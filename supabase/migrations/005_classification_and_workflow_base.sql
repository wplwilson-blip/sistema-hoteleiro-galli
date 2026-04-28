-- Sprint 2 - Classificacoes e base de workflow.

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint cost_centers_unit_code_unique unique (unit_id, code)
);

create table if not exists public.operational_categories (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint operational_categories_module_code_unique unique (module_code, code)
);

create table if not exists public.request_types (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  code text not null,
  name text not null,
  description text,
  requires_approval boolean not null default true,
  default_approval_flow_id uuid,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint request_types_module_code_unique unique (module_code, code)
);

create table if not exists public.attachment_types (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  code text not null,
  name text not null,
  description text,
  is_required boolean not null default false,
  requires_expiration_date boolean not null default false,
  allowed_mime_types text[] not null default array[]::text[],
  max_file_size_mb integer,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint attachment_types_module_code_unique unique (module_code, code),
  constraint attachment_types_file_size_positive check (max_file_size_mb is null or max_file_size_mb > 0)
);

create table if not exists public.system_statuses (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  entity_type text not null,
  code text not null,
  name text not null,
  description text,
  sequence_order integer not null default 0,
  is_initial boolean not null default false,
  is_final boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint system_statuses_unique unique (module_code, entity_type, code)
);

create index if not exists cost_centers_unit_id_idx on public.cost_centers (unit_id);
create index if not exists cost_centers_status_idx on public.cost_centers (status);
create index if not exists cost_centers_created_at_idx on public.cost_centers (created_at);
create index if not exists operational_categories_module_idx on public.operational_categories (module_code);
create index if not exists operational_categories_status_idx on public.operational_categories (status);
create index if not exists request_types_module_idx on public.request_types (module_code);
create index if not exists request_types_status_idx on public.request_types (status);
create index if not exists request_types_created_at_idx on public.request_types (created_at);
create index if not exists attachment_types_module_idx on public.attachment_types (module_code);
create index if not exists attachment_types_status_idx on public.attachment_types (status);
create index if not exists system_statuses_lookup_idx on public.system_statuses (module_code, entity_type);
create index if not exists system_statuses_status_idx on public.system_statuses (status);
