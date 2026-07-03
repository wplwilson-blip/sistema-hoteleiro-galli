# Plano — specs E2E API-level da Fase 3-C (rota `/api/admin/permissions/profiles`)

> 2026-07-02 · Branch `feat-fase3c-editar-perfis`. **PLANO, não código.** Alvo: STAGING
> (`jascnmgagejlvjlenduv`). NÃO tocar produção (`chnamldrlwohaudmjrez`). Nenhuma alteração em
> código de app, migration ou config — só specs/helpers de teste novos (a criar depois da revisão).
>
> Cobre **três** comportamentos server-side: **(b)** SUPER_ADMIN intocável, **(c)** soft-delete ao
> revogar, **(d)** "afeta N usuários". (A regra **(a)** anti-auto-trancamento fica fora deste lote —
> ver Riscos §5.)
>
> **⚠️ Atualização 2026-07-02 (revisão):** adotada a **Opção 2** — implementar AGORA **só (b)**,
> em HTTP puro, sem banco/service_role. **(c)** e **(d)** estão **ADIADAS** (ver marcações). O
> conteúdo original de (c)/(d) e do mecanismo service_role foi **preservado** abaixo para o bloco
> futuro. **Leia primeiro a seção "DECISÃO: Opção 2".**

---

## DECISÃO: Opção 2 — só (b) SUPER_ADMIN intocável, HTTP puro (ATIVO)

Da revisão: cobrir **agora apenas o comportamento (b)** via teste E2E **API-level HTTP puro** —
**sem tocar o banco**, **sem cliente service_role**, **sem fixture**. **(c)** soft-delete e **(d)**
userCount ficam **ADIADAS** para um bloco futuro, junto com **(a)** auto-trancamento (que exigirá
fixture de banco de qualquer forma). As seções §0, §3 e §4 abaixo permanecem como **referência
futura** e estão marcadas **[ADIADA]**.

### Por que isto dispensa banco/fixture/service_role

- **Ator: E2E_ADMIN (super admin).** Ele já **passa** o gate `ADMIN:profiles.manage`
  (`requirePermission` retorna `hasPermission = true` para super admin — `permissions.ts:265-267`),
  então a requisição **alcança** o handler e bate **direto na regra (b)**. Não é preciso conceder
  nada (sem override), nem criar perfil-alvo.
- Usa o **`storageState` de E2E_ADMIN** já produzido pelo projeto `setup` (`auth.setup.ts:8-11`).

### 1. Como o teste identifica o perfil SUPER_ADMIN e monta PUT/DELETE

**Assinatura real da rota (id, não code, no BODY):** PUT e DELETE compartilham o mesmo schema
`writeSchema` (`route.ts:17-20`):

```ts
// route.ts:17-20
const writeSchema = z.object({
  profileId: z.string().uuid("Perfil invalido."),      // <- UUID do perfil no BODY
  permissionCode: z.string().trim().min(1, "Permissao invalida.")
});
```

- `PUT(request)` — `route.ts:230,238`: `writeSchema.parse(await request.json())` ⇒ corpo JSON
  `{ profileId, permissionCode }`. **Não** há id no path (a rota é estática
  `/api/admin/permissions/profiles`, sem `[id]`).
- `DELETE(request)` — `route.ts:352,360`: idêntico, mesmo `writeSchema`, mesmo corpo.

Portanto o teste precisa do **UUID** do perfil SUPER_ADMIN (o `profileId` é validado como `uuid`; um
literal `"SUPER_ADMIN"` seria rejeitado pelo Zod com 422 **de validação**, não pela regra (b) — não
serve). **Como obter o UUID só por HTTP:** chamar o **GET** da própria rota como E2E_ADMIN e achar o
perfil por `code`:

