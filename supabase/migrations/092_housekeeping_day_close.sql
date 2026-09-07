-- ============================================================================
-- 092 — Fechamento do dia, sobra que acumula e o 409 que diz qual (plano 77)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O QUE ESTA MIGRATION RESOLVE, em uma frase: hoje O DIA NAO TERMINA. Uma tarefa
-- `pending` de sexta e' indistinguivel de uma de segunda -- as duas dizem "ainda
-- nao foi feito", e nenhuma diz "o dia acabou e ficou sem fazer".
--
-- PREMISSA: 089, 090 e 091 ja aplicadas nos dois bancos.
--
-- ADITIVA. Nao altera `rooms`, `room_status_history`, permissoes, perfis nem
-- policies. Acrescenta um valor de enum, uma tabela, duas colunas e tres
-- funcoes, e substitui o corpo de duas ja existentes.
--
-- AS ASSINATURAS NAO MUDAM. `housekeeping_open_day` e `rooms_apply_transition`
-- continuam com os mesmos argumentos -- a licao da D8 do plano 75: mudar
-- assinatura de RPC exposta pelo PostgREST e' SEMPRE quebra (PGRST203), nunca
-- compatibilidade. Tudo o que e' novo entra no corpo.
--
-- ORDEM DE DEPLOY: sem janela. O app atual continua funcionando depois de
-- aplicar; o app novo le campos que o banco antigo simplesmente nao teria.
-- ============================================================================


-- ============================================================================
-- 0) O VALOR NOVO DO ENUM -- SOZINHO, ANTES DE TUDO
--
-- LEIA ANTES DE COLAR NO SQL EDITOR:
--
-- `alter type ... add value` NAO RODA DENTRO DE BLOCO DE TRANSACAO em versoes
-- mais antigas do Postgres. Se voce colar o arquivo inteiro de uma vez e o
-- editor envolver tudo numa transacao, ESTE comando falha e derruba o resto --
-- exatamente o tipo de coisa que quebrou a 089 na sua mao.
--
-- RODE ESTE BLOCO SOZINHO, PRIMEIRO. Depois o restante do arquivo.
--
-- NAO E' REVERSIVEL: nao existe `drop value` num enum do Postgres. Desfeito todo
-- o resto da 092, `not_done` PERMANECE NO TIPO PARA SEMPRE. Isso NAO impede o
-- rollback -- um valor de enum sem nenhuma linha usando nao faz mal nenhum --,
-- mas fica escrito para ninguem se assustar ao ver o valor sobrevivendo.
--
-- O CHECK do bicondicional (091) NAO MUDA: `not_done` ja cai no lado "sem tipo",
-- que e' confirmacao de que a regra da D2.1 do plano 75 estava bem formulada.
-- ============================================================================

alter type public.housekeeping_task_outcome add value if not exists 'not_done';


-- ============================================================================
-- 1) public.housekeeping_day_events -- a trilha do dia (plano 77, D5)
--
-- POR QUE UMA TABELA, e nao colunas `reopened_at`/`reopened_by`: reabrir zera
-- `closed_at`/`closed_by` e PERDE que o dia chegou a ser fechado. Colunas
-- responderiam "foi reaberto", nunca "foi fechado as 17h COM 3 PENDENTES e
-- reaberto as 18h" -- e a segunda reabertura sobrescreveria a primeira.
--
-- E ha um dado que SO' sobrevive aqui: o numero de pendentes no momento do
-- fechamento. Ele NAO e' derivavel depois, porque reabrir converte `not_done`
-- de volta em `pending` -- a contagem daquele instante seria irrecuperavel.
--
-- `housekeeping_days` continua guardando o ESTADO ATUAL (closed_at nulo =
-- aberto agora); esta tabela guarda a TRILHA.
-- ============================================================================

do $EVENTS$
begin
  if not exists (select 1 from pg_type where typname = 'housekeeping_day_event') then
    create type public.housekeeping_day_event as enum ('opened', 'closed', 'reopened');
  end if;
end
$EVENTS$;

create table if not exists public.housekeeping_day_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  housekeeping_day_id uuid not null references public.housekeeping_days(id) on delete restrict,
  event public.housekeeping_day_event not null,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.app_users(id) on delete set null,
  -- Quantas tarefas estavam PENDENTES no momento do fechamento. Nulo fora de
  -- `closed`. E' o registro que a D1 exige e que nao pode ser recalculado.
  pending_count integer,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,

  constraint housekeeping_day_events_pending_iff_closed check (
    (event = 'closed' and pending_count is not null)
    or (event <> 'closed' and pending_count is null)
  ),
  constraint housekeeping_day_events_note_not_blank check (
    note is null or btrim(note) <> ''
  )
);

create index if not exists housekeeping_day_events_day_idx
  on public.housekeeping_day_events (housekeeping_day_id, occurred_at);

comment on table public.housekeeping_day_events is
  'Trilha do dia da Governanca (plano 77, D5): abertura, fechamento e reabertura. Existe porque reabrir zera closed_at/closed_by e perderia que o dia chegou a ser fechado -- e porque o numero de pendentes no fechamento nao e derivavel depois (reabrir devolve not_done a pending).';


-- ============================================================================
-- 2) A SOBRA em public.housekeeping_tasks (plano 77, D6)
--
-- `carried_over_since` e' a FONTE; `carried_over_days` e' CONVENIENCIA.
--
-- O contador e' redundante de proposito -- a tela pergunta "ha quantos dias"
-- muito mais que "desde qual data" --, e dado redundante desincroniza. Por isso
-- existe a consulta que diz qual dos dois esta certo, no item 5 da VALIDACAO:
-- divergencia significa DEFEITO NA PROPAGACAO, nao dado a corrigir na mao.
-- ============================================================================

alter table public.housekeeping_tasks
  add column if not exists carried_over_since date,
  add column if not exists carried_over_days integer not null default 0;

