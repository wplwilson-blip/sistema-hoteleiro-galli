-- RH-22.1 - Fundacao de Desligamento.
-- Cria controle administrativo de desligamentos sem integrar folha, financeiro, ponto ou eSocial.

create table if not exists public.employee_terminations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  status text not null default 'draft',
  termination_type text not null,
  termination_reason text not null,
  requested_at timestamptz not null default now(),
  effective_date date,
  requested_by uuid references public.app_users(id) on delete set null,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  implemented_by uuid references public.app_users(id) on delete set null,
  implemented_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancelled_at timestamptz,
  notes text,
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_terminations_status_check check (status in ('draft', 'pending_review', 'approved', 'implemented', 'cancelled')),
  constraint employee_terminations_type_check check (
    termination_type in ('voluntary', 'involuntary', 'mutual', 'retirement', 'end_of_contract', 'other')
  ),
  constraint employee_terminations_visibility_check check (is_sensitive = true and visibility_scope = 'restricted'),
  constraint employee_terminations_reason_not_blank check (length(trim(termination_reason)) > 0),
  constraint employee_terminations_reason_safe_check check (
    termination_reason !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  ),
  constraint employee_terminations_notes_safe_check check (
    notes is null or notes !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  )
);

create table if not exists public.employee_termination_checklists (
  id uuid primary key default gen_random_uuid(),
  termination_id uuid not null references public.employee_terminations(id) on delete cascade,
  item_name text not null,
  is_required boolean not null default true,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_termination_checklists_name_not_blank check (length(trim(item_name)) > 0),
  constraint employee_termination_checklists_completion_check check (
    is_completed = false or (completed_at is not null and completed_by is not null)
  ),
  constraint employee_termination_checklists_text_safe_check check (
    item_name !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
    and (notes is null or notes !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)')
  )
);

create index if not exists employee_terminations_employee_idx
  on public.employee_terminations (employee_id, requested_at desc)
  where deleted_at is null;

create index if not exists employee_terminations_unit_status_idx
  on public.employee_terminations (unit_id, status, requested_at desc)
  where deleted_at is null;

create index if not exists employee_terminations_type_idx
  on public.employee_terminations (termination_type, status)
  where deleted_at is null;

create index if not exists employee_termination_checklists_termination_idx
  on public.employee_termination_checklists (termination_id, is_completed, is_required);

alter table public.employee_terminations enable row level security;
alter table public.employee_termination_checklists enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para desligamentos.';
    return;
  end if;

  drop trigger if exists set_updated_at_employee_terminations on public.employee_terminations;
  create trigger set_updated_at_employee_terminations
    before update on public.employee_terminations
    for each row execute function public.update_updated_at_column();

  drop trigger if exists set_updated_at_employee_termination_checklists on public.employee_termination_checklists;
  create trigger set_updated_at_employee_termination_checklists
    before update on public.employee_termination_checklists
    for each row execute function public.update_updated_at_column();
end;
$$;

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'terminations.view', 'Visualizar desligamentos', 'Permite consultar processos administrativos de desligamento conforme escopo de unidade.'),
  ('HR', 'terminations.manage', 'Gerenciar desligamentos', 'Permite criar, editar, enviar, cancelar e efetivar processos administrativos de desligamento.'),
  ('HR', 'terminations.review', 'Revisar desligamentos', 'Permite aprovar processos administrativos de desligamento.'),
  ('HR', 'terminations.sensitive.view', 'Visualizar desligamentos sensiveis', 'Permite consultar dados restritos de processos administrativos de desligamento.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with super_admin_profile as (
  select id
  from public.access_profiles
  where code = 'SUPER_ADMIN'
    and status = 'active'
    and deleted_at is null
  limit 1
), termination_permissions as (
  select id
  from public.permissions
  where code in (
    'HR:terminations.view',
    'HR:terminations.manage',
    'HR:terminations.review',
    'HR:terminations.sensitive.view'
  )
    and status = 'active'
    and deleted_at is null
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  super_admin_profile.id,
  termination_permissions.id,
  true,
  'active'
from super_admin_profile
cross join termination_permissions
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

comment on table public.employee_terminations is
  'Processos administrativos de desligamento do colaborador. Nao calcula verbas rescisorias, TRCT, homologacao, folha, ponto ou eSocial.';
comment on table public.employee_termination_checklists is
  'Checklist operacional de pendencias administrativas do desligamento.';
