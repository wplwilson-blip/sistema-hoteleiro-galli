# Plano — Unidade ativa com escopo de dados (abordagem B-MISTO)

> **STATUS:** abordagem A (perfil derivado no cliente, backend intacto, dados sempre em
> visão UNIÃO) foi **REJEITADA**. Este documento a substitui pela **abordagem B-MISTO**.
> **Decisão B-MISTO:** o escopo de dados passa a **seguir a unidade ativa**, validado
> **server-side**. "Misto" = nem toda rota estreita: rotas de **OPERAÇÃO** escopam pela
> unidade ativa; rotas de **REDE (consolidadas)** mantêm a visão união.
> **Área SENSÍVEL** (coração da autorização + helpers de sessão — `NAO_ALTERAR.md`).
> NÃO tocar em `auth.getUser()`, login, `auth_email`, Supabase Auth. A unidade ativa é
> camada **ACIMA** da autenticação. Plano → revisão → código, sem exceção.

---

## 0. Achados da revisão de código (base factual)

- `getAccessibleUnitIdsForPermission` (permissions.ts) hoje **sempre** retorna a UNIÃO das
  unidades acessíveis. Super admin → `getAllActiveUnitIds` (todas as unidades ativas).
- `requirePermission` chama esse helper e devolve `accessibleUnitIds` (união) no `context`.
- `session.ts > getSessionContextByAuthUserId`: `activeUnit = units[0]` e `profile = firstLink`
  (1º vínculo por `created_at asc`). `units[]` é montado **só dos links** do usuário — inclusive
  para super admin (trava o seletor do super admin numa unidade só).
- **`login/route.ts` NÃO grava cookie de unidade.** Ele grava os cookies de **auth do Supabase**
  (via `server.ts`) e registra `unit_id` em `system_logs`. ⇒ **Não há cookie de unidade ativa
  para reusar; será criado um novo** (ponto 2).
- **`(app_user_id, unit_id)` NÃO é único** em `user_unit_links`. A unique é
  `user_unit_links_unique_scope (app_user_id, unit_id, department_id, access_profile_id)`
  (migration 003). ⇒ um usuário pode ter **mais de um perfil ativo na mesma unidade**;
  `firstLink` descarta os demais silenciosamente (ponto 3).
- `base-cadastros/api-helpers.ts:37` (`requireSuperAdminRequest`) lê `session.profile.code` →
  o perfil resolvido no servidor precisa ser coerente; **derivar perfil no cliente quebraria
  essa coerência** (por isso B-misto resolve o perfil no servidor).
- Cookies do app (server.ts) usam: `httpOnly: true`, `sameSite: "lax"`, `secure` só em produção,
  `path: "/"`, `maxAge: 7 dias`. Este é o padrão a espelhar no cookie de unidade ativa.
- 25 rotas consomem `requirePermission` (algumas + `assertUnitInPermissionScope`). Tabela na §9.

---

## 1. Ponto 1 — Dois modos em `getAccessibleUnitIdsForPermission`

Sem duplicar lógica. O cálculo da UNIÃO (links + overrides + super admin) **permanece igual**.
Adiciona-se um **filtro final opcional** que estreita o resultado para a unidade ativa.

- Nova opção em `PermissionAuthorizationOptions`:
  `scope?: "aggregate" | "active-unit"` (default **"aggregate"** → comportamento atual).
- Em `getAccessibleUnitIdsForPermission`:
  1. calcula `allowedUnitIds` (união) exatamente como hoje (inclui o caminho super admin);
  2. se `scope === "active-unit"`: `accessibleUnitIds = uniao ∩ [activeUnitId]`
     (o `activeUnitId` validado vem do `session.activeUnit.id`, já resolvido server-side — §3);
  3. `hasPermission` em `active-unit` = "a unidade ativa está na união permitida".
- **Quem decide o modo é a ROTA**, explicitamente, passando `{ scope: "active-unit" }`.
  Rotas que não passam nada continuam em `aggregate` (nenhuma regressão).
- `requirePermission(permissionCode, { scope })` apenas repassa a opção ao helper. Sem
  duplicação: o estreitamento é um único `intersect` no fim do cálculo já existente.
