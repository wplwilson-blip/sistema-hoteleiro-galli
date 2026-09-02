-- ============================================================================
-- 091 — O dia da governanca (plano docs/codex/75)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O QUE ESTA MIGRATION CRIA, em uma frase: o registro do TRABALHO do dia --
-- quais apartamentos entram na fila, que tipo de arrumacao cada um recebeu,
-- quais foram dispensados e por quem -- que hoje nao existe em lugar nenhum.
--
-- O ACHADO CENTRAL (plano 75, §2): existem DOIS tipos de arrumacao.
--   saida       -> dirty -> cleaning -> clean -> inspected   TEM vistoria
--   permanencia -> dirty -> cleaning -> clean                NAO tem vistoria
-- Permanencia para em `clean` porque nao ha o que liberar para venda: o quarto
-- ja esta ocupado. Exigir `inspected` numa permanencia seria pedir para liberar
-- para venda um quarto com hospede dentro.
--
-- ONDE AS COISAS NAO VAO (plano 75, §3): tipo de arrumacao e dispensa NAO entram
-- em `rooms` (seria sobrescrito amanha e responderia so "qual foi o ultimo
-- tipo") nem em `room_status_history` (dispensa NAO e' transicao -- o estado do
-- apartamento nao mudou, e' justamente o ponto). Sao fatos do DIA.
--
-- PREMISSA: 089 e 090 ja aplicadas nos dois bancos. Esta migration assume as
-- tres dimensoes, a RPC de transicao e a ACL fechada.
--
-- ADITIVA. Nao altera `rooms`, `room_status_history`, enums existentes,
-- permissoes, perfis nem policies. Cria duas tabelas e tres enums, e substitui
-- o corpo da `rooms_apply_transition` por `create or replace`.
--
-- ATENCAO -- A ASSINATURA DA FUNCAO MUDA: ganha `p_occurred_at timestamptz
-- default null`. Isso cria uma SOBRECARGA: a assinatura antiga de 4 argumentos
-- continua existindo ate ser removida no passo 7. A ordem importa, e o passo 7
-- explica por que o drop vem DEPOIS do create.
--
-- ORDEM DE DEPLOY: aplicar a migration ANTES do deploy do app. O parametro novo
-- tem default, entao o app antigo (que chama com 4 argumentos) continua
-- funcionando pela sobrecarga enquanto o deploy nao sai. O contrario -- app novo
-- com banco velho -- quebra: `p_occurred_at` nao existiria.
-- ============================================================================


-- ============================================================================
-- 0) A DATA OPERACIONAL -- calculada no fuso da UNIDADE, nunca no do servidor
--
-- O servidor do Supabase roda em UTC. Sao Paulo e' UTC-3, entao as 21h00 no
-- hotel ja sao 00h00 UTC -- e `agora::date` no servidor devolve AMANHA.
--
-- O QUE ISSO QUEBRARIA, e nao e' borda: governanca de hotel trabalha depois das
-- 21h (turndown, atraso, manutencao noturna). Uma transicao as 21h30 procuraria
-- o `housekeeping_days` de AMANHA, nao acharia, e o bloco inteiro dos efeitos na
-- tarefa seria pulado EM SILENCIO: o quarto sairia de bloqueio e a tarefa nao
-- ressuscitaria, o `inspected` nao tiparia como saida, o `clean` nao fecharia a
-- permanencia. Nenhum erro -- so' o dado que nao chega, todo dia depois das 21h.
--
-- `units.timezone` existe desde a migration 002 (`not null default
-- 'America/Sao_Paulo'`) e NUNCA foi lida por funcao nenhuma -- so' escrita, com
-- valor fixo, em duas rotas. E' o mesmo padrao do `organization_id` da 089: a
-- coluna estava la, e o codigo nao olhou.
--
-- Fica por UNIDADE, e nao numa constante, porque e' o que o SaaS vai precisar no
-- primeiro hotel fora do fuso de Brasilia.
--
-- UMA FUNCAO SO', e nao `at time zone` repetido nos tres lugares: e' o que torna
-- barato um eventual "corte do dia" configuravel (dia da governanca das 6h as
-- 6h) -- mudaria aqui, e em nenhum outro lugar. Ver o plano 75, D7.
-- ============================================================================

