-- Compras - Trava no banco para cotacoes que ja integram um dossie formal de aprovacao.
-- Rede de seguranca por baixo da trava de aplicacao (assertQuoteIsNotInFormalDossier):
-- uma cotacao referenciada por um snapshot ATIVO nao pode sofrer UPDATE nem DELETE,
-- preservando a auditoria. Snapshots devolvidos (returned_to_purchases) ou substituidos
-- (superseded) NAO travam a cotacao, liberando a revisao apos devolucao.

-- Funcao auxiliar: a cotacao integra algum dossie ATIVO?
-- Ativo = snapshot_status in ('pending','approved','rejected') and deleted_at is null.
-- A cotacao e considerada referenciada tanto pela coluna selected_quote_id quanto pela
-- presenca do id dentro do snapshot_payload (vencedora, recomendada e concorrentes).
create or replace function public.purchase_quote_in_active_dossier(p_quote_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.purchase_approval_snapshots s
    where s.snapshot_status in ('pending', 'approved', 'rejected')
      and s.deleted_at is null
      and (
        s.selected_quote_id = p_quote_id
        or jsonb_path_exists(
             s.snapshot_payload,
             '$.selectedQuote.id ? (@ == $qid)',
             jsonb_build_object('qid', p_quote_id::text)
           )
        or jsonb_path_exists(
             s.snapshot_payload,
             '$.recommendedQuote.id ? (@ == $qid)',
             jsonb_build_object('qid', p_quote_id::text)
           )
        or jsonb_path_exists(
             s.snapshot_payload,
             '$.quotes[*].id ? (@ == $qid)',
             jsonb_build_object('qid', p_quote_id::text)
           )
      )
  )
  into v_exists;

  return coalesce(v_exists, false);
end;
$$;

-- Funcao de trigger: bloqueia UPDATE/DELETE de cotacoes travadas por dossie ativo.
-- Bloqueio total no UPDATE (nao compara coluna a coluna).
create or replace function public.enforce_purchase_quote_dossier_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if public.purchase_quote_in_active_dossier(old.id) then
      raise exception 'PURCHASE_QUOTE_LOCKED_IN_DOSSIER';
    end if;

    return old;
  end if;

  -- tg_op = 'UPDATE'
  if public.purchase_quote_in_active_dossier(old.id) then
    raise exception 'PURCHASE_QUOTE_LOCKED_IN_DOSSIER';
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_quote_dossier_lock on public.purchase_quotes;

create trigger purchase_quote_dossier_lock
  before update or delete on public.purchase_quotes
  for each row execute function public.enforce_purchase_quote_dossier_lock();

comment on function public.purchase_quote_in_active_dossier(uuid) is
  'Retorna true se a cotacao integra algum dossie formal ATIVO (snapshot_status in pending/approved/rejected e deleted_at null), detectada por selected_quote_id ou pela presenca do id no snapshot_payload (selectedQuote, recommendedQuote e quotes[]). returned_to_purchases e superseded nao contam como ativos.';

comment on function public.enforce_purchase_quote_dossier_lock() is
  'Rede de seguranca no banco: impede UPDATE/DELETE de cotacoes travadas em dossie formal ativo, levantando PURCHASE_QUOTE_LOCKED_IN_DOSSIER. A trava de aplicacao (assertQuoteIsNotInFormalDossier) continua como primeira linha de defesa.';
