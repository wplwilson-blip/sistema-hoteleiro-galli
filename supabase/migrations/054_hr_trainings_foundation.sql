-- RH-19.1 - Fundacao de Treinamentos.
-- Cria catalogo e atribuicoes de treinamentos do RH.
-- Nao cria saude ocupacional, ASO, eSocial, folha, financeiro ou ponto.

create table if not exists public.hr_trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  title text not null,
  description text,
  training_type text not null default 'other',
  delivery_mode text not null default 'in_person',
  provider_name text,
  workload_hours numeric(8,2),
  is_mandatory boolean not null default false,
  requires_certificate boolean not null default false,
  has_expiration boolean not null default false,
  validity_days integer,
  status text not null default 'active',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_trainings_type_check check (
    training_type in ('integration', 'operational', 'mandatory', 'safety', 'leadership', 'technical', 'behavioral', 'recycling', 'other')
  ),
  constraint hr_trainings_delivery_mode_check check (
    delivery_mode in ('in_person', 'online', 'hybrid', 'external')
  ),
  constraint hr_trainings_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint hr_trainings_title_not_blank check (length(trim(title)) >= 3),
  constraint hr_trainings_workload_non_negative check (workload_hours is null or workload_hours >= 0),
  constraint hr_trainings_validity_check check (
    (has_expiration = false and validity_days is null)
    or (has_expiration = true and validity_days is not null and validity_days > 0)
  )
);

create table if not exists public.employee_trainings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  training_id uuid not null references public.hr_trainings(id) on delete restrict,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  due_date date,
  completed_at timestamptz,
  expires_at timestamptz,
  certificate_attachment_id uuid references public.attachments(id) on delete set null,
  attendance_confirmed boolean not null default false,
  attendance_confirmed_at timestamptz,
  notes text,
  is_sensitive boolean not null default false,
  visibility_scope text not null default 'unit',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_trainings_status_check check (
    status in ('assigned', 'scheduled', 'in_progress', 'completed', 'expired', 'waived', 'cancelled')
  ),
  constraint employee_trainings_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_trainings_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint employee_trainings_attendance_check check (
    attendance_confirmed = false or attendance_confirmed_at is not null
  )
);

create index if not exists hr_trainings_organization_idx on public.hr_trainings (organization_id);
create index if not exists hr_trainings_unit_idx on public.hr_trainings (unit_id);
create index if not exists hr_trainings_type_idx on public.hr_trainings (training_type);
create index if not exists hr_trainings_delivery_mode_idx on public.hr_trainings (delivery_mode);
create index if not exists hr_trainings_status_idx on public.hr_trainings (status);
create index if not exists hr_trainings_mandatory_idx on public.hr_trainings (is_mandatory);
create index if not exists hr_trainings_deleted_at_idx on public.hr_trainings (deleted_at);

create index if not exists employee_trainings_organization_idx on public.employee_trainings (organization_id);
create index if not exists employee_trainings_unit_idx on public.employee_trainings (unit_id);
create index if not exists employee_trainings_employee_idx on public.employee_trainings (employee_id);
create index if not exists employee_trainings_training_idx on public.employee_trainings (training_id);
create index if not exists employee_trainings_status_idx on public.employee_trainings (status);
create index if not exists employee_trainings_due_date_idx on public.employee_trainings (due_date);
create index if not exists employee_trainings_expires_at_idx on public.employee_trainings (expires_at);
create index if not exists employee_trainings_certificate_idx on public.employee_trainings (certificate_attachment_id);
create index if not exists employee_trainings_deleted_at_idx on public.employee_trainings (deleted_at);

alter table public.hr_trainings enable row level security;
alter table public.employee_trainings enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para treinamentos RH.';
    return;
  end if;

  foreach table_name in array array['hr_trainings', 'employee_trainings']
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || table_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
      'set_updated_at_' || table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de treinamentos RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array['hr_trainings', 'employee_trainings']
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || table_name, table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_trail()',
      'audit_' || table_name,
      table_name
    );
  end loop;
end;
$$;

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'trainings.view', 'Visualizar treinamentos de RH', 'Permite consultar catalogo e treinamentos atribuidos conforme escopo de unidade.'),
  ('HR', 'trainings.manage', 'Gerenciar catalogo de treinamentos', 'Permite criar e editar treinamentos do catalogo de RH.'),
  ('HR', 'trainings.assign', 'Atribuir treinamentos de RH', 'Permite atribuir treinamentos a colaboradores.'),
  ('HR', 'trainings.verify', 'Validar treinamentos de RH', 'Permite registrar conclusao, presenca e certificado de treinamentos.'),
  ('HR', 'trainings.sensitive.view', 'Visualizar treinamentos sensiveis', 'Permite consultar dados restritos de treinamentos quando houver.')
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
), training_permissions as (
  select id
  from public.permissions
  where code in (
    'HR:trainings.view',
    'HR:trainings.manage',
    'HR:trainings.assign',
    'HR:trainings.verify',
    'HR:trainings.sensitive.view'
  )
    and status = 'active'
    and deleted_at is null
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  super_admin_profile.id,
  training_permissions.id,
  true,
  'active'
from super_admin_profile
cross join training_permissions
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

comment on table public.hr_trainings is
  'Catalogo de treinamentos do RH: internos, externos, obrigatorios, reciclagens e capacitações operacionais. Nao representa ASO ou saude ocupacional.';
comment on table public.employee_trainings is
  'Treinamentos atribuidos a colaboradores, com presenca, certificado, validade e rastreabilidade na Vida Funcional.';
comment on column public.employee_trainings.certificate_attachment_id is
  'Vinculo futuro/operacional para certificado no catalogo privado de anexos. Esta migration nao cria upload especifico.';