create or replace function public.housekeeping_service_date(
  p_at timestamptz,
  p_unit_id uuid
) returns date
language sql
stable
security definer
set search_path = public
as $SERVICEDATE$
  select (p_at at time zone coalesce(nullif(btrim(u.timezone), ''), 'America/Sao_Paulo'))::date
  from public.units u
  where u.id = p_unit_id;
$SERVICEDATE$;

comment on function public.housekeeping_service_date(timestamptz, uuid) is
  'Data operacional de um instante, no fuso da UNIDADE (units.timezone, existente desde a 002 e ate aqui sem nenhum leitor). O servidor roda em UTC: sem isto, as 21h de Sao Paulo o dia ja teria virado e os efeitos na tarefa seriam pulados em silencio.';


-- ============================================================================
-- 1) Os tres enums do dia
-- ============================================================================

do $ENUMS$
begin
  -- Tipo de arrumacao. NAO e' atributo do apartamento: e' do servico do dia.
  if not exists (select 1 from pg_type where typname = 'housekeeping_service_type') then
    create type public.housekeeping_service_type as enum ('checkout', 'stayover');
  end if;

  -- Desfecho da tarefa. `declined` e `cancelled` sao DISTINTOS de proposito
  -- (plano 75, §5.6.2): dispensa e' decisao do hospede; cancelamento e' o
  -- apartamento ter saido de operacao. Achatar os dois faria o relatorio do mes
  -- dizer que o hospede dispensou arrumacao num quarto que estava em obra.
  if not exists (select 1 from pg_type where typname = 'housekeeping_task_outcome') then
    create type public.housekeeping_task_outcome as enum ('pending', 'done', 'declined', 'cancelled');
  end if;

  -- Origem da dispensa. Os dois caminhos reais: a recepcao avisa antes, ou a
  -- camareira descobre na porta. Registrar QUAL dos dois e' o que permite saber
  -- depois se o aviso funcionou.
  if not exists (select 1 from pg_type where typname = 'housekeeping_decline_origin') then
    create type public.housekeeping_decline_origin as enum ('front_desk', 'housekeeper');
  end if;
end
$ENUMS$;


-- ============================================================================
-- 2) public.housekeeping_days -- o registro do dia
--
-- POR QUE ESTA TABELA EXISTE, e nao e' burocracia: DIA SEM REGISTRO E' SILENCIO,
-- NAO ZERO. Sem ela, um domingo em que ninguem abriu o sistema e um domingo em
-- que nada precisou ser arrumado sao a MESMA coisa -- os dois aparecem como
-- lista vazia. Esta tabela e' o que separa "nao sabemos" de "nao havia
-- trabalho", e e' a unica coisa que impede o historico de mentir por omissao.
-- ============================================================================

create table if not exists public.housekeeping_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  service_date date not null,
  opened_at timestamptz not null default now(),
  opened_by uuid references public.app_users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.app_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint housekeeping_days_unit_date_unique unique (unit_id, service_date),
  constraint housekeeping_days_closed_after_opened check (closed_at is null or closed_at >= opened_at)
);

comment on table public.housekeeping_days is
  'Registro do dia de trabalho da Governanca (plano 75, D1). A existencia da linha e o que distingue "dia nao aberto" de "dia sem trabalho" -- os dois seriam lista vazia sem ela.';


