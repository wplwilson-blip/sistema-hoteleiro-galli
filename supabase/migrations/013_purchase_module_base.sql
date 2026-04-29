-- Sprint 5A - Base operacional do modulo de Compras.
-- Esta migration cria apenas o banco operacional de compras.
-- Nao cria telas, rotas, APIs ou motor de aprovacao completo.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_request_type') then
    create type public.purchase_request_type as enum ('normal', 'emergency');
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_priority') then
    create type public.purchase_priority as enum ('low', 'normal', 'high', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_request_status') then
    create type public.purchase_request_status as enum (
      'draft',
      'submitted',
      'under_review',
      'quotation',
      'pending_approval',
      'approved',
      'rejected',
      'awaiting_purchase',
      'purchase_ordered',
      'partially_received',
      'received_total',
      'received_with_divergence',
      'closed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_quote_status') then
    create type public.purchase_quote_status as enum ('received', 'selected', 'rejected', 'expired', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_receipt_type') then
    create type public.purchase_receipt_type as enum ('partial', 'full', 'divergent');
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_receipt_status') then
    create type public.purchase_receipt_status as enum ('draft', 'registered', 'cancelled');
  end if;
end;
$$;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  cost_center_id uuid references public.cost_centers(id) on delete restrict,
  requested_by uuid references public.app_users(id) on delete set null,
  request_number text not null,
  title text not null,
  description text,
  justification text not null,
  request_type public.purchase_request_type not null default 'normal',
  priority public.purchase_priority not null default 'normal',
  desired_date date,
  total_estimated_amount numeric(14,2) not null default 0,
  total_approved_amount numeric(14,2) not null default 0,
  quotation_required boolean not null default false,
  required_quote_count smallint not null default 0,
  approval_required boolean not null default false,
  director_approval_required boolean not null default false,
  status public.purchase_request_status not null default 'draft',
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  budget_period_id uuid references public.budget_periods(id) on delete restrict,
  budget_line_id uuid references public.budget_lines(id) on delete restrict,
  budget_reservation_id uuid references public.budget_reservations(id) on delete set null,
  over_budget boolean not null default false,
  over_budget_justification text,
  payment_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_requests_request_number_not_blank check (btrim(request_number) <> ''),
  constraint purchase_requests_title_not_blank check (btrim(title) <> ''),
  constraint purchase_requests_justification_not_blank check (btrim(justification) <> ''),
  constraint purchase_requests_required_quote_count_check check (required_quote_count >= 0),
  constraint purchase_requests_total_estimated_amount_check check (total_estimated_amount >= 0),
  constraint purchase_requests_total_approved_amount_check check (total_approved_amount >= 0),
  constraint purchase_requests_quote_logic_check check (
    (quotation_required = true and required_quote_count > 0)
    or (quotation_required = false and required_quote_count = 0)
  ),
  constraint purchase_requests_approval_logic_check check (
    director_approval_required = false or approval_required = true
  ),
  constraint purchase_requests_over_budget_justification_check check (
    not over_budget or btrim(coalesce(over_budget_justification, '')) <> ''
  )
);

create unique index if not exists purchase_requests_org_request_number_active_unique
  on public.purchase_requests (organization_id, request_number)
  where deleted_at is null;

create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  item_description text not null,
  quantity numeric(14,2) not null,
  unit_of_measure text not null,
  estimated_unit_price numeric(14,2) not null default 0,
  estimated_total_price numeric(14,2) not null default 0,
  approved_unit_price numeric(14,2),
  approved_total_price numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_request_items_description_not_blank check (btrim(item_description) <> ''),
  constraint purchase_request_items_unit_of_measure_not_blank check (btrim(unit_of_measure) <> ''),
  constraint purchase_request_items_quantity_positive check (quantity > 0),
  constraint purchase_request_items_estimated_unit_price_check check (estimated_unit_price >= 0),
  constraint purchase_request_items_estimated_total_price_check check (estimated_total_price >= 0),
  constraint purchase_request_items_approved_unit_price_check check (approved_unit_price is null or approved_unit_price >= 0),
  constraint purchase_request_items_approved_total_price_check check (approved_total_price is null or approved_total_price >= 0)
);

