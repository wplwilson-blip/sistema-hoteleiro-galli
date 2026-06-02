-- RH-21.1 - Fundacao de Conduta e Ocorrencias.
-- Cria registros administrativos de conduta sem alterar Auth, login ou modulos fora do RH.

create table if not exists public.employee_conduct_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid not null references public.units(id),
  employee_id uuid not null references public.employees(id),
  conduct_type text not null,
  status text not null default 'active',
  occurrence_date date not null,
  title text not null,
  description text,
  action_taken text,
  severity text not null default 'warning',
  attachment_id uuid references public.attachments(id),
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_conduct_records_type_check check (
    conduct_type in ('warning', 'suspension', 'complaint', 'compliment', 'formal_guidance', 'formal_conversation')
  ),
  constraint employee_conduct_records_status_check check (status in ('active', 'cancelled', 'resolved', 'archived')),
  constraint employee_conduct_records_severity_check check (severity in ('info', 'notice', 'warning', 'critical')),
  constraint employee_conduct_records_visibility_check check (
    visibility_scope in ('restricted', 'unit', 'organization') and
    (is_sensitive = true or visibility_scope <> 'restricted')
  ),
  constraint employee_conduct_records_title_safe_check check (
    title !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  ),
  constraint employee_conduct_records_description_safe_check check (
    description is null or description !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  ),
  constraint employee_conduct_records_action_safe_check check (
    action_taken is null or action_taken !~* '(cpf|rg|ctps|pis|cid|diagnostico|diagnóstico|laudo|medical|medico|médico|file_path|storage_path|signed_url|token|senha|password|auth_email)'
  )
);

create index if not exists employee_conduct_records_employee_idx
  on public.employee_conduct_records (employee_id, occurrence_date desc)
  where deleted_at is null;

create index if not exists employee_conduct_records_unit_idx
  on public.employee_conduct_records (unit_id, occurrence_date desc)
  where deleted_at is null;

create index if not exists employee_conduct_records_type_status_idx
  on public.employee_conduct_records (conduct_type, status, occurrence_date desc)
  where deleted_at is null;

alter table public.employee_conduct_records enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pg_function_is_visible(oid)
  ) then
    drop trigger if exists set_updated_at_employee_conduct_records on public.employee_conduct_records;
    create trigger set_updated_at_employee_conduct_records
      before update on public.employee_conduct_records
      for each row
      execute function public.set_updated_at();
  end if;
end $$;

insert into public.permissions (code, description)
values
  ('HR:conduct.view', 'Visualizar conduta e ocorrencias de colaboradores'),
  ('HR:conduct.manage', 'Gerenciar conduta e ocorrencias de colaboradores'),
  ('HR:conduct.sensitive.view', 'Visualizar dados sensiveis de conduta e ocorrencias')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select 'SUPER_ADMIN', permission.code
from public.permissions permission
where permission.code in (
  'HR:conduct.view',
  'HR:conduct.manage',
  'HR:conduct.sensitive.view'
)
on conflict (role, permission_code) do nothing;

comment on table public.employee_conduct_records is
  'Registros administrativos de conduta e ocorrencias do colaborador para RH-21.1.';
