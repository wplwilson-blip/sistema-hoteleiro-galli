# -*- coding: utf-8 -*-
"""Monta supabase/migrations/094_task_outcome_not_overwritten.sql."""
import io
import os
import subprocess
import sys

env = dict(os.environ, PYTHONIOENCODING="utf-8")
rpc = subprocess.run(
    [sys.executable, "scripts/codex/extract-094-rpc.py"], capture_output=True, env=env
)

if rpc.returncode != 0:
    sys.exit("extract-094-rpc.py falhou: " + rpc.stderr.decode("utf-8", "replace"))

CORPO = rpc.stdout.decode("utf-8")

CABECA = """-- ============================================================================
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

"""

RODAPE = """

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
"""

io.open(
    "supabase/migrations/094_task_outcome_not_overwritten.sql", "w", encoding="utf-8", newline="\n"
).write(CABECA + CORPO + RODAPE)

print("094 montada")