create table if not exists public.purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  quote_number text not null,
  quote_date date not null default current_date,
  valid_until date not null,
  total_amount numeric(14,2) not null default 0,
  delivery_days integer,
  payment_terms text,
  is_selected boolean not null default false,
  is_recurring_supplier_quote boolean not null default false,
  quote_validity_exception boolean not null default false,
  quote_validity_exception_reason text,
  notes text,
  status public.purchase_quote_status not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_quotes_quote_number_not_blank check (btrim(quote_number) <> ''),
  constraint purchase_quotes_valid_until_check check (valid_until >= quote_date),
  constraint purchase_quotes_total_amount_check check (total_amount >= 0),
  constraint purchase_quotes_delivery_days_check check (delivery_days is null or delivery_days >= 0),
  constraint purchase_quotes_validity_exception_reason_check check (
    not quote_validity_exception or btrim(coalesce(quote_validity_exception_reason, '')) <> ''
  )
);

create unique index if not exists purchase_quotes_request_supplier_quote_number_active_unique
  on public.purchase_quotes (purchase_request_id, supplier_id, quote_number)
  where deleted_at is null;

create table if not exists public.purchase_quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_quote_id uuid not null references public.purchase_quotes(id) on delete restrict,
  purchase_request_item_id uuid not null references public.purchase_request_items(id) on delete restrict,
  item_description text not null,
  quantity numeric(14,2) not null,
  unit_price numeric(14,2) not null default 0,
  total_price numeric(14,2) not null default 0,
  delivery_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_quote_items_description_not_blank check (btrim(item_description) <> ''),
  constraint purchase_quote_items_quantity_positive check (quantity > 0),
  constraint purchase_quote_items_unit_price_check check (unit_price >= 0),
  constraint purchase_quote_items_total_price_check check (total_price >= 0)
);

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  received_by uuid references public.app_users(id) on delete set null,
  received_at timestamptz not null default now(),
  receipt_type public.purchase_receipt_type not null,
  status public.purchase_receipt_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null
);

create index if not exists purchase_receipts_request_id_idx on public.purchase_receipts (purchase_request_id);
create index if not exists purchase_receipts_unit_id_idx on public.purchase_receipts (unit_id);
create index if not exists purchase_receipts_received_by_idx on public.purchase_receipts (received_by);
create index if not exists purchase_receipts_status_idx on public.purchase_receipts (status);
create index if not exists purchase_receipts_created_at_idx on public.purchase_receipts (created_at);

create table if not exists public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete restrict,
  purchase_request_item_id uuid not null references public.purchase_request_items(id) on delete restrict,
  quantity_received numeric(14,2) not null default 0,
  quantity_rejected numeric(14,2) not null default 0,
  divergence_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_receipt_items_quantity_received_check check (quantity_received >= 0),
  constraint purchase_receipt_items_quantity_rejected_check check (quantity_rejected >= 0)
);

create table if not exists public.purchase_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  event_type text not null,
  from_status public.purchase_request_status,
  to_status public.purchase_request_status,
  description text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_request_events_event_type_not_blank check (btrim(event_type) <> '')
);

create index if not exists purchase_request_items_org_idx on public.purchase_request_items (organization_id);
create index if not exists purchase_request_items_unit_idx on public.purchase_request_items (unit_id);
create index if not exists purchase_request_items_request_id_idx on public.purchase_request_items (purchase_request_id);
create index if not exists purchase_request_items_created_at_idx on public.purchase_request_items (created_at);

create index if not exists purchase_quotes_org_idx on public.purchase_quotes (organization_id);
create index if not exists purchase_quotes_unit_idx on public.purchase_quotes (unit_id);
create index if not exists purchase_quotes_request_id_idx on public.purchase_quotes (purchase_request_id);
create index if not exists purchase_quotes_supplier_id_idx on public.purchase_quotes (supplier_id);
create index if not exists purchase_quotes_status_idx on public.purchase_quotes (status);
create index if not exists purchase_quotes_created_at_idx on public.purchase_quotes (created_at);

create index if not exists purchase_quote_items_org_idx on public.purchase_quote_items (organization_id);
create index if not exists purchase_quote_items_unit_idx on public.purchase_quote_items (unit_id);
create index if not exists purchase_quote_items_quote_id_idx on public.purchase_quote_items (purchase_quote_id);
create index if not exists purchase_quote_items_request_item_id_idx on public.purchase_quote_items (purchase_request_item_id);
create index if not exists purchase_quote_items_created_at_idx on public.purchase_quote_items (created_at);

create index if not exists purchase_receipt_items_org_idx on public.purchase_receipt_items (organization_id);
create index if not exists purchase_receipt_items_unit_idx on public.purchase_receipt_items (unit_id);
create index if not exists purchase_receipt_items_receipt_id_idx on public.purchase_receipt_items (purchase_receipt_id);
create index if not exists purchase_receipt_items_request_item_id_idx on public.purchase_receipt_items (purchase_request_item_id);
create index if not exists purchase_receipt_items_created_at_idx on public.purchase_receipt_items (created_at);