-- ============================================================================
-- 3) public.housekeeping_tasks -- a tarefa do dia
--
-- CHAVEADA PELO DIA, nao pela data. `housekeeping_day_id` e' NOT NULL com FK:
-- tarefa NAO PODE existir sem dia, e isso e' garantido pelo banco, nao pela boa
-- vontade da aplicacao. Uma chave por (room_id, service_date) permitiria
-- orfa -- exatamente o estado que a D1 declara impossivel.
--
-- `service_type` e' NULLABLE de proposito (plano 75, D2): a tarefa NASCE SEM
-- TIPO. O tipo e' decidido no FECHO da limpeza, nao na abertura do dia, porque
-- as 8h a ocupacao ainda nao sabe quem vai sair -- e derivar ali erraria nos 50
-- casos que mais importam, em silencio.
-- ============================================================================

create table if not exists public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  housekeeping_day_id uuid not null references public.housekeeping_days(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,

  service_type public.housekeeping_service_type,
  outcome public.housekeeping_task_outcome not null default 'pending',

  decline_origin public.housekeeping_decline_origin,
  decline_note text,

  -- Gancho do plano 76 (escala e titular por ala). Fica NULO ate la; nenhum
  -- escritor nesta fatia. Campo orfao consciente, com dono declarado.
  housekeeping_employee_id uuid references public.employees(id) on delete set null,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,

  constraint housekeeping_tasks_day_room_unique unique (housekeeping_day_id, room_id),

  -- O BICONDICIONAL DA D2.1, nos DOIS sentidos:
  --   service_type preenchido  <=>  outcome = 'done'
  -- Trabalho feito SEMPRE tem tipo; trabalho nao feito NUNCA tem.
  --
  -- O sentido de ida impede tarefa concluida sem dizer que trabalho era aquele
  -- -- o buraco que o atalho `cleaning -> inspected` abriria.
  -- O sentido de volta impede gravar `stayover` numa dispensa, que faria o
  -- relatorio do mes contar como permanencia realizada um quarto onde NINGUEM
  -- ENTROU.
  constraint housekeeping_tasks_type_iff_done check (
    (outcome = 'done' and service_type is not null)
    or (outcome <> 'done' and service_type is null)
  ),

  -- Dispensa exige origem; qualquer outro desfecho a proibe. Saber POR QUAL
  -- caminho a dispensa chegou e' o que permite avaliar depois se o aviso da
  -- recepcao esta funcionando.
  constraint housekeeping_tasks_decline_origin_iff_declined check (
    (outcome = 'declined' and decline_origin is not null)
    or (outcome <> 'declined' and decline_origin is null)
  ),

  -- Sem string em branco fingindo justificativa.
  constraint housekeeping_tasks_decline_note_not_blank check (
    decline_note is null or btrim(decline_note) <> ''
  ),

  constraint housekeeping_tasks_completed_iff_closed check (
    (outcome = 'pending' and completed_at is null)
    or (outcome <> 'pending')
  )
);

comment on table public.housekeeping_tasks is
  'Tarefa de arrumacao de UM apartamento em UM dia (plano 75). Um apartamento nao "e" permanencia -- ele TEM uma arrumacao de permanencia hoje. Por isso tipo e dispensa vivem aqui, e nao em rooms nem em room_status_history.';

comment on column public.housekeeping_tasks.service_type is
  'Tipo do servico EXECUTADO. Nulo enquanto a tarefa nao concluiu (D2): decidido no fecho da limpeza, quando a ocupacao ja e informativa E quem registra acabou de ver o quarto.';

comment on column public.housekeeping_tasks.housekeeping_employee_id is
  'Camareira responsavel. NULO ate o plano 76 (escala e titular por ala); nenhum escritor nesta fatia.';


-- ============================================================================
-- 4) Indices -- as duas filas da tela sao exatamente estas consultas
-- ============================================================================

create index if not exists housekeeping_days_unit_date_idx
  on public.housekeeping_days (unit_id, service_date desc);

create index if not exists housekeeping_tasks_day_outcome_idx
  on public.housekeeping_tasks (housekeeping_day_id, outcome);

create index if not exists housekeeping_tasks_room_idx
  on public.housekeeping_tasks (room_id);

create index if not exists housekeeping_tasks_employee_idx
  on public.housekeeping_tasks (housekeeping_employee_id);


