# Plano — Fase 3-C: edição das permissões de perfis (`profile_permissions`)

> **Plano. Sem código ainda.** Aprovar antes. **Operação mais sensível do sistema:** escrita de
> autorização que afeta **TODOS** os usuários do perfil de uma vez. Escrita **somente** em
> `profile_permissions`. **NÃO** tocar `access_profiles` (criar/renomear/excluir perfil = 3-D). Sem
> migration/DDL/RLS. Gate `ADMIN:profiles.manage`. Salvaguardas no BACKEND (bloqueio total) + espelhadas
> na UI. Respeita `docs/NAO_ALTERAR.md`.

## 0. Fatos verificados (no código real)

- **Tabela `profile_permissions`** (colunas usadas): `id, access_profile_id, permission_id, is_allowed
  bool, reason?, status (record_status), created_at, updated_at, created_by, updated_by, deleted_at,
  deleted_by`, com **`unique(access_profile_id, permission_id)` SEM `unit_id`**.
  → **Confirmado:** ao contrário dos overrides (onde `unit_id NULL` quebrava `on conflict`), aqui o
  `on conflict (access_profile_id, permission_id)` **funciona**. Mesmo assim, para manter simetria com a
  3-B e o tratamento de linhas soft-deletadas, o plano usa **upsert manual** (SELECT existente → UPDATE/
  reativa senão INSERT). Isso evita depender de a constraint estar declarada exatamente como esperamos e
  já cobre a reativação de linha soft-deletada. (Decisão D3.)
