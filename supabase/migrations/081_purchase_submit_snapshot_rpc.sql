-- Compras - RPC transacional para gerar o dossie formal de aprovacao (envio/reenvio).
-- Substitui as tres escritas sequenciais e sem transacao da rota
-- POST /api/purchases/approvals/[requestId]/resubmit (create snapshot + update da
-- purchase_requests + dois eventos) por UMA transacao. O lock FOR UPDATE na
-- purchase_requests serializa reenvios concorrentes; o snapshot_number e' calculado sob o
-- lock; o gate atomico e o indice unico (migration 019) garantem no maximo um snapshot
-- pendente. A montagem do snapshot_payload continua na camada de aplicacao.

create or replace function public.purchase_submit_approval_snapshot(
  p_request_id uuid,
  p_organization_id uuid,
  p_unit_id uuid,
  p_selected_quote_id uuid,
  p_selected_supplier_id uuid,
  p_approval_status_at_creation text,
  p_approval_rule text,
  p_approval_level text,
  p_total_amount numeric,
  p_currency text,
  p_is_selected_quote_recommended boolean,
  p_recommendation_reason text,
  p_submitted_by uuid,
  p_now timestamptz,
  p_snapshot_payload jsonb,
  p_next_status text,
  p_from_status text,
  p_total_approved_amount numeric,
  p_quotation_required boolean,
  p_required_quote_count integer,
  p_approval_required boolean,
  p_director_approval_required boolean,
  p_submit_event_type text,
  p_submit_event_description text,
  p_snapshot_event_type text,
  p_request_number text
)
returns table (snapshot_id uuid, snapshot_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.purchase_requests%rowtype;
  v_snapshot_number integer;
  v_snapshot_id uuid;
begin
  -- Lock da solicitacao: serializa reenvios concorrentes da mesma compra.
  select *
  into v_req
  from public.purchase_requests
  where id = p_request_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  -- Gate atomico: nao pode existir outro snapshot pendente para esta compra.
  if exists (
    select 1
    from public.purchase_approval_snapshots
    where purchase_request_id = p_request_id
      and snapshot_status = 'pending'
      and deleted_at is null
  ) then
    raise exception 'PURCHASE_SNAPSHOT_ALREADY_PENDING';
  end if;

  -- Proximo numero sequencial, calculado sob o lock (nunca fora da transacao).
  select coalesce(max(pas.snapshot_number), 0) + 1
  into v_snapshot_number
  from public.purchase_approval_snapshots pas
  where pas.purchase_request_id = p_request_id
    and pas.deleted_at is null;

  -- Insert do snapshot. Converte a violacao do indice unico (23505) em erro de negocio.
  begin
    insert into public.purchase_approval_snapshots (
      organization_id,
      unit_id,
      purchase_request_id,
      selected_quote_id,
      selected_supplier_id,
      snapshot_number,
      snapshot_status,
      approval_status_at_creation,
      approval_rule,
      approval_level,
      total_amount,
      currency,
      is_selected_quote_recommended,
      recommendation_reason,
      submitted_by,
      submitted_at,
      snapshot_payload,
      created_at,
      updated_at,
      created_by,
      updated_by
    )
    values (
      p_organization_id,
      p_unit_id,
      p_request_id,
      p_selected_quote_id,
      p_selected_supplier_id,
      v_snapshot_number,
      'pending',
      p_approval_status_at_creation,
      p_approval_rule,
      p_approval_level,
      p_total_amount,
      p_currency,
      p_is_selected_quote_recommended,
      p_recommendation_reason,
      p_submitted_by,
      p_now,
      p_snapshot_payload,
      p_now,
      p_now,
      p_submitted_by,
      p_submitted_by
    )
    returning id into v_snapshot_id;
  exception
    when unique_violation then
      raise exception 'PURCHASE_SNAPSHOT_ALREADY_PENDING';
  end;

  -- Update da solicitacao (mesmos campos que a rota atualizava).
  update public.purchase_requests
  set status = p_next_status::public.purchase_request_status,
      total_approved_amount = p_total_approved_amount,
      quotation_required = p_quotation_required,
      required_quote_count = p_required_quote_count,
      approval_required = p_approval_required,
      director_approval_required = p_director_approval_required,
      approval_status = 'pending',
      approval_level = p_approval_level,
      approval_decided_at = null,
      approval_decided_by = null,
      approval_decision_notes = null,
      updated_by = p_submitted_by
  where id = p_request_id;

  -- Evento de envio/reenvio.
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
    p_organization_id,
    p_unit_id,
    p_request_id,
    p_submit_event_type,
    p_from_status::public.purchase_request_status,
    p_next_status::public.purchase_request_status,
    p_submit_event_description,
    p_submitted_by
  );

  -- Evento de criacao do dossie formal (descricao embute o snapshot_number sob o lock).
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
    p_organization_id,
    p_unit_id,
    p_request_id,
    p_snapshot_event_type,
    p_from_status::public.purchase_request_status,
    p_next_status::public.purchase_request_status,
    'Dossie formal de aprovacao #' || v_snapshot_number || ' criado para a compra ' || p_request_number || '.',
    p_submitted_by
  );

  return query select v_snapshot_id, v_snapshot_number;
end;
$$;

revoke execute on function public.purchase_submit_approval_snapshot(
  uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, boolean, text, uuid,
  timestamptz, jsonb, text, text, numeric, boolean, integer, boolean, boolean, text,
  text, text, text
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.purchase_submit_approval_snapshot(
      uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, boolean, text, uuid,
      timestamptz, jsonb, text, text, numeric, boolean, integer, boolean, boolean, text,
      text, text, text
    ) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.purchase_submit_approval_snapshot(
      uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, boolean, text, uuid,
      timestamptz, jsonb, text, text, numeric, boolean, integer, boolean, boolean, text,
      text, text, text
    ) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.purchase_submit_approval_snapshot(
      uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, boolean, text, uuid,
      timestamptz, jsonb, text, text, numeric, boolean, integer, boolean, boolean, text,
      text, text, text
    ) to service_role;
  end if;
end;
$$;

comment on function public.purchase_submit_approval_snapshot(
  uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, boolean, text, uuid,
  timestamptz, jsonb, text, text, numeric, boolean, integer, boolean, boolean, text,
  text, text, text
) is
  'Gera o dossie formal de aprovacao (envio/reenvio) em uma unica transacao: lock da solicitacao, gate de snapshot pendente, snapshot_number sob o lock, insert do snapshot, update da purchase_requests e dois eventos. A montagem do snapshot_payload e o calculo de alcada permanecem na camada de aplicacao.';
