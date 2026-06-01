-- RH-20.1 - Fundacao de Saude Ocupacional.
-- Cria registros ocupacionais e certificacoes NR do colaborador.
-- Nao cria eSocial, folha, ponto, agenda medica, clinicas ou integracoes externas.

create table if not exists public.employee_occupational_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  record_type text not null,
  status text not null default 'valid',
  exam_date date,
  expires_at date,
  provider_name text,
  doctor_name text,
  certificate_number text,
  restriction_notes text,
  attachment_id uuid references public.attachments(id) on delete set null,
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_occupational_records_type_check check (
    record_type in (
      'aso_admission',
      'aso_periodic',
      'aso_return',
      'aso_role_change',
      'aso_termination',
      'occupational_exam',
      'occupational_restriction',
      'nr_certification'
    )
  ),
  constraint employee_occupational_records_status_check check (
    status in ('valid', 'expiring', 'expired', 'cancelled')
  ),
  constraint employee_occupational_records_visibility_check check (
    visibility_scope = 'restricted' and is_sensitive = true
  ),
  constraint employee_occupational_records_safe_text_check check (
    coalesce(restriction_notes, '') !~* '(cid|diagnostico|diagnóstico|laudo|cpf|rg|token|senha|signed_url|storage_path|file_path)'
  )
);

create table if not exists public.employee_nr_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  nr_code text not null,
  training_name text not null,
  issued_at date,
  expires_at date,
  certificate_attachment_id uuid references public.attachments(id) on delete set null,
  status text not null default 'valid',
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_nr_certifications_nr_code_check check (
    nr_code ~ '^NR-[0-9]{2,3}[A-Z]?$'
  ),
  constraint employee_nr_certifications_name_check check (length(trim(training_name)) >= 2),
  constraint employee_nr_certifications_status_check check (
    status in ('valid', 'expiring', 'expired', 'cancelled')
  ),
  constraint employee_nr_certifications_visibility_check check (
    visibility_scope = 'restricted' and is_sensitive = true
  )
);

create index if not exists employee_occupational_records_organization_idx on public.employee_occupational_records (organization_id);
create index if not exists employee_occupational_records_unit_idx on public.employee_occupational_records (unit_id);
create index if not exists employee_occupational_records_employee_idx on public.employee_occupational_records (employee_id);
create index if not exists employee_occupational_records_type_idx on public.employee_occupational_records (record_type);
create index if not exists employee_occupational_records_status_idx on public.employee_occupational_records (status);
create index if not exists employee_occupational_records_expires_idx on public.employee_occupational_records (expires_at);
create index if not exists employee_occupational_records_deleted_idx on public.employee_occupational_records (deleted_at);

create index if not exists employee_nr_certifications_organization_idx on public.employee_nr_certifications (organization_id);
create index if not exists employee_nr_certifications_unit_idx on public.employee_nr_certifications (unit_id);
create index if not exists employee_nr_certifications_employee_idx on public.employee_nr_certifications (employee_id);
create index if not exists employee_nr_certifications_nr_idx on public.employee_nr_certifications (nr_code);
create index if not exists employee_nr_certifications_status_idx on public.employee_nr_certifications (status);
create index if not exists employee_nr_certifications_expires_idx on public.employee_nr_certifications (expires_at);
create index if not exists employee_nr_certifications_deleted_idx on public.employee_nr_certifications (deleted_at);

alter table public.employee_occupational_records enable row level security;
alter table public.employee_nr_certifications enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para Saude Ocupacional.';
    return;
  end if;

  foreach table_name in array array['employee_occupational_records', 'employee_nr_certifications']
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de Saude Ocupacional devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array['employee_occupational_records', 'employee_nr_certifications']
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
  ('HR', 'occupational.view', 'Visualizar saude ocupacional', 'Permite consultar ASOs, exames ocupacionais e certificacoes NR conforme escopo de unidade.'),
  ('HR', 'occupational.manage', 'Gerenciar saude ocupacional', 'Permite criar e editar registros ocupacionais de colaboradores.'),
  ('HR', 'occupational.verify', 'Validar saude ocupacional', 'Permite validar registros ocupacionais e certificados ocupacionais.'),
  ('HR', 'occupational.sensitive.view', 'Visualizar dados sensiveis ocupacionais', 'Permite consultar detalhes restritos de saude ocupacional.')
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
), occupational_permissions as (
  select id
  from public.permissions
  where code in (
    'HR:occupational.view',
    'HR:occupational.manage',
    'HR:occupational.verify',
    'HR:occupational.sensitive.view'
  )
    and status = 'active'
    and deleted_at is null
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  super_admin_profile.id,
  occupational_permissions.id,
  true,
  'active'
from super_admin_profile
cross join occupational_permissions
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

comment on table public.employee_occupational_records is
  'Fundacao de Saude Ocupacional: ASOs, exames, restricoes e registros ocupacionais restritos do colaborador.';
comment on table public.employee_nr_certifications is
  'Certificacoes NR do colaborador, incluindo validade e anexo de certificado quando disponivel.';
