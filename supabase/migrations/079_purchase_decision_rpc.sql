-- Compras - RPC transacional para registrar a decisao de aprovacao de compra.
-- Substitui as quatro escritas separadas e sem transacao da rota
-- POST /api/purchases/approvals/[requestId]/decision por uma unica transacao,
-- com o compare-and-swap do snapshot como PRIMEIRA escrita e derivando o
-- approval_level do proprio snapshot pendente. A autorizacao continua na rota.

create or replace function public.purchase_apply_approval_decision(
  p_request_id uuid,
  p_winning_quote_id uuid,
  p_decision text,
  p_justification text,
  p_decided_by uuid,
  p_decided_at timestamptz,
  p_next_status text,
  p_from_status text,
  p_event_type text,
  p_event_description text
)
returns table (snapshot_id uuid, approval_level text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.purchase_requests%rowtype;
  v_level text;
  v_snap uuid;
begin
  select *
  into v_req
  from public.purchase_requests
  where id = p_request_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  if v_req.approval_status in ('approved', 'rejected') then
    raise exception 'PURCHASE_ALREADY_DECIDED';
  end if;

  update public.purchase_approval_snapshots
  set snapshot_status = p_decision,
      decision = p_decision,
      decision_reason = nullif(btrim(p_justification), ''),
      decided_by = p_decided_by,
      decided_at = p_decided_at,
      updated_by = p_decided_by,
      updated_at = p_decided_at
  where purchase_request_id = p_request_id
    and snapshot_status = 'pending'
    and deleted_at is null
  returning id, purchase_approval_snapshots.approval_level
  into v_snap, v_level;

  if v_snap is null then
    raise exception 'PURCHASE_SNAPSHOT_NOT_PENDING';
  end if;

  insert into public.purchase_approval_decisions (
    organization_id,
    unit_id,
    purchase_request_id,
    purchase_quote_id,
    approval_level,
    decision,
    justification,
    decided_by,
    decided_at
  )
  values (
    v_req.organization_id,
    v_req.unit_id,
    p_request_id,
    p_winning_quote_id,
    v_level,
    p_decision,
    nullif(btrim(p_justification), ''),
    p_decided_by,
    p_decided_at
  );

  update public.purchase_requests
  set status = p_next_status,
      approval_status = p_decision,
      approval_level = v_level,
      approval_decided_at = p_decided_at,
      approval_decided_by = p_decided_by,
      approval_decision_notes = nullif(btrim(p_justification), ''),
      updated_by = p_decided_by
  where id = p_request_id;

  insert into public.purchase_request_events (
    organization_id,
    unit_id,
    purchase_request_id,
    event_type,
    from_status,
    to_status,
    description,
    created_by
  )
  values (
    v_req.organization_id,
    v_req.unit_id,
    p_request_id,
    p_event_type,
    p_from_status,
    p_next_status,
    p_event_description,
    p_decided_by
  );

  return query select v_snap, v_level;
end;
$$;

revoke execute on function public.purchase_apply_approval_decision(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.purchase_apply_approval_decision(
      uuid,
      uuid,
      text,
      text,
      uuid,
      timestamptz,
      text,
      text,
      text,
      text
    ) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.purchase_apply_approval_decision(
      uuid,
      uuid,
      text,
      text,
      uuid,
      timestamptz,
      text,
      text,
      text,
      text
    ) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.purchase_apply_approval_decision(
      uuid,
      uuid,
      text,
      text,
      uuid,
      timestamptz,
      text,
      text,
      text,
      text
    ) to service_role;
  end if;
end;
$$;

comment on function public.purchase_apply_approval_decision(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text
) is
  'Registra a decisao de aprovacao de compra em uma unica transacao: CAS do snapshot pendente como primeira escrita, insert da decisao, update da solicitacao e insert do evento. A autorizacao permanece na rota; esta funcao nao faz autorizacao.';
