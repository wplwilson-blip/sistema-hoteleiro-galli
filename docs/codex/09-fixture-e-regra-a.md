# Fixture E2E + gatilho da regra (a) — confirmações para planejar testes 3-C

> Gerado em 2026-07-02. **Read-only**: nenhum código/config/migration/teste alterado. Sem commit.
>
> Fontes: `src/app/api/admin/permissions/profiles/route.ts`, `src/lib/auth/permissions.ts`,
> `tests/e2e/global-setup.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/helpers/auth.ts`,
> `.env.e2e.example`, `docs/codex/11-plano-testes-fluxo.md`.

---

## PARTE 1 — A regra (a) dispara por OVERRIDE?

### 1. O que `actorUsesProfile()` consulta exatamente

`route.ts:70-86`. Consulta **apenas `user_unit_links`** — não olha
`user_permission_overrides`:

```ts
// route.ts:71-78
.from("user_unit_links")
.select("id")
.eq("app_user_id", actorId)
.eq("access_profile_id", profileId)   // <- casa o PERFIL-ALVO no vínculo do ator
.eq("status", "active")
.is("deleted_at", null)
.limit(1);
```

- **Tabela:** `user_unit_links`.
- **Colunas:** seleciona só `id` (existência); filtra por `app_user_id`,
  `access_profile_id`, `status`, `deleted_at`.
- **Considera `user_permission_overrides`?** **NÃO.** A pergunta que ela responde é
  literalmente "o ator tem um vínculo ativo cujo `access_profile_id` é o perfil-alvo?".
  Overrides (concessão por exceção por usuário) não entram nessa checagem.

### 2. Ator com `profiles.manage` só por override — a regra (a) dispara?

**Não dispara.** Há uma assimetria entre o GATE e a CHECAGEM DE AUTO-USO:

- **Gate (`requirePermission`)** — `permissions.ts:330-361` → `getAccessibleUnitIdsForPermission`
  (`:251-308`) **considera overrides** via `applyUserPermissionOverrides` (`:208-249`, chamado em
  `:282-289`). Logo, um ator que recebeu `ADMIN:profiles.manage` por
  `user_permission_overrides` **passa** no gate e alcança o handler DELETE.
- **Checagem de auto-uso (`actorUsesProfile`)** — só compara
  `user_unit_links.access_profile_id` com o perfil-alvo (`route.ts:75`). O override
  **não** é visto aqui.

Resultado: se o ator tem `profiles.manage` **apenas por override** e o `access_profile_id`
dos seus vínculos **não** é o perfil-alvo, então `route.ts:381`
(`PROTECTED_ADMIN.includes(code) && await actorUsesProfile(...)`) tem o segundo operando
**`false`** → o guard **não** retorna 422 e a revogação prossegue (soft-delete normal).

### 3. Conclusão objetiva

**Para exercitar a regra (a), o ator PRECISA ter o perfil-alvo em
`user_unit_links.access_profile_id`? → SIM.**
Basta ter a permissão por override? **NÃO** — o override passa no gate, mas `actorUsesProfile`
é por perfil no vínculo e não enxerga o override, então o anti-auto-trancamento não chega a disparar.

> Implicação de teste: o cenário (a) exige um ator cujo **vínculo ativo** use exatamente o
> **perfil-alvo**, e que esse perfil conceda `ADMIN:profiles.manage` (para o ator ter a permissão
> e, ao removê-la, estar de fato se autotrancando). Um ator que só tenha a permissão via override
> **não** reproduz (a).

---

## PARTE 2 — Onde vivem os usuários E2E

### 4. São criados on-the-fly, ou o setup só faz login?

**O setup APENAS faz login, assumindo que os usuários já existem no staging.** Não há criação.

- `tests/e2e/auth.setup.ts:8-16` — os dois "testes" de setup só chamam
  `createAuthState("E2E_ADMIN"/"E2E_MULTI", baseURL)`. Nenhum insert.
- `tests/e2e/helpers/auth.ts:68-97` — `createAuthState` faz **`POST /api/auth/login`**
  com `username`+`password` vindos do ambiente (`:76-79`) e grava o `storageState`. Se o login
  falhar, lança erro dizendo explicitamente *"...e se o usuario existe no STAGING"*
  (`auth.ts:81-88`) — ou seja, pressupõe pré-existência.
- `tests/e2e/global-setup.ts:12-38` — faz **só** o guard anti-produção (valida o host de
  `PLAYWRIGHT_BASE_URL`). Não cria usuário/perfil/vínculo.
- `.env.e2e.example:19-26` — só declara os **nomes** das variáveis de credencial (sem valores).

### 5. Há script/seed no repo que os provisiona?

**Não há.** Nenhum script/seed no repositório cria os usuários E2E (usuário +
`access_profile` + `user_unit_links`). → **provisionados manualmente fora do repo.**

- O plano `docs/codex/11-plano-testes-fluxo.md:91-96` e `§8.3 (:228-230)` registra a **decisão**
  de "criar `E2E_MULTI` no staging" via **UI/seed manual** (ou setup global), com credenciais
  sempre em env — mas **esse código não existe** no repo. `E2E_ADMIN` é reaproveitado de um
  usuário pré-existente (`wilson.admin`, doc 11:81,88).

### 6. Qual o `access_profile` de cada um?

Não há seed no repo definindo esses perfis; a fonte é a **documentação** e os **comentários dos specs**:

- **E2E_ADMIN → `SUPER_ADMIN`.** Fonte: `docs/codex/11-plano-testes-fluxo.md:81,88`
  ("`wilson.admin` ... **é SUPER_ADMIN**"; "`E2E_ADMIN` — super admin (já existe: `wilson.admin`)").
- **E2E_MULTI → não-super, "Gerente Departamental" (`DEPARTMENT_MANAGER`).** Fontes:
  - `docs/codex/11-plano-testes-fluxo.md:89-90,229` — "usuário **NÃO-super** com acesso às 2
    unidades + permissões (compras/RH view+manage)".
  - Comentários dos specs: `tests/e2e/compras-fluxo.e2e.spec.ts:7`
    ("E2E_MULTI (Gerente Departamental, nao-super, 2 unidades...)") e
    `tests/e2e/compras-diretoria.e2e.spec.ts:12-16` ("E2E_MULTI (`DEPARTMENT_MANAGER`) tem só
    `approvals.decide.administrative`, NÃO tem `approvals.decide.directorate`").

> Ressalva: o código de perfil `DEPARTMENT_MANAGER` para o E2E_MULTI vem de **comentários de
> teste/plano**, não de um seed versionado — o provisionamento real está fora do repo (staging).
> Nenhum dos dois E2E, nem o perfil `DEPARTMENT_MANAGER`, recebe `ADMIN:profiles.manage` em
> qualquer seed do repo (o único grant dessa permissão é para `SUPER_ADMIN`, migration
> `070_admin_permissions_catalog.sql`).

---

## Síntese para o plano de testes

- Cenário (a) **exige uma fixture nova**: um ator **não-super** cujo **vínculo ativo use o
  perfil-alvo**, e esse **perfil-alvo** conceda `ADMIN:profiles.manage`. Nem `E2E_MULTI`
  (DEPARTMENT_MANAGER, sem a permissão) nem `E2E_ADMIN` (SUPER_ADMIN, bloqueado por (b)) servem.
- Override **não** é atalho para (a): passa no gate, mas não aciona o anti-auto-trancamento.
- Como não há seed de usuários E2E no repo, provisionar essa fixture será um passo **manual no
  staging** (ou um novo setup), coerente com o padrão já usado para `E2E_MULTI`.
