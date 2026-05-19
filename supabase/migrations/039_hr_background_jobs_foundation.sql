-- RH-7I - Fundacao de Background Processing da plataforma RH Workflow Engine.
-- Control plane seguro para jobs internos. Nao cria daemon, worker distribuido,
-- scheduler externo, envio real de notificacoes ou execucao automatica irrestrita.

create table if not exists public.hr_background_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  job_type text not null,
  status text not null default 'pending',
  priority text not null default 'normal',
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  locked_at timestamptz,
  locked_by text,
  correlation_id text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_background_jobs_type_check check (
    job_type in (
      'sla_scan',
      'escalation_scan',
      'notification_dispatch',
      'audit_cleanup',
      'analytics_refresh',
      'dashboard_refresh'
    )
  ),
  constraint hr_background_jobs_status_check check (
    status in ('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled', 'retrying')
  ),
  constraint hr_background_jobs_priority_check check (priority in ('low', 'normal', 'high', 'critical')),
  constraint hr_background_jobs_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint hr_background_jobs_result_object_check check (jsonb_typeof(result) = 'object'),
  constraint hr_background_jobs_attempts_check check (
    attempts >= 0
    and max_attempts > 0
    and max_attempts <= 10
    and attempts <= max_attempts
  ),
  constraint hr_background_jobs_scheduled_status_check check (
    status <> 'scheduled' or scheduled_at is not null
  ),
  constraint hr_background_jobs_running_lock_check check (
    status <> 'running' or (started_at is not null and locked_at is not null and btrim(coalesce(locked_by, '')) <> '')
  ),
  constraint hr_background_jobs_completed_check check (
    status <> 'completed' or finished_at is not null
  ),
  constraint hr_background_jobs_failed_check check (
    status <> 'failed' or (failed_at is not null and btrim(coalesce(failure_reason, '')) <> '')
  ),
  constraint hr_background_jobs_correlation_format check (
    correlation_id is null or btrim(correlation_id) <> ''
  ),
  constraint hr_background_jobs_locked_by_format check (
    locked_by is null or btrim(locked_by) <> ''
  ),
  constraint hr_background_jobs_failure_reason_safe_check check (
    failure_reason is null
    or failure_reason !~* '(cpf|rg|salary|medical|cid|storage_path|signed_url|document_number)'
  ),
  constraint hr_background_jobs_payload_safe_check check (
    payload::text !~* '"(cpf|rg|salary|medical|cid|storage_path|signed_url|document_number)"\s*:'
  ),
  constraint hr_background_jobs_result_safe_check check (
    result::text !~* '"(cpf|rg|salary|medical|cid|storage_path|signed_url|document_number)"\s*:'
  )
);

create index if not exists hr_background_jobs_unit_idx
  on public.hr_background_jobs (unit_id)
  where deleted_at is null;

create index if not exists hr_background_jobs_status_scheduled_idx
  on public.hr_background_jobs (status, scheduled_at, priority)
  where deleted_at is null;

create index if not exists hr_background_jobs_type_status_idx
  on public.hr_background_jobs (job_type, status)
  where deleted_at is null;

create index if not exists hr_background_jobs_locked_idx
  on public.hr_background_jobs (locked_at, locked_by)
  where deleted_at is null and status = 'running';

create index if not exists hr_background_jobs_correlation_idx
  on public.hr_background_jobs (correlation_id)
  where deleted_at is null and correlation_id is not null;

alter table public.hr_background_jobs enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para jobs background RH.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_background_jobs on public.hr_background_jobs;
  create trigger set_updated_at_hr_background_jobs
    before update on public.hr_background_jobs
    for each row execute function public.update_updated_at_column();
end $$;

comment on table public.hr_background_jobs is
  'Control plane de jobs assincronos internos de RH. Nao executa codigo arbitrario nem workers externos.';

comment on column public.hr_background_jobs.payload is
  'Payload minimo e seguro do job. Nao deve conter documentos, dados medicos, salarios, storage paths ou URLs assinadas.';

comment on column public.hr_background_jobs.locked_by is
  'Identificador do runner manual/controlado que fez claim do job para evitar dupla execucao.';
