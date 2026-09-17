-- ============================================================================
-- 094 — A dispensa sobrevive ao resto do dia (plano docs/codex/80, temporaria)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O QUE ESTA MIGRATION RESOLVE: uma tarefa DISPENSADA que depois chega a
-- `inspected` derruba a RPC com SQLSTATE 23514, e a vistoria responde 500.
--
-- O caminho e' real e corriqueiro: o hospede dispensa a arrumacao de manha; a
-- tarde ele faz check-out, o quarto e' arrumado e vistoriado. O bloco (a) gravava
-- `outcome = 'done'` sem limpar `decline_origin`, violando o bicondicional
-- `housekeeping_tasks_decline_origin_iff_declined` da 091.
--
-- E O IRMAO SILENCIOSO, que e' o pior dos dois: o mesmo `update` sobrescrevia
-- `cancelled` -> `done` SEM ERRO NENHUM, porque `cancelled` nao tem coluna
-- companheira com bicondicional. Um grita 23514; o outro apagava calado. Os dois
-- entram na mesma guarda -- tratar so' o que grita seria deixar de fora
-- exatamente o que nao da' sinal.
--
-- DEFEITO PRE-EXISTENTE (bloco (a) da 091, aplicado nos dois bancos). A fatia 78
-- nao o criou: tornou-o ALCANCAVEL, ao abrir a dispensa de origem `front_desk` --
-- que ate' entao nao tinha por onde entrar, porque o gate exigia
-- `rooms.housekeeping` para qualquer origem.
--
-- PREMISSA: 089 a 093 aplicadas. A ORDEM IMPORTA. Esta migration reescreve o
-- corpo EXTRAIDO DA 093 -- se a 093 nao tiver sido aplicada neste banco, aplicar
-- a 094 traz junto a trava estreitada da ocupacao SEM o perfil RECEPCAO e SEM a
-- permissao `BASE:rooms.occupancy`, que sao secoes da 093. Aplique a 093 primeiro.
--
-- ADITIVA NO SCHEMA: nao cria nem altera coluna, tipo, tabela, indice, perfil ou
-- permissao. Substitui o corpo de UMA funcao.
--
-- A ASSINATURA NAO MUDA -- (jsonb, text, text, uuid). Licao da D8 do plano 75.
--
-- ESTA E' A SAIDA TEMPORARIA, e o plano 80 diz isso com todas as letras. A saida
-- definitiva e' a trilha de eventos da tarefa (`housekeeping_task_events`), que
-- resolve junto o D12 do plano 78 -- sao o mesmo problema: dois fatos no mesmo
-- dia, uma linha so'. Ver o LIMITE CONHECIDO no rodape.
--
-- ORDEM DE DEPLOY: sem janela. Nao ha mudanca de contrato com o app.
-- ============================================================================


