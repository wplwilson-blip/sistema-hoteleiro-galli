-- RH-7C - Fundacao da Notification Engine para Workflow Engine RH.
-- Apenas registra e permite consulta futura. Nao envia e-mail, WhatsApp, SMS,
-- nao cria cron, scheduler, fila, websocket ou automacao externa.

create table if not exists public.hr_workflow_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  step_id uuid references public.hr_workflow_steps(id) on delete restrict,
  event_id uuid references public.hr_workflow_events(id) on delete restrict,
  recipient_user_id uuid not null references public.app_users(id) on delete restrict,
  notification_type text not null,
  channel text not null default 'in_app',
  status text not null default 'pending',
  priority text not null default 'normal',
  title text not null,
  message text not null,
  visibility_scope text not null default 'unit',
  is_sensitive boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_notifications_type_check check (
    notification_type in (
      'workflow_event',
      'workflow_assigned',
      'workflow_status_changed',
      'step_assigned',
      'step_waiting_approval',
      'step_returned',
      'step_rejected',
      'workflow_cancelled',
      'sla_warning',
      'sla_overdue',
      'escalation_notice'
    )
  ),
  constraint hr_workflow_notifications_channel_check check (
    channel in ('in_app', 'email', 'whatsapp')
  ),
  constraint hr_workflow_notifications_status_check check (
    status in ('pending', 'scheduled', 'sent', 'read', 'failed', 'cancelled')
  ),
  constraint hr_workflow_notifications_priority_check check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  constraint hr_workflow_notifications_title_not_blank check (btrim(title) <> ''),
  constraint hr_workflow_notifications_message_not_blank check (btrim(message) <> ''),
  constraint hr_workflow_notifications_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint hr_workflow_notifications_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint hr_workflow_notifications_payload_object_check check (jsonb_typeof(payload) = 'object'),
  constraint hr_workflow_notifications_scheduled_check check (
    status <> 'scheduled'
    or scheduled_for is not null
  ),
  constraint hr_workflow_notifications_sent_check check (
    status not in ('sent', 'read')
    or sent_at is not null
  ),
  constraint hr_workflow_notifications_read_check check (
    status <> 'read'
    or read_at is not null
  ),
  constraint hr_workflow_notifications_failed_check check (
    (
      status = 'failed'
      and failed_at is not null
      and btrim(coalesce(failure_reason, '')) <> ''
    )
    or (
      status <> 'failed'
      and failed_at is null
      and failure_reason is null
    )
  ),
  constraint hr_workflow_notifications_pending_unsent_check check (
    status not in ('pending', 'scheduled', 'cancelled')
    or (
      sent_at is null
      and read_at is null
      and failed_at is null
      and failure_reason is null
    )
  ),
  constraint hr_workflow_notifications_payload_lgpd_check check (
    lower(payload::text) not like '%file_path%'
    and lower(payload::text) not like '%signed_url%'
    and lower(payload::text) not like '%signedurl%'
    and lower(payload::text) not like '%storage_path%'
    and lower(payload::text) not like '%createsignedurl%'
    and lower(payload::text) not like '%download_url%'
    and lower(payload::text) not like '%public_url%'
    and lower(payload::text) not like '%document_number%'
    and lower(payload::text) not like '%salary%'
    and lower(payload::text) not like '%medical%'
    and payload::text !~* '(^|[^a-z0-9_])cpf([^a-z0-9_]|$)'
    and payload::text !~* '(^|[^a-z0-9_])rg([^a-z0-9_]|$)'
    and payload::text !~* '(^|[^a-z0-9_])cid([^a-z0-9_]|$)'
  )
);

create index if not exists hr_workflow_notifications_organization_idx
  on public.hr_workflow_notifications (organization_id)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_unit_idx
  on public.hr_workflow_notifications (unit_id)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_workflow_idx
  on public.hr_workflow_notifications (workflow_id)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_step_idx
  on public.hr_workflow_notifications (step_id)
  where step_id is not null
    and deleted_at is null;

create index if not exists hr_workflow_notifications_event_idx
  on public.hr_workflow_notifications (event_id)
  where event_id is not null
    and deleted_at is null;

create index if not exists hr_workflow_notifications_recipient_idx
  on public.hr_workflow_notifications (recipient_user_id)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_status_idx
  on public.hr_workflow_notifications (status)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_channel_idx
  on public.hr_workflow_notifications (channel)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_scheduled_for_idx
  on public.hr_workflow_notifications (scheduled_for)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_unit_status_created_idx
  on public.hr_workflow_notifications (unit_id, status, created_at desc)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_recipient_status_created_idx
  on public.hr_workflow_notifications (recipient_user_id, status, created_at desc)
  where deleted_at is null;

create index if not exists hr_workflow_notifications_workflow_created_idx
  on public.hr_workflow_notifications (workflow_id, created_at desc)
  where deleted_at is null;

alter table public.hr_workflow_notifications enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para notificacoes de workflows de RH.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_workflow_notifications on public.hr_workflow_notifications;
  create trigger set_updated_at_hr_workflow_notifications
    before update on public.hr_workflow_notifications
    for each row execute function public.update_updated_at_column();
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de notificacoes de workflows de RH devera ser adicionada em migration futura.';
    return;
  end if;

  drop trigger if exists audit_hr_workflow_notifications on public.hr_workflow_notifications;
  create trigger audit_hr_workflow_notifications
    after insert or update or delete on public.hr_workflow_notifications
    for each row execute function public.write_audit_trail();
end;
$$;

comment on table public.hr_workflow_notifications is
  'Fundacao da Notification Engine de workflows de RH. Registra destinatario, evento, canal futuro e status sem enviar notificacoes reais.';
comment on column public.hr_workflow_notifications.recipient_user_id is
  'Usuario interno que devera receber a notificacao futura. Colaborador nao e necessariamente usuario do sistema.';
comment on column public.hr_workflow_notifications.notification_type is
  'Tipo operacional controlado da notificacao preparada a partir de eventos, SLA ou escalation do workflow.';
comment on column public.hr_workflow_notifications.channel is
  'Canal futuro planejado: in_app, email ou whatsapp. Esta fundacao nao executa envio.';
comment on column public.hr_workflow_notifications.status is
  'Estado operacional do registro: pending, scheduled, sent, read, failed ou cancelled. Nesta sprint apenas pending/scheduled sao preparados pela aplicacao.';
comment on column public.hr_workflow_notifications.payload is
  'Payload minimo e redigido para roteamento/consulta futura. Nao deve conter dados pessoais sensiveis, anexos, file_path, signed_url ou storage_path.';