-- ============================================================================
-- 5) RPC de abertura do dia
--
-- Transacional: cria o dia e as tarefas dos apartamentos elegiveis numa
-- transacao so'. Reabrir um dia ja aberto e' NO-OP IDEMPOTENTE, nunca
-- duplicacao -- a governanta que clicar duas vezes nao ganha 230 tarefas.
--
-- ELEGIVEIS: ativos, nao excluidos, e SEM BLOQUEIO. Um quarto em obra nao entra
-- na fila porque ninguem vai arruma-lo. O caso do quarto que SAI de bloqueio
-- depois esta tratado na rooms_apply_transition (§5.6.1 do plano).
--
-- NENHUMA TAREFA NASCE COM TIPO. Ver D2.
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

  insert into public.housekeeping_tasks
    (organization_id, unit_id, housekeeping_day_id, room_id, outcome, created_by, updated_by)
  select v_org, p_unit_id, v_day_id, r.id, 'pending'::public.housekeeping_task_outcome,
         p_actor_id, p_actor_id
  from public.rooms r
  where r.unit_id = p_unit_id
    and r.deleted_at is null
    and r.status = 'active'
    and r.blocking_status = 'none'
  on conflict (housekeeping_day_id, room_id) do nothing;

  return v_day_id;
end;
$OPENDAY$;

comment on function public.housekeeping_open_day(uuid, date, uuid) is
  'Abre o dia de trabalho da Governanca e materializa as tarefas dos apartamentos elegiveis. Idempotente: reabrir nao duplica. Nenhuma tarefa nasce com service_type (plano 75, D2).';


-- ============================================================================
-- 6) rooms_apply_transition -- hora real, trava de lote e efeitos na tarefa
--
-- O corpo abaixo foi EXTRAIDO da 090 por script e recebeu as mudancas desta
-- fatia. `create or replace` reescreve o corpo inteiro, entao a funcao vai
-- completa: versionar so o trecho alterado deixaria o arquivo mentindo sobre o
-- que esta no banco.
--
-- O QUE MUDOU em relacao a 090:
--   a) p_occurred_at (D5) -- hora do FATO, com as duas travas: nao futura, e
--      nao anterior a ultima transicao do mesmo apartamento no mesmo dia.
--      Alimenta room_status_history.changed_at E rooms.housekeeping_changed_at.
--   b) trava de lote em `inspected` (D4), nas DUAS arestas.
--   c) efeitos na tarefa do dia: inspected tipa como saida; bloquear cancela;
--      desbloquear cria a tarefa que faltava.
-- ============================================================================

create or replace function public.rooms_apply_transition(
  p_transitions jsonb,
  p_dimension text,
  p_reason text default null,
  p_actor_id uuid default null,
  -- Hora do FATO, nao da digitacao (plano 75, D5). Nulo = agora.
  p_occurred_at timestamptz default null
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
  -- Hora do fato: informada ou agora. Resolvida UMA vez para todo o lote, para que um lote
  -- nao fique com linhas de historico milissegundos diferentes entre si.
  v_at := coalesce(p_occurred_at, now());

  -- TRAVA 1 da D5: nao pode ser futura. `now()` como teto, sem tolerancia -- um relogio de
  -- cliente adiantado nao e' motivo para aceitar um fato que ainda nao aconteceu.
  if v_at > now() then
    raise exception 'ROOMS_TRANSITION_OCCURRED_AT_FUTURE' using errcode = '22023';
  end if;
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
      raise exception 'ROOMS_TRANSITION_STALE' using errcode = '22023';
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


comment on function public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz) is
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (planos 70 §6.2, 74 e 75). A regra vive em rooms-utils.ts e chega decidida; aqui garantem-se atomicidade, lock em ordem estavel de room_id, releitura da origem sob lock, recusa de UH inativa, hora do FATO (p_occurred_at) e a trava de lote em inspected.';