- `GET /api/admin/permissions/profiles` — gate `ADMIN:permissions.view` (`route.ts:130`), que
  E2E_ADMIN tem (super). Retorna `profiles: [{ id, code, name, ..., permissions: [...] }]`
  (`route.ts:209-224`). O teste seleciona `profiles.find(p => p.code === "SUPER_ADMIN").id` →
  `superAdminId`. (O `code` esperado é `SUPER_ADMIN`, `session.ts:9`.)
- Do mesmo GET, para escolher `permissionCode`: usar `SUPER_ADMIN.permissions[].code` (ex.:
  `ADMIN:profiles.manage`, seedado) para o caso DELETE; e qualquer código do catálogo **fora** dessa
  lista para o caso PUT. *(Na prática a regra (b) barra antes de resolver a permissão — §3 — então o
  código exato é indiferente para o 422; escolhemos coerentes só por clareza.)*

Montagem:
- **PUT** `context.request.put("/api/admin/permissions/profiles", { data: { profileId: superAdminId,
  permissionCode: <código qualquer válido> } })`.
- **DELETE** `context.request.delete("/api/admin/permissions/profiles", { data: { profileId:
  superAdminId, permissionCode: "ADMIN:profiles.manage" } })`.
  (Playwright `request` aceita `data` em DELETE.)

### 2. SPEC (b) — dois casos

- **(b1) PUT** como E2E_ADMIN, corpo `{ profileId: superAdminId, permissionCode: <código válido> }`
  → **assert HTTP 422** e corpo `message === "O perfil Super Administrador nao pode ser editado."`
  (`route.ts:248-250`).
- **(b2) DELETE** como E2E_ADMIN, corpo `{ profileId: superAdminId, permissionCode:
  "ADMIN:profiles.manage" }` → **assert HTTP 422** e a **mesma** mensagem (`route.ts:370-372`).

**É 422, não 403 — confirmado no código.** O 403 só ocorreria se o ator **não** passasse
`requirePermission` (`permissions.ts:343-347`). E2E_ADMIN é super admin ⇒ `hasPermission = true`
⇒ o handler roda e retorna o **422 específico do Super Admin**. Ou seja: o ator **passa o gate** e é
barrado pela regra dedicada. (Sanidade: pode-se afirmar `status === 422` e **`!== 403`**.)

### 3. Verificação "nada gravado" — só por HTTP (sem service_role)

Não há acesso direto ao banco neste lote. A verificação mais forte disponível por HTTP é o
**diff do GET** (que o ator E2E_ADMIN pode chamar):

1. **Antes:** `GET` → capturar o conjunto de códigos concedidos do SUPER_ADMIN
   (`profiles.find(code==='SUPER_ADMIN').permissions.map(p=>p.code)`), ordenado.
2. Executar **(b1)** e **(b2)** (ambos 422).
3. **Depois:** `GET` novamente → assert que o conjunto de códigos do SUPER_ADMIN é **idêntico** ao de
   antes (nada concedido pelo PUT, nada removido pelo DELETE).

**Limitação (reportada honestamente):** o GET só expõe grants **efetivos**
(`is_allowed=true`, `status=active`, `deleted_at null` — `route.ts:154-161`). Ele **não** revela
linhas soft-deletadas nem `is_allowed=false`. Porém **qualquer** mutação real no conjunto concedido
(insert, soft-delete, ou flip de `is_allowed`) **encolheria ou aumentaria** esse conjunto e seria
detectada pelo diff. Como a regra (b) barra **antes de qualquer escrita** (§5), o esperado é conjunto
**inalterado** — e é exatamente isso que asseramos. **Não** introduzimos service_role só para
inspecionar linhas invisíveis; o diff do GET é a asserção mais forte possível sem banco. *(A prova
de nível de linha — status/deleted_at/is_allowed — fica para o bloco futuro §3-ADIADA, que já terá
service_role.)*

### 4. Arquivo

