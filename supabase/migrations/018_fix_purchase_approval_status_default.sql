-- FIX-APPROVAL-STATUS-1 - approval_status deve nascer sem decisao formal.

alter table public.purchase_requests
  alter column approval_status drop default;

alter table public.purchase_requests
  alter column approval_status drop not null;

update public.purchase_requests
set approval_status = null
where approval_status = 'pending'
  and approval_required is distinct from true
  and approval_decided_at is null
  and approval_decided_by is null;

comment on column public.purchase_requests.approval_status is
  'Status da decisao formal de aprovacao de compra. Null indica que ainda nao foi enviada para aprovacao.';
