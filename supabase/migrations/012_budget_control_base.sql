-- Sprint 2.6 - Base de orcamento integrada as compras.
-- Esta migration cria a base gerencial de orcamento. Nao e financeiro completo,
-- nao cria modulo de compras e nao altera telas.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'budget_period_status') then
    create type public.budget_period_status as enum ('draft', 'open', 'locked', 'closed', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_line_status') then
    create type public.budget_line_status as enum ('active', 'blocked', 'closed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_movement_type') then
    create type public.budget_movement_type as enum (
      'initial_budget',
      'adjustment_increase',
      'adjustment_decrease',
      'transfer_in',
      'transfer_out',
      'reservation',
      'reservation_release',
      'commitment',
      'commitment_release',
      'actual',
      'reversal',
      'cancellation'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_reservation_status') then
    create type public.budget_reservation_status as enum (
      'active',
      'committed',
      'released',
      'cancelled',
      'converted_to_actual'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_change_type') then
    create type public.budget_change_type as enum (
      'increase',
      'decrease',
      'transfer',
      'reallocation',
      'emergency_extra_budget'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_change_status') then
    create type public.budget_change_status as enum (
      'draft',
      'pending_approval',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;
end;
$$;

create table if not exists public.budget_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  fiscal_year integer not null,
  fiscal_month integer not null,
  period_start date not null,
  period_end date not null,
  status public.budget_period_status not null default 'draft',
  locked_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint budget_periods_fiscal_month_check check (fiscal_month between 1 and 12),
  constraint budget_periods_period_range_check check (period_end >= period_start)
);

create unique index if not exists budget_periods_unit_year_month_active_unique
  on public.budget_periods (unit_id, fiscal_year, fiscal_month)
  where deleted_at is null;

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  budget_period_id uuid not null references public.budget_periods(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  cost_center_id uuid not null references public.cost_centers(id) on delete restrict,
  operational_category_id uuid references public.operational_categories(id) on delete restrict,
  manager_user_id uuid references public.app_users(id) on delete set null,
  original_amount numeric(14,2) not null default 0,
  approved_adjustments_amount numeric(14,2) not null default 0,
  reserved_amount numeric(14,2) not null default 0,
  committed_amount numeric(14,2) not null default 0,
  realized_amount numeric(14,2) not null default 0,
  cancelled_amount numeric(14,2) not null default 0,
  status public.budget_line_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint budget_lines_original_amount_non_negative check (original_amount >= 0),
  constraint budget_lines_approved_adjustments_non_negative check (approved_adjustments_amount >= 0),
  constraint budget_lines_reserved_amount_non_negative check (reserved_amount >= 0),
  constraint budget_lines_committed_amount_non_negative check (committed_amount >= 0),
  constraint budget_lines_realized_amount_non_negative check (realized_amount >= 0),
  constraint budget_lines_cancelled_amount_non_negative check (cancelled_amount >= 0)
);

create table if not exists public.budget_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  budget_period_id uuid not null references public.budget_periods(id) on delete restrict,
  budget_line_id uuid not null references public.budget_lines(id) on delete restrict,
  movement_type public.budget_movement_type not null,
  amount numeric(14,2) not null,
  source_module text,
  source_entity_type text,
  source_entity_id uuid,
  description text,
  movement_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint budget_movements_amount_not_zero check (amount <> 0)
);

create table if not exists public.budget_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  budget_period_id uuid not null references public.budget_periods(id) on delete restrict,
  budget_line_id uuid not null references public.budget_lines(id) on delete restrict,
  amount numeric(14,2) not null,
  status public.budget_reservation_status not null default 'active',
  source_module text not null,
  source_entity_type text not null,
  source_entity_id uuid not null,
  reserved_by uuid references public.app_users(id) on delete set null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  converted_at timestamptz,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint budget_reservations_amount_positive check (amount > 0),
  constraint budget_reservations_source_module_not_blank check (btrim(source_module) <> ''),
  constraint budget_reservations_source_entity_type_not_blank check (btrim(source_entity_type) <> '')
);

create table if not exists public.budget_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  budget_period_id uuid not null references public.budget_periods(id) on delete restrict,
  requested_by uuid references public.app_users(id) on delete set null,
  request_type public.budget_change_type not null,
  from_budget_line_id uuid references public.budget_lines(id) on delete restrict,
  to_budget_line_id uuid references public.budget_lines(id) on delete restrict,
  amount numeric(14,2) not null,
  justification text not null,
  evidence_required boolean not null default false,
  emergency_flag boolean not null default false,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  status public.budget_change_status not null default 'draft',
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint budget_change_requests_amount_positive check (amount > 0),
  constraint budget_change_requests_justification_not_blank check (btrim(justification) <> ''),
  constraint budget_change_requests_transfer_scope_check check (
    request_type not in ('transfer', 'reallocation')
    or (from_budget_line_id is not null and to_budget_line_id is not null and from_budget_line_id <> to_budget_line_id)
  ),
  constraint budget_change_requests_increase_scope_check check (
    request_type not in ('increase', 'emergency_extra_budget')
    or to_budget_line_id is not null
  ),
  constraint budget_change_requests_decrease_scope_check check (
    request_type <> 'decrease'
    or from_budget_line_id is not null
  )
);

create index if not exists budget_periods_organization_id_idx on public.budget_periods (organization_id);
create index if not exists budget_periods_unit_id_idx on public.budget_periods (unit_id);
create index if not exists budget_periods_fiscal_year_idx on public.budget_periods (fiscal_year);
create index if not exists budget_periods_fiscal_month_idx on public.budget_periods (fiscal_month);
create index if not exists budget_periods_status_idx on public.budget_periods (status);

create index if not exists budget_lines_unit_id_idx on public.budget_lines (unit_id);
create index if not exists budget_lines_budget_period_id_idx on public.budget_lines (budget_period_id);
create index if not exists budget_lines_department_id_idx on public.budget_lines (department_id);
create index if not exists budget_lines_cost_center_id_idx on public.budget_lines (cost_center_id);
create index if not exists budget_lines_manager_user_id_idx on public.budget_lines (manager_user_id);
create index if not exists budget_lines_status_idx on public.budget_lines (status);

create index if not exists budget_movements_unit_id_idx on public.budget_movements (unit_id);
create index if not exists budget_movements_budget_period_id_idx on public.budget_movements (budget_period_id);
create index if not exists budget_movements_budget_line_id_idx on public.budget_movements (budget_line_id);
create index if not exists budget_movements_movement_type_idx on public.budget_movements (movement_type);
create index if not exists budget_movements_movement_date_idx on public.budget_movements (movement_date);
create index if not exists budget_movements_source_module_idx on public.budget_movements (source_module);
create index if not exists budget_movements_source_entity_idx on public.budget_movements (source_entity_type, source_entity_id);

create index if not exists budget_reservations_unit_id_idx on public.budget_reservations (unit_id);
create index if not exists budget_reservations_budget_period_id_idx on public.budget_reservations (budget_period_id);
create index if not exists budget_reservations_budget_line_id_idx on public.budget_reservations (budget_line_id);
create index if not exists budget_reservations_status_idx on public.budget_reservations (status);
create index if not exists budget_reservations_source_module_idx on public.budget_reservations (source_module);
create index if not exists budget_reservations_source_entity_idx on public.budget_reservations (source_entity_type, source_entity_id);

create index if not exists budget_change_requests_unit_id_idx on public.budget_change_requests (unit_id);
create index if not exists budget_change_requests_budget_period_id_idx on public.budget_change_requests (budget_period_id);
create index if not exists budget_change_requests_requested_by_idx on public.budget_change_requests (requested_by);
create index if not exists budget_change_requests_request_type_idx on public.budget_change_requests (request_type);
create index if not exists budget_change_requests_status_idx on public.budget_change_requests (status);
create index if not exists budget_change_requests_emergency_flag_idx on public.budget_change_requests (emergency_flag);

create or replace view public.budget_line_balances as
select
  bl.id as budget_line_id,
  bl.organization_id,
  bl.unit_id,
  bl.budget_period_id,
  bl.department_id,
  bl.cost_center_id,
  bl.manager_user_id,
  bl.original_amount,
  bl.approved_adjustments_amount,
  bl.reserved_amount,
  bl.committed_amount,
  bl.realized_amount,
  (bl.original_amount + bl.approved_adjustments_amount) as current_budget_amount,
  (
    bl.original_amount
    + bl.approved_adjustments_amount
    - bl.reserved_amount
    - bl.committed_amount
    - bl.realized_amount
  ) as available_amount
from public.budget_lines bl
where bl.deleted_at is null;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para orcamento.';
    return;
  end if;

  foreach table_name in array array[
    'budget_periods',
    'budget_lines',
    'budget_movements',
    'budget_reservations',
    'budget_change_requests'
  ]
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de orcamento devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'budget_periods',
    'budget_lines',
    'budget_movements',
    'budget_reservations',
    'budget_change_requests'
  ]
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

