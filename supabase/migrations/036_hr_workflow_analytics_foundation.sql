-- RH-7F - Fundacao de Analytics & KPIs da Workflow Engine RH.
-- Somente views analiticas agregaveis. Nao cria BI externo, exportadores,
-- realtime, cron, scheduler, automacao externa ou dashboard visual complexo.

create or replace view public.hr_workflow_analytics_workflow_facts as
select
  w.organization_id,
  w.unit_id,
  w.id as workflow_id,
  w.workflow_type,
  w.status,
  w.priority,
  w.sla_status,
  w.sla_due_at,
  w.sla_minutes,
  w.escalation_enabled,
  w.escalation_level,
  w.escalation_max_level,
  w.created_at,
  w.started_at,
  w.completed_at,
  w.cancelled_at,
  case
    when w.status in ('open', 'in_progress', 'waiting_approval', 'returned') then true
    else false
  end as is_active,
  case
    when w.status in ('open', 'in_progress', 'waiting_approval', 'returned')
      and (
        w.sla_status = 'overdue'
        or (
          w.sla_due_at is not null
          and w.sla_due_at < now()
          and coalesce(w.sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
        )
      )
    then true
    else false
  end as is_overdue_active,
  case
    when w.completed_at is not null
    then greatest(0, floor(extract(epoch from (w.completed_at - coalesce(w.started_at, w.created_at))) / 60))::bigint
    else null
  end as completion_minutes,
  case
    when w.completed_at is not null
      and w.sla_due_at is not null
      and w.completed_at > w.sla_due_at
    then floor(extract(epoch from (w.completed_at - w.sla_due_at)) / 60)::bigint
    when w.status in ('open', 'in_progress', 'waiting_approval', 'returned')
      and w.sla_due_at is not null
      and now() > w.sla_due_at
    then floor(extract(epoch from (now() - w.sla_due_at)) / 60)::bigint
    else 0::bigint
  end as delay_minutes
from public.hr_workflows w
where w.deleted_at is null;

create or replace view public.hr_workflow_analytics_step_facts as
select
  s.organization_id,
  s.unit_id,
  s.workflow_id,
  s.id as step_id,
  s.step_code,
  s.step_order,
  s.status,
  s.requires_approval,
  s.sla_status,
  s.sla_due_at,
  s.sla_minutes,
  s.created_at,
  s.started_at,
  s.completed_at,
  s.returned_at,
  case
    when s.status in ('pending', 'in_progress', 'waiting_approval', 'returned')
      and (
        s.sla_status = 'overdue'
        or (
          s.sla_due_at is not null
          and s.sla_due_at < now()
          and coalesce(s.sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
        )
      )
    then true
    else false
  end as is_overdue,
  case
    when s.completed_at is not null
    then greatest(0, floor(extract(epoch from (s.completed_at - coalesce(s.started_at, s.created_at))) / 60))::bigint
    else null
  end as completion_minutes,
  case
    when s.completed_at is not null
      and s.sla_due_at is not null
      and s.completed_at > s.sla_due_at
    then floor(extract(epoch from (s.completed_at - s.sla_due_at)) / 60)::bigint
    when s.status in ('pending', 'in_progress', 'waiting_approval', 'returned')
      and s.sla_due_at is not null
      and now() > s.sla_due_at
    then floor(extract(epoch from (now() - s.sla_due_at)) / 60)::bigint
    else 0::bigint
  end as delay_minutes
from public.hr_workflow_steps s
where s.deleted_at is null;

comment on view public.hr_workflow_analytics_workflow_facts is
  'Fatos analiticos seguros dos workflows de RH. Nao contem nomes, documentos, metadata sensivel ou payload bruto.';

comment on view public.hr_workflow_analytics_step_facts is
  'Fatos analiticos seguros das etapas de workflows de RH. Nao contem nomes, documentos, metadata sensivel ou payload bruto.';
