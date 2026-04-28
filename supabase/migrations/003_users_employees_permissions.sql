-- Sprint 2 - Usuarios, colaboradores, perfis e permissoes.
-- Login oficial sera por username + senha. E-mail nao e login.
-- auth_email e tecnico/interno para compatibilidade futura com Supabase Auth.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username text not null,
  auth_email text not null,
  display_name text not null,
  personal_email text,
  phone text,
  status public.access_status not null default 'pending',
  last_login_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint app_users_username_unique unique (username),
  constraint app_users_auth_email_unique unique (auth_email),
  constraint app_users_username_format check (username ~ '^[a-z0-9._-]{3,50}$'),
  constraint app_users_auth_email_format check (auth_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint app_users_personal_email_format check (personal_email is null or personal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint app_users_display_name_not_blank check (btrim(display_name) <> '')
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  job_position_id uuid references public.job_positions(id) on delete set null,
  full_name text not null,
  preferred_name text,
  document_number text,
  corporate_email text,
  personal_email text,
  phone text,
  hire_date date,
  termination_date date,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint employees_full_name_not_blank check (btrim(full_name) <> ''),
  constraint employees_corporate_email_format check (corporate_email is null or corporate_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint employees_personal_email_format check (personal_email is null or personal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.user_employee_links (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  status public.user_link_status not null default 'active',
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint user_employee_links_unique_active unique (app_user_id, employee_id)
);

create table if not exists public.access_profiles (
  id uuid primary key default gen_random_uuid(),
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
  constraint access_profiles_code_unique unique (code),
  constraint access_profiles_code_format check (code ~ '^[A-Z0-9_]{2,40}$'),
  constraint access_profiles_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  action_code text not null,
  code text generated always as (module_code || ':' || action_code) stored,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint permissions_code_unique unique (code),
  constraint permissions_module_format check (module_code ~ '^[A-Z0-9_]{2,30}$'),
  constraint permissions_action_format check (action_code ~ '^[a-z0-9_.-]{2,60}$')
);

create table if not exists public.profile_permissions (
  id uuid primary key default gen_random_uuid(),
  access_profile_id uuid not null references public.access_profiles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  is_allowed boolean not null default true,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint profile_permissions_unique unique (access_profile_id, permission_id)
);

create table if not exists public.user_unit_links (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  access_profile_id uuid not null references public.access_profiles(id) on delete restrict,
  status public.user_link_status not null default 'active',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint user_unit_links_unique_scope unique (app_user_id, unit_id, department_id, access_profile_id)
);

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  is_allowed boolean not null,
  reason text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint user_permission_overrides_unique unique (app_user_id, unit_id, permission_id)
);

create index if not exists app_users_status_idx on public.app_users (status);
create index if not exists app_users_created_at_idx on public.app_users (created_at);
create index if not exists app_users_username_idx on public.app_users (username);
create index if not exists employees_unit_id_idx on public.employees (unit_id);
create index if not exists employees_status_idx on public.employees (status);
create index if not exists employees_created_at_idx on public.employees (created_at);
create index if not exists employees_full_name_idx on public.employees using gin (to_tsvector('portuguese', full_name));
create index if not exists user_employee_links_app_user_id_idx on public.user_employee_links (app_user_id);
create index if not exists user_employee_links_employee_id_idx on public.user_employee_links (employee_id);
create index if not exists user_employee_links_status_idx on public.user_employee_links (status);
create index if not exists access_profiles_status_idx on public.access_profiles (status);
create index if not exists permissions_module_code_idx on public.permissions (module_code);
create index if not exists permissions_status_idx on public.permissions (status);
create index if not exists profile_permissions_profile_idx on public.profile_permissions (access_profile_id);
create index if not exists user_unit_links_app_user_id_idx on public.user_unit_links (app_user_id);
create index if not exists user_unit_links_unit_id_idx on public.user_unit_links (unit_id);
create index if not exists user_unit_links_status_idx on public.user_unit_links (status);
create index if not exists user_permission_overrides_app_user_id_idx on public.user_permission_overrides (app_user_id);
