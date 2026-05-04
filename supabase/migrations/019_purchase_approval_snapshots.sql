-- AUDIT-1C-B - Snapshot formal da aprovacao de compras.
-- Cria a base para congelar o dossie enviado formalmente para aprovacao.

create table if not exists public.purchase_approval_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  selected_quote_id uuid references public.purchase_quotes(id) on delete set null,
  selected_supplier_id uuid references public.suppliers(id) on delete set null,
  snapshot_number integer not null,
  snapshot_status text not null default 'pending',
  approval_status_at_creation text,
  approval_rule text not null,
  approval_level text not null,
  total_amount numeric(14,2) not null,
  currency text not null default 'BRL',
  is_selected_quote_recommended boolean not null default false,
  recommendation_reason text,
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.app_users(id) on delete set null,
  decided_at timestamptz,
  decision text,
  decision_reason text,
  superseded_by_snapshot_id uuid references public.purchase_approval_snapshots(id) on delete set null,
  superseded_at timestamptz,
  superseded_by uuid references public.app_users(id) on delete set null,
  snapshot_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint purchase_approval_snapshots_number_positive check (snapshot_number > 0),
  constraint purchase_approval_snapshots_status_check check (
    snapshot_status in ('pending', 'approved', 'rejected', 'returned_to_purchases', 'superseded')
  ),
  constraint purchase_approval_snapshots_approval_status_check check (
    approval_status_at_creation is null
    or approval_status_at_creation in ('pending', 'approved', 'rejected', 'returned_to_purchases')
  ),
  constraint purchase_approval_snapshots_level_check check (
    approval_level in ('administrative_management', 'general_directorate')
  ),
  constraint purchase_approval_snapshots_total_check check (total_amount >= 0),
  constraint purchase_approval_snapshots_currency_not_blank check (btrim(currency) <> ''),
  constraint purchase_approval_snapshots_rule_not_blank check (btrim(approval_rule) <> ''),
  constraint purchase_approval_snapshots_decision_check check (
    decision is null
    or decision in ('approved', 'rejected', 'returned_to_purchases')
  ),
  constraint purchase_approval_snapshots_payload_object_check check (jsonb_typeof(snapshot_payload) = 'object')
);

create unique index if not exists purchase_approval_snapshots_request_number_active_unique
  on public.purchase_approval_snapshots (purchase_request_id, snapshot_number)
  where deleted_at is null;

create unique index if not exists purchase_approval_snapshots_request_pending_unique
  on public.purchase_approval_snapshots (purchase_request_id)
  where snapshot_status = 'pending'
    and deleted_at is null;

create index if not exists purchase_approval_snapshots_org_idx on public.purchase_approval_snapshots (organization_id);
create index if not exists purchase_approval_snapshots_unit_idx on public.purchase_approval_snapshots (unit_id);
create index if not exists purchase_approval_snapshots_request_idx on public.purchase_approval_snapshots (purchase_request_id);
create index if not exists purchase_approval_snapshots_selected_quote_idx on public.purchase_approval_snapshots (selected_quote_id);
create index if not exists purchase_approval_snapshots_supplier_idx on public.purchase_approval_snapshots (selected_supplier_id);
create index if not exists purchase_approval_snapshots_status_idx on public.purchase_approval_snapshots (snapshot_status);
create index if not exists purchase_approval_snapshots_submitted_at_idx on public.purchase_approval_snapshots (submitted_at);
create index if not exists purchase_approval_snapshots_submitted_by_idx on public.purchase_approval_snapshots (submitted_by);

alter table public.purchase_approval_snapshots enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists set_updated_at_purchase_approval_snapshots on public.purchase_approval_snapshots;
    create trigger set_updated_at_purchase_approval_snapshots
      before update on public.purchase_approval_snapshots
      for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is not null then
    drop trigger if exists audit_purchase_approval_snapshots on public.purchase_approval_snapshots;
    create trigger audit_purchase_approval_snapshots
      after insert or update or delete on public.purchase_approval_snapshots
      for each row execute function public.write_audit_trail();
  end if;
end;
$$;

comment on table public.purchase_approval_snapshots is
  'Snapshots formais e historicos do dossie enviado para aprovacao de compras.';
comment on column public.purchase_approval_snapshots.snapshot_payload is
  'Fotografia jsonb do dossie no momento do envio formal: solicitacao, unidade, departamento, fornecedor, cotacoes, itens, anexos, recomendacao e alcada.';
comment on column public.purchase_approval_snapshots.snapshot_number is
  'Sequencia do dossie formal por solicitacao. Cada reenvio deve gerar novo numero.';
comment on column public.purchase_approval_snapshots.snapshot_status is
  'Status do snapshot formal: pending, approved, rejected, returned_to_purchases ou superseded.';
comment on column public.purchase_approval_snapshots.approval_rule is
  'Identificador textual da regra de alcada congelada no momento do envio.';
