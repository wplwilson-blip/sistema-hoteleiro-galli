-- Migration 075 - RH-E-05: marcador de efetivacao de desligamento no cadastro.
--
-- Adiciona SOMENTE a coluna de idempotencia usada pelo efetivador diario (Vercel Cron / GitHub Actions):
-- applied_at marca que o desligamento ja foi efetivado no cadastro do colaborador (employees.status =
-- 'inactive'). NULL = ainda nao efetivado (e' a janela em que o cancelamento tardio e' permitido).
--
-- NAO toca constraint, trigger, status, RLS, nem qualquer migration aplicada. Aditivo e idempotente.
-- Vai para STAGING primeiro (validar) e depois PRODUCAO.
-- (074 fica reservado para o rename da fila de jobs - docs/codex/25.)

alter table public.employee_terminations
  add column if not exists applied_at timestamptz;

comment on column public.employee_terminations.applied_at is
  'RH-E-05: timestamp em que o desligamento foi efetivado no cadastro do colaborador (employees.status=inactive) pelo efetivador diario. NULL = pendente de efetivacao (janela de cancelamento tardio permitido).';

-- Indice parcial para a fila do efetivador (status='implemented' AND applied_at is null, ordenado por
-- effective_date). Aditivo; nao altera nada existente.
create index if not exists employee_terminations_pending_apply_idx
  on public.employee_terminations (effective_date)
  where applied_at is null;
