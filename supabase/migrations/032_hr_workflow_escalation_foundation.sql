-- RH-7B - Fundacao de escalation para Workflow Engine RH.
-- Apenas estrutura e leitura futura. Nao cria cron, filas, notificacoes ou automacao externa.

alter table public.hr_workflows
  add column if not exists escalation_enabled boolean not null default true,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists escalation_last_at timestamptz,
  add column if not exists escalation_count integer not null default 0,
  add column if not exists escalation_max_level integer not null default 3;

alter table public.hr_workflow_steps
  add column if not exists escalation_enabled boolean not null default true,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists escalation_last_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_workflows_escalation_level_check'
      and conrelid = 'public.hr_workflows'::regclass
  ) then
    alter table public.hr_workflows
      add constraint hr_workflows_escalation_level_check check (
        escalation_level >= 0
        and escalation_max_level >= 0
        and escalation_max_level <= 10
        and escalation_level <= escalation_max_level
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_workflows_escalation_count_check'
      and conrelid = 'public.hr_workflows'::regclass
  ) then
    alter table public.hr_workflows
      add constraint hr_workflows_escalation_count_check check (escalation_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_workflow_steps_escalation_level_check'
      and conrelid = 'public.hr_workflow_steps'::regclass
  ) then
    alter table public.hr_workflow_steps
      add constraint hr_workflow_steps_escalation_level_check check (
        escalation_level >= 0
        and escalation_level <= 10
      );
  end if;
end $$;

create index if not exists hr_workflows_unit_escalation_idx
  on public.hr_workflows (unit_id, escalation_enabled, escalation_level, escalation_max_level)
  where deleted_at is null;

create index if not exists hr_workflows_escalation_last_at_idx
  on public.hr_workflows (escalation_last_at)
  where deleted_at is null;

create index if not exists hr_workflow_steps_workflow_escalation_idx
  on public.hr_workflow_steps (workflow_id, escalation_enabled, escalation_level)
  where deleted_at is null;

