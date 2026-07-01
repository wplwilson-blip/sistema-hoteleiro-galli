# Plano — Fase 3-B: edição de exceções de permissão por usuário (user_permission_overrides)

> **Plano. Sem código ainda.** Aprovar antes. **PRIMEIRA tela que ESCREVE autorização** (concede/
> revoga acesso) — altíssima sensibilidade. Escrita **somente** em `user_permission_overrides`
> (NADA de `profile_permissions` — isso é 3-C). Sem migration (tabela já existe). Gate
> `ADMIN:overrides.manage`. Salvaguardas no BACKEND (bloqueio total) + espelhadas na UI.

## 0. Fatos verificados

- `user_permission_overrides` (migration 003:143): `id, app_user_id, unit_id (nullable), permission_id,
  is_allowed bool NOT NULL, reason text, status (record_status default active), created_at, updated_at,
  created_by, updated_by, deleted_at, deleted_by`, **unique(app_user_id, unit_id, permission_id)**.
- Precedência **override > perfil** já implementada nos resolvers (`is_allowed=true` concede, `false`
  nega; `unit_id` nulo aplica a todas as unidades vinculadas) — **não muda** nesta fase.
- `audit_action` enum (001:49): `insert, update, soft_delete, restore, delete, login, logout, approve,
  reject, system`. `audit_trail` (007:62): `action, module_code, entity_type, entity_id, table_name,
  app_user_id, unit_id, old_value jsonb, new_value jsonb, metadata jsonb`. `system_logs` (007:45):
  `level, action, module_code, entity_type, entity_id, app_user_id, unit_id, message, context`.
- Helpers reusáveis: `appUserHasSuperAdminLink(supabase, appUserId)`, `getEffectivePermissionCodes`
  (Fase 1), gate `requirePermission(CODE)`.
- 3-A já expõe: `GET /api/admin/permissions/catalog`, `GET /api/admin/permissions/user/[id]`, e a aba
  Usuários em `/configuracoes/perfis-acessos`.

> ⚠️ **Caveat de upsert (importante):** como `unit_id` será SEMPRE `NULL` e o Postgres trata `NULL`
> como distinto em unique, `on conflict (app_user_id, unit_id, permission_id)` **não** dedupe linhas de
> escopo nulo. Portanto o upsert será **manual**: SELECT existente (por `app_user_id + permission_id +
> unit_id IS NULL`, incluindo linhas soft-deletadas) → UPDATE se achar (reativando), senão INSERT.

## 1. Rotas de ESCRITA — `/api/admin/permissions/overrides` (gate `ADMIN:overrides.manage`)

### 1.1 `PUT` (conceder/negar = upsert)
- Body: `{ targetUserId: uuid, permissionCode: string, isAllowed: boolean, reason?: string }`.
  `unit_id` **NÃO** vem do client — forçado `null` no servidor (decisão: escopo sempre todas as unidades).
- Validações (422 em falha): `targetUserId` existe e ativo (`app_users`); `permissionCode` existe/ativa
  no catálogo → resolve `permission_id`; `isAllowed` booleano; `reason` opcional (trim → null se vazio).
- Salvaguardas (§2) ANTES de escrever.
- Upsert manual (ver caveat): busca linha `app_user_id=target, permission_id, unit_id is null`
  (qualquer status). Se existir → UPDATE `is_allowed, reason, status='active', deleted_at=null,
  deleted_by=null, updated_by=actor, updated_at=now()`. Senão → INSERT (`unit_id=null, is_allowed,
  reason, status='active', created_by=actor, updated_by=actor`).
- Retorno: `{ ok: true, override: { id, permissionCode, isAllowed, reason } }`.

### 1.2 `DELETE` (seguir perfil = remover exceção, SOFT-delete)
- Body: `{ targetUserId: uuid, permissionCode: string }`.
- Validações + salvaguardas (§2).
- Busca override ativa (`unit_id is null, deleted_at is null`). Se não houver → `{ ok: true, removed:
  false }` (idempotente). Se houver → UPDATE `status='inactive', deleted_at=now(), deleted_by=actor,
  updated_by=actor`. **Nunca hard-delete.**
- Retorno: `{ ok: true, removed: true }`.

> Só GET (3-A) + PUT/DELETE (3-B). Nenhum `profile_permissions`. Erros seguem `apiError(msg, status)`.

## 2. Salvaguardas no BACKEND (bloqueio TOTAL — 403/422; espelhadas na UI)

Aplicadas em PUT e DELETE, **antes** de qualquer escrita:

1. **Alvo é super admin → BLOQUEAR.** `if (await appUserHasSuperAdminLink(supabase, targetUserId))` →
   `apiError("Não é possível criar exceções de permissão para um super administrador.", 422)`. (Super
   admin já vê tudo; exceção nele é sem sentido e perigosa.) UI: esconder os controles de edição para
   alvo super admin (já mostra "Acesso total").
2. **Auto-trancamento → BLOQUEAR.** Seja `PROTECTED_ADMIN = ["ADMIN:overrides.manage",
   "ADMIN:permissions.view"]` (avaliar incluir `ADMIN:profiles.manage`). Se
   `targetUserId === context.session.user.id` **e** `permissionCode ∈ PROTECTED_ADMIN` **e** a operação
   REDUZ o próprio acesso (PUT com `isAllowed=false`, ou DELETE de um override que sustenta o acesso) →
   `apiError("Você não pode remover a sua própria capacidade de administrar acessos.", 422)`.
   - Regra concreta segura: bloquear `actor===alvo && code ∈ PROTECTED_ADMIN && (PUT isAllowed=false ||
     DELETE)`. Conceder a si mesmo (`isAllowed=true`) é inócuo e permitido.
   - Observação: hoje só super admin tem `overrides.manage` (e alvo super admin já é bloqueado por (1));
     a salvaguarda (2) protege o cenário futuro de `overrides.manage` concedida a um não-super.

