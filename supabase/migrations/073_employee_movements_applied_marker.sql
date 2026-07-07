-- Migration 073 - RH-E-01: marcador de efetivacao de movimentacao funcional.
--
-- Adiciona SOMENTE a coluna de idempotencia usada pelo efetivador diario (Vercel Cron):
-- movement_applied_at marca que a movimentacao ja foi aplicada ao cadastro do colaborador
-- (employees.unit_id/department_id/job_position_id). NULL = ainda nao efetivada.
--
-- NAO toca constraint, trigger, status, nem qualquer migration aplicada. Aditivo e idempotente.
-- Vai para STAGING primeiro (validar) e depois PRODUCAO.

alter table public.employee_movements
  add column if not exists movement_applied_at timestamptz;

comment on column public.employee_movements.movement_applied_at is
  'RH-E-01: timestamp em que a movimentacao foi efetivada no cadastro do colaborador pelo efetivador diario. NULL = pendente de efetivacao.';

-- Indice parcial para a fila do efetivador (status='implemented' AND movement_applied_at is null,
-- ordenado por effective_date). Aditivo; nao altera nada existente.
create index if not exists employee_movements_pending_apply_idx
  on public.employee_movements (effective_date)
  where movement_applied_at is null;
