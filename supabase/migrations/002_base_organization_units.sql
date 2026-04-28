-- Sprint 2 - Organizacao, unidades, departamentos e cargos.
-- Os campos created_by/updated_by/deleted_by sao UUIDs livres nesta fase.
-- A FK para usuarios sera tratada com cuidado apos a consolidacao da autenticacao.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  status public.record_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint organizations_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  code text not null,
  legal_name text,
  tax_id text,
  timezone text not null default 'America/Sao_Paulo',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint units_name_not_blank check (btrim(name) <> ''),
  constraint units_code_format check (code ~ '^[A-Z0-9_-]{2,20}$'),
  constraint units_organization_code_unique unique (organization_id, code)
);

create table if not exists public.unit_settings (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint unit_settings_key_format check (key ~ '^[a-z0-9_.-]{2,80}$'),
  constraint unit_settings_unit_key_unique unique (unit_id, key)
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  is_system_default boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint departments_name_not_blank check (btrim(name) <> ''),
  constraint departments_code_format check (code ~ '^[A-Z0-9_-]{2,20}$'),
  constraint departments_scope_required check (
    is_system_default = true or organization_id is not null or unit_id is not null
  )
);

create unique index if not exists departments_system_code_unique
  on public.departments (code)
  where is_system_default = true and organization_id is null and unit_id is null;

create unique index if not exists departments_unit_code_unique
  on public.departments (unit_id, code)
  where unit_id is not null and deleted_at is null;

create table if not exists public.job_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  is_leadership boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint job_positions_name_not_blank check (btrim(name) <> ''),
  constraint job_positions_code_format check (code ~ '^[A-Z0-9_-]{2,30}$')
);

create index if not exists organizations_status_idx on public.organizations (status);
create index if not exists organizations_created_at_idx on public.organizations (created_at);
create index if not exists units_organization_id_idx on public.units (organization_id);
create index if not exists units_status_idx on public.units (status);
create index if not exists units_created_at_idx on public.units (created_at);
create index if not exists unit_settings_unit_id_idx on public.unit_settings (unit_id);
create index if not exists unit_settings_status_idx on public.unit_settings (status);
create index if not exists unit_settings_created_at_idx on public.unit_settings (created_at);
create index if not exists departments_unit_id_idx on public.departments (unit_id);
create index if not exists departments_status_idx on public.departments (status);
create index if not exists departments_created_at_idx on public.departments (created_at);
create index if not exists departments_code_idx on public.departments (code);
create index if not exists job_positions_unit_id_idx on public.job_positions (unit_id);
create index if not exists job_positions_department_id_idx on public.job_positions (department_id);
create index if not exists job_positions_status_idx on public.job_positions (status);
create index if not exists job_positions_created_at_idx on public.job_positions (created_at);