-- ============================================================================
-- 1) rooms_apply_transition -- o bloco (a) para de sobrescrever desfecho
--
-- Corpo EXTRAIDO DA 093 por script (scripts/codex/extract-094-rpc.py), nao
-- redigitado. Vai COMPLETA: `create or replace` reescreve o corpo inteiro, entao
-- versionar so' o trecho alterado deixaria o arquivo mentindo sobre o que esta no
-- banco.
--
-- O QUE MUDOU em relacao a 093 -- UM ponto:
--   a) o `update` do bloco (a) ganhou `and outcome in ('pending', 'not_done')`.
--      Tudo o mais -- historico, ordem de lock, `occurred_at`, travas de lote, as
--      duas formas da ocupacao, blocos (b), (c) e (d) -- segue identico.
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

  -- A TRAVA DA OCUPACAO NAO CAIU: ELA ESTREITOU (plano 78, D1).
  --
  -- Ate' a 092 este ponto levantava ROOMS_TRANSITION_NO_WRITER incondicionalmente: a D1 do
  -- plano 70 decidiu que `occupancy_status` nasceria SEM ESCRITOR, e a trava existia para que
  -- uma chamada direta nao contornasse a decisao pela porta dos fundos. A mesma D1 previu que
  -- o escritor apareceria. E' esta fatia -- a Recepcao.
  --
  -- Mas DERRUBAR a trava seria a coisa errada, e o resultado desta migration e' MAIS FORTE que
  -- o de antes, nao mais fraco:
  --
  --   ANTES: bloqueava por AUSENCIA de escritor. E' uma trava sobre um vazio -- some
  --          exatamente no dia em que o vazio e' preenchido, junto com a decisao que protegia.
  --
  --   AGORA: a dimensao aceita DUAS FORMAS e nada mais, e a segunda EXIGE o efeito. A frase do
  --          Wilson -- "de ocupado para livre nao existe, tem que ir para sujo" -- passa a ser
  --          INVARIANTE DE BANCO, nao convencao da rota. Uma segunda rota escrita amanha, ou um
  --          `select` no SQL Editor, NAO CONSEGUE produzir um apartamento vago e vistoriado que
  --          ninguem arrumou.
  --
  -- A validacao da forma e' POR ITEM e vive dentro do laco, junto do `from`/`to`/efeito de cada
  -- apartamento -- nao aqui, onde so' existe a dimensao do lote.

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

    -- AS DUAS FORMAS DA OCUPACAO (plano 78, D1). Conferidas ANTES do lock: e' validacao da
    -- FORMA DO PEDIDO, nao do estado do apartamento -- e recusar cedo evita segurar lock para
    -- morrer em seguida.
    --
    --   check-in   `vacant`   -> `occupied`   SEM efeito de limpeza
    --   check-out  `occupied` -> `vacant`     COM efeito, e o efeito so' pode ser `dirty`
    --
    -- Por que o check-in NAO mexe na limpeza: o hospede acabou de entrar num quarto que estava
    -- arrumado. Zerar `housekeeping` no check-in diria que esta' sujo quando nao esta'.
    --
    -- Por que `inspected` nao aparece aqui de forma alguma (plano 78, D4): liberar para venda e'
    -- ato da Governanca. Esta e' a PRIMEIRA das tres camadas que protegem essa fronteira -- as
    -- outras duas sao o perfil sem `rooms.inspect` e a matriz do `canTransition` --, e e' a
    -- unica que vale contra uma chamada direta a RPC.
    if p_dimension = 'occupancy' then
      if v_from = 'vacant' and v_to = 'occupied' then
        if v_effect is not null then
          raise exception 'ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM'
            using errcode = '22023',
                  detail = jsonb_build_object(
                    'room_id', v_room_id,
                    'from', v_from,
                    'to', v_to,
                    'housekeeping_effect', v_effect,
                    'motivo', 'check-in nao altera a limpeza'
                  )::text;
        end if;
      elsif v_from = 'occupied' and v_to = 'vacant' then
        -- O CORACAO DA FATIA. `is distinct from` cobre os dois jeitos de errar numa condicao
        -- so': efeito AUSENTE (nulo) e efeito DIFERENTE de `dirty` -- inclusive `inspected`,
        -- que e' a tentativa que a D4 existe para impedir.
        if v_effect is distinct from 'dirty' then
          raise exception 'ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY'
            using errcode = '22023',
                  detail = jsonb_build_object(
                    'room_id', v_room_id,
                    'housekeeping_effect', v_effect,
                    'motivo', 'de ocupado para livre nao existe: o check-out devolve o apartamento para a governanca'
                  )::text;
        end if;
      else
        raise exception 'ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM'
          using errcode = '22023',
                detail = jsonb_build_object(
                  'room_id', v_room_id,
                  'from', v_from,
                  'to', v_to,
                  'motivo', 'a ocupacao aceita apenas check-in (vacant->occupied) e check-out (occupied->vacant)'
                )::text;
      end if;
    end if;

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
        -- Sem este ramo o `v_current` da ocupacao viria NULO, a comparacao com `v_from` nunca
        -- bateria e TODO check-in morreria como ROOMS_TRANSITION_STALE.
        when 'occupancy'    then occupancy_status::text
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

    if p_dimension = 'occupancy' then
      -- CHECK-IN E CHECK-OUT NUM UPDATE SO' (plano 78, D2).
      --
      -- E' o ponto onde a fatia poderia dar errado: `occupancy` e `housekeeping` precisam mudar
      -- ATOMICAMENTE. Um sem o outro deixa o apartamento vago e vistoriado -- vendavel com o
      -- quarto sujo. Duas chamadas em sequencia pela rota resolveriam a escrita e nao a
      -- atomicidade, que e' justamente o modo de falha.
      --
      -- Reusa o caminho que o BLOQUEIO ja' percorre desde a 089: mesmo `update`, mesma regra de
      -- relogio, e a linha de historico do efeito gravada logo abaixo com `is_automatic = true`.
      -- Uma funcao dedicada para a Recepcao duplicaria lock, releitura, historico e efeito na
      -- tarefa -- segunda fonte de verdade para as mesmas regras (plano 78, D2, alternativa b).
      update public.rooms
      set occupancy_status = v_to::public.occupancy_status,
          -- `coalesce`: no check-in o efeito e' nulo por construcao (a forma o proibe), e a
          -- limpeza fica exatamente onde estava.
          housekeeping_status = coalesce(v_effect::public.housekeeping_status, housekeeping_status),
          -- Mesmo cuidado do bloqueio: o relogio de "Sujo ha 6 horas" so' reinicia se a limpeza
          -- REALMENTE mudou.
          housekeeping_changed_at = case
            when v_effect is not null and v_effect is distinct from v_current_housekeeping then v_at
            else housekeeping_changed_at
          end,
          updated_at = now(),
          updated_by = p_actor_id
      where id = v_room_id;
    elsif p_dimension = 'housekeeping' then
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
      -- ================================================================================
      -- 16/09/2026 -- ESTE BLOCO PASSA A NAO TOCAR TAREFA COM DESFECHO (plano 80).
      --
      -- LEIA ANTES DE "CONSERTAR DE VOLTA". Ate' a 093 o comentario aqui afirmava:
      --
      --     "Uma tarefa `declined` ou `cancelled` que chegue aqui vira `done`, e esta
      --      certo: nao se alcanca `inspected` sem ter passado pelo ciclo de limpeza.
      --      Registrar isso como `done` e' o unico desfecho verdadeiro."
      --
      -- O raciocinio estava CERTO SOBRE O DESFECHO e ignorava uma coisa que ninguem
      -- tinha ido conferir: ONDE CADA UM DOS DOIS FATOS MORA.
      --
      --   A ARRUMACAO tem segundo domicilio. Ela esta' em `room_status_history`, linha
      --   por linha -- `dirty -> cleaning -> clean -> inspected` --, com hora, autor e
      --   organizacao. Sobrescrever a tarefa nao apaga que o quarto foi arrumado.
      --
      --   A DISPENSA NAO TEM. Dispensa NAO E' TRANSICAO -- decisao da §3 do plano 75,
      --   porque o estado do apartamento nao muda --, entao ela nao aparece no
      --   historico. Ela existe em UM lugar so': nesta linha, em `outcome`,
      --   `decline_origin`, `decline_note` e `completed_at`. Sobrescrever APAGA O FATO
      --   DE VEZ, sem segundo registro em lugar nenhum.
      --
      -- Entre perder o registro de um fato que tem outro domicilio e perder o UNICO
      -- registro de outro, nao ha escolha. Por isso a tarefa com desfecho fica INTACTA.
      --
      -- (Havia tambem um sintoma imediato: `declined` tem a coluna companheira
      -- `decline_origin` com bicondicional, entao o `update` antigo levantava 23514 e a
      -- vistoria respondia 500. Mas o 23514 e' o MOTIVO MENOR. `cancelled` nao tem
      -- coluna companheira: ali o mesmo `update` nao levantava nada e apagava calado --
      -- e e' por isso que os dois desfechos entram na mesma guarda. Tratar so' o que
      -- grita seria deixar de fora exatamente o pior dos dois.)
      --
      -- O QUE ISTO NAO RESOLVE esta no LIMITE CONHECIDO, no rodape deste arquivo, ao
      -- lado do D12 do plano 78: sao o mesmo problema -- dois fatos no mesmo dia, uma
      -- linha so'. A saida definitiva e' a trilha de eventos da tarefa (plano 80, (A)).
      -- ================================================================================
      --
      -- `pending` e `not_done` continuam sendo escritas: nenhuma das duas registra um
      -- fato proprio que a sobrescrita apagaria. `not_done` e' derivada do fechamento do
      -- dia, e a reabertura a devolve.
      if p_dimension = 'housekeeping' and v_to = 'inspected' then
        update public.housekeeping_tasks
        set service_type = 'checkout'::public.housekeeping_service_type,
            outcome = 'done'::public.housekeeping_task_outcome,
            completed_at = v_at,
            updated_at = now(),
            updated_by = p_actor_id
        where housekeeping_day_id = v_day_id
          and room_id = v_room_id
          and outcome in (
            'pending'::public.housekeeping_task_outcome,
            'not_done'::public.housekeeping_task_outcome
          );
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
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (planos 70 §6.2, 74, 75, 77, 78 e 80). A regra vive em rooms-utils.ts e chega decidida; aqui garantem-se atomicidade, lock em ordem estavel de room_id, releitura da origem sob lock com o apartamento divergente no `detail`, recusa de UH inativa, hora do FATO por item, a trava de lote em inspected, as DUAS FORMAS da ocupacao e a guarda que impede a vistoria de sobrescrever tarefa com desfecho (dispensa e cancelamento).';


