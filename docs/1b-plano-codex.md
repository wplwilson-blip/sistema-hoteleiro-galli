# Plano 1b - Autorizacao por permissao para decisao de aprovacao de compras

## Objetivo

Corrigir a autorizacao de `assertCanDecidePurchaseApprovalLevel` para seguir o padrao-ouro do projeto: decisao por permissao e escopo de unidade, nao por nome hardcoded de perfil.

Esta etapa ainda e plano. Nao altera codigo, banco, Auth, login, Supabase Auth, RLS, snapshots, triggers ou helpers de sessao.

## Arquivos previstos

- `supabase/migrations/065_purchase_approval_decision_grants_split.sql`
- `src/lib/auth/permissions.ts`
- `src/lib/purchases/approval-authorization.ts`
- `tests/unit/purchases/approval-authorization.spec.ts`

## Migration prevista

Nome previsto:

```text
supabase/migrations/065_purchase_approval_decision_grants_split.sql
```

SQL exato proposto:

```sql
-- Divide a permissao de decisao de aprovacao de compras por alcada.
-- Seed/grants apenas: nao altera Auth, login, auth_email, RLS, policies,
-- snapshots, triggers ou schema operacional.
-- SUPER_ADMIN nao precisa de grant porque segue como atalho no codigo.

insert into public.permissions (module_code, action_code, name, description)
values
  (
    'PURCHASES',
    'approvals.decide.administrative',
    'Decidir aprovacoes administrativas de compras',
    'Permite aprovar, reprovar ou devolver compras na alcada de Gerencia Administrativa no escopo permitido.'
  ),
  (
    'PURCHASES',
    'approvals.decide.directorate',
    'Decidir aprovacoes da diretoria de compras',
    'Permite aprovar, reprovar ou devolver compras na alcada de Diretoria Geral no escopo permitido.'
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with profile_permission_matrix(profile_code, permission_code) as (
  values
    ('DEPARTMENT_MANAGER', 'PURCHASES:approvals.decide.administrative'),
    ('UNIT_DIRECTOR', 'PURCHASES:approvals.decide.administrative'),
    ('UNIT_DIRECTOR', 'PURCHASES:approvals.decide.directorate'),
    ('NETWORK_MANAGER', 'PURCHASES:approvals.decide.administrative'),
    ('NETWORK_MANAGER', 'PURCHASES:approvals.decide.directorate')
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  access_profile.id,
  permission.id,
  true,
  'active'
from profile_permission_matrix matrix
join public.access_profiles access_profile
  on access_profile.code = matrix.profile_code
 and access_profile.status = 'active'
 and access_profile.deleted_at is null
join public.permissions permission
  on permission.code = matrix.permission_code
 and permission.status = 'active'
 and permission.deleted_at is null
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

update public.profile_permissions profile_permission
set
  is_allowed = false,
  status = 'inactive',
  deleted_at = now(),
  deleted_by = null,
  updated_at = now()
from public.permissions permission
where profile_permission.permission_id = permission.id
  and permission.code = 'PURCHASES:approvals.decide'
  and profile_permission.deleted_at is null;

-- Rollback manual, se necessario:
--
-- with legacy_profile_permission_matrix(profile_code, permission_code) as (
--   values
--     ('SUPER_ADMIN', 'PURCHASES:approvals.decide'),
--     ('NETWORK_MANAGER', 'PURCHASES:approvals.decide'),
--     ('UNIT_DIRECTOR', 'PURCHASES:approvals.decide')
-- )
-- insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
-- select
--   access_profile.id,
--   permission.id,
--   true,
--   'active'
-- from legacy_profile_permission_matrix matrix
-- join public.access_profiles access_profile
--   on access_profile.code = matrix.profile_code
--  and access_profile.status = 'active'
--  and access_profile.deleted_at is null
-- join public.permissions permission
--   on permission.code = matrix.permission_code
--  and permission.status = 'active'
--  and permission.deleted_at is null
-- on conflict (access_profile_id, permission_id) do update set
--   is_allowed = true,
--   status = 'active',
--   deleted_at = null,
--   deleted_by = null,
--   updated_at = now();
--
-- update public.profile_permissions profile_permission
-- set
--   is_allowed = false,
--   status = 'inactive',
--   deleted_at = now(),
--   deleted_by = null,
--   updated_at = now()
-- from public.permissions permission,
--      public.access_profiles access_profile
-- where profile_permission.permission_id = permission.id
--   and access_profile.id = profile_permission.access_profile_id
--   and permission.code in (
--     'PURCHASES:approvals.decide.administrative',
--     'PURCHASES:approvals.decide.directorate'
--   )
--   and access_profile.code in ('DEPARTMENT_MANAGER', 'UNIT_DIRECTOR', 'NETWORK_MANAGER')
--   and profile_permission.deleted_at is null;
```