-- ============================================================================
-- 7) Remocao da sobrecarga antiga
--
-- A assinatura ganhou `p_occurred_at`, entao existem agora DUAS funcoes
-- `rooms_apply_transition`: a de 4 argumentos (090) e a de 5 (acima). Isso NAO
-- e' acidente e a ordem importa:
--
--   - o `create or replace` acima nao substitui a antiga, porque assinatura
--     diferente e' funcao diferente para o Postgres;
--   - enquanto o deploy do app nao sai, o app ANTIGO chama com 4 argumentos e
--     precisa que ela continue existindo;
--   - por isso o drop vem por ULTIMO, e e' o unico passo desta migration que
--     NAO pode ser executado antes do deploy.
--
-- SE VOCE ESTIVER APLICANDO ANTES DO DEPLOY: pule este passo, aplique o resto,
-- faca o deploy, e volte para rodar so este bloco -- NO MESMO DIA. As duas
-- assinaturas convivem sem risco tecnico, mas conviver e' estado de TRANSICAO:
-- a antiga nao grava hora retroativa nem mexe na tarefa do dia, e quem a chamar
-- por engano nao recebe erro nenhum -- so' o dado que nao aparece.
--
-- A ordem completa esta na SEQUENCIA DE APLICACAO, no fim deste arquivo.
-- ============================================================================

-- drop function if exists public.rooms_apply_transition(jsonb, text, text, uuid);


-- ============================================================================
-- 8) Superficie de execucao -- a ACL da assinatura NOVA
--
-- CRITICO, e e' um risco que a 090 nao tinha: a funcao de 5 argumentos e' uma
-- funcao NOVA para o Postgres, e nasce com `execute` para PUBLIC por padrao. A
-- ACL da assinatura antiga NAO a protege. Sem o revoke abaixo, esta migration
-- REABRIRIA a porta que a 090 fechou.
--
-- `security definer` ignora RLS: com `authenticated` podendo executar, qualquer
-- usuario logado transiciona qualquer apartamento de qualquer unidade pelo
-- PostgREST, sem passar pelo gate de permissao da rota.
-- ============================================================================

revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz) from public;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz) from anon;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz) from authenticated;
grant execute on function public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz) to service_role;

revoke execute on function public.housekeeping_service_date(timestamptz, uuid) from public;
revoke execute on function public.housekeeping_service_date(timestamptz, uuid) from anon;
revoke execute on function public.housekeeping_service_date(timestamptz, uuid) from authenticated;
grant execute on function public.housekeeping_service_date(timestamptz, uuid) to service_role;

revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from public;
revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from anon;
revoke execute on function public.housekeeping_open_day(uuid, date, uuid) from authenticated;
grant execute on function public.housekeeping_open_day(uuid, date, uuid) to service_role;


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" para DDL e para DML
-- sem RETURNING. "Deu certo" na tela nao prova comportamento.
-- ============================================================================
--
-- 1) A ACL das DUAS funcoes esta fechada. ESTE E' O ITEM MAIS IMPORTANTE desta
--    migration: a assinatura nova nasce publica por padrao.
--
--    select p.proname,
--           pg_get_function_identity_arguments(p.oid) as args,
--           coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('rooms_apply_transition', 'housekeeping_open_day')
--    order by p.proname, args;
--
--    -- esperado: service_role=X/postgres em TODAS as linhas.
--    -- REPROVA se qualquer linha trouxer "(sem ACL: PUBLICO)", `=X/` sem papel
--    -- antes do igual, `anon=X/` ou `authenticated=X/`.
--
-- 2) O bicondicional da D2.1 esta valendo (as duas devem FALHAR; rodar em
--    staging, dentro de transacao com rollback):
--
--    -- begin;
--    --   insert into public.housekeeping_tasks
--    --     (organization_id, unit_id, housekeeping_day_id, room_id, outcome)
--    --   select u.organization_id, d.unit_id, d.id, r.id, 'done'
--    --   from public.housekeeping_days d
--    --   join public.units u on u.id = d.unit_id
--    --   join public.rooms r on r.unit_id = d.unit_id
--    --   limit 1;
--    -- rollback;  -- esperado: housekeeping_tasks_type_iff_done ('done' sem tipo)
--
--    -- begin;
--    --   update public.housekeeping_tasks
--    --   set service_type = 'stayover' where outcome = 'pending' limit 1;
--    -- rollback;  -- esperado: housekeeping_tasks_type_iff_done (tipo sem 'done')
--
-- 3) Abertura do dia e' IDEMPOTENTE. Rode DUAS vezes e compare a contagem:
--
--    select public.housekeeping_open_day('<UNIT_ID>', current_date, null);
--    select count(*) from public.housekeeping_tasks
--    where housekeeping_day_id = (select id from public.housekeeping_days
--                                 where unit_id = '<UNIT_ID>' and service_date = current_date);
--
--    -- rode as duas linhas de novo: a contagem tem que ser IDENTICA.
--    -- REPROVA se dobrar.
--
-- 4) Nenhuma tarefa nasce com tipo (D2) -- deve voltar ZERO:
--
--    select count(*) from public.housekeeping_tasks
--    where service_type is not null and outcome = 'pending';
--
-- 5) A trava de lote em `inspected` (D4). Deve FALHAR com
--    ROOMS_TRANSITION_INSPECT_NOT_BATCHABLE, SQLSTATE 22023:
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(
--        jsonb_build_object('room_id','<ROOM_A>','from','clean','to','inspected','housekeeping_effect',null),
--        jsonb_build_object('room_id','<ROOM_B>','from','clean','to','inspected','housekeeping_effect',null)),
--      'housekeeping', null, null, null);
--
-- 6) Hora futura recusada -- ROOMS_TRANSITION_OCCURRED_AT_FUTURE, 22023:
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object('room_id','<ROOM_ID>','from','dirty','to','cleaning','housekeeping_effect',null)),
--      'housekeeping', null, null, now() + interval '1 hour');
--
-- 7) CONTROLE NEGATIVO -- os caminhos antigos continuam respondendo:
--
--    select public.rooms_apply_transition('[]'::jsonb, 'housekeeping', null, null, null);
--    -- esperado: ROOMS_TRANSITION_EMPTY_BATCH, 22023.
--
--    `create or replace` reescreve o corpo INTEIRO. Um erro de transcricao em
--    outro caminho nao apareceria nos itens 1 a 6 -- so' em producao.
--
-- 8) A PROVA COMPORTAMENTAL, em staging, ANTES de producao: a suite E2E do
--    plano 70 estendida. E' o unico caminho que passa pelo PostgREST.
--
-- 8.1) A DATA OPERACIONAL E' A LOCAL, NAO A DO SERVIDOR.
--
--    O servidor roda em UTC (confirme com `show timezone;`). Este item nao da
--    para rodar "de dia e esperar dar certo": as 14h local e 17h UTC a data e' a
--    mesma nos dois fusos, e o teste passaria mesmo com o defeito. E' preciso
--    SIMULAR um instante depois das 21h local.
--
--    a) A funcao devolve a data LOCAL, nao a UTC:
--
--       select
--         public.housekeeping_service_date(
--           timestamptz '2026-09-02 23:30:00-03', u.id) as data_local,
--         (timestamptz '2026-09-02 23:30:00-03')::date  as data_do_servidor,
--         u.timezone
--       from public.units u where u.code = 'GALLI';
--
--       -- esperado: data_local = 2026-09-02  |  data_do_servidor = 2026-09-03
--       -- REPROVA se as duas forem iguais: ou o fuso da unidade esta errado, ou
--       -- a funcao nao esta convertendo.
--
--    b) Duas transicoes as 20h50 e as 21h10 locais sao do MESMO dia operacional
--       (e' o que faz a trava 2 conferir a segunda contra a primeira):
--
--       select
--         public.housekeeping_service_date(timestamptz '2026-09-02 20:50:00-03', u.id)
--         = public.housekeeping_service_date(timestamptz '2026-09-02 21:10:00-03', u.id)
--           as mesmo_dia
--       from public.units u where u.code = 'GALLI';
--
--       -- esperado: true. REPROVA se false.
--
--    c) A abertura do dia usa a data local. Simule sem esperar a noite trocando
--       o fuso da SESSAO -- isto NAO altera dado, so' a sessao corrente:
--
--       begin;
--         set local timezone = 'Pacific/Kiritimati';  -- UTC+14: ja e' "amanha"
--         select public.housekeeping_open_day(
--           (select id from public.units where code = 'GALLI'), null, null);
--         select service_date from public.housekeeping_days
--         order by created_at desc limit 1;
--       rollback;
--
--       -- esperado: service_date = a data de HOJE em America/Sao_Paulo, e NAO a
--       -- data da sessao. REPROVA se vier a data de Kiritimati -- significa que
--       -- `current_date` (ou o fuso da sessao) voltou a mandar no dia do hotel.
--
-- 9) DEPOIS DO PASSO 7 (o drop da sobrecarga), nos dois bancos: existe UMA e
--    somente uma rooms_apply_transition.
--
--    select pg_get_function_identity_arguments(p.oid) as args
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rooms_apply_transition';
--
--    -- esperado: UMA linha, com `jsonb, text, text, uuid, timestamptz`.
--    -- REPROVA se voltarem duas: a de 4 argumentos sobreviveu, e quem chamar
--    -- por ela perde a hora retroativa e os efeitos na tarefa do dia EM
--    -- SILENCIO -- sem erro, sem log, so' o dado que nao aparece.
--
--
-- ============================================================================
-- SEQUENCIA DE APLICACAO (a ordem importa, e o passo 7 tem data)
--
--   1. Aplicar esta migration nos DOIS bancos, com o passo 7 COMENTADO.
--      Pode ser com o app no ar: o parametro novo tem default, e o app antigo
--      continua chamando a assinatura de 4 argumentos pela sobrecarga.
--   2. Rodar os itens 1 a 7 da VALIDACAO em staging.
--   3. Suite E2E em staging (item 8). Portao para producao.
--   4. Deploy do app.
--   5. Rodar o PASSO 7 nos DOIS bancos, NO MESMO DIA do deploy.
--   6. Rodar o item 9 da VALIDACAO nos dois bancos.
--
-- POR QUE O PASSO 7 TEM DATA e nao fica adiado: duas assinaturas convivendo e'
-- estado de TRANSICAO, e estado de transicao sem data de fim vira permanente.
-- Daqui a tres meses alguem chama a de 4 argumentos sem saber que existe uma
-- melhor, e a hora retroativa e a tarefa do dia silenciosamente nao acontecem.
-- Nao ha erro para investigar: so' o dado que nunca chega.
-- ============================================================================
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
--
-- ORDEM OBRIGATORIA -- REVERTA O APP ANTES: o deploy novo chama a funcao com 5
-- argumentos e le as duas tabelas. Dropar com o app novo no ar derruba a tela.
--
--   -- a) volta a funcao para a versao da 090 (4 argumentos), reaplicando o
--   --    arquivo 090_rooms_transition_stale_errcode.sql inteiro.
--
--   -- b) so' entao as tabelas. ATENCAO: isto DESCARTA o registro de trabalho
--   --    da Governanca. Confira antes:
--   --      select count(*) from public.housekeeping_tasks;
--   --    Se voltar > 0, sao dias de trabalho real.
--   drop function if exists public.housekeeping_open_day(uuid, date, uuid);
--   drop function if exists public.housekeeping_service_date(timestamptz, uuid);
--   drop function if exists public.rooms_apply_transition(jsonb, text, text, uuid, timestamptz);
--   drop table if exists public.housekeeping_tasks;
--   drop table if exists public.housekeeping_days;
--   drop type if exists public.housekeeping_decline_origin;
--   drop type if exists public.housekeeping_task_outcome;
--   drop type if exists public.housekeeping_service_type;
-- ============================================================================