- **`SUPER_ADMIN_PROFILE_CODE = "SUPER_ADMIN"`** em [`src/lib/auth/session.ts:9`](../../src/lib/auth/session.ts#L9).
- **Helpers reusáveis:** `appUserHasSuperAdminLink(supabase, appUserId)` (session.ts:366),
  `requirePermission(CODE)` (permissions.ts:330) → `context = { session, supabase, isSuperAdmin, ... }`
  com `context.session.user.id` = **ator**.
- **3-A/3-B (já no `main`):** `GET /api/admin/permissions/profiles` (perfis + grants ativos),
  `GET /api/admin/permissions/catalog` (catálogo completo), `GET /api/admin/permissions/user/[id]`,
  `PUT/DELETE /api/admin/permissions/overrides` (padrão a espelhar). Aba Perfis hoje é **read-only** em
  [`perfis-acessos-client.tsx`](../../src/components/admin/perfis-acessos-client.tsx) (`ProfilesTab`,
  `ModulePermissionList`).

### 0.1 ⚠️ COMO `profile_permissions` é lido HOJE — DIVERGÊNCIA CRÍTICA entre os dois resolvers

Há **dois** resolvers e eles filtram `profile_permissions` de forma **diferente**:

- **Resolver A — o GATE de autorização** (`getProfileAllowedIds` em
  [`permissions.ts:191-198`](../../src/lib/auth/permissions.ts#L191-L198), usado por
  `requirePermission` / `getAccessibleUnitIdsForPermission`):
  filtra **`is_allowed = true` AND `status = 'active'` AND `deleted_at IS NULL`**. ✅ Respeita
  soft-delete e `is_allowed=false`.
- **Resolver B — os CÓDIGOS EFETIVOS da sessão** (`getEffectivePermissionCodes` em
  [`session.ts:148-166`](../../src/lib/auth/session.ts#L148-L166), que monta `session.permissions`
  usado pela **sidebar/menu (Fase 1)**, pela ocultação de botões (Fase 2) e pelo campo `permissions`
  do `GET /user/[id]`):
  seleciona `profile_permissions` **SEM nenhum filtro** de `is_allowed`, `status` ou `deleted_at` —
  **toda linha conta como concedida**. ❌

**Consequência direta para a 3-C:** qualquer método de revogação (soft-delete OU `is_allowed=false`)
será **corretamente respeitado pelo Resolver A (o gate de segurança)** — ou seja, a API-alvo passa a
retornar 403 para o usuário. **Mas o Resolver B continuará listando a permissão** (ele ignora status/
deleted_at/is_allowed), então **o menu/UI da sessão viva mostraria a permissão revogada até o Resolver B
ser corrigido**. Não é furo de segurança (o gate real bloqueia), mas **quebra o critério de aceite
"revogar reflete no efetivo"** para a parte de UI/menu.

> Isto é área sensível (auth). Está registrado como **Decisão D1** (§6) — precisa da sua escolha antes
> de eu escrever código. O restante do plano assume a opção recomendada (D1-a: alinhar o Resolver B).

## 1. Modelo de escrita — grant/revoke em `profile_permissions`

**Semântica escolhida (D2):** um perfil **concede** permissões; ele não "nega" (negação por usuário é o
domínio de overrides, 3-B). Portanto uma linha de `profile_permissions` só existe em dois estados úteis:

- **Concedida:** linha **ativa** com `is_allowed = true`, `deleted_at NULL`.
- **Revogada:** linha **soft-deleted** (`status='inactive'`, `deleted_at`/`deleted_by` preenchidos).

Nunca usaremos `is_allowed = false` em `profile_permissions` (evita o "terceiro estado" ambíguo e é
consistente com como o Resolver A lê — `is_allowed=true`). Revogar = **soft-delete** (mesma filosofia da
3-B; preserva trilha; reativável). Isso reflete corretamente no Resolver A imediatamente.

## 2. Rota de ESCRITA — `PUT /api/admin/permissions/profiles` (gate `ADMIN:profiles.manage`)

> Nova rota `PUT` (+ `DELETE`) **no mesmo arquivo** [`profiles/route.ts`](../../src/app/api/admin/permissions/profiles/route.ts)
> que hoje só tem `GET` (3-A). O `GET` permanece gated por `ADMIN:permissions.view`; a escrita é gated
> por `ADMIN:profiles.manage`. Espelha 1:1 o padrão de `overrides/route.ts`.

### 2.1 `PUT` (conceder)
- **Body:** `{ profileId: uuid, permissionCode: string }`. (`isAllowed` **não** vem do client — conceder
  sempre grava `is_allowed=true`; revogar é o `DELETE`. Mantém o modelo binário do §1.)
- **Validações (422/404):** perfil existe e ativo (`access_profiles`, `status=active`, `deleted_at null`)
  → resolve `access_profile_id`; `permissionCode` existe/ativa no catálogo → resolve `permission_id`.
- **Salvaguardas (§3) ANTES de escrever.**
- **Upsert manual:** SELECT linha `access_profile_id + permission_id` (qualquer status, inclui
  soft-deleted). Se existir → UPDATE `is_allowed=true, status='active', deleted_at=null, deleted_by=null,
  reason=null, updated_by=actor`. Senão → INSERT (`is_allowed=true, status='active', created_by=actor,
  updated_by=actor`).
- **Retorno:** `{ ok: true, grant: { profileId, permissionCode, isAllowed: true } }`.

### 2.2 `DELETE` (revogar = soft-delete)
- **Body:** `{ profileId: uuid, permissionCode: string }`.
- **Validações + salvaguardas (§3).**
- Busca linha **ativa** (`status='active'`, `deleted_at null`). Se não houver → `{ ok:true, removed:false }`
  (idempotente). Se houver → UPDATE `status='inactive', deleted_at=now(), deleted_by=actor,
  updated_by=actor`. **Nunca hard-delete.**
- **Retorno:** `{ ok: true, removed: true }`.

Erros seguem `apiError(msg, status)`. Nenhuma escrita fora de `profile_permissions`.

## 3. Salvaguardas (todas SERVER-SIDE — bloqueio total; espelhadas na UI)

Aplicadas em `PUT` e `DELETE`, **antes** de qualquer escrita:

1. **SUPER_ADMIN INTOCÁVEL (inegociável).** Carrega o perfil-alvo (`access_profiles.code`). Se
   `code === SUPER_ADMIN_PROFILE_CODE` → `apiError("O perfil Super Administrador não pode ser editado.",
   422)`. Bloqueia conceder **e** revogar. (Aplica ao `PUT` também: nada entra/sai do SUPER_ADMIN por
   esta tela.) UI: perfil SUPER_ADMIN sem controles (só leitura, "Acesso total").
2. **ANTI-AUTO-TRANCAMENTO.** `PROTECTED_ADMIN = ["ADMIN:permissions.view", "ADMIN:profiles.manage",
   "ADMIN:overrides.manage"]`. Regra: **no `DELETE` (revogar)**, se `permissionCode ∈ PROTECTED_ADMIN`
   **e o ator usa o perfil-alvo**, bloquear → `apiError("Você não pode remover permissões de
   administração de um perfil que você mesmo utiliza.", 422)`.
   - "Ator usa o perfil-alvo" = existe `user_unit_links` **ativo** (`status=active`, `deleted_at null`)
     com `app_user_id = context.session.user.id` **e** `access_profile_id = profileId`. (Query direta —
     não depende do perfil ativo da sessão, pois o ator pode ter o perfil-alvo em unidade não-ativa.)
   - `PUT` (conceder) é inócuo → **não** bloqueado por (2).
   - Observação: hoje só o SUPER_ADMIN tem `profiles.manage` e o alvo SUPER_ADMIN já cai em (1); (2)
     protege o cenário futuro de `profiles.manage` concedida a um perfil não-super que o ator use.
3. **AVISO DE IMPACTO (contagem, read-only).** A API expõe quantos **usuários** o perfil afeta
   (ver §4); a UI exige confirmação no modal com esse número antes de aplicar. (Não é bloqueio; é
   consentimento informado.)
4. **Gate** `requirePermission("ADMIN:profiles.manage")` em `PUT`/`DELETE` (403 sem permissão).
5. **Auditoria** `audit_trail` (§5).

## 4. Contagem de impacto (usuários por perfil) — read-only

- **Onde:** estender `GET /api/admin/permissions/profiles` para incluir, por perfil, `userCount`.
  (Alternativa considerada: endpoint dedicado `GET /profiles/[id]/impact`. Recomendo estender o `GET`
  existente — a aba já o consome; é aditivo e não quebra a 3-A.) — **Decisão D4.**
- **Cálculo:** distinct `app_user_id` em `user_unit_links` com `access_profile_id = perfil`,
  `status='active'`, `deleted_at IS NULL`. Conta **usuários distintos** (um usuário com o perfil em N
  unidades conta 1). Feito em lote para todos os perfis exibidos.
- **Uso na UI:** no modal de confirmação — "Este perfil é usado por **N usuário(s)**; a mudança afeta
  todos." Se `N = 0`, texto neutro ("Nenhum usuário usa este perfil atualmente").

## 5. Auditoria (`audit_trail`, best-effort + log) — mesmo padrão da 3-B

- **Autor em toda escrita:** `created_by`/`updated_by`/`deleted_by = context.session.user.id`.
- **`audit_trail`** por escrita: `action` `insert` (nova concessão) / `update` (reativar) /
  `soft_delete` (revogar); `module_code='ADMIN'`; `entity_type='profile_permission'`;
  `entity_id` = id da linha; `table_name='profile_permissions'`; `app_user_id` = **ator**;
  `old_value`/`new_value` = JSON da linha antes/depois; `metadata = { profileId, profileCode,
  permissionCode, isAllowed }`.
- **Best-effort:** falha ao gravar auditoria **não reverte** a escrita e é **logada**
  (`logBaseCadastroError`), idêntico a `writeOverrideAudit`.

## 6. Decisões para sua revisão (D1 é bloqueante)

- **D1 (BLOQUEANTE — área sensível/auth): o Resolver B (`getEffectivePermissionCodes`) ignora
  `is_allowed`/`status`/`deleted_at` em `profile_permissions`.** Sem corrigir, a revogação **não reflete**
  no menu/UI da sessão viva (embora o gate real já bloqueie). Opções:
  - **D1-a (RECOMENDADA):** alinhar o Resolver B ao Resolver A — adicionar
    `.eq("is_allowed", true).eq("status","active").is("deleted_at", null)` na query de `session.ts:148-151`.
    Correção pequena, corrige um **bug pré-existente** e faz a revogação refletir no efetivo. **Toca um
    resolver** (a restrição pedia não tocar) → por isso peço sua autorização explícita. Faria como
    **mudança-companheira** da 3-C, com nota no commit.
  - **D1-b:** não tocar o resolver agora; documentar que a revogação só reflete no menu após novo login/
    refresh de sessão. (Não atende plenamente o aceite "reflete no efetivo".)
  - **D1-c:** tratar a correção do Resolver B como uma fatia própria (3-C.1) antes/depois desta.
- **D2:** revogar = **soft-delete** (não `is_allowed=false`). Confirmar.
- **D3:** **upsert manual** (mesmo com `on conflict` viável) para reativar soft-deletadas e simetria com
  3-B. Confirmar (alternativa: `upsert` nativo por on-conflict + tratamento à parte de reativação).
- **D4:** `userCount` no `GET /profiles` (recomendado) vs endpoint dedicado.

## 7. UI — estende a aba "Perfis" (hoje read-only)

- **Gate visual:** edição só quando `canDo(myPermissions, "ADMIN:profiles.manage")` (literal client-safe,
  como na 3-B). Sem a permissão → mantém a visão read-only atual (`ModulePermissionList`).
- **Grade de edição:** para o perfil selecionado, listar o **catálogo completo** (`GET /catalog`,
  `groupByModule`/`MODULE_LABELS` reusados), cada permissão com **checkbox/toggle** marcado quando
  concedida (derivado de `selectedProfile.permissions`). Alternar → abre **modal de confirmação**.
- **Modal de confirmação (toda mudança):** título conceder/revogar + resumo (perfil, permissão) +
  **aviso de impacto** ("N usuários"). Confirmar → `PUT` (conceder) ou `DELETE` (revogar) →
  invalidar/`refetch` de `["admin","permissions","profiles"]` (e do `/user/[id]` se aberto).
- **SUPER_ADMIN:** perfil-alvo SUPER_ADMIN → **sem controles** (só leitura; badge "Acesso total").
- **PROTECTED_ADMIN desabilitado:** checkbox de permissão ∈ PROTECTED_ADMIN aparece **desabilitado para
  revogar** quando o ator usa o perfil-alvo (espelha a salvaguarda 2; o backend também bloqueia). A UI
  precisa saber se o ator usa o perfil → expor `usedByActor: boolean` por perfil no `GET /profiles`
  (read-only, aditivo) OU derivar de `myUserId` + lista de usuários do perfil. (Detalhe de UI; decido na
  implementação a via mais simples, provavelmente `usedByActor` no GET.)
- **Estados de rede:** botões desabilitados enquanto `mutation.isPending`; erro exibido; sucesso fecha o
  modal e atualiza a grade.

## 8. Garantias

- Escrita **somente** em `profile_permissions`. **Nada** de `access_profiles` (3-D),
  `user_permission_overrides` (3-B), schema, migration, RLS.
- Resolvers **inalterados** — **exceto** a correção opcional D1-a (se você aprovar), que é a única
  mudança fora de `profile_permissions` e será claramente sinalizada.
- Gate server-side `ADMIN:profiles.manage`; 5 salvaguardas no backend; soft-delete; auditoria com autor.
- 3-A/3-B seguem funcionando (extensões do `GET /profiles` são aditivas; `GET` continua `permissions.view`).
- **Aceite/T2/T3:** os perfis usados nos testes E2E **não podem perder** permissões essenciais — nenhuma
  escrita é feita pelo plano/código automaticamente; as mudanças são manuais via UII. Rodar tsc/lint/
  build + E2E T2/T3 após a implementação, antes de qualquer revisão de merge.

## 9. Saída após aprovação (arquivos)

- `src/app/api/admin/permissions/profiles/route.ts` — adicionar `PUT` + `DELETE` (gate `profiles.manage`,
  salvaguardas, upsert manual, soft-delete, auditoria) e estender o `GET` com `userCount` (+ `usedByActor`).
- `src/components/admin/perfis-acessos-client.tsx` — `ProfilesTab` com grade editável + modal de impacto.
- **(Se D1-a aprovada)** `src/lib/auth/session.ts` — filtro em `getEffectivePermissionCodes`
  (`is_allowed=true, status=active, deleted_at IS NULL`), como mudança-companheira sinalizada.
