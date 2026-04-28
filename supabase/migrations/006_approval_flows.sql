-- Sprint 2 - Alçadas e instâncias de aprovação.
-- Regra futura: autoaprovação deve ser bloqueada na camada de serviço/trigger especifica.
-- Regra futura: rejeição sempre exigirá justificativa registrada em approval_actions.reason.

create table if not exists public.approval_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  request_type_id uuid references public.request_types(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  is_global boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approval_flows_name_not_blank check (btrim(name) <> ''),
  constraint approval_flows_scope_check check (is_global = true or organization_id is not null or unit_id is not null)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'request_types_default_approval_flow_fk'
  ) then
    alter table public.request_types
      add constraint request_types_default_approval_flow_fk
      foreign key (default_approval_flow_id) references public.approval_flows(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.approval_levels (
  id uuid primary key default gen_random_uuid(),
  approval_flow_id uuid not null references public.approval_flows(id) on delete restrict,
  level_order integer not null,
  name text not null,
  min_amount numeric(14,2),
  max_amount numeric(14,2),
  required_profile_id uuid references public.access_profiles(id) on delete set null,
  required_permission_id uuid references public.permissions(id) on delete set null,
  require_all_approvers boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approval_levels_flow_order_unique unique (approval_flow_id, level_order),
  constraint approval_levels_order_positive check (level_order > 0),
  constraint approval_levels_amount_range check (
    min_amount is null or max_amount is null or min_amount <= max_amount
  )
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  approval_flow_id uuid references public.approval_flows(id) on delete restrict,
  request_type_id uuid references public.request_types(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  requester_user_id uuid references public.app_users(id) on delete set null,
  requester_employee_id uuid references public.employees(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  title text not null,
  amount numeric(14,2),
  status public.approval_status not null default 'pending',
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approval_requests_title_not_blank check (btrim(title) <> '')
);

create table if not exists public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete restrict,
  approval_level_id uuid references public.approval_levels(id) on delete set null,
  step_order integer not null,
  assigned_profile_id uuid references public.access_profiles(id) on delete set null,
  assigned_user_id uuid references public.app_users(id) on delete set null,
  status public.approval_status not null default 'pending',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approval_steps_request_order_unique unique (approval_request_id, step_order),
  constraint approval_steps_order_positive check (step_order > 0)
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete restrict,
  approval_step_id uuid references public.approval_steps(id) on delete set null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  action public.approval_action not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint approval_actions_reject_reason check (action <> 'reject' or btrim(coalesce(reason, '')) <> '')
);

comment on table public.approval_flows is 'Fluxos de aprovação globais ou por unidade. Não representa módulo financeiro completo.';
comment on table public.approval_requests is 'Instância genérica de aprovação para solicitações futuras.';
comment on column public.approval_actions.reason is 'Rejeições devem informar justificativa. Autoaprovação será bloqueada em regra de negócio futura.';

create index if not exists approval_flows_unit_id_idx on public.approval_flows (unit_id);
create index if not exists approval_flows_status_idx on public.approval_flows (status);
create index if not exists approval_flows_created_at_idx on public.approval_flows (created_at);
create index if not exists approval_levels_flow_id_idx on public.approval_levels (approval_flow_id);
create index if not exists approval_levels_status_idx on public.approval_levels (status);
create index if not exists approval_requests_unit_id_idx on public.approval_requests (unit_id);
create index if not exists approval_requests_status_idx on public.approval_requests (status);
create index if not exists approval_requests_created_at_idx on public.approval_requests (created_at);
create index if not exists approval_requests_entity_idx on public.approval_requests (entity_type, entity_id);
create index if not exists approval_steps_request_id_idx on public.approval_steps (approval_request_id);
create index if not exists approval_steps_status_idx on public.approval_steps (status);
create index if not exists approval_actions_request_id_idx on public.approval_actions (approval_request_id);
create index if not exists approval_actions_created_at_idx on public.approval_actions (created_at);
