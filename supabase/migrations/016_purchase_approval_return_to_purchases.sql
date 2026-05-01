-- Sprint 5D.1 - permite devolucao da aprovacao para revisao de Compras.

alter table public.purchase_requests
  drop constraint if exists purchase_requests_approval_status_check;

alter table public.purchase_requests
  add constraint purchase_requests_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected', 'returned_to_purchases'));

alter table public.purchase_approval_decisions
  drop constraint if exists purchase_approval_decisions_decision_check;

alter table public.purchase_approval_decisions
  add constraint purchase_approval_decisions_decision_check
  check (decision in ('approved', 'rejected', 'returned_to_purchases'));

alter table public.purchase_approval_decisions
  drop constraint if exists purchase_approval_decisions_rejection_justification_check;

alter table public.purchase_approval_decisions
  add constraint purchase_approval_decisions_justification_check
  check (
    decision = 'approved'
    or btrim(coalesce(justification, '')) <> ''
  );

comment on column public.purchase_requests.approval_status is
  'Status da decisao formal de aprovacao de compra: pending, approved, rejected ou returned_to_purchases.';
comment on table public.purchase_approval_decisions is
  'Historico de decisoes formais de aprovacao de compras, incluindo devolucoes para revisao de Compras.';
