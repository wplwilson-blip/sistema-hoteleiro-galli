-- Sprint 5D - aprovacao real de compras V1.
-- Cria campos de decisao na solicitacao e historico de decisoes por compra.

alter table public.purchase_requests
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approval_level text,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_decided_by uuid references public.app_users(id) on delete set null,
  add column if not exists approval_decision_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_requests_approval_status_check'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_requests_approval_level_check'
      and conrelid = 'public.purchase_requests'::regclass
  ) then
    alter table public.purchase_requests
      add constraint purchase_requests_approval_level_check
      check (approval_level is null or approval_level in ('administrative_management', 'general_directorate'));
  end if;
end;
$$;

create table if not exists public.purchase_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  purchase_quote_id uuid references public.purchase_quotes(id) on delete set null,
  approval_level text not null,
  decision text not null,
  justification text,
  decided_by uuid references public.app_users(id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint purchase_approval_decisions_level_check check (approval_level in ('administrative_management', 'general_directorate')),
  constraint purchase_approval_decisions_decision_check check (decision in ('approved', 'rejected')),
  constraint purchase_approval_decisions_rejection_justification_check check (
    decision <> 'rejected' or btrim(coalesce(justification, '')) <> ''
  )
);

create index if not exists purchase_requests_approval_status_idx on public.purchase_requests (approval_status);
create index if not exists purchase_requests_approval_level_idx on public.purchase_requests (approval_level);
create index if not exists purchase_requests_approval_decided_at_idx on public.purchase_requests (approval_decided_at);
create index if not exists purchase_requests_approval_decided_by_idx on public.purchase_requests (approval_decided_by);

create index if not exists purchase_approval_decisions_org_idx on public.purchase_approval_decisions (organization_id);
create index if not exists purchase_approval_decisions_unit_idx on public.purchase_approval_decisions (unit_id);
create index if not exists purchase_approval_decisions_request_idx on public.purchase_approval_decisions (purchase_request_id);
create index if not exists purchase_approval_decisions_quote_idx on public.purchase_approval_decisions (purchase_quote_id);
create index if not exists purchase_approval_decisions_level_idx on public.purchase_approval_decisions (approval_level);
create index if not exists purchase_approval_decisions_decision_idx on public.purchase_approval_decisions (decision);
create index if not exists purchase_approval_decisions_decided_at_idx on public.purchase_approval_decisions (decided_at);

alter table public.purchase_approval_decisions enable row level security;

comment on column public.purchase_requests.approval_status is
  'Status da decisao formal de aprovacao de compra: pending, approved ou rejected.';
comment on column public.purchase_requests.approval_level is
  'Alcada responsavel pela decisao formal: administrative_management ou general_directorate.';
comment on column public.purchase_requests.approval_decided_at is
  'Data e hora da decisao formal de aprovacao ou reprovacao.';
comment on column public.purchase_requests.approval_decided_by is
  'Usuario interno que registrou a decisao formal.';
comment on column public.purchase_requests.approval_decision_notes is
  'Observacao de aprovacao ou justificativa de reprovacao.';
comment on table public.purchase_approval_decisions is
  'Historico de decisoes formais de aprovacao de compras. Sprint 5D V1.';
