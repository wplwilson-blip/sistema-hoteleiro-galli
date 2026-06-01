-- RH-19.2 - Governanca de vencimentos e reciclagem de treinamentos.
-- Expande somente status de employee_trainings e tipo de job de RH para
-- permitir processamento operacional de vencimentos, alertas e reciclagem.

alter table public.employee_trainings
  drop constraint if exists employee_trainings_status_check;

alter table public.employee_trainings
  add constraint employee_trainings_status_check check (
    status in (
      'assigned',
      'scheduled',
      'in_progress',
      'completed',
      'expired',
      'retraining_required',
      'waived',
      'cancelled'
    )
  );

alter table public.hr_background_jobs
  drop constraint if exists hr_background_jobs_type_check;

alter table public.hr_background_jobs
  add constraint hr_background_jobs_type_check check (
    job_type in (
      'sla_scan',
      'escalation_scan',
      'notification_dispatch',
      'audit_cleanup',
      'analytics_refresh',
      'dashboard_refresh',
      'training_expiration_scan'
    )
  );

comment on constraint employee_trainings_status_check on public.employee_trainings is
  'Status operacional de treinamento do colaborador, incluindo reciclagem necessaria para RH-19.2.';

comment on constraint hr_background_jobs_type_check on public.hr_background_jobs is
  'Tipos de rotinas internas de RH, incluindo varredura de vencimentos de treinamentos.';
