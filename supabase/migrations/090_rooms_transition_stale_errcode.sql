-- ============================================================================
-- 090 — errcode do ROOMS_TRANSITION_STALE (plano docs/codex/74)
--
-- NAO APLICADA PELO CODEX. O Wilson aplica nos DOIS bancos (staging e producao).
--
-- O QUE CORRIGE, em uma frase: a transicao de apartamento PENDURA ate o timeout
-- em vez de devolver 409 quando duas pessoas mexem no mesmo apartamento ao mesmo
-- tempo -- porque o ROOMS_TRANSITION_STALE era levantado com errcode 40001.
--
-- 40001 e' serialization_failure: o codigo que o POSTGRES levanta quando ELE
-- detecta conflito de serializacao. Aqui quem detecta e' a APLICACAO, comparando
-- um valor lido com um relido sob o lock -- concorrencia otimista de nivel de
-- negocio, nao do motor. Qualquer camada que trate 40001 como transitorio REPETE
-- a requisicao, e esta CERTA em faze-lo; o PostgREST faz. A resposta nunca
-- voltava. O defeito nao e' de quem repete: e' nosso, por usar um codigo
-- reservado para outra coisa.
--
-- Sintoma medido (plano 74, §2.1) -- MEDICAO HISTORICA, NAO CRITERIO DE APROVACAO:
-- com o defeito presente, os outros tres caminhos de excecao respondiam em 159,
-- 210 e 313 ms e o STALE nao respondia em 25 s. pg_stat_activity durante o
-- travamento mostrava `idle in transaction (aborted)` com wait_event_type NULO --
-- nao havia espera por lock.
--
-- NAO use esses tempos para aprovar a migration. O criterio da VALIDACAO e'
-- SQLSTATE (item 2) e a prova comportamental e' o caso 16a da suite E2E (item 6).
-- Medir tempo por CONEXAO DIRETA aprovaria uma migration que nao corrigisse nada:
-- o travamento era do PostgREST, e o SQL Editor nao passa por ele.
--
-- PREMISSA: a 089 JA ESTA APLICADA em staging (jascnmgagejlvjlenduv) e em
-- producao (chnamldrlwohaudmjrez). Esta migration ASSUME isso. Ela nao cria nem
-- altera tabela, coluna, tipo, indice, CHECK, policy, perfil ou permissao --
-- SO substitui o corpo da funcao.
--
-- APLICACAO SEM JANELA: pode ser aplicada com o app NO AR. Nao altera schema, nao
-- altera dado, e a assinatura da funcao nao muda -- nenhuma requisicao em voo
-- quebra. E' o oposto da 089, que exigia ordem estrita entre banco e deploy.
--
-- DIFERENCA PARA A 089: UMA LINHA DE CODIGO. O corpo abaixo foi EXTRAIDO da 089 e
-- so' o errcode do STALE mudou (40001 -> 22023). `create or replace` reescreve o
-- corpo INTEIRO, por isso a funcao vai completa aqui: versionar so' o trecho
-- alterado deixaria o arquivo mentindo sobre o que esta no banco.
--
-- NENHUMA MUDANCA EM TYPESCRIPT: a rota casa o erro por MENSAGEM
-- (includes("ROOMS_TRANSITION_STALE")), nao por codigo. O 409 de
-- transitions/route.ts volta a funcionar sozinho assim que a resposta passar a
-- chegar. Esse acoplamento por texto esta registrado como divida em
-- docs/NAO_ALTERAR.md.
--
-- Idempotente: create or replace.
-- ============================================================================