do $CARRY$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'housekeeping_tasks_carry_since_iff_days'
  ) then
    -- Sobra sem data seria sobra que nao sabe desde quando -- o defeito que a D6
    -- existe para evitar. Os dois sentidos, como o bicondicional da D2.1.
    alter table public.housekeeping_tasks
      add constraint housekeeping_tasks_carry_since_iff_days check (
        (carried_over_since is null and carried_over_days = 0)
        or (carried_over_since is not null and carried_over_days > 0)
      );
  end if;
end
$CARRY$;

comment on column public.housekeeping_tasks.carried_over_since is
  'Data em que o apartamento ficou not_done pela PRIMEIRA vez nesta sequencia. FONTE DA VERDADE da sobra: propaga da tarefa anterior, e so usa a data do dia anterior quando a sequencia comeca ali. Nulo quando nao e sobra.';

comment on column public.housekeeping_tasks.carried_over_days is
  'Quantos dias REGISTRADOS a sobra ja dura. Conveniencia recalculavel a partir de carried_over_since (ver VALIDACAO, item 5); em caso de divergencia, a data e que vale.';


-- ============================================================================
-- 3) housekeeping_open_day -- ganha a propagacao da sobra
--
-- Corpo EXTRAIDO da 091 por script e adaptado. A ASSINATURA NAO MUDA.
-- ============================================================================

create or replace function public.housekeeping_open_day(
  p_unit_id uuid,
  p_service_date date default null,
  p_actor_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $OPENDAY$
declare
  v_date date;
  v_org uuid;
  v_tz text;
  v_day_id uuid;
  v_prev_day_id uuid;
  v_prev_date date;
begin
  select organization_id, coalesce(nullif(btrim(timezone), ''), 'America/Sao_Paulo')
  into v_org, v_tz
  from public.units
  where id = p_unit_id and deleted_at is null;

  if v_org is null then
    raise exception 'HOUSEKEEPING_UNIT_NOT_FOUND' using errcode = '22023';
  end if;

  -- `current_date` seria a data do SERVIDOR, que roda em UTC. A governanta que
  -- abrisse o dia as 22h de domingo criaria a SEGUNDA-FEIRA -- e a fila do
  -- domingo dela ficaria vazia para sempre.
  v_date := coalesce(p_service_date, (now() at time zone v_tz)::date);

  -- Lock por unidade+data: duas aberturas simultaneas do mesmo dia serializam
  -- em vez de correrem. `on conflict do nothing` sozinho nao bastaria, porque o
  -- insert das tarefas abaixo precisa enxergar o dia ja resolvido.
  insert into public.housekeeping_days
    (organization_id, unit_id, service_date, opened_by, created_by, updated_by)
  values (v_org, p_unit_id, v_date, p_actor_id, p_actor_id, p_actor_id)
  on conflict (unit_id, service_date) do nothing;

  select id into v_day_id
  from public.housekeeping_days
  where unit_id = p_unit_id and service_date = v_date;

  -- O ULTIMO dia registrado ANTES deste, e nao "ontem": um domingo que ninguem abriu nao e'
  -- um dia em que a governanca deixou de arrumar. A sobra conta dias REGISTRADOS.
  select id, service_date into v_prev_day_id, v_prev_date
  from public.housekeeping_days
  where unit_id = p_unit_id and service_date < v_date
  order by service_date desc
  limit 1;

  -- A SOBRA (plano 77, D6). `carried_over_since` PROPAGA a data original da sequencia; so'
  -- quando ela comeca aqui e' que usamos a data do dia anterior.
  --
  -- Copiar a data de ontem SEMPRE seria o "reset" que a D6 recusa: um quarto sem arrumar desde
  -- sexta apareceria no domingo como "sobra de sabado", e a historia toda se perderia -- o
  -- mesmo motivo pelo qual `housekeeping_changed_at` existe.
  --
  -- SO' `not_done` carrega. `declined` nao e' sobra (nada ficou por fazer -- o hospede recusou)
  -- e `cancelled` tampouco (o apartamento saiu de operacao).
  insert into public.housekeeping_tasks
    (organization_id, unit_id, housekeeping_day_id, room_id, outcome,
     carried_over_since, carried_over_days, created_by, updated_by)
  select v_org, p_unit_id, v_day_id, r.id, 'pending'::public.housekeeping_task_outcome,
         sobra.carried_over_since,
         coalesce(sobra.carried_over_days, 0),
         p_actor_id, p_actor_id
  from public.rooms r
  left join lateral (
    select coalesce(t.carried_over_since, v_prev_date) as carried_over_since,
           (select count(*)
            from public.housekeeping_days d2
            where d2.unit_id = p_unit_id
              and d2.service_date >= coalesce(t.carried_over_since, v_prev_date)
              and d2.service_date <  v_date) as carried_over_days
    from public.housekeeping_tasks t
    where t.housekeeping_day_id = v_prev_day_id
      and t.room_id = r.id
      and t.outcome = 'not_done'::public.housekeeping_task_outcome
  ) sobra on true
  where r.unit_id = p_unit_id
    and r.deleted_at is null
    and r.status = 'active'
    and r.blocking_status = 'none'
  on conflict (housekeeping_day_id, room_id) do nothing;

  return v_day_id;
end;
$OPENDAY$;


-- ============================================================================
-- 4) housekeeping_close_day -- fechar com pendencia (plano 77, D1 e D2)
--
-- Fechar com pendencia e' PERMITIDO: um sistema que proibe encerrar e' um
-- sistema que ensina a mentir para poder fechar -- a governanta marcaria como
-- arrumado o que nao foi, so' para o botao liberar.
--
-- As pendentes viram `not_done`, que separa "ficou sem arrumar e o dia fechou"
-- de "esta pendente porque o dia ainda esta aberto".
--
-- E O FECHAMENTO TAMBEM PROPAGA A SOBRA, pela ordem real da manha: a governanta
-- abre a segunda as 8h e so' entao fecha a sexta, as 8h05. As tarefas de segunda
-- ja foram criadas -- sem a marca, porque as 8h as de sexta ainda eram
-- `pending`. Sem esta propagacao, a marca dependeria da ordem em que ela clicou,
-- e a ordem errada e' a MAIS PROVAVEL.
--
-- Idempotente: fechar um dia ja fechado e' no-op.
-- ============================================================================

