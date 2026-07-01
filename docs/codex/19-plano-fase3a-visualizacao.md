# Plano — Fase 3-A (parte 2): tela READ-ONLY de Perfis e Acessos

> **Plano. Sem código ainda.** Aprovar antes. Área sensível (exibe dados de autorização). **TUDO
> read-only** (nenhum POST/PATCH/DELETE nesta fatia). Sem migration. Não toca schema/RLS/session/
> segurança além de LER. Gate por **`ADMIN:permissions.view`** (migration 070, já aplicada).

## 0. Reuso confirmado (verificado)

- Tabelas: `permissions (id, code, module_code, action_code, name, description, status, deleted_at)`,
  `access_profiles (id, code, name, description, is_system_default, status, deleted_at)`,
  `profile_permissions (access_profile_id, permission_id, is_allowed, status, deleted_at)`,
  `user_unit_links (app_user_id, unit_id, access_profile_id, status, deleted_at)`,
  `app_users (id, username, display_name, status, deleted_at)`.
- Helpers existentes (`src/lib/auth/session.ts`): **`getEffectivePermissionCodes(supabase, {isSuperAdmin,
  appUserId, links})`** (Fase 1) e **`appUserHasSuperAdminLink(supabase, appUserId)`**.
- Gate de rota: `requirePermission(CODE)` (padrão `purchases/approvals/route.ts:381`).
- Listagem de usuários existente: `GET /api/base/users` (retorna `users`, `profiles`, `units`, links).
  **Atenção:** hoje é gateada por `BASE:users.view` **E** `isSuperAdmin` (route.ts:75,82). Ver §3.3.

## 1. As 3 rotas GET (todas `requirePermission("ADMIN:permissions.view")`, read-only)

### 1.1 `GET /api/admin/permissions/catalog`
Todas as permissões do catálogo (para nomes/rotulos e agrupamento).
- Query: `permissions` where `status='active' and deleted_at is null`, `order by module_code, action_code`.
- Retorno:
```json
{ "ok": true, "permissions": [
  { "id": "...", "code": "ADMIN:permissions.view", "moduleCode": "ADMIN",
    "actionCode": "permissions.view", "name": "Visualizar permissões e acessos", "description": "..." }
]}
```

### 1.2 `GET /api/admin/permissions/profiles`
Perfis + suas permissões concedidas.
- Query A: `access_profiles` where `status='active' and deleted_at is null`, `order by name`.
- Query B: `profile_permissions` (`is_allowed=true, status='active', deleted_at is null`) **join**
  `permissions` (active) — selecionando `access_profile_id, permissions(code, module_code, action_code, name)`.
- Monta no servidor: cada perfil com sua lista de permissões. **Agrupamento por `module_code`** pode ser
  feito no servidor (mapa) ou no front; proponho retornar a lista e agrupar no front (§3).
- Retorno:
```json
{ "ok": true, "profiles": [
  { "id": "...", "code": "SUPER_ADMIN", "name": "Super Admin", "description": "...",
    "isSystemDefault": true,
    "permissions": [ { "code": "ADMIN:permissions.view", "moduleCode": "ADMIN",
                       "actionCode": "permissions.view", "name": "..." } ] }
]}
```

### 1.3 `GET /api/admin/permissions/user/[id]`
Permissões **efetivas** do usuário-ALVO (perfil + overrides), via helper da Fase 1.
- Passos (ver §2): resolver links + isSuperAdmin do ALVO → `getEffectivePermissionCodes`.
- Retorno:
```json
{ "ok": true,
  "user": { "id": "...", "username": "...", "displayName": "..." },
  "isSuperAdmin": false,
  "permissions": ["PURCHASES:requests.view", "..."],   // ["*"] se super admin
  "profiles": [ { "code": "COMPRAS", "name": "Compras" } ] }   // perfis ativos do alvo (contexto)
```
- Super admin: `permissions: ["*"]` + `isSuperAdmin: true` → o front mostra "Acesso total" (não lista).

> Todas as 3 apenas LEEM. Sem `insert/update/delete`. Erro de query → `apiError(..., 500)` (padrão).

## 2. Visão "Usuários": montar o input para o usuário-ALVO (não o logado)

Em `user/[id]` (após o gate `ADMIN:permissions.view`):
1. Buscar o alvo: `app_users` (id, username, display_name) where id = params.id, `deleted_at is null`.
   Se não existir/ inativo → 404.
2. **links do alvo:** `user_unit_links` select `unit_id, access_profile_id` where `app_user_id = id`,
   `status='active'`, `deleted_at is null` (mesma forma que a session usa).
3. **isSuperAdmin do alvo:** reusar **`appUserHasSuperAdminLink(supabase, id)`** (já existe; evita
   duplicar a deteccao de super admin).
