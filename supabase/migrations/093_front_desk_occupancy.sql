-- ============================================================================
-- 093 — A Recepcao escreve a ocupacao: check-in e check-out (plano docs/codex/78)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O QUE ESTA MIGRATION RESOLVE, em uma frase: `occupancy_status` NAO ESTA VAZIA --
-- ESTA CONGELADA. A 089 fez backfill dela a partir do `room_status` legado
-- (089:125) e desde entao NENHUMA linha de codigo a alterou. Ela nao e' um vazio
-- inerte esperando escritor: e' um dado que PARECE PLAUSIVEL e se afasta da
-- realidade a cada check-in que acontece no mundo e nao no sistema.
--
-- Isso nao e' acrescentar capacidade. E' PARAR DE MENTIR. `suggestedServiceType`
-- (rooms-utils.ts:774) ja' decide entre `checkout` e `stayover` lendo essa coluna:
-- ela esta' correta e e' inutil, porque le' um retrato congelado. Se a tela da
-- governanta (plano 71) chegasse antes desta fatia, daria sugestoes erradas com
-- aparencia de certas.
--
-- PREMISSA: 089, 090, 091 e 092 ja aplicadas nos dois bancos.
--
-- ADITIVA NO SCHEMA. Nao cria coluna, tipo, tabela nem indice. `occupancy_status`
-- existe desde a 089. Acrescenta um perfil, um codigo de permissao e as concessoes,
-- e substitui o corpo de UMA funcao ja existente.
--
-- A ASSINATURA NAO MUDA. `rooms_apply_transition` continua
-- (jsonb, text, text, uuid) -- a licao da D8 do plano 75: mudar assinatura de RPC
-- exposta pelo PostgREST e' SEMPRE quebra (PGRST203), nunca compatibilidade. Tudo
-- o que e' novo entra no corpo e no item jsonb.
--
-- O CORACAO DA FATIA (plano 78, D1): a trava da ocupacao NAO CAIU -- ELA ESTREITOU.
-- Ate' aqui, `ROOMS_TRANSITION_NO_WRITER` bloqueava por AUSENCIA de escritor, e uma
-- trava sobre um vazio some no dia em que o vazio e' preenchido. A partir desta
-- migration a dimensao aceita DUAS FORMAS e nada mais, e a segunda EXIGE o efeito:
--
--     check-in    vacant   -> occupied    SEM efeito
--     check-out   occupied -> vacant      COM housekeeping_effect = 'dirty'
--
-- "De ocupado para livre nao existe, tem que ir para sujo" deixa de ser convencao da
-- rota e vira INVARIANTE DE BANCO. Uma segunda rota escrita amanha, ou um select no
-- SQL Editor, nao consegue produzir um apartamento vago e vistoriado que ninguem
-- arrumou. O resultado e' MAIS FORTE que a trava anterior, nao mais fraco.
--
-- ORDEM DE DEPLOY: sem janela. Depois de aplicar, o app atual continua funcionando
-- -- ele simplesmente nunca chama a dimensao `occupancy`. O app novo precisa desta
-- migration aplicada; sem ela, todo check-in morre com ROOMS_TRANSITION_NO_WRITER.
-- ============================================================================


-- ============================================================================
-- 1) O perfil RECEPCAO (plano 78, D5)
--
-- POR QUE PERFIL NOVO, e nao reaproveitar um existente: mesmo raciocinio da D5 do
-- plano 70, que criou LIDER_GOVERNANCA. O motivo NAO e' vazamento lateral (gente de
-- outros setores ja enxerga apartamentos desde a 088). E' o inverso: para RECEBER o
-- que precisa, a recepcionista teria que SER outra coisa e ganhar o resto junto --
-- DEPARTMENT_MANAGER traz alcada de compra ate R$200 e BASE:rooms.manage;
-- SUPERVISOR traz HR:documents.manage, HR:documents.verify e HR:employees.view.
-- Alcada financeira e documento de colaborador para quem precisa dizer que o
-- hospede chegou.
--
-- Confirmado com o Wilson: a recepcionista de plantao e' sempre quem faz o
-- check-out, inclusive de madrugada. Nao ha porteiro nem gerente fazendo isso --
-- RECEPCAO e' perfil so'.
--
-- `is_system_default = true`, como todos os perfis da 010 e da 089.
-- ============================================================================