- **Super admin em `active-unit`** → `[activeUnitId]` (não todas). Em `aggregate` → todas
  (inalterado).

> **Importante:** este modo afeta **leitura/listagem**. A validação de **escrita** (ponto 5)
> permanece em `aggregate` para não afrouxar nada.

---

## 2. Ponto 2 — Cookie de unidade ativa (validado server-side) + endpoint de troca

**Não existe cookie de unidade hoje** ⇒ criar um novo (não há concorrente a reusar).

- **Nome:** `active_unit_id`.
- **Flags (espelhando `server.ts`):** `httpOnly: true`, `sameSite: "lax"`, `secure` só em
  produção, `path: "/"`, `maxAge: 7 dias`. `httpOnly` é seguro porque o **cliente não precisa
  ler** o cookie — o servidor resolve a unidade ativa e a devolve no `SessionContext`.
- **Cookie cru nunca é fonte de verdade:** a cada request, `session.ts` lê o `active_unit_id`
  e **valida** contra os `user_unit_links` ativos reais (§3). Inválido/removido → fallback.
- **Endpoint de troca:** `POST /api/auth/active-unit` (route handler, pode gravar cookie):
  - body `{ unitId }`;
  - valida que o usuário tem `user_unit_links` **ativo** naquela unidade (super admin: que a
    unidade existe e está ativa);
  - se não tiver vínculo → **403** (e não grava cookie);
  - se válido → grava `active_unit_id` e retorna o `SessionContext` recalculado
    (`activeUnit` + `profile` novos). Helpers de cookie ficam em `src/lib/auth/active-unit.ts`
    (`getActiveUnitCookie`, `setActiveUnitCookie`, reusando o padrão de `server.ts`).
- **Login:** *recomendação* — **não alterar** `login/route.ts` (área sensível). Quando não há
  cookie ainda, o fallback de `session.ts` usa `units[0]` (idêntico ao de hoje). O cookie passa
  a existir quando o usuário troca de unidade pela 1ª vez.
  - *Alternativa sinalizada (decisão sua):* gravar `active_unit_id = activeUnit.id` ao final do
    login bem-sucedido — é aditivo e **não** toca `signInWithPassword`/`auth_email`/`getUser`,
    mas mexe no arquivo sensível de login. **Não decido sozinho.**

---

## 3. Ponto 3 — Perfil ativo resolvido NO SERVIDOR + fallback + múltiplos perfis

Em `getSessionContextByAuthUserId`:

- Ler `active_unit_id` (cookie) e procurar entre os `links` ativos do usuário a unidade
  correspondente. **Resolução:**
  - cookie presente **e** há link ativo naquela unidade → `activeUnit` = essa unidade e
    `profile` = perfil **daquele** vínculo;
  - cookie ausente / inválido / vínculo removido → **fallback seguro**: `activeUnit = units[0]`,
    `profile = firstLink` (comportamento atual, sem erro).
- **Múltiplos perfis na mesma unidade** (porque `(app_user_id, unit_id)` não é único): hoje o
  `firstLink` descarta em silêncio. Proposta determinística (a confirmar):
  - **precedência por privilégio**: `SUPER_ADMIN` > demais; empate → `created_at asc` (estável,
    igual à ordenação atual). Assim a troca de unidade é previsível e nunca "sorteia" perfil.
  - *Sinalizado:* se você preferir outra regra (ex.: perfil marcado como "primário"), defina —
    **não decido sozinho**. (Schema atual não tem flag de primário.)
- **Sem derivação no cliente:** `profile` continua sendo um campo único no `SessionContext`,
  resolvido no servidor — mantém coerência com `requireSuperAdminRequest` (`session.profile.code`).

---

## 4. Ponto 4 — `units[]` do super admin = todas as unidades ativas

Hoje `units[]` (session.ts) é montado só dos links → super admin fica preso a 1 unidade no seletor.

- Em `getSessionContextByAuthUserId`, detectar super admin (mesma checagem usada na autorização:
  perfil `SUPER_ADMIN` em link ativo) e, nesse caso, montar `units[]` a partir de
  **todas as unidades ativas** (equivalente a `getAllActiveUnitIds`), para o super admin poder
  escolher qualquer uma. `unitProfiles` do super admin → `SUPER_ADMIN` em todas.