## Validacoes SQL previstas apos aplicacao

```sql
select code, status, deleted_at
from public.permissions
where code in (
  'PURCHASES:approvals.decide',
  'PURCHASES:approvals.decide.administrative',
  'PURCHASES:approvals.decide.directorate'
)
order by code;
```

```sql
select
  access_profile.code as profile_code,
  permission.code as permission_code,
  profile_permission.is_allowed,
  profile_permission.status,
  profile_permission.deleted_at
from public.profile_permissions profile_permission
join public.access_profiles access_profile
  on access_profile.id = profile_permission.access_profile_id
join public.permissions permission
  on permission.id = profile_permission.permission_id
where permission.code in (
  'PURCHASES:approvals.decide',
  'PURCHASES:approvals.decide.administrative',
  'PURCHASES:approvals.decide.directorate'
)
order by access_profile.code, permission.code;
```

Resultado esperado:

- `PURCHASES:approvals.decide.administrative` existe e esta ativa.
- `PURCHASES:approvals.decide.directorate` existe e esta ativa.
- `DEPARTMENT_MANAGER` tem grant ativo apenas de `PURCHASES:approvals.decide.administrative`.
- `UNIT_DIRECTOR` tem grants ativos de `PURCHASES:approvals.decide.administrative` e `PURCHASES:approvals.decide.directorate`.
- `NETWORK_MANAGER` tem grants ativos de `PURCHASES:approvals.decide.administrative` e `PURCHASES:approvals.decide.directorate`.
- Nao existe grant ativo restante para `PURCHASES:approvals.decide`.
- `SUPER_ADMIN` nao precisa de grant novo nem antigo porque passa pelo atalho do helper.

## Nova logica da funcao

Arquivo:

```text
src/lib/purchases/approval-authorization.ts
```

Mudancas previstas:

- Remover `DIRECTORATE_PROFILE_CODES`.
- Remover consulta direta a `user_unit_links` filtrando por `access_profiles.code`.
- Reutilizar `userHasPermissionForUnit` de `@/lib/auth/permissions`, incluindo o atalho de `SUPER_ADMIN` ja existente no helper generico.
- Remover import de `SUPER_ADMIN_PROFILE_CODE` se ele nao for mais necessario.
- Adicionar constantes de permissao em `PURCHASES_PERMISSIONS`:
  - `approvalsDecideAdministrative: "PURCHASES:approvals.decide.administrative"`
  - `approvalsDecideDirectorate: "PURCHASES:approvals.decide.directorate"`

Caso a caso:

| `approvalLevel` | Permissao exigida | Resultado esperado |
| --- | --- | --- |
| `administrative_management` | `PURCHASES:approvals.decide.administrative` na unidade da compra | `DEPARTMENT_MANAGER`, `UNIT_DIRECTOR` e `NETWORK_MANAGER` passam apenas se tiverem vinculo/permissao na unidade. |
| `general_directorate` | `PURCHASES:approvals.decide.directorate` na unidade da compra | `UNIT_DIRECTOR` e `NETWORK_MANAGER` passam apenas se tiverem vinculo/permissao na unidade. |
| qualquer nivel | atalho de `SUPER_ADMIN` | `SUPER_ADMIN` passa em ambos os ramos sem depender de grant. |

