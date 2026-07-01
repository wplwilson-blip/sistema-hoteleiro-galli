-- Catalogo de permissoes do modulo ADMIN (Fase 3 do projeto de permissoes).
-- Seed/grant APENAS: nao cria/altera tabela, nao toca Auth, login, auth_email, RLS, policies,
-- triggers ou schema operacional. Idempotente (on conflict do update), no mesmo padrao da 064.
--
-- Uso das permissoes criadas aqui:
--   - ADMIN:permissions.view  -> UNICA consumida na Fase 3-A (gate da tela read-only de perfis/
--                                permissoes/permissoes efetivas).
--   - ADMIN:profiles.manage   -> catalogada agora, SEM uso, ate a Fase 3-C (conceder/revogar
--                                permissoes de perfis).
--   - ADMIN:overrides.manage  -> catalogada agora, SEM uso, ate a Fase 3-B (conceder/revogar
--                                excecoes de permissao por usuario).
--   Catalogar as tres de uma vez evita migrations futuras so para seed.
--
-- Concede as tres SOMENTE ao perfil SUPER_ADMIN (nenhum outro perfil recebe nesta migration).
-- Nao mexe no unique(code) global das permissions (divida de multi-tenant tratada so quando o
-- SaaS for real).

insert into public.permissions (module_code, action_code, name, description)
values
  ('ADMIN', 'permissions.view', 'Visualizar permissões e acessos', 'Permite visualizar perfis de acesso, suas permissões e as permissões efetivas dos usuários.'),
  ('ADMIN', 'profiles.manage', 'Gerenciar permissões de perfis', 'Permite conceder ou revogar permissões de perfis de acesso.'),
  ('ADMIN', 'overrides.manage', 'Gerenciar exceções de permissão por usuário', 'Permite conceder ou revogar exceções de permissão para usuários específicos.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with profile_permission_matrix(profile_code, permission_code) as (
  values
    -- Super Admin: recebe as tres permissoes novas do modulo ADMIN.
    ('SUPER_ADMIN', 'ADMIN:permissions.view'),
    ('SUPER_ADMIN', 'ADMIN:profiles.manage'),
    ('SUPER_ADMIN', 'ADMIN:overrides.manage')
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