- `activeUnit` do super admin resolve contra essa lista completa (cookie validado: a unidade
  precisa existir e estar ativa). Fallback → `units[0]` dessa lista completa.
- **Não altera autorização**: `permissions.ts` para super admin já usa `getAllActiveUnitIds`;
  isto apenas alinha o `SessionContext` ao que a autorização já enxerga.

---

## 5. Ponto 5 — Escrita: herda a unidade ativa, sem afrouxar validação

- **Validação server-side de escrita permanece em `aggregate`** (inalterada). As rotas de escrita
  seguem usando `assertUnitInPermissionScope(context, payload.unitId)` / `validateUnitScope`
  contra a **UNIÃO** — ninguém perde a capacidade de escrever onde já podia, e nada é afrouxado.
- **Default da escrita = unidade ativa** (camada de UI/cliente): formulários pré-selecionam
  `payload.unitId = activeUnit.id` (resolve o problema original: cadastro caía em `units[0]`).
- **Trocar a unidade de destino exige escopo explícito**: o usuário muda o campo de unidade no
  formulário (envio consciente de outro `payload.unitId`); o servidor valida normalmente contra
  a união. Ou seja: B-misto estreita **leitura/listagem**; **escrita** mantém validação ampla +
  default na unidade ativa.
- Consequência prática por arquivo: em rotas com `GET` **e** `POST/PATCH` (ex.: departments),
  o **handler GET** passa `{ scope: "active-unit" }`; o **handler de escrita** **não** passa
  scope (continua `aggregate`).

---

## 6. Ponto 6 — Store (Zustand) + invalidação de queries

`src/store/app-store.ts` hoje é MOCK (Marina Costa, unidades hardcoded) e `setActiveUnit` só
troca local, sem persistir nem trocar perfil.

- **Persistência = cookie server-validated** (não localStorage). Em B-misto a fonte de verdade é
  o cookie `active_unit_id`; no reload, o `layout` chama `getCurrentSessionContext()` que lê o
  cookie e devolve `activeUnit`/`profile` corretos. **Descarta-se a ideia de localStorage da
  abordagem A** (seria uma segunda fonte de verdade divergente do servidor).
- `setActiveUnit(unitId)` passa a:
  1. chamar `POST /api/auth/active-unit` (servidor valida o vínculo e regrava o cookie);
  2. em caso de **403**, não troca nada (mostra erro);
  3. em caso de sucesso, aplicar no store o `SessionContext` retornado (`activeUnit` + `profile`);
  4. **invalidar/refetch** as queries do TanStack com escopo de unidade (senão a tela mostra
     dados da unidade anterior). Para isso, as `queryKey` das telas unit-scoped passam a incluir
     `activeUnit.id` (ex.: `["base","departments", activeUnitId]`), garantindo refetch na troca.
- **Limpeza do mock** entra **na Leva 1** (estado inicial neutro/vazio, sobrescrito por
  `setSessionContext`) — é dependência natural de mexer no store agora.

---

## 7. Ponto 7 — Classificação das 25 rotas

Defaults aplicados (seus): Operação = unit-scoped; Aprovações de rede (lista) = aggregate;
decisão/resubmit mantêm check **per-unit do request específico** (aggregate, sem estreitar);
Cadastros = unit-scoped, com **exceção de fornecedor corporativo (`unit_id` nulo) sempre visível**.
Casos que **não encaixam** estão marcados 🚩 com proposta (não decididos por mim).