Pseudo-logica prevista:

```ts
const requiredPermission =
  input.approvalLevel === "general_directorate"
    ? PURCHASES_PERMISSIONS.approvalsDecideDirectorate
    : PURCHASES_PERMISSIONS.approvalsDecideAdministrative;

const canDecide = await userHasPermissionForUnit(
  supabase,
  input.session,
  requiredPermission,
  input.unitId,
  {
    validationErrorMessage: "Nao foi possivel validar a autoridade para decidir este dossie.",
    unitValidationErrorMessage: "Nao foi possivel validar a autoridade para decidir este dossie."
  }
);

if (!canDecide) {
  throw new PurchaseApprovalAuthorizationError(messageByApprovalLevel[input.approvalLevel], 403);
}
```

Mensagens previstas:

- Para `administrative_management`: `Voce nao tem permissao para decidir aprovacoes administrativas de compras nesta unidade.`
- Para `general_directorate`: `Aprovacao restrita a Diretoria Geral. Seu perfil nao possui autoridade para decidir este dossie nesta unidade.`
- Para falha tecnica de validacao: `Nao foi possivel validar a autoridade para decidir este dossie.`

Observacao: o bloqueio da Gerencia Administrativa em `general_directorate` fica garantido pela ausencia do grant `PURCHASES:approvals.decide.directorate` para `DEPARTMENT_MANAGER`, nao por `if` baseado em nome de perfil.

## Testes unitarios previstos

Como o projeto nao tem runner unitario dedicado e ja usa `@playwright/test`, os testes serao criados em:

```text
tests/unit/purchases/approval-authorization.spec.ts
```

Runner previsto:

```powershell
npx playwright test tests/unit/purchases/approval-authorization.spec.ts --project=chromium
```

Testes:

1. `DEPARTMENT_MANAGER` com permissao `PURCHASES:approvals.decide.administrative` e vinculo na unidade decide `administrative_management`.
2. `DEPARTMENT_MANAGER` sem permissao `PURCHASES:approvals.decide.directorate` nao decide `general_directorate`.
3. `UNIT_DIRECTOR` com permissao `PURCHASES:approvals.decide.directorate` e vinculo na unidade decide `general_directorate`.
4. `UNIT_DIRECTOR` com permissao na unidade A nao decide compra da unidade B.
5. `NETWORK_MANAGER` com permissao `PURCHASES:approvals.decide.directorate` e vinculo na unidade decide `general_directorate`.
6. `NETWORK_MANAGER` tambem decide `administrative_management` quando tiver permissao administrativa na unidade.
7. `SUPER_ADMIN` decide `administrative_management` sem depender de grant.
8. `SUPER_ADMIN` decide `general_directorate` sem depender de grant.
9. Falha tecnica na consulta de permissao vira `PurchaseApprovalAuthorizationError` com status `500`.
10. Falta de permissao vira `PurchaseApprovalAuthorizationError` com status `403`.

Os testes serao unitarios com Supabase mockado. Nao devem acessar banco real, nao devem alterar dados e nao devem depender de usuario real.

## Validacoes finais previstas

Depois da aprovacao deste plano e da implementacao:

```powershell
npx playwright test tests/unit/purchases/approval-authorization.spec.ts --project=chromium
npm.cmd run lint
npm.cmd run build
git diff --check
git status --short --untracked-files=all
```

## Fora de escopo

- Nao alterar fronteira de R$ 200,00.
- Nao alterar `getPurchaseApprovalLevel`.
- Nao alterar snapshots, dossies formais, historico de decisoes ou triggers.
- Nao alterar Auth, login, Supabase Auth, `auth_email`, RLS ou policies.
- Nao mexer em fluxo de cotacao vencedora.
- Nao conceder `PURCHASES:approvals.decide.directorate` para `DEPARTMENT_MANAGER`.