create or replace function public.housekeeping_close_day(
  p_day_id uuid,
  p_actor_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $CLOSEDAY$
declare
  v_day public.housekeeping_days%rowtype;
  v_pending integer;
begin
  select * into v_day
  from public.housekeeping_days
  where id = p_day_id
  for update;

  if not found then
    raise exception 'HOUSEKEEPING_DAY_NOT_FOUND' using errcode = '22023';
  end if;

  -- No-op idempotente: fechar duas vezes nao gera evento duplicado nem reconta.
  if v_day.closed_at is not null then
    return 0;
  end if;

  select count(*) into v_pending
  from public.housekeeping_tasks
  where housekeeping_day_id = p_day_id
    and outcome = 'pending'::public.housekeeping_task_outcome;

  update public.housekeeping_tasks
  set outcome = 'not_done'::public.housekeeping_task_outcome,
      updated_at = now(),
      updated_by = p_actor_id
  where housekeeping_day_id = p_day_id
    and outcome = 'pending'::public.housekeeping_task_outcome;

  update public.housekeeping_days
  set closed_at = now(),
      closed_by = p_actor_id,
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_day_id;

  -- A CONTAGEM VIVE AQUI, e so' aqui: reabrir devolve `not_done` a `pending`, e
  -- o numero deste instante seria irrecuperavel depois (D5).
  insert into public.housekeeping_day_events
    (organization_id, unit_id, housekeeping_day_id, event, actor_id, pending_count, created_by)
  values (v_day.organization_id, v_day.unit_id, p_day_id, 'closed', p_actor_id, v_pending, p_actor_id);

  -- Propagacao da sobra para dias POSTERIORES ainda abertos (D6). As tarefas que
  -- acabaram de virar `not_done` passam a contar como sobra la'.
  update public.housekeeping_tasks alvo
  set carried_over_since = coalesce(origem.carried_over_since, v_day.service_date),
      carried_over_days = (
        select count(*)
        from public.housekeeping_days d2
        where d2.unit_id = v_day.unit_id
          and d2.service_date >= coalesce(origem.carried_over_since, v_day.service_date)
          and d2.service_date <  posterior.service_date
      ),
      updated_at = now(),
      updated_by = p_actor_id
  from public.housekeeping_days posterior,
       public.housekeeping_tasks origem
  where alvo.housekeeping_day_id = posterior.id
    and posterior.unit_id = v_day.unit_id
    and posterior.service_date > v_day.service_date
    and posterior.closed_at is null
    and origem.housekeeping_day_id = p_day_id
    and origem.room_id = alvo.room_id
    and origem.outcome = 'not_done'::public.housekeeping_task_outcome
    and alvo.outcome = 'pending'::public.housekeeping_task_outcome;

  return v_pending;
end;
$CLOSEDAY$;

comment on function public.housekeeping_close_day(uuid, uuid) is
  'Fecha o dia da Governanca: converte pending em not_done, grava o evento com o numero de pendentes (irrecuperavel depois) e propaga a sobra para dias posteriores em aberto. Idempotente.';


-- ============================================================================
-- 5) housekeeping_reopen_day -- reabrir devolve SO' as not_done (D4)
--
-- Quarto atrasado as 18h depois do fechamento das 17h acontece. Proibir reabrir
-- faria o dado ficar errado nos DOIS dias: o de hoje sem o trabalho, e o de
-- amanha com um trabalho que nao e' dele.
--
-- `done`, `declined` e `cancelled` ficam INTACTAS -- e a assimetria com o
-- desbloqueio (091, §5.6.1, que ressuscita so' `cancelled`) e' justificada:
--
--   `done` e `declined` sao FATOS CONSUMADOS. Alguem arrumou, ou o hospede
--   recusou. Reabrir o dia nao desfaz nenhum dos dois.
--
--   `not_done` NAO e' fato consumado: e' o registro de que O DIA ACABOU ANTES DO
--   TRABALHO. Reabrir desfaz exatamente essa premissa. Nao estamos apagando um
--   fato -- estamos corrigindo uma conclusao que deixou de valer.
--
-- As naturezas sao diferentes, nao a regra.
--
-- Idempotente: reabrir um dia aberto e' no-op.
-- ============================================================================

create or replace function public.housekeeping_reopen_day(
  p_day_id uuid,
  p_actor_id uuid default null,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $REOPENDAY$
declare
  v_day public.housekeeping_days%rowtype;
  v_restored integer;
begin
  select * into v_day
  from public.housekeeping_days
  where id = p_day_id
  for update;

  if not found then
    raise exception 'HOUSEKEEPING_DAY_NOT_FOUND' using errcode = '22023';
  end if;

  if v_day.closed_at is null then
    return 0;
  end if;

  update public.housekeeping_tasks
  set outcome = 'pending'::public.housekeeping_task_outcome,
      updated_at = now(),
      updated_by = p_actor_id
  where housekeeping_day_id = p_day_id
    and outcome = 'not_done'::public.housekeeping_task_outcome;

  get diagnostics v_restored = row_count;

  update public.housekeeping_days
  set closed_at = null,
      closed_by = null,
      updated_at = now(),
      updated_by = p_actor_id
  where id = p_day_id;

  -- O evento e' o que impede a reabertura de apagar a historia: `closed_at` acabou
  -- de virar nulo, e sem esta linha ninguem saberia que o dia chegou a ser fechado.
  insert into public.housekeeping_day_events
    (organization_id, unit_id, housekeeping_day_id, event, actor_id, note, created_by)
  values (v_day.organization_id, v_day.unit_id, p_day_id, 'reopened', p_actor_id,
          nullif(btrim(coalesce(p_note, '')), ''), p_actor_id);

  return v_restored;
end;
$REOPENDAY$;

comment on function public.housekeeping_reopen_day(uuid, uuid, text) is
  'Reabre o dia da Governanca: devolve SO as not_done para pending (done, declined e cancelled ficam intactas) e registra o evento -- sem ele, zerar closed_at apagaria que o dia chegou a ser fechado.';


-- ============================================================================
-- 6) rooms_apply_transition -- o 409 passa a dizer QUAL apartamento (§4.1)
--
-- Corpo EXTRAIDO da 091 por script. A ASSINATURA NAO MUDA. A unica diferenca e'
-- o `detail` no raise do ROOMS_TRANSITION_STALE.
-- ============================================================================

create or replace function public.rooms_apply_transition(
  p_transitions jsonb,
  p_dimension text,
  p_reason text default null,
  p_actor_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_room_id uuid;
  v_from text;
  v_to text;
  v_effect text;
  v_current text;
  v_current_housekeeping text;
  v_record_status public.record_status;
  v_unit_id uuid;
  v_at timestamptz;
  v_last_at timestamptz;
  v_day_id uuid;
  v_service_type text;
  v_task_outcome public.housekeeping_task_outcome;
  v_count integer := 0;
begin
  if p_dimension is null or p_dimension not in ('occupancy', 'housekeeping', 'blocking') then
    raise exception 'ROOMS_TRANSITION_INVALID_DIMENSION' using errcode = '22023';
  end if;

  -- Ocupacao nao tem escritor nesta release (plano 70, D1). A trava vive na
  -- aplicacao E aqui: uma chamada direta a RPC nao deve contornar a decisao.
  if p_dimension = 'occupancy' then
    raise exception 'ROOMS_TRANSITION_NO_WRITER' using errcode = '22023';
  end if;

  if p_transitions is null or jsonb_typeof(p_transitions) <> 'array' or jsonb_array_length(p_transitions) = 0 then
    raise exception 'ROOMS_TRANSITION_EMPTY_BATCH' using errcode = '22023';
  end if;

  -- TRAVA DE LOTE (plano 75, D4): chegar em `inspected` nao aceita lote.
  --
  -- A informacao que essa transicao carrega e' "EU OLHEI ESTE QUARTO", e um botao que libera
  -- vinte de uma vez e' um botao que libera vinte sem olhar. A trava e' sobre CHEGAR em
  -- inspected, nao sobre uma aresta: vale para `clean -> inspected` e para o atalho
  -- `cleaning -> inspected`. Fechar so a primeira faria do atalho a porta dos fundos da
  -- vistoria em uma semana.
  --
  -- O lote continua valendo para todo o resto -- dirty, cleaning, clean e bloqueio -- porque
  -- esses sao fatos COLETIVOS sobre muitos quartos. Vistoria nao e'.
  if p_dimension = 'housekeeping'
     and jsonb_array_length(p_transitions) > 1
     and exists (
       select 1 from jsonb_array_elements(p_transitions) as t(element)
       where t.element ->> 'to' = 'inspected'
     ) then
    raise exception 'ROOMS_TRANSITION_INSPECT_NOT_BATCHABLE' using errcode = '22023';
  end if;

  -- ORDEM ESTAVEL POR room_id antes de qualquer `for update`.
  --
  -- Dois lotes que se cruzam -- um andar e uma ala que compartilham apartamentos --
  -- travariam em ordens opostas e o Postgres mataria um deles por deadlock. Com todos
  -- os lotes pegando os locks na mesma ordem, o segundo apenas espera. Uma linha.
  for v_item in
    select element
    from jsonb_array_elements(p_transitions) as t(element)
    order by (t.element ->> 'room_id')::uuid
  loop
    v_room_id := (v_item ->> 'room_id')::uuid;
    v_from    := v_item ->> 'from';
    v_to      := v_item ->> 'to';
    v_effect  := v_item ->> 'housekeeping_effect';

    -- HORA DO FATO, POR APARTAMENTO (plano 75, D5 e D8). Nulo = agora.
    --
    -- Por ITEM, e nao por chamada, porque a folha tem uma hora POR APARTAMENTO: "112 as
    -- 10h20, 113 as 10h45". Com uma hora por chamada, a governanta teria que lancar um
    -- apartamento por vez para preservar a hora real -- o que anula o lote exatamente no caso
    -- em que ele mais serve: ela passa o corredor com a folha na mao e lanca dez de uma vez,
    -- cada um com a sua hora.
    --
    -- Um lote gerando linhas de historico com horas DIFERENTES e' o comportamento certo: os
    -- fatos aconteceram em horas diferentes. (Uma versao anterior resolvia a hora uma vez para
    -- o lote inteiro, com o argumento oposto -- estava errado.)
    v_at := coalesce((v_item ->> 'occurred_at')::timestamptz, now());

    -- TRAVA 1 da D5: nao pode ser futura. `now()` como teto, sem tolerancia -- um relogio de
    -- cliente adiantado nao e' motivo para aceitar um fato que ainda nao aconteceu.
    if v_at > now() then
      raise exception 'ROOMS_TRANSITION_OCCURRED_AT_FUTURE' using errcode = '22023';
    end if;

    -- Lock + releitura da origem. Lemos TAMBEM o housekeeping atual (para o efeito
    -- colateral e para o historico) e o record_status do cadastro.
    -- `deleted_at is null`: apartamento excluido nao transita, e um lote que o inclua
    -- falha inteiro em vez de ignora-lo em silencio.
    select
      case p_dimension
        when 'housekeeping' then housekeeping_status::text
        when 'blocking'     then blocking_status::text
      end,
      housekeeping_status::text,
      status,
      unit_id
    into v_current, v_current_housekeeping, v_record_status, v_unit_id
    from public.rooms
    where id = v_room_id and deleted_at is null
    for update;

    if not found then
      raise exception 'ROOMS_TRANSITION_ROOM_NOT_FOUND' using errcode = '22023';
    end if;

    -- Apartamento INATIVO no cadastro nao aceita transicao operacional. Ele nao esta no
    -- inventario em uso: nao entra em fila de arrumacao, nao e' vistoriado e nao volta
    -- para a venda. Reativar e' assunto do cadastro (`rooms.manage`), nao da governanca.
    if v_record_status <> 'active' then
      raise exception 'ROOMS_TRANSITION_ROOM_INACTIVE' using errcode = '22023';
    end if;

    if v_current is distinct from v_from then
      -- 22023 (invalid_parameter_value), e NAO 40001. Ver o plano 74: 40001 e'
      -- serialization_failure, o codigo que o POSTGRES levanta quando ELE detecta conflito.
      -- Aqui quem detecta divergencia e' a aplicacao, comparando o valor lido com o relido
      -- sob o lock. Qualquer camada que trate 40001 como transitorio REPETE a requisicao --
      -- e esta certa em faze-lo. Era o que o PostgREST fazia: a resposta nunca voltava.
      --
      -- O `detail` CARREGA QUAL apartamento divergiu e para qual estado (plano 77, §4.1).
      --
      -- Sem ele, a governanta lanca dez apartamentos, o lote inteiro aborta e ela nao sabe
      -- qual dos dez causou -- numa manha com duas ocupantes operando ao mesmo tempo (D7),
      -- isso e' refazer o corredor as cegas. A informacao existe AQUI, sob o lock, e ate' esta
      -- versao era descartada.
      --
      -- `detail` e' campo proprio do erro do Postgres: chega ao PostgREST e aparece em
      -- `error.details`, AO LADO da mensagem, sem alterar nenhuma trava existente.
      raise exception 'ROOMS_TRANSITION_STALE'
        using errcode = '22023',
              detail = jsonb_build_object(
                'room_id', v_room_id,
                'expected', v_from,
                'current', v_current,
                'dimension', p_dimension
              )::text;
    end if;

    -- TRAVA 2 da D5: a hora informada nao pode ser ANTERIOR a ultima transicao do mesmo
    -- apartamento no MESMO DIA. Sem ela o historico aceita "arrumado as 10h20, sujo as 14h"
    -- numa ordem que nao aconteceu, e a linha do tempo do apartamento vira ficcao -- que e'
    -- exatamente o dado de onde sai o "Sujo ha 6 horas".
    --
    -- Sob o lock, de proposito: a leitura precisa ser a mesma que o insert vai enxergar.
    -- No fuso da UNIDADE. Com `::date` cru, uma transicao as 20h50 e outra as 21h10
    -- (Sao Paulo) cairiam em "dias" diferentes na comparacao -- 23h50 e 00h10 UTC --,
    -- e a segunda nao seria conferida contra a primeira. A trava existe para impedir
    -- ordem impossivel; comparar em fuso errado a desliga justamente no fim do dia.
    select max(changed_at) into v_last_at
    from public.room_status_history
    where room_id = v_room_id
      and public.housekeeping_service_date(changed_at, v_unit_id)
          = public.housekeeping_service_date(v_at, v_unit_id);

    if v_last_at is not null and v_at < v_last_at then
      raise exception 'ROOMS_TRANSITION_OCCURRED_AT_BEFORE_LAST' using errcode = '22023';
    end if;

    -- TIPO DE ARRUMACAO NO FECHO (plano 75, D2). Chega no proprio item do lote, porque um
    -- corredor tem saidas E permanencias misturadas: um tipo unico por chamada seria errado
    -- na metade dos quartos.
    v_service_type := v_item ->> 'service_type';

    if v_service_type is not null and v_service_type not in ('checkout', 'stayover') then
      raise exception 'ROOMS_TRANSITION_INVALID_SERVICE_TYPE' using errcode = '22023';
    end if;

    if p_dimension = 'housekeeping' then
      update public.rooms
      set housekeeping_status = v_to::public.housekeeping_status,
          -- A hora do FATO, nao a da digitacao. Se so' o historico fosse retroativo e este
          -- campo ficasse em now(), o "Sujo ha 6 horas" mentiria -- que e' a razao de a
          -- coluna existir (plano 75, §5.7).
          housekeeping_changed_at = v_at,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    else
      update public.rooms
      set blocking_status = v_to::public.blocking_status,
          -- Efeito colateral da §4.2, quando houver: sair de bloqueio -- de qualquer
          -- tipo -- derruba a UH para `dirty`. NUNCA para `inspected`: alguem entrou no
          -- apartamento, e a liberacao para venda continua exclusiva da governanca.
          housekeeping_status = coalesce(v_effect::public.housekeeping_status, housekeeping_status),
          -- O relogio da limpeza so' reinicia se a limpeza REALMENTE mudou. Um bloqueio
          -- que nao mexe no housekeeping nao pode zerar "Sujo ha 6 horas".
          housekeeping_changed_at = case
            when v_effect is not null and v_effect is distinct from v_current_housekeeping then v_at
            else housekeeping_changed_at
          end,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    end if;

    -- Uma linha por transicao de dimensao. A linha do efeito colateral e' gravada
    -- SEPARADAMENTE abaixo: sao dois fatos distintos, e achatar os dois numa linha
    -- so' e' a mesma conflacao que esta migration existe para desfazer.
    -- organization_id vem de units: `rooms` nao a carrega, so `unit_id`.
    -- room_status_history.organization_id e' NOT NULL desde a 011.
    insert into public.room_status_history
      (organization_id, unit_id, room_id, dimension, previous_status, new_status, reason,
       changed_by, created_by, updated_by, source_module, changed_at)
    select u.organization_id, r.unit_id, r.id, p_dimension, v_from, v_to, p_reason,
           p_actor_id, p_actor_id, p_actor_id, 'BASE', v_at
    from public.rooms r
    join public.units u on u.id = r.unit_id
    where r.id = v_room_id;

    -- A comparacao e' contra o housekeeping ATUAL, nao contra `v_current` -- que, num
    -- lote de bloqueio, carrega o valor da dimensao BLOCKING e nunca seria igual a um
    -- valor de limpeza. Escrito daquele jeito, o guarda era morto: nao filtrava nada.
    --
    -- E `previous_status` recebe o housekeeping de verdade, nao null. Sem ele, o
    -- historico nao responde "o 305 estava vistoriado quando entrou em obra?" -- que e'
    -- justamente a pergunta que se faz depois de uma reclamacao de hospede.
    if v_effect is not null and v_effect is distinct from v_current_housekeeping then
      insert into public.room_status_history
        (organization_id, unit_id, room_id, dimension, previous_status, new_status, reason,
         changed_by, created_by, updated_by, source_module, is_automatic, changed_at)
      select u.organization_id, r.unit_id, r.id, 'housekeeping', v_current_housekeeping, v_effect, p_reason,
             p_actor_id, p_actor_id, p_actor_id, 'BASE', true, v_at
      from public.rooms r
      join public.units u on u.id = r.unit_id
      where r.id = v_room_id;
    end if;

    -- ------------------------------------------------------------------ tarefa do dia
    --
    -- A tarefa e' o registro do TRABALHO do dia; o historico acima e' o registro do ESTADO.
    -- Sao coisas diferentes, e por isso vivem em tabelas diferentes (plano 75, §3).
    -- Data operacional no fuso da unidade. Com `v_at::date` cru, toda transicao
    -- depois das 21h procuraria o dia de AMANHA, nao acharia, e o bloco inteiro
    -- abaixo seria pulado em silencio.
    select id into v_day_id
    from public.housekeeping_days
    where unit_id = v_unit_id
      and service_date = public.housekeeping_service_date(v_at, v_unit_id)
      and closed_at is null;

    if v_day_id is not null then
      -- (a) CHEGAR EM `inspected` E' SAIDA POR DEFINICAO (D2.1). Permanencia para em `clean`,
      -- entao nao ha outro caminho ate aqui. Isto e' o que fecha o atalho
      -- `cleaning -> inspected` sem exigir um passo a mais da governanta -- e corrige uma
      -- tarefa que estivesse tipada `stayover` porque o hospede saiu DEPOIS da arrumacao de
      -- permanencia. A vistoria e' o ato posterior e mais informado; ela vence.
      --
      -- SEM GUARDA DE DESFECHO, e isto e' DECISAO, nao esquecimento -- diferente do bloco (b),
      -- que filtra `pending` de proposito.
      --
      -- Uma tarefa `declined` ou `cancelled` que chegue aqui vira `done`, e esta certo: NAO SE
      -- ALCANCA `inspected` SEM TER PASSADO PELO CICLO DE LIMPEZA. A propria matriz de
      -- transicao so' aceita `clean -> inspected` e `cleaning -> inspected`, e dispensa nao
      -- mexe no estado de limpeza. Logo, se a tarefa foi dispensada de manha e o quarto chegou
      -- a `inspected` a tarde, o trabalho ACONTECEU depois da dispensa -- o hospede saiu, o
      -- quarto foi arrumado e vistoriado. Registrar isso como `done` e' o unico desfecho
      -- verdadeiro; manter `declined` diria que ninguem entrou num quarto que foi vistoriado.
      --
      -- A maquina de estados e' que garante isso. Se um dia alguem acrescentar uma aresta que
      -- chegue a `inspected` sem passar por limpeza, esta guarda precisa voltar.
      if p_dimension = 'housekeeping' and v_to = 'inspected' then
        update public.housekeeping_tasks
        set service_type = 'checkout'::public.housekeeping_service_type,
            outcome = 'done'::public.housekeeping_task_outcome,
            completed_at = v_at,
            updated_at = now(),
            updated_by = p_actor_id
        where housekeeping_day_id = v_day_id and room_id = v_room_id;
      end if;

      -- (d) O FECHO DA LIMPEZA (D2). Chegar em `clean` e' o momento -- e o unico -- em que o
      -- tipo de arrumacao importa: e' ali que se decide se o apartamento PARA ou se ainda
      -- precisa de vistoria.
      --
      -- Por que o tipo e' EXIGIDO aqui: sem ele a RPC nao tem como saber se a tarefa terminou.
      -- Deixar passar produziria exatamente o buraco que a D2 descreve -- quarto limpo, tarefa
      -- pendente para sempre, e ninguem procurando porque nada aparece como faltando.
      --
      -- E POR QUE SO' `stayover` FECHA A TAREFA, e este e' o ponto sutil:
      --   - `stayover` termina em `clean` (nao ha vistoria num quarto ocupado) -> `done`, e o
      --     tipo e' gravado. Bicondicional satisfeito.
      --   - `checkout` NAO terminou: ainda falta a vistoria. A tarefa continua `pending` e SEM
      --     tipo -- e isso e' verdade, nao perda. O tipo dela sera gravado no bloco (a), quando
      --     chegar em `inspected`, que e' quando o trabalho de fato acabou.
      --
      -- Um quarto que fica em `clean` como saida ate' o fim do dia termina `pending` sem tipo,
      -- e esta CERTO: a vistoria nao aconteceu, o trabalho nao acabou. O bicondicional da D2.1
      -- nao e' uma restricao que atrapalha aqui -- ele e' o que mantem a fila honesta.
      if p_dimension = 'housekeeping' and v_to = 'clean' then
        select outcome into v_task_outcome
        from public.housekeeping_tasks
        where housekeeping_day_id = v_day_id and room_id = v_room_id;

        if v_task_outcome = 'pending'::public.housekeeping_task_outcome then
          if v_service_type is null then
            raise exception 'ROOMS_TRANSITION_SERVICE_TYPE_REQUIRED' using errcode = '22023';
          end if;

          if v_service_type = 'stayover' then
            update public.housekeeping_tasks
            set service_type = 'stayover'::public.housekeeping_service_type,
                outcome = 'done'::public.housekeeping_task_outcome,
                completed_at = v_at,
                updated_at = now(),
                updated_by = p_actor_id
            where housekeeping_day_id = v_day_id and room_id = v_room_id;
          end if;
        end if;
      end if;

      -- (b) BLOQUEAR CANCELA a tarefa pendente (§5.6.2). O apartamento saiu de operacao;
      -- ninguem vai arrumar quarto em obra, e deixa-lo pendente para sempre poria a tela para
      -- esconder um dado que o modelo sabe estar errado.
      if p_dimension = 'blocking' and v_to <> 'none' then
        update public.housekeeping_tasks
        set outcome = 'cancelled'::public.housekeeping_task_outcome,
            service_type = null,
            updated_at = now(),
            updated_by = p_actor_id
        where housekeeping_day_id = v_day_id
          and room_id = v_room_id
          and outcome = 'pending'::public.housekeeping_task_outcome;
      end if;

      -- (c) DESBLOQUEAR cria -- ou RESSUSCITA -- a tarefa (§5.6.1). A abertura do dia filtra
      -- `blocking_status = 'none'`, e encerrar manutencao derruba o apartamento para `dirty`:
      -- sem isto ele sumiria da fila justamente quando voltou a precisar de trabalho.
      --
      -- O `do nothing` daqui estava ERRADO e reintroduzia o proprio defeito que este bloco
      -- existe para evitar. Bloquear e desbloquear NO MESMO DIA nao e' hipotese -- e' a
      -- manutencao que resolve em duas horas, que e' a maioria. Nesse caso a linha JA EXISTE,
      -- deixada como `cancelled` pelo bloco (b), e o `do nothing` a deixava cancelada: o
      -- apartamento voltava a precisar de arrumacao e continuava fora da fila.
      --
      -- `do update` devolve a `pending` -- mas SOMENTE quando o desfecho for `cancelled`.
      -- Nunca ressuscita `done` (o trabalho aconteceu) nem `declined` (o hospede decidiu):
      -- desbloquear um quarto nao desfaz nenhum dos dois. `service_type` volta a nulo pelo
      -- bicondicional da D2.1 -- tarefa pendente nao tem tipo.
      if p_dimension = 'blocking' and v_to = 'none' then
        insert into public.housekeeping_tasks
          (organization_id, unit_id, housekeeping_day_id, room_id, outcome, created_by, updated_by)
        select u.organization_id, v_unit_id, v_day_id, v_room_id,
               'pending'::public.housekeeping_task_outcome, p_actor_id, p_actor_id
        from public.units u
        where u.id = v_unit_id
        on conflict (housekeeping_day_id, room_id) do update
        set outcome = 'pending'::public.housekeeping_task_outcome,
            service_type = null,
            completed_at = null,
            updated_at = now(),
            updated_by = p_actor_id
        where public.housekeeping_tasks.outcome = 'cancelled'::public.housekeeping_task_outcome;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


comment on function public.rooms_apply_transition(jsonb, text, text, uuid) is
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (planos 70 §6.2, 74, 75 e 77). A regra vive em rooms-utils.ts e chega decidida; aqui garantem-se atomicidade, lock em ordem estavel de room_id, releitura da origem sob lock com o apartamento divergente no `detail`, recusa de UH inativa, hora do FATO por item e a trava de lote em inspected.';


-- ============================================================================
-- 7) Superficie de execucao
--
-- As tres funcoes de dia sao SECURITY DEFINER e ignoram RLS. As duas novas
-- nascem com `execute` para PUBLIC por padrao -- sem os revokes abaixo, esta
-- migration abriria porta nova. As reescritas mantem a ACL (create or replace
-- nao a reseta), e os revokes ficam por serem baratos e auto-curativos.
-- ============================================================================

revoke execute on function public.housekeeping_close_day(uuid, uuid) from public;
revoke execute on function public.housekeeping_close_day(uuid, uuid) from anon;
revoke execute on function public.housekeeping_close_day(uuid, uuid) from authenticated;
grant execute on function public.housekeeping_close_day(uuid, uuid) to service_role;

revoke execute on function public.housekeeping_reopen_day(uuid, uuid, text) from public;
revoke execute on function public.housekeeping_reopen_day(uuid, uuid, text) from anon;
revoke execute on function public.housekeeping_reopen_day(uuid, uuid, text) from authenticated;
grant execute on function public.housekeeping_reopen_day(uuid, uuid, text) to service_role;

revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from public;
revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from anon;
revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from authenticated;
grant execute on function public.housekeeping_open_day(uuid, date, uuid) to service_role;

revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from public;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from anon;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from authenticated;
grant execute on function public.rooms_apply_transition(jsonb, text, text, uuid) to service_role;


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" para DDL e para DML
-- sem RETURNING. "Deu certo" na tela nao prova comportamento.
-- ============================================================================
--
-- 1) O valor novo existe e o CHECK do bicondicional continua valendo com ele:
--
--    select unnest(enum_range(null::public.housekeeping_task_outcome));
--    -- esperado: pending, done, declined, cancelled, not_done
--
--    -- begin;
--    --   update public.housekeeping_tasks
--    --   set outcome = 'not_done', service_type = 'checkout'
--    --   where id = (select id from public.housekeeping_tasks where outcome = 'pending' limit 1);
--    -- rollback;  -- esperado: housekeeping_tasks_type_iff_done (not_done COM tipo)
--
-- 2) A ACL das QUATRO funcoes esta fechada:
--
--    select p.proname,
--           pg_get_function_identity_arguments(p.oid) as args,
--           coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('rooms_apply_transition', 'housekeeping_open_day',
--                        'housekeeping_close_day', 'housekeeping_reopen_day',
--                        'housekeeping_service_date')
--    order by p.proname;
--
--    -- esperado: service_role=X/postgres em TODAS. `rooms_apply_transition` e
--    -- `housekeeping_open_day` aparecem UMA vez cada -- se aparecerem duas,
--    -- alguem recriou com assinatura diferente e o PostgREST vai devolver
--    -- PGRST203 em toda chamada (plano 75, D8).
--
-- 3) FECHAR com pendencia: converte e registra o numero.
--
--    select public.housekeeping_close_day('<DAY_ID>', null);
--    -- devolve o numero de pendentes convertidas.
--
--    select event, pending_count, occurred_at
--    from public.housekeeping_day_events
--    where housekeeping_day_id = '<DAY_ID>' order by occurred_at;
--    -- esperado: uma linha `closed` com pending_count = o numero devolvido.
--
--    select outcome, count(*) from public.housekeeping_tasks
--    where housekeeping_day_id = '<DAY_ID>' group by outcome;
--    -- esperado: ZERO `pending`; as que eram pendentes agora sao `not_done`.
--
--    -- IDEMPOTENCIA: rode o close de novo. Deve devolver 0 e NAO criar segundo
--    -- evento `closed`.
--
-- 4) REABRIR devolve SO' as not_done:
--
--    select public.housekeeping_reopen_day('<DAY_ID>', null, 'quarto 305 atrasado');
--    -- devolve quantas voltaram para pending.
--
--    select outcome, count(*) from public.housekeeping_tasks
--    where housekeeping_day_id = '<DAY_ID>' group by outcome;
--    -- esperado: as not_done viraram pending; `done`, `declined` e `cancelled`
--    -- com a MESMA contagem de antes. REPROVA se qualquer uma das tres mudou.
--
--    select event, note from public.housekeeping_day_events
--    where housekeeping_day_id = '<DAY_ID>' order by occurred_at;
--    -- esperado: `closed` (com pending_count) E `reopened` -- o fechamento
--    -- CONTINUA registrado mesmo com closed_at agora nulo. E' o ponto da D5.
--
-- 5) A SOBRA: o contador bate com a data. DEVE VOLTAR VAZIO.
--
--    A data e' a FONTE; o contador e' conveniencia. Divergencia aqui significa
--    DEFEITO NA PROPAGACAO, nao dado a corrigir na mao.
--
--    select t.id, r.room_number, d.service_date,
--           t.carried_over_since, t.carried_over_days as gravado,
--           (select count(*) from public.housekeeping_days d2
--             where d2.unit_id = d.unit_id
--               and d2.service_date >= t.carried_over_since
--               and d2.service_date <  d.service_date) as recalculado
--    from public.housekeeping_tasks t
--    join public.housekeeping_days d on d.id = t.housekeeping_day_id
--    join public.rooms r on r.id = t.room_id
--    where t.carried_over_since is not null
--      and t.carried_over_days <> (
--        select count(*) from public.housekeeping_days d2
--        where d2.unit_id = d.unit_id
--          and d2.service_date >= t.carried_over_since
--          and d2.service_date <  d.service_date);
--
-- 6) A SOBRA ACUMULA, nao reseta. Depois de dois dias seguidos de not_done no
--    mesmo apartamento:
--
--    select r.room_number, d.service_date, t.carried_over_since, t.carried_over_days
--    from public.housekeeping_tasks t
--    join public.housekeeping_days d on d.id = t.housekeeping_day_id
--    join public.rooms r on r.id = t.room_id
--    where t.carried_over_since is not null
--    order by r.room_number, d.service_date;
--
--    -- esperado: `carried_over_since` IGUAL nas duas linhas (a data ORIGINAL),
--    -- e `carried_over_days` crescendo. REPROVA se a data mudar de um dia para
--    -- o outro -- isso e' o "reset" que a D6 recusa.
--
-- 7) CONTROLE NEGATIVO -- os caminhos da 091 continuam respondendo:
--
--    select public.rooms_apply_transition('[]'::jsonb, 'housekeeping', null, null);
--    -- esperado: ROOMS_TRANSITION_EMPTY_BATCH, 22023.
--
--    `create or replace` reescreve o corpo INTEIRO de duas funcoes. Um erro de
--    transcricao em outro caminho nao apareceria nos itens 1 a 6.
--
-- 8) O `detail` do STALE carrega o apartamento (§4.1). Provoque um `from`
--    divergente e confira o campo DETAIL do erro, nao so' a mensagem:
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id','<ROOM_ID>','from','<FROM_MENTIROSO>','to','inspected',
--        'housekeeping_effect',null)),
--      'housekeeping', null, null);
--
--    -- esperado: erro ROOMS_TRANSITION_STALE, SQLSTATE 22023, e DETAIL com um
--    -- JSON contendo room_id, expected, current e dimension.
--    -- REPROVA se o detail vier vazio: a tela volta a nao saber qual dos dez
--    -- apartamentos causou o conflito.
--
-- 9) A PROVA COMPORTAMENTAL, em staging, ANTES de producao: a suite E2E
--    estendida. E' o unico caminho que passa pelo PostgREST.
--
--
-- ============================================================================
-- SEQUENCIA DE APLICACAO
--
--   1. Rodar o BLOCO 0 SOZINHO (o `add value`), em ambos os bancos.
--   2. Aplicar o restante do arquivo nos DOIS bancos. Sem janela.
--   3. Rodar os itens 1 a 8 da VALIDACAO em staging.
--   4. Suite E2E em staging (item 9). Portao para producao.
--   5. Aplicar em producao e rodar a VALIDACAO la.
--   6. Deploy do app.
-- ============================================================================
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
--
-- ATENCAO -- O VALOR DE ENUM NAO SAI. Nao existe `drop value` no Postgres:
-- `not_done` permanece em housekeeping_task_outcome PARA SEMPRE, mesmo desfeito
-- todo o resto. Isso NAO impede o rollback e nao faz mal nenhum -- um valor sem
-- linhas usando e' inerte --, mas esta escrito aqui para ninguem se assustar.
--
-- ORDEM: reverta o app ANTES, se ele ja estiver lendo os campos novos.
--
--   -- a) as tarefas que viraram not_done voltam a pending, senao a restricao
--   --    de coluna abaixo encontra linhas com carried_over_* preenchidos.
--   update public.housekeeping_tasks
--   set outcome = 'pending' where outcome = 'not_done';
--
--   -- b) as funcoes voltam a versao da 091, reaplicando 091_housekeeping_day.sql
--   --    INTEIRO (ele traz open_day e rooms_apply_transition na forma anterior).
--   drop function if exists public.housekeeping_close_day(uuid, uuid);
--   drop function if exists public.housekeeping_reopen_day(uuid, uuid, text);
--
--   -- c) colunas e tabela. ATENCAO: isto DESCARTA a trilha dos dias. Confira:
--   --      select count(*) from public.housekeeping_day_events;
--   alter table public.housekeeping_tasks
--     drop constraint if exists housekeeping_tasks_carry_since_iff_days,
--     drop column if exists carried_over_since,
--     drop column if exists carried_over_days;
--
--   drop table if exists public.housekeeping_day_events;
--   drop type if exists public.housekeeping_day_event;
-- ============================================================================