## 3. Auditoria (recomendado)

- **Autor em toda escrita:** `created_by`/`updated_by`/`deleted_by = context.session.user.id` (padrão das
  rotas existentes).
- **`audit_trail` (RECOMENDADO — é a trilha para "alteracoes criticas", com old/new value):** inserir em
  cada escrita:
  - `action`: `insert` (novo override), `update` (reativar/alterar), `soft_delete` (remover).
  - `module_code`: `'ADMIN'`; `entity_type`: `'user_permission_override'`; `entity_id`: id do override;
    `table_name`: `'user_permission_overrides'`.
  - `app_user_id`: **ator** (quem fez); `old_value`/`new_value`: JSON da linha antes/depois (null quando
    não aplicável); `metadata`: `{ targetUserId, permissionCode, isAllowed }`.
  - Nota: `audit_trail` parece ainda não ser escrito pelo app (só `system_logs` é, via `writeAuthLog`).
    Como esta é a primeira escrita de autorização, **recomendo adotar `audit_trail` aqui** (estabelece o
    padrão para 3-C). Se preferir manter só `system_logs` por ora, registro como decisão.
- **`system_logs` (opcional, log técnico):** `action` `'admin.override.upsert'`/`'admin.override.remove'`,
  `module_code 'ADMIN'`, `app_user_id` ator, `message`, `context { targetUserId, permissionCode }`.
- **Falha de auditoria não deve reverter a escrita** já efetivada — logar erro e seguir (a escrita do
  override é a fonte de verdade; auditoria é complementar). (Decisão sua: best-effort vs transacional.)

## 4. UI — estende a aba "Usuários" da 3-A

Após selecionar um usuário (não super admin), abaixo do resumo:
- **Lista COMPLETA do catálogo** (`GET /catalog`) agrupada por `module_code` (reusa `groupByModule`/
  `MODULE_LABELS`).
- Para cada permissão, o **estado efetivo do alvo** e um **controle de 3 estados**:
  - Estados exibidos: **Herdada do perfil** / **Concedida por exceção** / **Negada por exceção** /
    **Sem acesso**.
  - Controle: **"Seguir perfil"** (sem override) · **"Conceder"** (override `is_allowed=true`) ·
    **"Negar"** (override `is_allowed=false`).
- **Como calcular o estado** (precisa do breakdown, não só do efetivo). **Extensão read-only do
  `GET /api/admin/permissions/user/[id]`** para retornar, além de `permissions` (efetivas, já usado pela
  3-A):
  - `profilePermissions: string[]` — códigos concedidos pelos PERFIS do alvo (grants de
    `profile_permissions`, união entre unidades, SEM overrides).
  - `overrides: [{ permissionCode, isAllowed }]` — overrides ativos do alvo (`unit_id is null`).
  - Derivação por permissão: se há override → "Concedida/Negada por exceção"; senão se
    `profilePermissions` inclui → "Herdada do perfil"; senão "Sem acesso".
  (Alternativa: endpoint dedicado `GET /overrides?userId=`. Recomendo estender `/user/[id]` — a aba já o
  consome; adição é read-only e não quebra a 3-A.)
- **Modal de confirmação em TODA mudança** (conceder / negar / seguir perfil): "Tem certeza?" com resumo
  (usuário, permissão, ação) + campo **Justificativa (opcional)**. Confirmar → PUT (conceder/negar) ou
  DELETE (seguir perfil) → refetch `/user/[id]`.
- **Super admin como alvo:** sem controles (mostra "Acesso total", como na 3-A).
- **Auto-trancamento na UI:** desabilitar "Negar"/"Seguir perfil" quando `alvo === logado` e a permissão
  ∈ PROTECTED_ADMIN (o backend também bloqueia — a UI só evita o clique).
- **Gate visual:** a edição só aparece para quem tem `ADMIN:overrides.manage` (string literal no client);
  a página já tem page-guard (3-A) por `ADMIN:permissions.view` — como `overrides.manage` hoje é do
  super admin (que tem ambas), a aba de edição pode checar `canDo(permissions, "ADMIN:overrides.manage")`.

## 5. Garantias

- Escrita **somente** em `user_permission_overrides` (nenhum `profile_permissions` — 3-C).
- **Sem migration/DDL/RLS/schema**; resolvers de sessão/permissão **inalterados** (precedência já existe).
- **Gate server-side** `ADMIN:overrides.manage` em PUT/DELETE; **salvaguardas no backend** (não só UI):
  alvo super admin bloqueado; auto-trancamento bloqueado.
- Soft-delete (nunca hard-delete); auditoria com autor (+ `audit_trail` recomendado).
- 3-A permanece funcional (extensão do `/user/[id]` é aditiva; `permissions` continua no retorno).

## 6. Decisões pendentes (para sua revisão)
1. **`audit_trail`**: adotar agora (recomendado) ou manter só `system_logs`?
2. **Auditoria best-effort** (não reverte a escrita em falha de log) — confirmar.
3. **`PROTECTED_ADMIN`** inclui `ADMIN:profiles.manage` além de `overrides.manage`/`permissions.view`?
4. Extensão do `/user/[id]` (recomendado) vs endpoint dedicado `/overrides?userId=`.

## 7. Saída após aprovação
- `src/app/api/admin/permissions/overrides/route.ts` (PUT + DELETE, gate `overrides.manage`, salvaguardas,
  upsert manual, soft-delete, auditoria).
- Extensão read-only de `.../user/[id]/route.ts` (`profilePermissions` + `overrides`).
- Extensão da aba Usuários em `perfis-acessos-client.tsx` (catálogo + 3 estados + modal de confirmação).