| # | Rota (arquivo) | Método(s) | Permissão | Modo | Observação |
|---|---|---|---|---|---|
| 1 | base/units/route.ts | GET, POST | units.view/manage | 🚩 **aggregate** | A entidade É a unidade; registro/seletor/forms precisam de todas. Estreitar quebraria gestão e selects. Proponho aggregate. |
| 2 | base/units/[id]/route.ts | PATCH | units.manage | 🚩 **aggregate** | Gerencia unidade específica; já usa `assertUnitInPermissionScope(params.id)`. Não estreitar. |
| 3 | base/departments/route.ts | GET / POST | departments.view/manage | GET unit-scoped / POST aggregate(escrita) | Cadastro por hotel. |
| 4 | base/departments/[id]/route.ts | PATCH | departments.manage | aggregate(escrita) | Escrita valida `payload.unitId` na união. |
| 5 | base/job-positions/route.ts | GET / POST | job_positions.view/manage | GET unit-scoped / POST aggregate | |
| 6 | base/job-positions/[id]/route.ts | PATCH | job_positions.manage | aggregate(escrita) | |
| 7 | base/employees/route.ts | GET / POST | employees.view/manage | GET unit-scoped / POST aggregate | |
| 8 | base/employees/[id]/route.ts | PATCH | employees.manage | aggregate(escrita) | |
| 9 | base/suppliers/route.ts | GET / POST | suppliers.view/manage | GET unit-scoped (+corporativo) / POST aggregate | **Exceção:** `unit_id` nulo (corporativo) continua visível (hoje já é gated por `isSuperAdmin`, não por accessibleUnitIds — preservar). |
| 10 | base/suppliers/[id]/route.ts | GET / PATCH | suppliers.view/manage | GET unit-scoped (+corporativo) / PATCH aggregate | Idem corporativo na leitura. |
| 11 | base/users/route.ts | GET, POST | users.view/manage | 🚩 **aggregate** | Usuários são globais (super-admin only); não são dado de 1 unidade. Não estreitar. |
| 12 | base/users/[id]/route.ts | PATCH, DELETE | users.manage | 🚩 **aggregate** | Idem. |
| 13 | base/users/[id]/reset-password/route.ts | POST | users.manage | 🚩 **aggregate** | Idem. |
| 14 | purchases/requests/route.ts | GET / POST | requests.view/manage | GET unit-scoped / POST aggregate | Operação. |
| 15 | purchases/requests/[id]/route.ts | GET / PATCH | requests.view/manage | GET unit-scoped / PATCH aggregate | 🚩 *Caveat:* deep-link a um request de OUTRA unidade dá 404 no GET unit-scoped. Aceitável (acesso pela unidade dele) — confirmar. |
| 16 | purchases/requests/[id]/quotes/route.ts | POST | quotes.manage | aggregate(escrita) | |
| 17 | purchases/requests/[id]/quotes/[quoteId]/route.ts | PATCH, DELETE | quotes.manage | aggregate(escrita) | |
| 18 | purchases/requests/[id]/quotes/[quoteId]/negotiations/route.ts | POST | quotes.manage | aggregate(escrita) | |
| 19 | purchases/quotes/route.ts | GET | quotes.view | unit-scoped | Operação. |
| 20 | purchases/documentation-dashboard/route.ts | GET | documentation.view | unit-scoped | Operação. |
| 21 | purchases/approvals/route.ts | GET | approvals.view | **aggregate** | Lista de rede (consolidada). |
| 22 | purchases/approvals/[requestId]/decision/route.ts | POST | approvals.view | **aggregate** | **Mantém** o check per-unit já existente (`accessibleUnitIds.includes(request.unit_id)`). Não estreitar por unidade ativa. |
| 23 | purchases/approvals/[requestId]/resubmit/route.ts | POST | approvals.submit | **aggregate** | Idem (check per-unit do request específico). |
| 24 | attachments/route.ts | GET, POST | purchases.view/manage | 🚩 propor **unit-scoped** | Anexos de compras (operacional). Confirmar que o GET filtra por entidade/unidade sem sumir anexos legítimos. |
| 25 | attachments/[id]/route.ts | DELETE | purchases.manage | aggregate(escrita) | Operação por id. |

🚩 **Casos sinalizados para sua decisão:** #1–2 (units), #11–13 (users), #15 (deep-link de
request), #24 (attachments). Proponho o modo indicado; confirme antes da migração da família.

---

## 8. Leva 1 — Núcleo (sem mudar o que o usuário vê)

Tudo permanece em modo **UNIÃO** (todas as rotas em `aggregate`). Nenhuma listagem muda. Só
prepara a fundação: cookie validado, perfil ativo no servidor, `units[]` do super admin e store.

**Arquivos tocados:**
- `src/lib/auth/active-unit.ts` **(novo)** — nome do cookie + `getActiveUnitCookie` /
  `setActiveUnitCookie` (espelha `cookieOptions` de `server.ts`).
