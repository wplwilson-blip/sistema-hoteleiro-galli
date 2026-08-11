-- Compras - RPCs transacionais para as QUATRO mutacoes de cotacao (achado #7 / plano 51).
--
-- Antes: PATCH (unselect | select | save) e DELETE em
-- /api/purchases/requests/[id]/quotes/[quoteId] executavam 3 a 6 escritas SEQUENCIAIS com
-- rollback MANUAL. O rollback nao cobre queda de processo (timeout, OOM, deploy, instancia
-- reciclada) e, no caminho de selecao, o proprio rollback era nao-atomico (um update por
-- cotacao dentro de um laco).
--
-- A janela mais grave e' a da SELECAO: entre "a cotacao vira vencedora" e "purchase_requests
-- recebe total_approved_amount/approval_level", a solicitacao fica com cotacao vencedora
-- NOVA e alcada ANTIGA. Como o nivel de aprovacao deriva de total_approved_amount
-- (getPurchaseApprovalLevel, corte em R$200) e alimenta o dossie formal, o resultado e'
-- DESVIO DE ALCADA: uma compra de valor alto decidida na alcada da gerencia.
--
-- Mesmo padrao ja usado nas migrations 079 (decisao) e 081 (dossie): a RPC e' um ENVELOPE
-- TRANSACIONAL. Todo o calculo (sumPurchaseQuoteItems, calculateWinningQuoteApprovalFlags,
-- getPurchaseApprovalLevel, mapQuoteEvidenceUpdate, getReviewApprovalStatusUpdate,
-- getReviewDecisionResetFields) permanece na aplicacao e chega pronto via jsonb.
--
-- Locks: FOR UPDATE na purchase_requests e na purchase_quotes serializam mutacoes
-- concorrentes na mesma compra (hoje duas selecoes simultaneas podem intercalar).
--
-- Ator: toda escrita seta created_by/updated_by = p_actor_id, exatamente como a rota faz
-- hoje. NAO setamos o GUC app.current_user_id: a auditoria generica (write_audit_trail,
-- migration 008) le esse GUC e ninguem no app o seta — audit_trail.app_user_id ja e' null
-- hoje. Manter identico ao comportamento atual; corrigir a rastreabilidade da audit_trail
-- e' assunto proprio, fora do escopo do #7.
--
-- Triggers que continuam valendo (agora DENTRO da transacao):
--   purchase_quotes      -> set_updated_at_purchase_quotes, audit_purchase_quotes,
--                           purchase_quote_dossier_lock (migration 080)
--   purchase_quote_items -> set_updated_at_purchase_quote_items, audit_purchase_quote_items
--   purchase_requests    -> set_updated_at_purchase_requests, audit_purchase_requests
--   purchase_request_events -> nenhum
-- O dossier_lock levantar PURCHASE_QUOTE_LOCKED_IN_DOSSIER agora aborta a mutacao INTEIRA,
-- em vez de deixar estado parcial.
--
-- Idempotente: create or replace.

-- =====================================================================================
-- Helper interno: aplica um patch jsonb na purchase_requests.
-- jsonb_populate_record usa a linha ATUAL como base, entao chaves AUSENTES no patch
-- preservam o valor atual — que e' exatamente a semantica de getReviewDecisionResetFields
-- (retorna {} quando nao deve tocar nos campos de decisao).
-- =====================================================================================
create or replace function public.purchase_apply_request_patch(
  p_request_id uuid,
  p_patch jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.purchase_requests%rowtype;
  v_next public.purchase_requests%rowtype;
begin
  if p_patch is null then
    return;
  end if;

  select * into v_current from public.purchase_requests where id = p_request_id;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  v_next := jsonb_populate_record(v_current, p_patch);

  update public.purchase_requests
     set status = v_next.status,
         total_approved_amount = v_next.total_approved_amount,
         quotation_required = v_next.quotation_required,
         required_quote_count = v_next.required_quote_count,
         approval_required = v_next.approval_required,
         director_approval_required = v_next.director_approval_required,
         approval_status = v_next.approval_status,
         approval_level = v_next.approval_level,
         approval_decided_at = v_next.approval_decided_at,
         approval_decided_by = v_next.approval_decided_by,
         approval_decision_notes = v_next.approval_decision_notes,
         updated_by = v_next.updated_by
   where id = p_request_id;
end;
$$;

-- =====================================================================================
-- Helper interno: insere eventos da solicitacao, na ordem do array.
-- =====================================================================================
create or replace function public.purchase_insert_request_events(
  p_request_id uuid,
  p_organization_id uuid,
  p_unit_id uuid,
  p_events jsonb,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_events is null or jsonb_array_length(p_events) = 0 then
    return;
  end if;

  insert into public.purchase_request_events (
    organization_id, unit_id, purchase_request_id, event_type, from_status, to_status,
    description, created_by
  )
  select
    p_organization_id,
    p_unit_id,
    p_request_id,
    e.event_type,
    -- from_status/to_status sao do enum public.purchase_request_status. O JSON traz string,
    -- e o Postgres NAO faz cast implicito text -> enum num INSERT ... SELECT (erro 42804).
    -- O cast explicito e' obrigatorio; jsonb_to_recordset e' declarado com text porque a
    -- extracao do JSON produz text.
    e.from_status::public.purchase_request_status,
    e.to_status::public.purchase_request_status,
    e.description,
    p_actor_id
  from jsonb_to_recordset(p_events) as e(
    event_type text,
    from_status text,
    to_status text,
    description text,
    ordinal int
  )
  order by e.ordinal nulls last;
end;
$$;

-- =====================================================================================
-- 1) SELECAO / DESSELECAO  (PATCH action=select | unselect)
-- =====================================================================================
create or replace function public.purchase_set_quote_selection(
  p_request_id uuid,
  p_quote_id uuid,
  p_select boolean,
  p_request_update jsonb,
  p_events jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.purchase_requests%rowtype;
  v_quote public.purchase_quotes%rowtype;
begin
  select * into v_request
    from public.purchase_requests
   where id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  select * into v_quote
    from public.purchase_quotes
   where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_QUOTE_NOT_FOUND';
  end if;

  if p_select then
    -- Demais cotacoes deixam de ser vencedoras (espelha o update com neq da rota).
    update public.purchase_quotes
       set is_selected = false,
           status = 'rejected',
           selected_by = null,
           selected_at = null,
           updated_by = p_actor_id
     where purchase_request_id = p_request_id
       and id <> p_quote_id
       and deleted_at is null;

    update public.purchase_quotes
       set is_selected = true,
           status = 'selected',
           selected_by = p_actor_id,
           selected_at = now(),
           updated_by = p_actor_id
     where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null;
  else
    update public.purchase_quotes
       set is_selected = false,
           status = 'received',
           selected_by = null,
           selected_at = null,
           updated_by = p_actor_id
     where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null;
  end if;

  perform public.purchase_apply_request_patch(p_request_id, p_request_update);
  perform public.purchase_insert_request_events(
    p_request_id, v_request.organization_id, v_request.unit_id, p_events, p_actor_id
  );

  return jsonb_build_object('ok', true, 'quoteId', p_quote_id, 'selected', p_select);
end;
$$;

-- =====================================================================================
-- 2) SALVAR VALORES  (PATCH action=save)
-- =====================================================================================
create or replace function public.purchase_save_quote_values(
  p_request_id uuid,
  p_quote_id uuid,
  p_quote_update jsonb,
  p_items jsonb,
  p_request_update jsonb,
  p_events jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.purchase_requests%rowtype;
  v_quote public.purchase_quotes%rowtype;
  v_next public.purchase_quotes%rowtype;
begin
  select * into v_request
    from public.purchase_requests
   where id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  select * into v_quote
    from public.purchase_quotes
   where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_QUOTE_NOT_FOUND';
  end if;

  -- Chaves ausentes no patch preservam o valor atual da cotacao.
  v_next := jsonb_populate_record(v_quote, p_quote_update);

  update public.purchase_quotes
     set supplier_id = v_next.supplier_id,
         quote_number = v_next.quote_number,
         quote_date = v_next.quote_date,
         valid_until = v_next.valid_until,
         total_amount = v_next.total_amount,
         delivery_days = v_next.delivery_days,
         payment_terms = v_next.payment_terms,
         is_selected = v_next.is_selected,
         is_recurring_supplier_quote = v_next.is_recurring_supplier_quote,
         quote_validity_exception = v_next.quote_validity_exception,
         quote_validity_exception_reason = v_next.quote_validity_exception_reason,
         quote_source_type = v_next.quote_source_type,
         evidence_type = v_next.evidence_type,
         evidence_confidence = v_next.evidence_confidence,
         source_contact_name = v_next.source_contact_name,
         source_contact_channel = v_next.source_contact_channel,
         source_reference = v_next.source_reference,
         source_url = v_next.source_url,
         source_notes = v_next.source_notes,
         evidence_missing_reason = v_next.evidence_missing_reason,
         requires_attachment = v_next.requires_attachment,
         requires_justification = v_next.requires_justification,
         has_formal_evidence = v_next.has_formal_evidence,
         is_verbal_quote = v_next.is_verbal_quote,
         is_emergency_quote = v_next.is_emergency_quote,
         emergency_reason = v_next.emergency_reason,
         regularization_required = v_next.regularization_required,
         regularization_deadline = v_next.regularization_deadline,
         notes = v_next.notes,
         status = v_next.status,
         updated_by = p_actor_id
   where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null;

  -- Troca dos itens: delete + insert na MESMA transacao (antes eram duas escritas soltas,
  -- deixando a cotacao sem itens com total_amount ja novo se o processo caisse no meio).
  delete from public.purchase_quote_items where purchase_quote_id = p_quote_id;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into public.purchase_quote_items (
      organization_id, unit_id, purchase_quote_id, purchase_request_item_id,
      item_description, quantity, unit_price, total_price, delivery_notes,
      created_by, updated_by
    )
    select
      v_request.organization_id,
      v_request.unit_id,
      p_quote_id,
      i.purchase_request_item_id,
      i.item_description,
      i.quantity,
      i.unit_price,
      i.total_price,
      i.delivery_notes,
      p_actor_id,
      p_actor_id
    from jsonb_to_recordset(p_items) as i(
      purchase_request_item_id uuid,
      item_description text,
      quantity numeric,
      unit_price numeric,
      total_price numeric,
      delivery_notes text
    );
  end if;

  perform public.purchase_apply_request_patch(p_request_id, p_request_update);
  perform public.purchase_insert_request_events(
    p_request_id, v_request.organization_id, v_request.unit_id, p_events, p_actor_id
  );

  return jsonb_build_object('ok', true, 'quoteId', p_quote_id);
end;
$$;

-- =====================================================================================
-- 3) CANCELAMENTO  (DELETE)
-- =====================================================================================
create or replace function public.purchase_cancel_quote(
  p_request_id uuid,
  p_quote_id uuid,
  p_request_update jsonb,
  p_events jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.purchase_requests%rowtype;
  v_quote public.purchase_quotes%rowtype;
  v_now timestamptz := now();
  v_items int;
begin
  select * into v_request
    from public.purchase_requests
   where id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_REQUEST_NOT_FOUND';
  end if;

  select * into v_quote
    from public.purchase_quotes
   where id = p_quote_id and purchase_request_id = p_request_id and deleted_at is null
     for update;

  if not found then
    raise exception 'PURCHASE_QUOTE_NOT_FOUND';
  end if;

  if v_quote.status = 'cancelled' then
    raise exception 'PURCHASE_QUOTE_ALREADY_CANCELLED';
  end if;

  select count(*) into v_items
    from public.purchase_quote_items
   where purchase_quote_id = p_quote_id and deleted_at is null;

  update public.purchase_quotes
     set status = 'cancelled',
         is_selected = false,
         selected_by = null,
         selected_at = null,
         deleted_at = v_now,
         deleted_by = p_actor_id,
         updated_by = p_actor_id
   where id = p_quote_id;

  update public.purchase_quote_items
     set deleted_at = v_now,
         deleted_by = p_actor_id,
         updated_by = p_actor_id
   where purchase_quote_id = p_quote_id;

  perform public.purchase_apply_request_patch(p_request_id, p_request_update);
  perform public.purchase_insert_request_events(
    p_request_id, v_request.organization_id, v_request.unit_id, p_events, p_actor_id
  );

  return jsonb_build_object('ok', true, 'quoteId', p_quote_id, 'cancelledItems', v_items);
end;
$$;

-- =====================================================================================
-- Grants — padrao da migration 079: execute apenas para service_role.
-- =====================================================================================
do $$
declare
  fn text;
  sig text;
  sigs text[] := array[
    'public.purchase_apply_request_patch(uuid, jsonb)',
    'public.purchase_insert_request_events(uuid, uuid, uuid, jsonb, uuid)',
    'public.purchase_set_quote_selection(uuid, uuid, boolean, jsonb, jsonb, uuid)',
    'public.purchase_save_quote_values(uuid, uuid, jsonb, jsonb, jsonb, jsonb, uuid)',
    'public.purchase_cancel_quote(uuid, uuid, jsonb, jsonb, uuid)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke execute on function %s from public', sig);

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', sig);
    end if;

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated', sig);
    end if;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', sig);
    end if;
  end loop;
end;
$$;

comment on function public.purchase_set_quote_selection(uuid, uuid, boolean, jsonb, jsonb, uuid) is
  'Selecao/desselecao de cotacao vencedora em UMA transacao: cotacoes + purchase_requests + eventos. Grava selected_by/selected_at no ato da selecao e limpa ao desmarcar. Fecha a janela de desvio de alcada entre a troca da vencedora e a atualizacao de total_approved_amount/approval_level.';

comment on function public.purchase_save_quote_values(uuid, uuid, jsonb, jsonb, jsonb, jsonb, uuid) is
  'Salvamento de valores da cotacao em UMA transacao: cotacao + troca de itens (delete+insert) + purchase_requests + eventos. Calculo permanece na aplicacao e chega via jsonb.';

comment on function public.purchase_cancel_quote(uuid, uuid, jsonb, jsonb, uuid) is
  'Cancelamento (soft delete) de cotacao em UMA transacao: cotacao + itens + purchase_requests (quando era a vencedora) + eventos.';
