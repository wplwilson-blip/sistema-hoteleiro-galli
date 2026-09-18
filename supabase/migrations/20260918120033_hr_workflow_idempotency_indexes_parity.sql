-- ============================================================================
-- Paridade de indices de hr_workflow_idempotency_keys
--
-- FINALIDADE: criar tres indices de chave estrangeira que foram declarados na
-- migration 023 (023_hr_workflow_transaction_foundation.sql, linhas 149-154) e
-- que nao estao presentes em todos os ambientes.
--
-- TABELA: public.hr_workflow_idempotency_keys
--
-- INDICES:
--   hr_workflow_idempotency_keys_unit_idx      (unit_id)
--   hr_workflow_idempotency_keys_workflow_idx  (workflow_id)
--   hr_workflow_idempotency_keys_actor_idx     (actor_user_id)
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
