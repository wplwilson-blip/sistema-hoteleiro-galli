-- RH-7E - Fundacao de Auditoria Avancada da Workflow Engine RH.
-- Somente captura e leitura auditavel. Nao cria SIEM, exportadores,
-- realtime, webhooks, trilha criptografica ou assinatura digital.

create table if not exists public.hr_workflow_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid references public.hr_workflows(id) on delete restrict,
  step_id uuid references public.hr_workflow_steps(id) on delete restrict,
  event_id uuid references public.hr_workflow_events(id) on delete restrict,
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  risk_level text not null default 'low',
  ip_address inet,
  user_agent text,
  request_id text,
  correlation_id text,
  created_at timestamptz not null default now(),
  constraint hr_workflow_audit_logs_action_check check (
    action in (
      'create_workflow',
      'execute_step',
      'approve_step',
      'reject_step',
      'return_step',
      'cancel_workflow'
    )
  ),
  constraint hr_workflow_audit_logs_entity_type_check check (
    entity_type in ('workflow', 'step', 'event', 'notification')
  ),
  constraint hr_workflow_audit_logs_risk_level_check check (
    risk_level in ('low', 'medium', 'high', 'critical')
  ),
  constraint hr_workflow_audit_logs_previous_state_object_check check (
    previous_state is null
    or jsonb_typeof(previous_state) = 'object'
  ),
  constraint hr_workflow_audit_logs_new_state_object_check check (
    new_state is null
    or jsonb_typeof(new_state) = 'object'
  ),
  constraint hr_workflow_audit_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflow_audit_logs_user_agent_length_check check (
    user_agent is null
    or length(user_agent) <= 500
  ),
  constraint hr_workflow_audit_logs_request_id_length_check check (
    request_id is null
    or length(request_id) <= 160
  ),
  constraint hr_workflow_audit_logs_correlation_id_length_check check (
    correlation_id is null
    or length(correlation_id) <= 160
  ),
  constraint hr_workflow_audit_logs_lgpd_check check (
    lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%file_path%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%signed_url%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%signedurl%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%storage_path%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%document_number%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%salary%'
    and lower(
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) not like '%medical%'
    and (
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) !~* '(^|[^a-z0-9_])cpf([^a-z0-9_]|$)'
    and (
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) !~* '(^|[^a-z0-9_])rg([^a-z0-9_]|$)'
    and (
      coalesce(previous_state::text, '')
      || ' '
      || coalesce(new_state::text, '')
      || ' '
      || coalesce(metadata::text, '')
    ) !~* '(^|[^a-z0-9_])cid([^a-z0-9_]|$)'
  )
);

create index if not exists hr_workflow_audit_logs_organization_idx
  on public.hr_workflow_audit_logs (organization_id);

create index if not exists hr_workflow_audit_logs_unit_created_idx
  on public.hr_workflow_audit_logs (unit_id, created_at desc);

create index if not exists hr_workflow_audit_logs_workflow_created_idx
  on public.hr_workflow_audit_logs (workflow_id, created_at desc)
  where workflow_id is not null;

create index if not exists hr_workflow_audit_logs_step_created_idx
  on public.hr_workflow_audit_logs (step_id, created_at desc)
  where step_id is not null;

create index if not exists hr_workflow_audit_logs_event_created_idx
  on public.hr_workflow_audit_logs (event_id, created_at desc)
  where event_id is not null;

create index if not exists hr_workflow_audit_logs_actor_created_idx
  on public.hr_workflow_audit_logs (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists hr_workflow_audit_logs_action_created_idx
  on public.hr_workflow_audit_logs (action, created_at desc);

create index if not exists hr_workflow_audit_logs_risk_created_idx
  on public.hr_workflow_audit_logs (risk_level, created_at desc);

create index if not exists hr_workflow_audit_logs_request_idx
  on public.hr_workflow_audit_logs (request_id)
  where request_id is not null;

create index if not exists hr_workflow_audit_logs_correlation_idx
  on public.hr_workflow_audit_logs (correlation_id)
  where correlation_id is not null;

alter table public.hr_workflow_audit_logs enable row level security;

comment on table public.hr_workflow_audit_logs is
  'Auditoria avancada dos workflows de RH. Registra acao, ator, unidade, entidade impactada, snapshots seguros e contexto operacional.';
comment on column public.hr_workflow_audit_logs.previous_state is
  'Snapshot resumido e redigido antes da acao. Nao armazenar payload bruto, dados pessoais sensiveis, anexos ou URLs assinadas.';
comment on column public.hr_workflow_audit_logs.new_state is
  'Snapshot resumido e redigido depois da acao. Nao armazenar payload bruto, dados pessoais sensiveis, anexos ou URLs assinadas.';
comment on column public.hr_workflow_audit_logs.metadata is
  'Metadados tecnicos minimos e seguros, como idempotencia, origem e chaves de correlacao.';
comment on column public.hr_workflow_audit_logs.risk_level is
  'Nivel operacional padronizado: low, medium, high ou critical.';