insert into public.access_profiles (code, name, description, is_system_default)
values
  ('RECEPCAO', 'Recepção', 'Recepcao: registra check-in e check-out, e bloqueia UH por decisao comercial. NAO opera limpeza nem vistoria.', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_system_default = excluded.is_system_default,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();


-- ============================================================================
-- 2) O codigo de permissao novo
--
-- Formato conferido contra public.permissions (003:91-108): `code` e' GERADO
-- (module_code || ':' || action_code), e `action_code ~ '^[a-z0-9_.-]{2,60}$'` --
-- 'rooms.occupancy' passa.
--
-- O nome diz o que a permissao FAZ e o que ela NAO faz, porque quem le' a tela de
-- perfis nao le' esta migration.
-- ============================================================================

insert into public.permissions (module_code, action_code, name, description)
values
  ('BASE', 'rooms.occupancy', 'Registrar check-in e check-out', 'Permite registrar entrada e saida de hospede na UH. O check-out devolve a UH para a governanca (sujo). NAO libera a UH para venda.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();


-- ============================================================================
-- 3) Concessao aos perfis (matriz da D5 do plano 78)
--
-- RECEPCAO recebe TRES codigos e nada mais:
--
--   view       -- ve o parque inteiro; e' como ela trabalha
--   occupancy  -- check-in e check-out
--   block      -- bloqueio comercial e' decisao de recepcao
--   (nao recebe housekeeping, inspect nem manage)
--
-- A RECEPCAO NAO VISTORIA (plano 78, D4). E' a fronteira que o plano 70 inteiro
-- existiu para proteger, e esta e' a SEGUNDA das tres camadas -- a primeira esta na
-- RPC (a forma do check-out so' aceita o efeito `dirty`), a terceira no
-- `canTransition`.
--
-- LIDER_GOVERNANCA NAO recebe `rooms.occupancy`, e isso e' decisao, nao esquecimento:
-- e' a metade reciproca da D4. A governanta nao marca ocupacao pelo mesmo motivo que
-- a recepcionista nao vistoria -- cada setor escreve numa dimensao so'.
--
-- `on conflict do nothing`, como a 088 e a 089: se alguem REVOGOU deliberadamente
-- uma concessao, reexecutar esta migration nao a restaura em silencio.
-- ============================================================================

with profile_permission_matrix(profile_code, permission_code) as (
  values
    ('RECEPCAO', 'BASE:rooms.view'),
    ('RECEPCAO', 'BASE:rooms.occupancy'),
    ('RECEPCAO', 'BASE:rooms.block'),

    -- Quem ja tinha o equivalente de escrita nas fatias anteriores.
    ('SUPER_ADMIN',   'BASE:rooms.occupancy'),
    ('UNIT_DIRECTOR', 'BASE:rooms.occupancy')
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  access_profile.id,
  permission.id,
  true,
  'active'
from profile_permission_matrix matrix
join public.access_profiles access_profile
  on access_profile.code = matrix.profile_code
 and access_profile.status = 'active'
 and access_profile.deleted_at is null
join public.permissions permission
  on permission.code = matrix.permission_code
 and permission.status = 'active'
 and permission.deleted_at is null
on conflict (access_profile_id, permission_id) do nothing;


-- ============================================================================
-- 4) rooms_apply_transition -- a trava que estreita e o check-out atomico
--
-- Corpo EXTRAIDO DA 092 por script (scripts/codex/extract-093-rpc.py), nao
-- redigitado. A base e' a 092 e nao a 091: a 092 redefiniu esta funcao para pôr o
-- `detail` no ROOMS_TRANSITION_STALE (plano 77), e extrair da 091 regrediria aquele
-- 409 em silencio.
--
-- Vai COMPLETA: `create or replace` reescreve o corpo inteiro, entao versionar so' o
-- trecho alterado deixaria o arquivo mentindo sobre o que esta no banco.
--
-- O QUE MUDOU em relacao a 092 -- quatro pontos, todos comentados no lugar:
--   a) a trava `occupancy` deixa de ser NO_WRITER incondicional e passa a validar a
--      FORMA, por item, dentro do laco (D1);
--   b) o `case` da releitura sob lock ganha o ramo `occupancy` -- sem ele todo
--      check-in morreria como STALE;
--   c) o `update` ganha o ramo `occupancy`, escrevendo as duas dimensoes no MESMO
--      comando (D2);
--   d) nada mais. Historico, tarefa do dia, ordem de lock, `occurred_at` e travas de
--      lote seguem identicos.
--
-- SEM EFEITO NA TAREFA DO DIA -- e isto e' DECISAO, com um limite conhecido
-- registrado ao final do arquivo (LIMITE CONHECIDO). Check-in e check-out nao tocam
-- `housekeeping_tasks`.
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
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (planos 70 §6.2, 74, 75, 77 e 78). A regra vive em rooms-utils.ts e chega decidida; aqui garantem-se atomicidade, lock em ordem estavel de room_id, releitura da origem sob lock com o apartamento divergente no `detail`, recusa de UH inativa, hora do FATO por item, a trava de lote em inspected e as DUAS FORMAS da ocupacao -- check-in sem efeito e check-out que EXIGE housekeeping_effect = dirty.';


