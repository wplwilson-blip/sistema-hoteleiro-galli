-- RH-20.2 - Governanca de vencimentos e alertas de Saude Ocupacional.
-- Expande somente o tipo de job de RH para permitir processamento manual
-- de vencimentos ocupacionais. Nao altera dados, Auth, login ou modulos fora de RH ocupacional.

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
      'training_expiration_scan',
      'occupational_expiration_scan'
    )
  );

comment on constraint hr_background_jobs_type_check on public.hr_background_jobs is
  'Tipos de rotinas internas de RH, incluindo varreduras de vencimentos de treinamentos e Saude Ocupacional.';