- `src/app/api/auth/active-unit/route.ts` **(novo)** — `POST` valida vínculo, grava cookie,
  retorna `SessionContext`; 403 sem vínculo.
- `src/lib/auth/session.ts` — resolver `activeUnit` + `profile` do cookie validado (fallback
  `units[0]`/`firstLink`); `units[]` do super admin = todas ativas; regra determinística de
  múltiplos perfis. **Sem tocar** `getCurrentSessionContext`/`auth.getUser`.
- `src/store/app-store.ts` — remover mock; `setActiveUnit` chama o endpoint e reflete o
  `SessionContext` retornado; estado inicial neutro.
- `src/lib/auth/types.ts` — só se necessário (ex.: tipar retorno do endpoint); sem novos campos
  obrigatórios.
- **NÃO** tocar `permissions.ts` nesta leva (segue 100% aggregate).
- **NÃO** tocar `login/route.ts` (fallback cobre "sem cookie").

**Critério de aceite (Leva 1):**
- `build` e `lint` passam.
- Comportamento **idêntico** ao atual para todos os usuários (tudo em união).
- Super admin passa a ter `units[]` completa no `SessionContext` (sem seletor ainda — Parte 3).
- Trocar unidade via endpoint grava cookie, valida vínculo (403 quando indevido) e o
  `SessionContext` reflete `activeUnit`/`profile` corretos. Reload mantém a escolha (cookie).
- `auth.getUser`/login/`auth_email` intactos.

---

## 9. Leva 2 — B-misto de fato (estreitar leitura por família)

Introduz os dois modos e migra **uma família por vez**, com invalidação de query no cliente.

**Arquivos tocados:**
- `src/lib/auth/permissions.ts` — `scope?: "aggregate" | "active-unit"` em
  `PermissionAuthorizationOptions`; estreitamento por interseção; `requirePermission` repassa.
- **Família Cadastros (primeiro):** handlers **GET** de departments, job-positions, employees,
  suppliers (#3,5,7,9 e os `[id]` de leitura) passam `{ scope: "active-unit" }`. Escrita
  inalterada (aggregate). Preservar exceção corporativa em suppliers.
- **Família Compras (depois):** GET de requests, requests/[id], quotes, documentation-dashboard
  (#14,15,19,20) → `active-unit`. Escrita inalterada. Aprovações (#21–23) permanecem aggregate.
- **Cliente:** `queryKey` das telas unit-scoped passam a incluir `activeUnit.id`;
  `setActiveUnit` invalida/refetch essas queries (store + componentes de lista das famílias).
- 🚩 units (#1–2), users (#11–13), attachments (#24): **só após sua confirmação** do modo.

**Critério de aceite (Leva 2):**
- Usuário multi-unidade troca de unidade → **dados operacionais e cadastros acompanham** a
  unidade ativa; sem "vazar" dados da unidade anterior (queries invalidadas).
- Perfil de **rede** mantém visão consolidada nas rotas **aggregate** (aprovações).
- **Super admin** troca livremente entre quaisquer unidades.
- **Unidade única** não percebe diferença (interseção = a própria unidade).
- Escrita continua validada server-side contra a união (sem afrouxar); default na unidade ativa.
- `build` e `lint` passam.

---

## 10. Restrições (NAO_ALTERAR) reafirmadas

- NÃO tocar `auth.getUser()`, `signInWithPassword`, `auth_email`, Supabase Auth, setup inicial.
- A autorização NÃO passa a depender do cookie cru: a unidade ativa é **validada** contra
  `user_unit_links` a cada request; a checagem de permissão por perfil/override continua igual.
- Estreitar é só **leitura**; escrita mantém validação ampla. Aprovações de rede não estreitam.
- Sem libs novas (cookie nativo do Next; TanStack já presente).

## 11. Decisões pendentes (não decididas aqui)

1. Cookie no login: manter login intacto (recomendado) **ou** gravar `active_unit_id` no login?
2. Múltiplos perfis na mesma unidade: precedência `SUPER_ADMIN`>demais + `created_at` (proposto)
   **ou** outra regra?
3. Confirmar modo dos 🚩: units (aggregate), users (aggregate), attachments (unit-scoped),
   deep-link de request (#15) com 404 fora da unidade ativa.