create index if not exists purchase_request_events_org_idx on public.purchase_request_events (organization_id);
create index if not exists purchase_request_events_unit_idx on public.purchase_request_events (unit_id);
create index if not exists purchase_request_events_request_id_idx on public.purchase_request_events (purchase_request_id);
create index if not exists purchase_request_events_event_type_idx on public.purchase_request_events (event_type);
create index if not exists purchase_request_events_created_at_idx on public.purchase_request_events (created_at);

create index if not exists purchase_requests_org_idx on public.purchase_requests (organization_id);
create index if not exists purchase_requests_unit_idx on public.purchase_requests (unit_id);
create index if not exists purchase_requests_department_idx on public.purchase_requests (department_id);
create index if not exists purchase_requests_cost_center_idx on public.purchase_requests (cost_center_id);
create index if not exists purchase_requests_requested_by_idx on public.purchase_requests (requested_by);
create index if not exists purchase_requests_approval_request_id_idx on public.purchase_requests (approval_request_id);
create index if not exists purchase_requests_status_idx on public.purchase_requests (status);
create index if not exists purchase_requests_request_type_idx on public.purchase_requests (request_type);
create index if not exists purchase_requests_priority_idx on public.purchase_requests (priority);
create index if not exists purchase_requests_approval_required_idx on public.purchase_requests (approval_required);
create index if not exists purchase_requests_director_approval_required_idx on public.purchase_requests (director_approval_required);
create index if not exists purchase_requests_budget_period_id_idx on public.purchase_requests (budget_period_id);
create index if not exists purchase_requests_budget_line_id_idx on public.purchase_requests (budget_line_id);
create index if not exists purchase_requests_budget_reservation_id_idx on public.purchase_requests (budget_reservation_id);
create index if not exists purchase_requests_over_budget_idx on public.purchase_requests (over_budget);
create index if not exists purchase_requests_created_at_idx on public.purchase_requests (created_at);

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para compras.';
    return;
  end if;

  foreach table_name in array array[
    'purchase_requests',
    'purchase_request_items',
    'purchase_quotes',
    'purchase_quote_items',
    'purchase_receipts',
    'purchase_receipt_items'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de compras devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'purchase_requests',
    'purchase_request_items',
    'purchase_quotes',
    'purchase_quote_items',
    'purchase_receipts',
    'purchase_receipt_items'
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

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_quotes enable row level security;
alter table public.purchase_quote_items enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;
alter table public.purchase_request_events enable row level security;

comment on table public.purchase_requests is
  'Cabecalho da solicitacao de compra. Integra aprovacao generica, cotacao, fornecedor, recebimento e futuras reservas orcamentarias.';
comment on column public.purchase_requests.quotation_required is
  'Indica se a solicitacao exige cotacao formal. A regra de quantidade minima fica para a aplicacao da Sprint 5B.';
comment on column public.purchase_requests.required_quote_count is
  'Quantidade minima de cotações esperada pela aplicacao. Ex.: 3 acima de R$ 200,00, com excecao para compra emergencial.';
comment on column public.purchase_requests.approval_required is
  'Marca se a solicitacao precisa passar por aprovacao formal.';
comment on column public.purchase_requests.director_approval_required is
  'Marca a necessidade de aprovacao do diretor quando o valor excede o limite gerencial.';
comment on column public.purchase_requests.budget_reservation_id is
  'Vinculo opcional com reserva orcamentaria criada na base da Sprint 2.6.';
comment on column public.purchase_requests.payment_request_id is
  'Campo reservado para integracao futura com Contas a Pagar.';

comment on table public.purchase_request_items is
  'Itens da solicitacao de compra. Permitem multiplos itens por solicitacao.';
comment on table public.purchase_quotes is
  'Cotas por fornecedor para a solicitacao de compra. Usa public.suppliers como cadastro compartilhado.';
comment on column public.purchase_quotes.quote_validity_exception is
  'Permite validade acima do padrao quando houver justificativa, como fornecedor recorrente/homologado.';
comment on table public.purchase_quote_items is
  'Itens detalhados por cotacao.';
comment on table public.purchase_receipts is
  'Registro operacional de recebimento parcial, total ou com divergencia.';
comment on table public.purchase_receipt_items is
  'Itens recebidos vinculados ao recebimento e ao item original da solicitacao.';
comment on table public.purchase_request_events is
  'Historico operacional da solicitacao de compra. Registra transicoes de status e eventos relevantes.';
