-- RH-7D - Fundacao do Dashboard Operacional RH.
-- Somente leitura consolidada. Nao cria realtime, websocket, polling,
-- cache distribuido, BI externo, notificacoes ou automacao externa.

create or replace view public.hr_workflow_dashboard_unit_metrics as
with workflow_metrics as (
  select
    organization_id,
    unit_id,
    count(*)::bigint as workflows_total,
    count(*) filter (
      where status in ('open', 'in_progress', 'waiting_approval', 'returned')
    )::bigint as workflows_active,
    count(*) filter (
      where status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and (
          sla_status = 'overdue'
          or (
            sla_due_at is not null
            and sla_due_at < now()
            and coalesce(sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
          )
        )
    )::bigint as workflows_overdue,
    count(*) filter (where status = 'waiting_approval')::bigint as workflows_waiting_approval,
    count(*) filter (where status = 'completed')::bigint as workflows_completed,
    count(*) filter (where status = 'rejected')::bigint as workflows_rejected,
    count(*) filter (where status = 'cancelled')::bigint as workflows_cancelled,
    count(*) filter (where status = 'returned')::bigint as workflows_returned,
    count(*) filter (
      where status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and (
          sla_status = 'overdue'
          or (
            sla_due_at is not null
            and sla_due_at < now()
            and coalesce(sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
          )
        )
    )::bigint as sla_overdue,
    count(*) filter (
      where status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and sla_status = 'warning'
        and (sla_due_at is null or sla_due_at >= now())
    )::bigint as sla_warning,
    count(*) filter (
      where status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and coalesce(sla_status, 'on_time') = 'on_time'
        and (sla_due_at is null or sla_due_at >= now())
    )::bigint as sla_on_time,
    count(*) filter (where sla_status = 'completed_on_time')::bigint as sla_completed_on_time,
    count(*) filter (where sla_status = 'completed_late')::bigint as sla_completed_late,
    count(*) filter (
      where escalation_enabled = true
        and status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and escalation_level < escalation_max_level
        and (
          sla_status = 'overdue'
          or (
            sla_due_at is not null
            and sla_due_at < now()
            and coalesce(sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
          )
        )
    )::bigint as escalation_eligible,
    count(*) filter (
      where escalation_enabled = true
        and status in ('open', 'in_progress', 'waiting_approval', 'returned')
        and (
          sla_status = 'overdue'
          or (
            sla_due_at is not null
            and sla_due_at < now()
            and coalesce(sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
          )
        )
    )::bigint as escalation_overdue
  from public.hr_workflows
  where deleted_at is null
  group by organization_id, unit_id
),
escalation_level_metrics as (
  select
    organization_id,
    unit_id,
    jsonb_object_agg(escalation_level::text, level_count order by escalation_level) as escalation_level_counts
  from (
    select
      organization_id,
      unit_id,
      escalation_level,
      count(*)::bigint as level_count
    from public.hr_workflows
    where deleted_at is null
      and escalation_enabled = true
      and status in ('open', 'in_progress', 'waiting_approval', 'returned')
    group by organization_id, unit_id, escalation_level
  ) levels
  group by organization_id, unit_id
),
step_metrics as (
  select
    organization_id,
    unit_id,
    count(*) filter (where status = 'waiting_approval')::bigint as steps_waiting_approval,
    count(*) filter (where status = 'in_progress')::bigint as steps_in_progress,
    count(*) filter (where status = 'returned')::bigint as steps_returned,
    count(*) filter (
      where status in ('pending', 'in_progress', 'waiting_approval', 'returned')
        and (
          sla_status = 'overdue'
          or (
            sla_due_at is not null
            and sla_due_at < now()
            and coalesce(sla_status, 'on_time') in ('on_time', 'warning', 'overdue')
          )
        )
    )::bigint as steps_overdue
  from public.hr_workflow_steps
  where deleted_at is null
  group by organization_id, unit_id
),
notification_metrics as (
  select
    organization_id,
    unit_id,
    count(*) filter (where status = 'pending')::bigint as notifications_pending,
    count(*) filter (where status = 'failed')::bigint as notifications_failed,
    count(*) filter (
      where status in ('pending', 'scheduled', 'sent')
        and read_at is null
    )::bigint as notifications_unread
  from public.hr_workflow_notifications
  where deleted_at is null
  group by organization_id, unit_id
)
select
  u.organization_id,
  u.id as unit_id,
  coalesce(w.workflows_total, 0)::bigint as workflows_total,
  coalesce(w.workflows_active, 0)::bigint as workflows_active,
  coalesce(w.workflows_overdue, 0)::bigint as workflows_overdue,
  coalesce(w.workflows_waiting_approval, 0)::bigint as workflows_waiting_approval,
  coalesce(w.workflows_completed, 0)::bigint as workflows_completed,
  coalesce(w.workflows_rejected, 0)::bigint as workflows_rejected,
  coalesce(w.workflows_cancelled, 0)::bigint as workflows_cancelled,
  coalesce(w.workflows_returned, 0)::bigint as workflows_returned,
  coalesce(w.sla_overdue, 0)::bigint as sla_overdue,
  coalesce(w.sla_warning, 0)::bigint as sla_warning,
  coalesce(w.sla_on_time, 0)::bigint as sla_on_time,
  coalesce(w.sla_completed_on_time, 0)::bigint as sla_completed_on_time,
  coalesce(w.sla_completed_late, 0)::bigint as sla_completed_late,
  coalesce(w.escalation_eligible, 0)::bigint as escalation_eligible,
  coalesce(w.escalation_overdue, 0)::bigint as escalation_overdue,
  coalesce(e.escalation_level_counts, '{}'::jsonb) as escalation_level_counts,
  coalesce(n.notifications_pending, 0)::bigint as notifications_pending,
  coalesce(n.notifications_failed, 0)::bigint as notifications_failed,
  coalesce(n.notifications_unread, 0)::bigint as notifications_unread,
  coalesce(s.steps_waiting_approval, 0)::bigint as steps_waiting_approval,
  coalesce(s.steps_in_progress, 0)::bigint as steps_in_progress,
  coalesce(s.steps_returned, 0)::bigint as steps_returned,
  coalesce(s.steps_overdue, 0)::bigint as steps_overdue,
  now() as generated_at
from public.units u
left join workflow_metrics w
  on w.organization_id = u.organization_id
 and w.unit_id = u.id
left join escalation_level_metrics e
  on e.organization_id = u.organization_id
 and e.unit_id = u.id
left join step_metrics s
  on s.organization_id = u.organization_id
 and s.unit_id = u.id
left join notification_metrics n
  on n.organization_id = u.organization_id
 and n.unit_id = u.id
where u.deleted_at is null
  and u.status = 'active';

comment on view public.hr_workflow_dashboard_unit_metrics is
  'Metricas operacionais consolidadas por unidade para o dashboard RH. A aplicacao deve filtrar sempre pelas unidades permitidas do usuario.';