- **Spec novo:** `tests/e2e/perfis-super-admin.e2e.spec.ts` (nome sugerido).
- **Projeto do Playwright:** casa o `testMatch: /.*\.e2e\.spec\.ts$/` do projeto **`chromium`**
  (`playwright.e2e.config.ts:48-53`), que **depende** do projeto `setup` (`dependencies: ["setup"]`)
  — logo o `storageState` de **E2E_ADMIN** já existe quando a spec roda. A spec faz
  `test.use({ storageState: authStatePath("E2E_ADMIN") })` (helper `authStatePath`,
  `helpers/auth.ts:24`).
- **Nível:** usa `request` do fixture de página autenticada (ou `browser.newContext({ storageState })`
  + `context.request`). Sem UI.
- **Nada de app/migration/config** é tocado; o spec novo já é coberto pelo `testMatch` existente
  (sem editar a config).

### 5. Risco de borda — PUT/DELETE real contra o SUPER_ADMIN no staging

**Seguro: nada é escrito.** A ordem no handler garante que a regra (b) barra **antes** de qualquer
operação de escrita. Sequência do PUT (`route.ts:237-259`):

1. `writeSchema.parse` (validação) → 2. `loadProfile` (SELECT) → 3. **guard SUPER_ADMIN → return 422
(`:248-250`)**. Só **depois** (`:252+`) viriam `resolvePermissionId` e o `insert/update`. O guard
está **antes** de todos eles ⇒ **nenhuma escrita**.

DELETE idêntico (`route.ts:359-372`): `parse` → `loadProfile` → **guard SUPER_ADMIN return 422
(`:370-372`)**; a anti-auto-trancamento (`:381`) e o `update` de soft-delete (`:406`) só viriam
depois — **não são alcançados**.

**Nenhum caminho escreve antes do barramento.** A única "escrita" possível em toda a rota seria
`writeProfilePermissionAudit` (audit_trail), mas ela só é chamada **após** os writes de sucesso
(`route.ts:296,327,418`) — jamais no caminho do 422. ⇒ O teste **não corrompe** o perfil Super Admin
do staging e **não deixa resíduo** (nem em `profile_permissions`, nem em `audit_trail`).