-- ============================================================================
-- 5) Superficie de execucao
--
-- Nenhuma funcao NOVA nesta migration -- so' uma reescrita. `create or replace` NAO
-- reseta a ACL, entao os revokes abaixo sao redundantes hoje. Ficam assim mesmo,
-- pelo mesmo motivo da 092: sao baratos e AUTO-CURATIVOS. Se alguem, em algum
-- momento, tiver dado `execute` a `authenticated` no SQL Editor para depurar e
-- esquecido de tirar, reaplicar esta migration fecha a porta.
--
-- A RPC e' `security definer` e IGNORA RLS: quem pode executa-la escreve o estado de
-- qualquer apartamento. E' exatamente por isso que ela so' e' alcancavel pelo
-- `service_role`, com a autorizacao resolvida por CODIGO DE PERMISSAO na rota.
-- ============================================================================

revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from public;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from anon;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from authenticated;
grant execute on function public.rooms_apply_transition(jsonb, text, text, uuid) to service_role;


-- ============================================================================
-- LIMITE CONHECIDO -- o check-out tardio e a tarefa ja concluida
--
-- ESCRITO AQUI PORQUE FOI DESCOBERTO ESCREVENDO ESTA MIGRATION, e nao esta no plano
-- 78. Nao e' defeito desta fatia: e' um limite do modelo do plano 75 que a fatia
-- TORNA ALCANCAVEL pela primeira vez.
--
-- O CENARIO: hospede em permanencia. A camareira arruma as 9h, a tarefa do dia fecha
-- como `done` com tipo `stayover`. As 14h o hospede faz check-out tardio. O
-- apartamento vai para `dirty` -- correto --, mas a tarefa daquele dia ja esta
-- `done`. O quarto precisa de arrumacao de saida e NAO aparece como pendente.
--
-- POR QUE NAO RESSUSCITEI A TAREFA, que seria o reflexo obvio (e' o que o
-- desbloqueio faz no bloco (c)): a tabela tem UMA linha por apartamento por dia. Pôr
-- a tarefa de volta em `pending` APAGARIA que a arrumacao de permanencia aconteceu
-- as 9h -- inclusive o `completed_at`. Seria a suite falsificando historico para
-- fazer o numero fechar, que e' o erro que o caso 31 do E2E existe para lembrar.
--
-- O modelo de uma linha por apartamento por dia NAO CONSEGUE representar "dois
-- servicos no mesmo dia". Isso e' mudanca de schema, e mudanca de schema decidida no
-- meio de outra fatia e' como se acumulam decisoes que ninguem tomou.
--
-- O QUE ACONTECE HOJE, na pratica: o apartamento aparece `dirty` no parque -- a
-- informacao NAO se perde, ela so' nao esta na fila de tarefas. Quem olha o mapa ve'.
--
-- AS DUAS SAIDAS, para a fatia que decidir isto:
--   (i)  a fila da tela ler `rooms.housekeeping_status = 'dirty'` ALEM da tarefa
--        pendente -- sem mudar schema, e a tarefa continua sendo o registro do
--        trabalho, nao a fonte da fila;
--   (ii) permitir mais de uma tarefa por apartamento por dia (derrubar o unique
--        `(housekeeping_day_id, room_id)`) -- representa a realidade com fidelidade e
--        mexe em tudo que hoje faz `on conflict` naquela chave.
--
-- Recomendacao para quando chegar a hora: (i). Nao muda modelo, e o dado ja esta la'.
-- ============================================================================


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" para DDL e para DML sem
-- RETURNING. "Deu certo" na tela NAO prova comportamento -- todos os itens abaixo
-- pedem um resultado OBSERVADO.
--
-- Escolha um apartamento de teste e guarde o id:
--
--   select id, number, occupancy_status, housekeeping_status, blocking_status, status
--   from public.rooms
--   where unit_id = '<UNIT_ID>' and deleted_at is null and status = 'active'
--     and blocking_status = 'none'
--   order by number limit 10;
-- ============================================================================
--
-- 1) O CHECK-OUT ATOMICO -- o que a fatia existe para garantir.
--
--    -- Ponto de partida: deixe o apartamento ocupado e vistoriado (o pior caso: e'
--    -- deste estado que sai o "vago e vistoriado com o quarto sujo").
--    -- begin;
--    --   update public.rooms set occupancy_status = 'occupied',
--    --                           housekeeping_status = 'inspected'
--    --   where id = '<ROOM_ID>';
--    --
--    --   select public.rooms_apply_transition(
--    --     jsonb_build_array(jsonb_build_object(
--    --       'room_id','<ROOM_ID>','from','occupied','to','vacant',
--    --       'housekeeping_effect','dirty')),
--    --     'occupancy', 'check-out validacao 093', null);
--    --
--    --   select occupancy_status, housekeeping_status from public.rooms
--    --   where id = '<ROOM_ID>';
--    --   -- ESPERADO: vacant + dirty. REPROVA se vier vacant + inspected.
--    --
--    --   select dimension, previous_status, new_status, is_automatic
--    --   from public.room_status_history
--    --   where room_id = '<ROOM_ID>' order by changed_at desc limit 2;
--    --   -- ESPERADO: DUAS linhas -- (occupancy, occupied->vacant, is_automatic=false)
--    --   -- e (housekeeping, inspected->dirty, is_automatic=TRUE).
--    -- rollback;
--
-- 2) O CHECK-OUT SEM O EFEITO E' RECUSADO -- a invariante da D1.
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id','<ROOM_ID_OCUPADO>','from','occupied','to','vacant')),
--      'occupancy', null, null);
--
--    -- ESPERADO: erro ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY, SQLSTATE 22023, com
--    -- DETAIL em JSON contendo room_id e motivo.
--    -- E A RESPOSTA TEM QUE VOLTAR EM MENOS DE 1s: SQLSTATE 40001 faz o PostgREST
--    -- REPETIR a requisicao e a resposta nunca voltar (plano 74). Se pendurar, o
--    -- errcode esta errado.
--    -- REPROVA tambem se o apartamento tiver mudado: a transacao inteira desfaz.
--
-- 3) `inspected` E' INALCANCAVEL PELA RECEPCAO -- as TRES camadas, uma a uma.
--
--    -- CAMADA 1 (esta migration): a forma do check-out so' aceita `dirty`.
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id','<ROOM_ID_OCUPADO>','from','occupied','to','vacant',
--        'housekeeping_effect','inspected')),
--      'occupancy', null, null);
--    -- ESPERADO: erro ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY. E' a unica camada
--    -- que vale contra uma chamada DIRETA a RPC, e por isso e' conferida aqui.
--
--    -- CAMADA 2 (concessao): o perfil nao tem a permissao da vistoria.
--    select permission.code
--    from public.profile_permissions profile_permission
--    join public.access_profiles access_profile
--      on access_profile.id = profile_permission.access_profile_id
--    join public.permissions permission
--      on permission.id = profile_permission.permission_id
--    where access_profile.code = 'RECEPCAO'
--      and profile_permission.is_allowed
--      and profile_permission.status = 'active'
--    order by permission.code;
--    -- ESPERADO, EXATAMENTE TRES: BASE:rooms.block, BASE:rooms.occupancy,
--    -- BASE:rooms.view.
--    -- REPROVA se aparecer BASE:rooms.inspect, BASE:rooms.housekeeping ou
--    -- BASE:rooms.manage.
--
--    -- CAMADA 3 (canTransition, em rooms-utils.ts): coberta pelo teste unitario e
--    -- pelo caso E2E "Recepcao tentando clean -> inspected recebe 403".
--
-- 4) AS OUTRAS FORMAS DE OCUPACAO MORREM.
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id','<ROOM_ID_VAGO>','from','vacant','to','vacant')),
--      'occupancy', null, null);
--    -- ESPERADO: ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM, SQLSTATE 22023.
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id','<ROOM_ID_VAGO>','from','vacant','to','occupied',
--        'housekeeping_effect','dirty')),
--      'occupancy', null, null);
--    -- ESPERADO: ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM -- check-in NAO altera a
--    -- limpeza.
--
-- 5) O CHECK-IN nao mexe na limpeza.
--
--    -- begin;
--    --   update public.rooms set occupancy_status = 'vacant',
--    --                           housekeeping_status = 'inspected'
--    --   where id = '<ROOM_ID>';
--    --
--    --   select public.rooms_apply_transition(
--    --     jsonb_build_array(jsonb_build_object(
--    --       'room_id','<ROOM_ID>','from','vacant','to','occupied')),
--    --     'occupancy', null, null);
--    --
--    --   select occupancy_status, housekeeping_status from public.rooms
--    --   where id = '<ROOM_ID>';
--    --   -- ESPERADO: occupied + inspected (a limpeza NAO mudou).
--    --
--    --   select count(*) from public.room_status_history
--    --   where room_id = '<ROOM_ID>' and changed_at > now() - interval '1 minute';
--    --   -- ESPERADO: 1 (uma linha so': nao ha efeito colateral no check-in).
--    -- rollback;
--
-- 6) CHECK-OUT DE MADRUGADA, com o dia ainda fechado.
--
--    -- A recepcionista de plantao faz check-out as 2h; o dia da governanca so' abre
--    -- as 8h. O bloco da tarefa e' PULADO (nao ha dia aberto), e isso e' correto --
--    -- a duvida e' se o apartamento se perde. Ele nao se perde: a abertura do dia
--    -- materializa TODOS os ativos sem bloqueio (091:312).
--    --
--    -- Faca o check-out agora, com o dia de hoje FECHADO ou inexistente:
--    select outcome from public.housekeeping_tasks
--    where room_id = '<ROOM_ID>'
--      and housekeeping_day_id = (
--        select id from public.housekeeping_days
--        where unit_id = '<UNIT_ID>'
--          and service_date = public.housekeeping_service_date(now(), '<UNIT_ID>')
--      );
--    -- ESPERADO ANTES DE ABRIR O DIA: nenhuma linha.
--    -- Depois de abrir o dia: uma linha `pending`.
--
-- 7) O PERFIL existe e esta ativo.
--
--    select code, name, is_system_default, status
--    from public.access_profiles where code = 'RECEPCAO';
--    -- ESPERADO: uma linha, is_system_default = true, status = 'active'.
--
-- 8) A ACL da funcao continua fechada, e ha UMA SO' assinatura.
--
--    select p.proname,
--           pg_get_function_identity_arguments(p.oid) as args,
--           coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rooms_apply_transition';
--
--    -- ESPERADO: UMA linha, args = 'p_transitions jsonb, p_dimension text,
--    -- p_reason text, p_actor_id uuid', acl com service_role=X/postgres.
--    -- SE APARECEREM DUAS LINHAS: alguem recriou com assinatura diferente e o
--    -- PostgREST vai devolver PGRST203 em TODA chamada (plano 75, D8).
--
-- 9) A PROVA COMPORTAMENTAL, em staging, ANTES de producao: a suite E2E do plano 78
--    (casos 7 a 12) roda verde contra este banco, com usuario real e sem service
--    role. Os casos 20 e 27 da suite de apartamentos rodam DEPOIS e continuam verdes
--    -- sao eles que provam que a reescrita da funcao nao regrediu a ACL nem o
--    -- comportamento das dimensoes que esta fatia nao toca.
-- ============================================================================