4. Chamar **`getEffectivePermissionCodes(supabase, { isSuperAdmin, appUserId: id, links })`** — mesma
   funcao da Fase 1 (perfil + overrides, união entre unidades). Sem reimplementar nada.
5. (Opcional/contexto) perfis do alvo: join dos `access_profile_id` distintos → `access_profiles(code,name)`.

> `getEffectivePermissionCodes` usa o client admin e é read-only. Reuso direto — nenhuma lógica nova de
> resolução de permissão.

## 3. Front (tela read-only)

### 3.1 Rota e menu
- Página: **`/configuracoes/perfis-acessos`** (em `src/app/(app)/configuracoes/perfis-acessos/page.tsx`),
  renderiza um client component.
- Menu (`app-sidebar.tsx`): **grupo NOVO "Configurações"** com o item **"Perfis e Acessos"**
  (`href: "/configuracoes/perfis-acessos"`, `requiredPermission: "ADMIN:permissions.view"`). Reusa
  `canSee`/`visibleGroupEntries` — o grupo só aparece para quem tem a permissão (hoje só super admin);
  precisa importar um ícone lucide novo (ex.: `Settings`/`KeyRound`).

### 3.2 Abas
- **Aba "Perfis":** lista `profiles` (nome, `code`, badge "Padrão do sistema" se `isSystemDefault`).
  Ao selecionar um perfil, mostra suas permissões **agrupadas por `module_code`** (ADMIN/BASE/
  PURCHASES/HR/ATTACHMENTS), cada uma com `name` + `code`. Fonte: `/profiles` (+ `/catalog` para
  nomes de módulo/rotulo se necessário).
- **Aba "Usuários":** um **seletor de usuário** (reusa `GET /api/base/users` — ver §3.3) e, ao escolher,
  chama `/user/[id]` e mostra as permissões efetivas **agrupadas por `module_code`**. Se `isSuperAdmin`/
  `permissions === ["*"]` → cartão **"Acesso total (super admin)"** amigável, sem listar.

### 3.3 Seletor de usuário (decisão)
`GET /api/base/users` já lista usuários, **mas** seu gate é `BASE:users.view` **+ isSuperAdmin**. Como
`ADMIN:permissions.view` hoje pertence só ao super admin, reusar funciona **agora**. Duas opções:
- **(A)** Reusar `/api/base/users` no seletor (rápido; coerente enquanto só super admin tem a permissão).
- **(B)** Endpoint dedicado `GET /api/admin/permissions/users` (gate `ADMIN:permissions.view`), retornando
  só `id, username, displayName` — coerente se um dia `permissions.view` for concedida a um não-super.
- **Recomendo (A) agora + registrar (B) como pendência** (evita endpoint extra nesta fatia). **Decisão sua.**

### 3.4 Rótulos de módulo
Mapa client `MODULE_LABELS = { ADMIN: "Administração", BASE: "Cadastros", PURCHASES: "Compras",
HR: "RH", ATTACHMENTS: "Anexos", ... }` (fallback = o próprio `module_code`).

### 3.5 Gate visual
O menu esconde o item sem `ADMIN:permissions.view`. **Hardening opcional:** a página pode fazer
`requirePermission`/redirect no server (server component) — mas o gate real são as 3 APIs (retornam 403);
sigo o padrão da Fase 1 (API-gated) e deixo o page-guard como opcional.

## 4. Permissão no client
String literal **`"ADMIN:permissions.view"`** (como Fases 1/2). **Não** importar `permissions.ts` no
client (puxa `server-only` via `session.ts`). Reusar `canDo`/`canSee` já existentes.

## 5. Garantias
- **Read-only total:** as 3 rotas são GET; nenhuma escrita nesta fatia. Sem migration/DDL.
- **Sem mudança de schema/RLS/session/segurança** — só leitura + reuso de helpers.
- **Gate server-side:** cada API valida `ADMIN:permissions.view` (não confia no menu). Super admin vê
  tudo (helpers já tratam `"*"`).
- **E2E T2/T3 intactos** (tela nova e isolada; nenhum toque nos fluxos de compras).

## 6. Fora de escopo (próximas fatias)
- 3-B (overrides.manage) e 3-C (profiles.manage) — escrita; ficam para depois (permissões já catalogadas
  na 070).
- Endpoint dedicado de usuários por `permissions.view` (§3.3-B), se a permissão sair do super admin.

## 7. Saída após aprovação
- `src/app/api/admin/permissions/{catalog,profiles,user/[id]}/route.ts` (GET, gate permissions.view).
- `src/app/(app)/configuracoes/perfis-acessos/page.tsx` + client component (abas).
- `app-sidebar.tsx`: grupo "Configurações" + item "Perfis e Acessos".
