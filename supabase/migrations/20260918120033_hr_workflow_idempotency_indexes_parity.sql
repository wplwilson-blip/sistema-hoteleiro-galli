-- ============================================================================
-- Restauracao de tres indices de FK de hr_workflow_idempotency_keys
--
-- NOTA SOBRE O NOME DO ARQUIVO: ele contem "indexes_parity", e o nome esta'
-- IMPRECISO. Foi mantido de proposito -- o arquivo ja' e' citado por documentos
-- de evidencia datados, e reescrever referencia historica para ajustar rotulo
-- custaria mais que a impressao. A correcao vive aqui, no cabecalho.
--
-- FINALIDADE: restaurar tres indices simples de colunas de CHAVE ESTRANGEIRA de
-- public.hr_workflow_idempotency_keys que estao ausentes em producao e NAO estao
-- cobertos por outro indice com leading column equivalente.
--
-- TABELA: public.hr_workflow_idempotency_keys
--
-- INDICES CRIADOS:
--   hr_workflow_idempotency_keys_unit_idx      (unit_id)       -> FK units
--   hr_workflow_idempotency_keys_workflow_idx  (workflow_id)   -> FK hr_workflows
--   hr_workflow_idempotency_keys_actor_idx     (actor_user_id) -> FK app_users
--
-- ============================================================================
-- ESTA MIGRATION NAO RESTAURA TODOS OS INDICES HISTORICOS DA 023
-- ============================================================================
--
-- A migration 023 declarava 11 indices no total (1 da primary key + 10 criados
-- por `create index`). PRODUCAO FOI MEDIDA COM 2:
--
--   hr_workflow_idempotency_keys_pkey
--   hr_workflow_idempotency_keys_unique_idx
--
-- NOVE indices historicos estao ausentes. Destes nove:
--
--   3 SAO RESTAURADOS por esta migration:
--     unit_idx
--     workflow_idx
--     actor_idx
--
--   6 FORAM AVALIADOS e DELIBERADAMENTE NAO sao restaurados nesta correcao:
--     organization_idx
--     action_idx
--     status_idx
--     expires_at_idx
--     status_expires_at_idx
--     created_at_idx
--
-- CONSULTAR docs/PLANO_RECONCILIACAO_MIGRATIONS.md para a justificativa de cada
-- um dos seis, com o criterio de reavaliacao.
--
-- POR QUE ISTO ESTA ESCRITO AQUI, e nao so' no plano: sem esta nota, aplicar a
-- migration e ver o preflight passar produziria a impressao de reconciliacao
-- COMPLETA. Seis indices seguiriam ausentes sem registro de que foram avaliados,
-- e a proxima auditoria encontraria o mesmo drift sem saber que houve decisao.
--
-- ============================================================================
--
-- A migration 023 NAO e' alterada. Idempotente por `if not exists`.
--
-- MEDICAO, VALIDACAO, DECISAO ENTRE `create index` E `CONCURRENTLY`, JANELA DE
-- MANUTENCAO E ROLLBACK: ver docs/PLANO_RECONCILIACAO_MIGRATIONS.md.
-- Este arquivo nao autoriza aplicacao por si so'.
-- ============================================================================

create index if not exists hr_workflow_idempotency_keys_unit_idx
  on public.hr_workflow_idempotency_keys (unit_id);

create index if not exists hr_workflow_idempotency_keys_workflow_idx
  on public.hr_workflow_idempotency_keys (workflow_id);

create index if not exists hr_workflow_idempotency_keys_actor_idx
  on public.hr_workflow_idempotency_keys (actor_user_id);