-- ============================================================================
-- ROLLBACK
--
-- SEM PERDA DE DADO: esta migration nao cria coluna, tipo nem tabela. O que ela
-- escreveu em `rooms.occupancy_status` durante o tempo em que esteve no ar E' DADO
-- REAL -- check-ins e check-outs que aconteceram --, e o rollback NAO o desfaz. Ele
-- devolve a funcao ao comportamento anterior e tira a permissao.
--
-- 1) A funcao volta ao corpo da 092: reaplique a secao 6 da
--    092_housekeeping_day_close.sql inteira (de `create or replace function
--    public.rooms_apply_transition(` ate' o `$$;`), seguida dos quatro
--    revoke/grant da secao 7 daquele arquivo.
--
-- 2) A permissao e o perfil:
--
--    -- delete from public.profile_permissions
--    -- where permission_id = (select id from public.permissions
--    --                        where code = 'BASE:rooms.occupancy');
--    --
--    -- delete from public.permissions where code = 'BASE:rooms.occupancy';
--    --
--    -- -- O perfil so' se apaga se ninguem estiver usando. Confira ANTES:
--    -- select count(*) from public.app_users u
--    -- join public.access_profiles p on p.id = u.access_profile_id
--    -- where p.code = 'RECEPCAO';
--    -- -- Se for > 0, os usuarios ficam sem perfil. Reatribua antes de apagar.
--    --
--    -- delete from public.access_profiles where code = 'RECEPCAO';
--
-- 3) O app: desfazer o commit da fatia. Com a funcao revertida e o app novo no ar,
--    todo check-in morre com ROOMS_TRANSITION_NO_WRITER -- que e' 422 na rota, nao
--    500, mas a Recepcao para de trabalhar.
-- ============================================================================