-- ============================================================================
-- 1) A funcao, com o errcode corrigido
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
      status
    into v_current, v_current_housekeeping, v_record_status
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

    if p_dimension = 'housekeeping' then
      update public.rooms
      set housekeeping_status = v_to::public.housekeeping_status,
          housekeeping_changed_at = now(),
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
            when v_effect is not null and v_effect is distinct from v_current_housekeeping then now()
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
       changed_by, created_by, updated_by, source_module)
    select u.organization_id, r.unit_id, r.id, p_dimension, v_from, v_to, p_reason,
           p_actor_id, p_actor_id, p_actor_id, 'BASE'
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
         changed_by, created_by, updated_by, source_module, is_automatic)
      select u.organization_id, r.unit_id, r.id, 'housekeeping', v_current_housekeeping, v_effect, p_reason,
             p_actor_id, p_actor_id, p_actor_id, 'BASE', true
      from public.rooms r
      join public.units u on u.id = r.unit_id
      where r.id = v_room_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.rooms_apply_transition(jsonb, text, text, uuid) is
  'Envelope TRANSACIONAL da transicao de estado de UH em lote (plano 70, §6.2). A regra vive em rooms-utils.ts (canTransition) e chega decidida; aqui garantem-se atomicidade, lock em ordem estavel de room_id, releitura da origem sob lock e recusa de UH inativa.';


-- ============================================================================
-- 2) Superficie de execucao -- repetida de proposito
--
-- `create or replace` NAO reseta ACL, entao estes comandos sao tecnicamente
-- redundantes num banco onde a 089 foi aplicada e ninguem mexeu. Ficam porque sao
-- baratos e tornam a migration AUTO-CURATIVA: aplicada num banco onde alguem
-- reabriu a funcao, ela fecha de novo.
--
-- `security definer` ignora RLS. Se `authenticated` puder executar, qualquer
-- usuario logado transiciona QUALQUER apartamento de QUALQUER unidade pelo
-- PostgREST, sem passar pelo gate de permissao da rota.
-- ============================================================================

revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from public;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from anon;
revoke execute on function public.rooms_apply_transition(jsonb, text, text, uuid) from authenticated;
grant execute on function public.rooms_apply_transition(jsonb, text, text, uuid) to service_role;


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
--
-- Atencao: o SQL Editor mostra "Success. No rows returned" tanto para DDL quanto
-- para DML sem RETURNING. "Deu certo" na tela nao prova nada sobre o
-- COMPORTAMENTO -- os itens 2 e 4 abaixo sao a prova.
-- ============================================================================
--
-- 1) A ACL continua FECHADA (a 090 e' um `create or replace` -- exatamente o
--    gesto contra o qual esta consulta protege):
--
--    select p.proname, coalesce(array_to_string(p.proacl, ' | '), '(sem ACL: PUBLICO)') as acl
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'rooms_apply_transition';
--
--    -- esperado: service_role=X/postgres (o postgres=X/postgres do dono tambem
--    -- aparece e e' normal).
--    -- REPROVA se aparecer `=X/` sem papel antes do igual (isso e' PUBLIC),
--    -- `authenticated=X/`, `anon=X/`, ou "(sem ACL: PUBLICO)".
--
-- 2) O SQLSTATE MUDOU -- condicao NECESSARIA, nao suficiente.
--
--    Escolha um apartamento e leia o estado real de limpeza:
--
--    select id, room_number, housekeeping_status
--    from public.rooms
--    where status = 'active' and deleted_at is null
--    order by room_number limit 1;
--
--    Chame a funcao com um `from` DIVERGENTE do valor lido acima (se o real for
--    'inspected', mande 'clean'), substituindo <ROOM_ID> e <FROM_MENTIROSO>:
--
--    select public.rooms_apply_transition(
--      jsonb_build_array(jsonb_build_object(
--        'room_id', '<ROOM_ID>', 'from', '<FROM_MENTIROSO>',
--        'to', 'inspected', 'housekeeping_effect', null)),
--      'housekeeping', null, null
--    );
--
--    -- APROVA se o erro ROOMS_TRANSITION_STALE voltar com SQLSTATE 22023.
--    -- REPROVA qualquer outro SQLSTATE, 40001 inclusive.
--
--    ####################################################################
--    # ATENCAO -- O QUE ESTE ITEM NAO PROVA
--    #
--    # Esta chamada roda por CONEXAO DIRETA (SQL Editor), nao pelo
--    # PostgREST. Ela NAO prova que a requisicao deixou de pendurar: o
--    # travamento era do PostgREST REPETINDO a requisicao, e por conexao
--    # direta o erro sempre voltou rapido -- INCLUSIVE COM O DEFEITO
--    # PRESENTE. Um criterio de tempo aqui aprovaria uma migration que
--    # nao corrigisse nada.
--    #
--    # A prova comportamental e' o item 6.
--    ####################################################################
--
-- 3) NADA foi gravado pela chamada recusada do item 2. Rode ANTES e DEPOIS dele,
--    com o mesmo <ROOM_ID>, e compare -- os dois numeros devem ser IGUAIS:
--
--    select count(*) from public.room_status_history where room_id = '<ROOM_ID>';
--
-- 4) CONTROLE NEGATIVO -- as outras excecoes continuam respondendo.
--
--    `create or replace` reescreve o corpo INTEIRO da funcao. Um erro de
--    transcricao em qualquer outro caminho NAO seria visto pelos itens 1 a 3 --
--    so' apareceria em producao, na primeira vez que alguem encostasse nele.
--
--    select public.rooms_apply_transition('[]'::jsonb, 'housekeeping', null, null);
--
--    -- esperado: ERRO ROOMS_TRANSITION_EMPTY_BATCH, SQLSTATE 22023.
--    -- REPROVA se o SQLSTATE nao for 22023 ou se a mensagem mudar.
--    -- Testa TRANSCRICAO do corpo, nao comportamento do PostgREST.
--
-- 5) Caso 20 da suite E2E (tests/e2e/rooms-transitions.e2e.spec.ts): a RPC
--    continua fechada para quem nao e' service_role. Reexecutado depois de CADA
--    aplicacao -- a 090 e' um `create or replace`, o gesto contra o qual aquele
--    caso protege.
--
-- 6) A PROVA COMPORTAMENTAL -- o caso 16a da suite E2E.
--
--    E' o UNICO caminho que passa pelo PostgREST, que e' onde o defeito vive.
--    Antes da 090 ele estoura o timeout de 60 s; depois dela tem que PASSAR.
--
--    OBRIGATORIO EM STAGING ANTES DE APLICAR EM PRODUCAO.
--
--    Sem ele, os itens 1 a 5 provam que a funcao esta sintaticamente certa e
--    fechada -- mas NAO que a governanta deixou de ver a tela travada.
--
--
-- ============================================================================
-- SEQUENCIA DE APLICACAO (a ordem importa)
--
--   1. Revisao do diff.
--   2. Aplicar em STAGING; rodar os itens 1 a 5.
--   3. Rodar a suite E2E INTEIRA em staging: esperado 17/17, com o 16a PASSANDO.
--      E' o portao para producao, nao conferencia posterior.
--   4. So' entao aplicar em PRODUCAO; rodar os itens 1 a 5 la.
--   5. Caso 20 reexecutado depois da aplicacao em producao.
--
-- Se depois da 090 o 16a ou o 17 continuarem falhando, e' ACHADO NOVO: trazer a
-- falha, nao o ajuste.
-- ============================================================================
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
--
-- ATENCAO: ISTO REINTRODUZ O TRAVAMENTO. Voltar o errcode para 40001 faz o
-- PostgREST tratar o STALE como falha transitoria e repetir a requisicao: ela
-- volta a PENDURAR ate o timeout em vez de devolver 409, com a conexao presa em
-- transacao abortada ate o servidor recolher. A governanta volta a olhar para uma
-- tela travada, sem ver a mensagem de "recarregue e tente novamente".
--
-- Existe por completude do padrao, NAO porque seja desejavel. Se a 090 causar
-- algum problema inesperado, o caminho certo e' investigar -- nao voltar para um
-- estado que ja sabemos defeituoso.
--
-- Para desfazer: reaplicar este mesmo arquivo trocando, na funcao acima,
--   using errcode = '22023'
-- de volta por
--   using errcode = '40001'
-- no raise do ROOMS_TRANSITION_STALE. Nao ha alteracao de schema nem de dado para
-- reverter -- so' o corpo da funcao.
-- ============================================================================