> Único pré-requisito de ambiente: o perfil `SUPER_ADMIN` precisa existir **ativo** no staging para o
> `loadProfile` retorná-lo e a regra (b) disparar (se não existisse, viria 404 "Perfil nao
> encontrado" e o teste falharia de forma clara, sem escrever nada). É garantido pelo seed
> `070_admin_permissions_catalog.sql` / base.

---

## 0. [ADIADA] ACHADO CRÍTICO — qual mecanismo de escrita de fixtures existe hoje

A decisão do pedido diz "a escrita de fixtures usa o mesmo mecanismo/credencial que os helpers E2E
já usam". **Verificado no código: essa premissa não se sustenta como está.** Os helpers E2E **não
escrevem no banco por acesso direto** — eles operam **100% via HTTP contra a app**:

- `tests/e2e/helpers/auth.ts:76` — `POST /api/auth/login` (cookies/sessão). Sem DB.
- `tests/e2e/helpers/purchases-flow.ts` e `purchases-ui.ts` — tudo via UI/rotas da app.
- `tests/e2e/helpers/data.ts` — só gera rótulos/CPF; sem DB.
- Busca por `service_role|createClient|supabase` em `tests/` → **0 ocorrências** de cliente de banco
  (só comentários). **Não há credencial de DB nos testes hoje.**

Onde a app usa service_role (para referência, **não** é usado pelos testes):
- `src/lib/supabase/admin.ts:6-15` → `createClient(url, serviceRoleKey, ...)`.
- `src/lib/supabase/env.ts:20-24` → `getAdminSupabaseEnv()` exige **`SUPABASE_SERVICE_ROLE_KEY`**
  (+ `NEXT_PUBLIC_SUPABASE_URL`). Essa key existe em **`.env.local`** (server-only, carregada pelo
  Next dev) — **não** é carregada pelo Playwright (a config só lê `.env.e2e.local`,
  `playwright.e2e.config.ts:29`).

### Decisão de mecanismo (a validar na revisão)

O perfil-alvo (`access_profiles`) e os vínculos (`user_unit_links`) **não têm endpoint HTTP** na app
(a rota 3-C só mexe em `profile_permissions`; não há CRUD de perfis/links). Logo, criá-los **exige
acesso direto ao banco**. Duas opções:

- **Opção A (recomendada) — cliente `service_role` dedicado no processo de teste.** Criar um helper
  novo `tests/e2e/helpers/admin-db.ts` que instancia `@supabase/supabase-js` com
  `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`. Requer **adicionar
  `SUPABASE_SERVICE_ROLE_KEY` ao `.env.e2e.local`** (env, nunca commitado) e documentá-la em
  `.env.e2e.example` (mudança de doc, a fazer no PR do código — não agora). Todas as fixtures
  (override, perfil, links) e todas as verificações de estado usam esse cliente. Teardown 100%
  determinístico por `DELETE` físico das linhas que criamos ⇒ **zero resíduo**.
- **Opção B (híbrida)** — override via API (`PUT /api/admin/permissions/overrides` autenticado como
  `E2E_ADMIN`, que é super e tem `overrides.manage`), e perfil+links via service_role. Rejeitada:
  mistura dois mecanismos, gera linhas em `audit_trail` (a API audita cada escrita) e complica o
  "zero resíduo". A verificação de estado de (b)/(c) **de qualquer modo** precisa de leitura direta
  no banco, então já teremos o cliente service_role — usá-lo para tudo é mais simples.

> **Reporte honesto:** não há "mesmo mecanismo já usado" para reaproveitar; este plano **introduz**
> o primeiro acesso direto ao banco na suíte E2E. Isso precisa de aprovação explícita, porque
> service_role **ignora RLS** — daí o guard do §5.

---

## 1. FIXTURES (setup `beforeAll` / teardown `afterAll`)

Ator das escritas na rota 3-C: **E2E_MULTI** (não-super, `DEPARTMENT_MANAGER`), autenticado por
`storageState` (projeto `setup` já existente). O setup concede a ele `ADMIN:profiles.manage` e cria o
perfil-alvo descartável.

Constantes estáveis (não sufixadas por run, para limpeza idempotente de rodadas abortadas):
`E2E_PROFILE_TARGET_CODE = "E2E_PROFILE_TARGET"`; permissão inócua p/ (c):
`INOCUA = "BASE:suppliers.view"` (ativa no catálogo, **fora** de `PROTECTED_ADMIN`).

### Setup cria (via service_role, nesta ordem):

1. **Limpeza defensiva primeiro** (idempotência — ver §5): remover qualquer resíduo de rodada
   anterior com o mesmo `E2E_PROFILE_TARGET_CODE` e qualquer override de `profiles.manage` do
   E2E_MULTI (mesma sequência do teardown, §1 abaixo).
2. **Resolver ids fixos** (SELECT, sem escrita): `app_users.id` do E2E_MULTI (por username do env);
   `permissions.id` de `ADMIN:profiles.manage`, de `INOCUA` e (p/ spec b) de um código que o
   SUPER_ADMIN tem/não tem; `access_profiles.id` do `SUPER_ADMIN` (`code=SUPER_ADMIN`); 1
   `units.id` ativo; 2 `app_users.id` ativos e **distintos** (quaisquer dois, para os vínculos de
   (d)) — de preferência **não** os atores, para desacoplar.
3. **Override no E2E_MULTI** — `INSERT` em **`user_permission_overrides`**:
   `{ app_user_id: E2E_MULTI, unit_id: null, permission_id: profiles.manage, is_allowed: true,
   status: "active", created_by/updated_by: E2E_MULTI }` (espelha o insert da rota de overrides,
   `overrides/route.ts:201-210`). Guardar o `id` retornado. Efeito: `requirePermission` passa a
   liberar E2E_MULTI (lido ao vivo do banco a cada request — `permissions.ts:282-289`).
4. **Perfil-alvo** — `INSERT` em **`access_profiles`**:
   `{ code: "E2E_PROFILE_TARGET", name: "[E2E] Perfil alvo", status: "active",
   is_system_default: false }`. Guardar `id` (`targetProfileId`).
5. **2 vínculos** — `INSERT` (×2) em **`user_unit_links`**:
   `{ app_user_id: <user1/user2>, unit_id: <unit>, access_profile_id: targetProfileId,
   status: "active" }`. ⇒ `userCount` do alvo = **2** distintos.

### Teardown limpa (via service_role, ordem respeitando FKs → DELETE físico):

Tabelas tocadas: `user_permission_overrides`, `access_profiles`, `user_unit_links`,
`profile_permissions` (criada pela spec (c)), `audit_trail` (gerada pela rota nas escritas de (c)).

Ordem (filhas antes das pais):
1. **`audit_trail`** — `DELETE where table_name='profile_permissions' and entity_id in (<pp ids
   criados na spec c>)` (capturar esses ids durante o teste). *(Só (c) escreve; (b) é barrado antes
   de gravar → sem audit; override criado por DB direto → sem audit.)*
2. **`profile_permissions`** — `DELETE where access_profile_id = targetProfileId` (remove o grant da
   permissão inócua criado por (c)). *Antes de `access_profiles` (FK `access_profile_id`).*
3. **`user_unit_links`** — `DELETE where access_profile_id = targetProfileId`. *Antes de
   `access_profiles` (FK `access_profile_id`).*
4. **`access_profiles`** — `DELETE where code = 'E2E_PROFILE_TARGET'`.
5. **`user_permission_overrides`** — `DELETE where id = <override id>` (ou por
   `app_user_id=E2E_MULTI and permission_id=profiles.manage and unit_id is null`). Independente das
   demais.

**Objetivo explícito:** zero resíduo (diferente da suíte de compras, que deixa residual soft-deletado
por regra de negócio). Aqui usamos DELETE **físico** só sobre linhas **que nós criamos** e **na
tabela** `audit_trail` apenas para nossos `entity_id`.

---

## 2. [SUPERSEDED] SPEC (b) via E2E_MULTI+override — substituída pela "DECISÃO: Opção 2"

> **Superada** para o lote atual: a versão ATIVA de (b) é HTTP puro com **E2E_ADMIN**, sem override
> (ver seção "DECISÃO: Opção 2" no topo). O texto abaixo (ator E2E_MULTI + override + service_role
> para verificar estado) só valeria se um dia quiséssemos exercer (b) com um ator **não-super** —
> mantido como referência histórica.

Ator: E2E_MULTI (já com override ⇒ passa o gate `ADMIN:profiles.manage`). Alvo: perfil `SUPER_ADMIN`.

- **PUT** `request.put("/api/admin/permissions/profiles", { data: { profileId: superAdminId,
  permissionCode: <um código que o SA NÃO tem> } })` → **assert HTTP 422** e corpo
  `message === "O perfil Super Administrador nao pode ser editado."` (`route.ts:248-250`).
- **DELETE** mesmo endpoint, `{ profileId: superAdminId, permissionCode: "ADMIN:profiles.manage" }`
  (que o SA **tem**) → **assert 422** + mesma mensagem (`route.ts:370-372`).
- **"Nada foi gravado"** — o guard dispara **antes** de qualquer escrita (é a 1ª checagem após
  `loadProfile`). Verificação por leitura direta:
  - Após o PUT: `SELECT` em `profile_permissions where access_profile_id=superAdminId and
    permission_id=<código testado>` → **0 linhas** (não criou grant).
  - Após o DELETE: `SELECT` em `profile_permissions where access_profile_id=superAdminId and
    permission_id=<profiles.manage>` → linha **inalterada**: `status='active'`, `deleted_at is null`
    (o seed a mantém; `070_admin_permissions_catalog.sql:35`). Comparar `updated_at` antes/depois
    para provar não-escrita.

## 3. [ADIADA] SPEC (c) — soft-delete ao revogar

> **ADIADA (Opção 2).** Reservada para o bloco futuro com fixture de banco (junto de (a) e (d)).
> Conteúdo preservado abaixo como referência.


Ator: E2E_MULTI. Alvo: `E2E_PROFILE_TARGET`. Permissão: `INOCUA = BASE:suppliers.view` (fora de
`PROTECTED_ADMIN`, então nenhum guard de auto-trancamento interfere).

1. **PUT** `{ profileId: targetProfileId, permissionCode: INOCUA }` → assert **200** `{ ok: true }`.
   Capturar o `id` da linha (via SELECT) para limpeza de `audit_trail`.
2. **SELECT** `profile_permissions where access_profile_id=targetProfileId and permission_id=INOCUA`
   → `status='active'`, `is_allowed=true`, `deleted_at is null` (concessão OK; `route.ts:308-319`).
3. **DELETE** `{ profileId: targetProfileId, permissionCode: INOCUA }` → assert **200**
   `{ ok: true, removed: true }`.
4. **SELECT** a **mesma** linha (por `id`) e assertar o estado pós-revogação (`route.ts:406-411`):
   - `status === 'inactive'` **e** `deleted_at !== null` (soft-delete),
   - **a linha ainda existe** (prova de que **não** houve DELETE físico — buscar por `id` retorna 1),
   - **`is_allowed === true`** (NÃO virou `false`; a revogação não toca `is_allowed`).

   Query que confirma: `select id, status, is_allowed, deleted_at from profile_permissions where
   id = <capturado>` → 1 linha com os valores acima.

## 4. [ADIADA] SPEC (d) — "afeta N usuários"

> **ADIADA (Opção 2).** Reservada para o bloco futuro com fixture de banco (junto de (a) e (c)).
> Conteúdo preservado abaixo como referência.


Confirmado no código: o número vem do **GET** da rota, campo **`userCount`** por perfil
(`route.ts:219`; contagem de `app_user_id` distintos em `user_unit_links` ativos, `route.ts:188-207`).

- **GET** `/api/admin/permissions/profiles` — o gate do GET é **`ADMIN:permissions.view`**
  (`route.ts:130`), que E2E_MULTI **não** tem só com o override de `profiles.manage`. Portanto
  **chamar o GET autenticado como `E2E_ADMIN`** (super admin, tem tudo) — usar o `storageState` de
  E2E_ADMIN neste teste.
- Assert: no array `profiles`, o item com `code === "E2E_PROFILE_TARGET"` tem
  **`userCount === 2`** (os 2 vínculos do setup).
- Reforço opcional: `usedByActor` reflete se o **ator do GET** (E2E_ADMIN) está entre os vínculos —
  como escolhemos 2 usuários que **não** são o ator, esperar `usedByActor === false`.

---

## 5. RISCOS / BORDA

- **service_role ignora RLS → guard obrigatório.** O `admin-db.ts` deve, na criação do cliente,
  **abortar** se `getSupabaseProjectRef()`/host do `NEXT_PUBLIC_SUPABASE_URL` **não** for
  `jascnmgagejlvjlenduv` (staging). O `global-setup.ts` atual só valida `PLAYWRIGHT_BASE_URL`, não o
  DB — este guard é uma **segunda trava** independente. Nunca rodar com a ref de produção.
- **Resíduo em caso de falha no meio.** Todo o ciclo em **`afterAll` idempotente** que roda **mesmo
  se um teste falhar** (Playwright executa hooks de teardown independentemente). Os 3 testes ficam em
  **um único arquivo** com `test.describe.serial` (um worker, sem corrida na fixture compartilhada).
  O `afterAll` deleta por **chave estável** (`code`, `id` do override, `access_profile_id`), não por
  variável só-em-memória, para limpar mesmo após crash parcial.
- **Idempotência de rodada abortada.** O `beforeAll` faz **limpeza defensiva antes de criar**
  (mesma sequência do teardown). Como o código do perfil é **estável** (`E2E_PROFILE_TARGET`), um
  resíduo de run anterior é encontrado e removido. Risco de colisão entre execuções **paralelas** é
  evitado por: (i) specs num só arquivo serial; (ii) `fullyParallel:false` na config
  (`playwright.e2e.config.ts:36`). *(Se um dia rodar em paralelo real, trocar o código estável por
  sufixo de run — não é o caso agora.)*
- **audit_trail.** As escritas de (c) geram 2 linhas de audit (insert + soft_delete). Limpamos por
  `entity_id`. Alternativa (a decidir na revisão): considerar audit como trilha intencional e **não**
  limpar — mas isso viola "zero resíduo"; por padrão, **limpamos**.
- **(a) anti-auto-trancamento fora do lote.** Exige o ator (E2E_MULTI) **vinculado ao perfil-alvo**
  em `user_unit_links` e removendo um código de `PROTECTED_ADMIN` (achado do doc 09). É viável
  reusando esta fixtura (basta vincular E2E_MULTI ao alvo e conceder-lhe `profiles.manage` **via o
  perfil**, não via override), mas muda a montagem; deixado como **próximo lote** para não inflar
  este PR.
- **Efeito colateral do override no gate.** O override concede `profiles.manage` **global** a
  E2E_MULTI durante a suíte. Como é soft/hard-removido no teardown e a suíte roda serial, não vaza
  para outras specs. Ainda assim, o teardown do override é **crítico** (senão E2E_MULTI fica com
  poder de admin no staging).

---

## 6. ARQUIVOS

**A criar (depois da revisão) — nenhum arquivo de app:**
- `tests/e2e/perfis-3c.e2e.spec.ts` — **um** arquivo, `test.describe.serial` com `beforeAll`/
  `afterAll` (fixtures §1) e os 3 testes (b), (c), (d). Pega o `.e2e.spec.ts` do projeto `chromium`.
- `tests/e2e/helpers/admin-db.ts` — **helper novo**: cliente `@supabase/supabase-js` service_role
  (guard de staging §5) + funções de fixture/limpeza (`ensureCleanTarget`, `grantOverride`,
  `createTargetProfile`, `linkUsers`, `readProfilePermission`, `teardownAll`).

**Mudanças de config/doc necessárias no PR do código (NÃO agora, fora deste plano read-only):**
- `.env.e2e.local` (gitignored) recebe `SUPABASE_SERVICE_ROLE_KEY` (valor real, nunca commitado).
- `.env.e2e.example` ganha a linha `SUPABASE_SERVICE_ROLE_KEY=` (documentação, sem valor).

**Não se altera:** nenhuma rota/componente/lib de app, nenhuma migration, nem
`playwright.e2e.config.ts` (os specs novos já casam o `testMatch` existente; o projeto `setup` já
gera os storageStates de E2E_ADMIN e E2E_MULTI usados aqui).

---

## Dúvidas para a revisão (bloqueiam o início do código)

1. **Aprovar o acesso direto ao banco via service_role nos testes** (Opção A). É o primeiro na suíte
   E2E; sem ele, (b)/(c) não têm como verificar estado e perfil/links não têm como ser criados.
2. Confirmar que pode **adicionar `SUPABASE_SERVICE_ROLE_KEY` ao `.env.e2e.local`** (e à
   `.env.e2e.example`).
3. Confirmar a política de **`audit_trail`**: limpar (zero resíduo) vs. preservar trilha.
