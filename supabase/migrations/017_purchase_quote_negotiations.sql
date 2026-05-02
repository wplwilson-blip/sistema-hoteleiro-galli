-- DB-COMPRAS-1B - Rodadas de negociacao e economia de compras.
-- Prepara o banco para preservar propostas originais e registrar economia futura.

alter table public.purchase_quotes
  add column if not exists original_quote_id uuid references public.purchase_quotes(id) on delete restrict,
  add column if not exists parent_quote_id uuid references public.purchase_quotes(id) on delete restrict,
  add column if not exists quote_round integer not null default 1,
  add column if not exists superseded_by_quote_id uuid references public.purchase_quotes(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references public.app_users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quotes_quote_round_check'
      and conrelid = 'public.purchase_quotes'::regclass
  ) then
    alter table public.purchase_quotes
      add constraint purchase_quotes_quote_round_check
      check (quote_round >= 1);
  end if;
end;
$$;

create table if not exists public.purchase_quote_negotiations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  original_quote_id uuid not null references public.purchase_quotes(id) on delete restrict,
  previous_quote_id uuid not null references public.purchase_quotes(id) on delete restrict,
  new_quote_id uuid not null references public.purchase_quotes(id) on delete restrict,
  round_number integer not null,
  previous_total_amount numeric(14,2) not null,
  new_total_amount numeric(14,2) not null,
  discount_amount numeric(14,2) not null,
  discount_percent numeric(9,4) not null,
  negotiation_notes text,
  negotiated_by uuid references public.app_users(id) on delete set null,
  negotiated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quote_negotiations_round_number_check'
      and conrelid = 'public.purchase_quote_negotiations'::regclass
  ) then
    alter table public.purchase_quote_negotiations
      add constraint purchase_quote_negotiations_round_number_check
      check (round_number >= 2);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quote_negotiations_previous_total_check'
      and conrelid = 'public.purchase_quote_negotiations'::regclass
  ) then
    alter table public.purchase_quote_negotiations
      add constraint purchase_quote_negotiations_previous_total_check
      check (previous_total_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_quote_negotiations_new_total_check'
      and conrelid = 'public.purchase_quote_negotiations'::regclass
  ) then
    alter table public.purchase_quote_negotiations
      add constraint purchase_quote_negotiations_new_total_check
      check (new_total_amount >= 0);
  end if;
end;
$$;

create index if not exists purchase_quotes_original_quote_idx on public.purchase_quotes (original_quote_id);
create index if not exists purchase_quotes_parent_quote_idx on public.purchase_quotes (parent_quote_id);
create index if not exists purchase_quotes_superseded_by_idx on public.purchase_quotes (superseded_by_quote_id);
create index if not exists purchase_quotes_superseded_at_idx on public.purchase_quotes (superseded_at);

create index if not exists purchase_quote_negotiations_request_idx on public.purchase_quote_negotiations (purchase_request_id);
create index if not exists purchase_quote_negotiations_supplier_idx on public.purchase_quote_negotiations (supplier_id);
create index if not exists purchase_quote_negotiations_original_quote_idx on public.purchase_quote_negotiations (original_quote_id);
create index if not exists purchase_quote_negotiations_previous_quote_idx on public.purchase_quote_negotiations (previous_quote_id);
create index if not exists purchase_quote_negotiations_new_quote_idx on public.purchase_quote_negotiations (new_quote_id);
create index if not exists purchase_quote_negotiations_negotiated_by_idx on public.purchase_quote_negotiations (negotiated_by);

alter table public.purchase_quote_negotiations enable row level security;

comment on column public.purchase_quotes.original_quote_id is
  'Primeira proposta da cadeia de negociacao. Null indica cotacao original.';
comment on column public.purchase_quotes.parent_quote_id is
  'Proposta imediatamente anterior quando esta cotacao e uma rodada renegociada.';
comment on column public.purchase_quotes.quote_round is
  'Numero da rodada da proposta. Rodada 1 representa a cotacao original.';
comment on column public.purchase_quotes.superseded_by_quote_id is
  'Cotacao posterior que superou esta proposta na cadeia de negociacao.';
comment on column public.purchase_quotes.superseded_at is
  'Data em que a proposta foi superada por nova rodada.';
comment on column public.purchase_quotes.superseded_by is
  'Usuario interno que registrou a nova rodada que superou esta proposta.';

comment on table public.purchase_quote_negotiations is
  'Registro das negociacoes entre propostas de um mesmo fornecedor, com valores congelados para auditoria e indicadores de economia.';
comment on column public.purchase_quote_negotiations.discount_amount is
  'Diferenca entre proposta anterior e nova proposta. Pode ser negativa quando houver aumento ou alteracao de escopo.';
comment on column public.purchase_quote_negotiations.discount_percent is
  'Percentual de economia ou aumento em relacao ao valor anterior, congelado no momento da negociacao.';