-- ============================================================================
-- 2) Superficie de execucao
--
-- Nenhuma funcao nova. `create or replace` NAO reseta ACL, entao os revokes sao
-- redundantes hoje -- e ficam, pelo mesmo motivo da 092 e da 093: sao baratos e
-- AUTO-CURATIVOS. Um `grant` dado a `authenticated` no SQL Editor para depurar e
-- esquecido la' e' fechado por reaplicar esta migration.
-- ============================================================================

revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from public;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from anon;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from authenticated;
grant execute on function public.rooms_apply_transition(jsonb, text, text, uuid) to service_role;


-- ============================================================================
-- LIMITE CONHECIDO -- o dia fecha contando menos trabalho do que aconteceu
--
-- IRMAO DO LIMITE DA 093 (check-out tardio). Nao e' coincidencia: e' o MESMO
-- problema, e por isso os dois so' somem juntos.
--
--   093: a camareira arruma as 9h (tarefa `done`, `stayover`), o hospede sai as
--        14h. O quarto fica `dirty` e a tarefa continua `done`.
--   094: o hospede dispensa de manha (tarefa `declined`), sai a tarde, e o quarto
--        e' arrumado e vistoriado. A tarefa continua `declined`.
--
-- Nos dois, DOIS FATOS ACONTECERAM NO MESMO DIA e a tabela tem UMA LINHA por
-- apartamento por dia. A linha guarda um; o outro nao cabe.
--
-- O QUE ESTA MIGRATION CUSTA, dito sem maquiagem: o dia fecha com uma tarefa
-- `declined` num apartamento que FOI ARRUMADO. A contagem de trabalho do dia fica
-- MENOR que a realidade, e a governanta que olhar o numero vai ver menos servico
-- do que a equipe fez.
--
-- NAO E' PERDA DE DADO -- e' pergunta que a tarefa nao responde:
--   - a arrumacao esta em `room_status_history` (dirty -> cleaning -> clean ->
--     inspected), com hora e autor. Da' para contar por la'.
--   - a dispensa esta na tarefa, intacta, com origem e nota.
-- O que nao existe e' uma linha que diga "os DOIS aconteceram, nesta ordem".
--
-- A SAIDA DEFINITIVA e' o plano 80, alternativa (A): `housekeeping_task_events`,
-- o mesmo padrao que a 092 criou para os dias -- a tabela guarda o estado atual,
-- a trilha guarda os fatos. Com ela, o bloco (a) volta a marcar `done` (inserindo
-- antes o evento da dispensa) e a contagem do dia passa a bater.
--
-- ENQUANTO NAO CHEGAR: quem for construir a tela da governanta (plano 71) precisa
-- saber que uma tarefa `declined` NAO significa "ninguem entrou no quarto". Pode
-- significar "foi dispensada de manha e arrumada a tarde". A pergunta "este
-- apartamento foi arrumado hoje?" se responde no historico, nao no desfecho da
-- tarefa.
-- ============================================================================


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" para DDL e para DML
-- sem RETURNING. "Deu certo" na tela NAO prova comportamento.
--
-- Prepare um apartamento e a tarefa dele no dia ABERTO de hoje:
--
--   select r.id as room_id, r.room_number, t.id as task_id, t.outcome
--   from public.rooms r
--   join public.housekeeping_tasks t on t.room_id = r.id
--   join public.housekeeping_days d on d.id = t.housekeeping_day_id
--   where r.unit_id = '<UNIT_ID>' and r.deleted_at is null and r.status = 'active'
--     and d.closed_at is null
--     and d.service_date = public.housekeeping_service_date(now(), '<UNIT_ID>')
--     and t.outcome = 'pending'
--   order by r.room_number limit 5;
-- ============================================================================
--
-- 1) O DEFEITO MORREU -- a dispensa sobrevive a vistoria.
--
--    -- begin;
--    --   -- a manha: o hospede dispensa.
--    --   update public.housekeeping_tasks
--    --   set outcome = 'declined', decline_origin = 'front_desk',
--    --       decline_note = 'validacao 094', completed_at = now()
--    --   where id = '<TASK_ID>';
--    --
--    --   -- a tarde: o quarto e' arrumado e vistoriado.
--    --   update public.rooms set housekeeping_status = 'clean' where id = '<ROOM_ID>';
--    --
--    --   select public.rooms_apply_transition(
--    --     jsonb_build_array(jsonb_build_object(
--    --       'room_id','<ROOM_ID>','from','clean','to','inspected')),
--    --     'housekeeping', null, null);
--    --
--    --   -- ESPERADO: devolve 1. NAO levanta 23514.
--    --   -- REPROVA com qualquer erro: era exatamente aqui que dava 500.
--    --
--    --   select occupancy_status, housekeeping_status from public.rooms
--    --   where id = '<ROOM_ID>';
--    --   -- ESPERADO: housekeeping_status = 'inspected'. O apartamento VOLTA A
--    --   -- VENDER -- e' a metade da decisao que nao pode ser esquecida.
--    --
--    --   select outcome, decline_origin, decline_note, service_type, completed_at
--    --   from public.housekeeping_tasks where id = '<TASK_ID>';
--    --   -- ESPERADO: outcome = 'declined', decline_origin = 'front_desk',
--    --   -- decline_note = 'validacao 094', service_type NULO.
--    --   -- REPROVA se outcome virou 'done': a dispensa foi apagada.
--    -- rollback;
--
-- 2) O IRMAO SILENCIOSO -- `cancelled` tambem sobrevive.
--
--    -- begin;
--    --   update public.housekeeping_tasks
--    --   set outcome = 'cancelled', service_type = null, completed_at = null
--    --   where id = '<TASK_ID>';
--    --
--    --   update public.rooms set housekeeping_status = 'clean' where id = '<ROOM_ID>';
--    --
--    --   select public.rooms_apply_transition(
--    --     jsonb_build_array(jsonb_build_object(
--    --       'room_id','<ROOM_ID>','from','clean','to','inspected')),
--    --     'housekeeping', null, null);
--    --
--    --   select outcome from public.housekeeping_tasks where id = '<TASK_ID>';
--    --   -- ESPERADO: 'cancelled'.
--    --   -- Antes desta migration isto virava 'done' SEM ERRO NENHUM -- o unico
--    --   -- jeito de perceber era comparar antes e depois, que e' o que este item faz.
--    -- rollback;
--
-- 3) O CAMINHO NORMAL CONTINUA FUNCIONANDO -- a guarda nao pode ter fechado demais.
--
--    -- begin;
--    --   update public.housekeeping_tasks
--    --   set outcome = 'pending', service_type = null, decline_origin = null,
--    --       decline_note = null, completed_at = null
--    --   where id = '<TASK_ID>';
--    --
--    --   update public.rooms set housekeeping_status = 'clean' where id = '<ROOM_ID>';
--    --
--    --   select public.rooms_apply_transition(
--    --     jsonb_build_array(jsonb_build_object(
--    --       'room_id','<ROOM_ID>','from','clean','to','inspected')),
--    --     'housekeeping', null, null);
--    --
--    --   select outcome, service_type, completed_at
--    --   from public.housekeeping_tasks where id = '<TASK_ID>';
--    --   -- ESPERADO: outcome = 'done', service_type = 'checkout', completed_at
--    --   -- preenchido. E' o comportamento da D2.1 do plano 75, INTACTO.
--    --   -- REPROVA se continuar 'pending': a guarda fechou demais e a fila passa a
--    --   -- mentir para o outro lado.
--    -- rollback;
--
-- 4) `not_done` TAMBEM continua sendo escrita.
--
--    -- Uma tarefa `not_done` e' sobra de dia fechado, nao fato proprio -- a
--    -- reabertura a devolve a `pending`. Ela entra na guarda de proposito.
--    -- Repita o item 3 com `outcome = 'not_done'` no lugar de 'pending'.
--    -- ESPERADO: vira 'done' com tipo 'checkout'.
--
-- 5) A ACL continua fechada, e ha UMA SO' assinatura.
--
--    select p.proname,
--           pg_get_function_identity_arguments(p.oid) as args,
--           coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rooms_apply_transition';
--    -- ESPERADO: UMA linha, service_role=X/postgres. DUAS linhas = PGRST203 em
--    -- toda chamada (plano 75, D8).
--
-- 6) A PROVA COMPORTAMENTAL, em staging ANTES de producao: o caso E2E 80.1 (a
--    dispensa intacta E o apartamento vendavel) roda verde, e os casos 20, 25 e 27
--    da suite de apartamentos continuam verdes -- 25 e' o que prova que o caminho
--    normal da D2.1 nao regrediu.
-- ============================================================================


-- ============================================================================
-- ROLLBACK
--
-- SEM PERDA DE DADO: nada de schema muda, e nenhuma linha e' reescrita por esta
-- migration.
--
-- Reaplique a secao 4 da 093_front_desk_occupancy.sql inteira (de
-- `create or replace function public.rooms_apply_transition(` ate' o `$$;`),
-- seguida dos quatro revoke/grant da secao 5 daquele arquivo.
--
-- O QUE VOLTA JUNTO, e por isso o rollback e' uma decisao e nao um reflexo: volta
-- o 500 com 23514 na vistoria de apartamento com tarefa dispensada, e volta a
-- sobrescrita CALADA de `cancelled`. Reverter esta migration reintroduz os dois.
-- ============================================================================
