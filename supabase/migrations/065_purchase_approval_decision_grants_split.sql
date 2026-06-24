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
