-- RH-10D - Perfis operacionais seguros para o dossie documental de RH.
-- Cria perfis especificos de RH e concede apenas permissoes ja existentes.
-- Nao altera RLS, Supabase Auth, login, auth_email, workflow engine ou SUPER_ADMIN.

insert into public.access_profiles (code, name, description, is_system_default)
values
  (
    'HR_OPERATOR',
    'Operador de RH',
    'Perfil para operacao diaria de RH com consulta de colaboradores e gestao documental nao sensivel.',
    true
  ),
  (
    'HR_SUPERVISOR',
    'Supervisor de RH',
    'Perfil para supervisao de RH com conferencia e decisao documental, sem acesso sensivel automatico.',
    true
  ),
  (
    'HR_SENSITIVE_VIEWER',
    'Visualizador Sensivel de RH',
    'Perfil restrito para visualizacao autorizada de documentos sensiveis de RH.',
    true
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with profile_permission_matrix(profile_code, permission_code) as (
  values
    -- Operacao diaria: acompanha colaboradores e mantem o controle documental.
    ('HR_OPERATOR', 'HR:employees.view'),
    ('HR_OPERATOR', 'HR:documents.view'),
    ('HR_OPERATOR', 'HR:documents.manage'),

    -- Supervisao: pode conferir, aprovar, rejeitar ou dispensar documentos.
    ('HR_SUPERVISOR', 'HR:employees.view'),
    ('HR_SUPERVISOR', 'HR:documents.view'),
    ('HR_SUPERVISOR', 'HR:documents.manage'),
    ('HR_SUPERVISOR', 'HR:documents.verify'),

    -- Acesso sensivel segregado por LGPD, sem permissao de gestao por padrao.
    ('HR_SENSITIVE_VIEWER', 'HR:employees.view'),
    ('HR_SENSITIVE_VIEWER', 'HR:documents.view'),
    ('HR_SENSITIVE_VIEWER', 'HR:documents.sensitive.view')
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
 and access_profile.deleted_at is null
join public.permissions permission
  on permission.code = matrix.permission_code
 and permission.deleted_at is null
where access_profile.status = 'active'
  and permission.status = 'active'
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();
