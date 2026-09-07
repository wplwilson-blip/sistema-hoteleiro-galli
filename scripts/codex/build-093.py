# -*- coding: utf-8 -*-
"""
Monta supabase/migrations/093_front_desk_occupancy.sql.

O corpo da RPC vem do extract-093-rpc.py (extraido da 092 e modificado la'), nunca
redigitado aqui. Este script so' costura cabecalho, perfil, permissao, ACL, validacao
e rollback em volta dele.
"""
import io
import os
import subprocess
import sys

# `text=True` NAO serve aqui: no Windows o filho escreve em cp1252 e o "§" volta
# corrompido. Captura em BYTES e decodifica utf-8 explicitamente.
env = dict(os.environ, PYTHONIOENCODING="utf-8")
rpc = subprocess.run(
    [sys.executable, "scripts/codex/extract-093-rpc.py"], capture_output=True, env=env
)

if rpc.returncode != 0:
    sys.exit("extract-093-rpc.py falhou: " + rpc.stderr.decode("utf-8", "replace"))

CORPO = rpc.stdout.decode("utf-8")

CABECA = """-- ============================================================================
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

"""

RODAPE = """

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
"""

io.open(
    "supabase/migrations/093_front_desk_occupancy.sql", "w", encoding="utf-8", newline="\n"
).write(CABECA + CORPO + RODAPE)

print("093 montada")