alter table public.budget_periods enable row level security;
alter table public.budget_lines enable row level security;
alter table public.budget_movements enable row level security;
alter table public.budget_reservations enable row level security;
alter table public.budget_change_requests enable row level security;

comment on view public.budget_line_balances is
  'Leitura consolidada de saldo por linha orcamentaria para validacao futura de compras e dashboards. Policies finais de leitura devem considerar unit_id, user_unit_links, access_profiles, permissions e centros de custo permitidos.';

comment on column public.budget_lines.approved_adjustments_amount is
  'Total consolidado de ajustes aprovados. Solicitacoes pendentes ficam em budget_change_requests.';
comment on column public.budget_lines.reserved_amount is
  'Valor reservado para compras/solicitacoes ainda nao comprometidas ou realizadas.';
comment on column public.budget_lines.committed_amount is
  'Valor comprometido por aprovacao/ordem futura, ainda nao realizado.';
comment on column public.budget_lines.realized_amount is
  'Valor realizado gerencialmente. Nao representa financeiro completo nem conciliacao bancaria.';
comment on column public.budget_change_requests.emergency_flag is
  'Indica ajuste associado a compra emergencial fora do orcamento, exigindo justificativa, evidencia e auditoria.';

comment on table public.budget_periods is
  'Periodos mensais de orcamento por unidade. Orcamento e gerencial e nao substitui financeiro completo. RLS final devera filtrar por unit_id, perfil, permissoes e escopo de centro de custo.';
comment on table public.budget_lines is
  'Linhas orcamentarias por periodo, unidade, centro de custo, gestor, departamento e categoria operacional quando aplicavel. RLS final devera limitar visibilidade por perfil, unidade, departamento e centros de custo permitidos.';
comment on table public.budget_movements is
  'Livro razao gerencial do orcamento. Registra orcamento inicial, ajustes, reservas, compromissos, realizacoes, estornos e cancelamentos. RLS final deve restringir leitura detalhada a perfis autorizados e auditoria.';
comment on table public.budget_reservations is
  'Reservas de orcamento para compras ou solicitacoes em andamento. Compra consome orcamento antes do pagamento. RLS final deve permitir validacao por Compras sem expor todo o orcamento estrategico.';
comment on table public.budget_change_requests is
  'Solicitacoes de ajuste orcamentario com aprovacao. Compra emergencial sem saldo deve gerar rastreabilidade e ciencia/aprovacao posterior. RLS final deve integrar unit_id, user_unit_links, access_profiles, permissions, aprovadores e centros de custo permitidos.';
