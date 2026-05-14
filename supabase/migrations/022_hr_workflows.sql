-- RH-4C - Workflows administrativos de RH.
-- Cria somente a camada estrutural permanente de workflows, etapas e eventos.
-- Nao cria APIs, telas, uploads, dashboards, snapshots, folha, ponto, eSocial ou PMS.

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'workflows.view', 'Visualizar workflows de RH', 'Permite consultar workflows administrativos de RH.'),
  ('HR', 'workflows.manage', 'Gerenciar workflows de RH', 'Permite criar e atualizar workflows administrativos de RH.'),
  ('HR', 'workflows.approve', 'Aprovar workflows de RH', 'Permite aprovar workflows administrativos de RH quando aplicavel.'),
  ('HR', 'workflows.cancel', 'Cancelar workflows de RH', 'Permite cancelar workflows administrativos de RH mediante justificativa.'),
  ('HR', 'workflows.sensitive.view', 'Visualizar workflows sensiveis de RH', 'Permite consultar workflows de RH marcados como sensiveis.'),
  ('HR', 'workflow_steps.view', 'Visualizar etapas de workflows de RH', 'Permite consultar etapas operacionais de workflows de RH.'),
  ('HR', 'workflow_steps.manage', 'Gerenciar etapas de workflows de RH', 'Permite manter etapas operacionais de workflows de RH.'),
  ('HR', 'workflow_steps.complete', 'Concluir etapas de workflows de RH', 'Permite concluir etapas operacionais de workflows de RH.'),
  ('HR', 'workflow_steps.return', 'Devolver etapas de workflows de RH', 'Permite devolver etapas operacionais de workflows de RH para ajuste.'),
  ('HR', 'workflow_events.view', 'Visualizar eventos de workflows de RH', 'Permite consultar a trilha operacional de workflows de RH.'),
  ('HR', 'workflow_events.sensitive.view', 'Visualizar eventos sensiveis de workflows de RH', 'Permite consultar eventos operacionais sensiveis de workflows de RH.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.profile_permissions (access_profile_id, permission_id, is_allowed)
select ap.id, p.id, true
from public.access_profiles ap
join public.permissions p
  on p.module_code = 'HR'
 and p.action_code in (
    'workflows.view',
    'workflows.manage',
    'workflows.approve',
    'workflows.cancel',
    'workflows.sensitive.view',
    'workflow_steps.view',
    'workflow_steps.manage',
    'workflow_steps.complete',
    'workflow_steps.return',
    'workflow_events.view',
    'workflow_events.sensitive.view'
  )
where ap.code = 'SUPER_ADMIN'
  and ap.deleted_at is null
  and p.deleted_at is null
on conflict (access_profile_id, permission_id) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

create table if not exists public.hr_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  workflow_number text,
  workflow_type text not null,
  title text not null,
  description text,
  status text not null default 'draft',
  priority text not null default 'normal',
  visibility_scope text not null default 'unit',
  is_sensitive boolean not null default false,
  initiated_by uuid references public.app_users(id) on delete set null,
  responsible_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflows_number_not_blank check (
    workflow_number is null or btrim(workflow_number) <> ''
  ),
  constraint hr_workflows_title_not_blank check (btrim(title) <> ''),
  constraint hr_workflows_type_check check (
    workflow_type in (
      'admission',
      'termination',
      'transfer',
      'promotion',
      'job_position_change',
      'training',
      'vacation',
      'absence',
      'warning',
      'equipment_delivery',
      'general_note'
    )
  ),
  constraint hr_workflows_status_check check (
    status in (
      'draft',
      'open',
      'in_progress',
      'waiting_approval',
      'returned',
      'completed',
      'cancelled'
    )
  ),
  constraint hr_workflows_priority_check check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  constraint hr_workflows_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint hr_workflows_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint hr_workflows_sensitive_type_check check (
    workflow_type not in ('termination', 'absence', 'warning')
    or (is_sensitive = true and visibility_scope = 'restricted')
  ),
  constraint hr_workflows_employee_required_check check (
    employee_id is not null
    or workflow_type in ('admission', 'training', 'general_note')
  ),
  constraint hr_workflows_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflows_completed_check check (
    status <> 'completed'
    or completed_at is not null
  ),
  constraint hr_workflows_completed_status_check check (
    status = 'completed'
    or (
      completed_at is null
      and completed_by is null
    )
  ),
  constraint hr_workflows_completed_after_started_check check (
    completed_at is null
    or started_at is null
    or completed_at >= started_at
  ),
  constraint hr_workflows_cancellation_required_check check (
    status <> 'cancelled'
    or (
      cancelled_at is not null
      and cancelled_by is not null
      and btrim(coalesce(cancellation_reason, '')) <> ''
    )
  ),
  constraint hr_workflows_cancellation_status_check check (
    status = 'cancelled'
    or (
      cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
  )
);

create unique index if not exists hr_workflows_org_number_active_unique
  on public.hr_workflows (organization_id, upper(workflow_number))
  where workflow_number is not null
    and deleted_at is null;

create table if not exists public.hr_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  step_order integer not null,
  step_code text,
  title text not null,
  description text,
  status text not null default 'pending',
  requires_approval boolean not null default false,
  visibility_scope text not null default 'unit',
  is_sensitive boolean not null default false,
  assigned_to_user_id uuid references public.app_users(id) on delete set null,
  assigned_at timestamptz,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.app_users(id) on delete set null,
  returned_at timestamptz,
  returned_by uuid references public.app_users(id) on delete set null,
  return_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_steps_order_positive check (step_order > 0),
  constraint hr_workflow_steps_code_not_blank check (
    step_code is null or btrim(step_code) <> ''
  ),
  constraint hr_workflow_steps_code_format check (
    step_code is null or step_code ~ '^[A-Z0-9_.-]{2,80}$'
  ),
  constraint hr_workflow_steps_title_not_blank check (btrim(title) <> ''),
  constraint hr_workflow_steps_status_check check (
    status in (
      'pending',
      'in_progress',
      'waiting_approval',
      'returned',
      'completed',
      'skipped',
      'cancelled'
    )
  ),
  constraint hr_workflow_steps_waiting_approval_check check (
    status <> 'waiting_approval'
    or requires_approval = true
  ),
  constraint hr_workflow_steps_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint hr_workflow_steps_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint hr_workflow_steps_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflow_steps_completed_check check (
    status <> 'completed'
    or completed_at is not null
  ),
  constraint hr_workflow_steps_completed_status_check check (
    status = 'completed'
    or (
      completed_at is null
      and completed_by is null
    )
  ),
  constraint hr_workflow_steps_approval_completion_check check (
    requires_approval = false
    or status <> 'completed'
    or (
      approved_at is not null
      and approved_by is not null
    )
  ),
  constraint hr_workflow_steps_completed_after_started_check check (
    completed_at is null
    or started_at is null
    or completed_at >= started_at
  ),
  constraint hr_workflow_steps_status_returned_check check (
    status <> 'returned'
    or (
      returned_at is not null
      and returned_by is not null
      and btrim(coalesce(return_reason, '')) <> ''
    )
  ),
  constraint hr_workflow_steps_returned_status_check check (
    status = 'returned'
    or (
      returned_at is null
      and returned_by is null
      and return_reason is null
    )
  )
);

create unique index if not exists hr_workflow_steps_workflow_order_active_unique
  on public.hr_workflow_steps (workflow_id, step_order)
  where deleted_at is null;

create unique index if not exists hr_workflow_steps_workflow_code_active_unique
  on public.hr_workflow_steps (workflow_id, upper(step_code))
  where step_code is not null
    and deleted_at is null;

create table if not exists public.hr_workflow_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  workflow_step_id uuid references public.hr_workflow_steps(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  event_scope text not null default 'workflow',
  event_type text not null,
  from_status text,
  to_status text,
  summary text not null,
  details text,
  visibility_scope text not null default 'unit',
  is_sensitive boolean not null default false,
  actor_user_id uuid references public.app_users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  event_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_events_scope_check check (
    event_scope in ('workflow', 'step')
  ),
  constraint hr_workflow_events_step_scope_check check (
    event_scope <> 'step' or workflow_step_id is not null
  ),
  constraint hr_workflow_events_type_check check (
    event_type in (
      'workflow_created',
      'workflow_opened',
      'workflow_assigned',
      'workflow_status_changed',
      'workflow_due_date_changed',
      'workflow_submitted_for_approval',
      'workflow_approved',
      'workflow_returned',
      'workflow_completed',
      'workflow_cancelled',
      'step_started',
      'step_completed',
      'step_returned',
      'step_skipped',
      'document_linked',
      'note_added'
    )
  ),
  constraint hr_workflow_events_from_status_check check (
    from_status is null or btrim(from_status) <> ''
  ),
  constraint hr_workflow_events_to_status_check check (
    to_status is null or btrim(to_status) <> ''
  ),
  constraint hr_workflow_events_summary_not_blank check (btrim(summary) <> ''),
  constraint hr_workflow_events_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint hr_workflow_events_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint hr_workflow_events_payload_object_check check (jsonb_typeof(event_payload) = 'object'),
  constraint hr_workflow_events_status_check check (
    status in ('active', 'voided')
  )
);

create index if not exists hr_workflows_organization_idx on public.hr_workflows (organization_id);
create index if not exists hr_workflows_unit_idx on public.hr_workflows (unit_id);
create index if not exists hr_workflows_employee_idx on public.hr_workflows (employee_id);
create index if not exists hr_workflows_type_idx on public.hr_workflows (workflow_type);
create index if not exists hr_workflows_status_idx on public.hr_workflows (status);
create index if not exists hr_workflows_priority_idx on public.hr_workflows (priority);
create index if not exists hr_workflows_sensitive_idx on public.hr_workflows (is_sensitive);
create index if not exists hr_workflows_responsible_user_idx on public.hr_workflows (responsible_user_id);
create index if not exists hr_workflows_due_at_idx on public.hr_workflows (due_at);
create index if not exists hr_workflows_created_at_idx on public.hr_workflows (created_at);
create index if not exists hr_workflows_deleted_at_idx on public.hr_workflows (deleted_at);
create index if not exists hr_workflows_unit_status_due_at_idx
  on public.hr_workflows (unit_id, status, due_at);

create index if not exists hr_workflow_steps_organization_idx on public.hr_workflow_steps (organization_id);
create index if not exists hr_workflow_steps_unit_idx on public.hr_workflow_steps (unit_id);
create index if not exists hr_workflow_steps_workflow_idx on public.hr_workflow_steps (workflow_id);
create index if not exists hr_workflow_steps_employee_idx on public.hr_workflow_steps (employee_id);
create index if not exists hr_workflow_steps_status_idx on public.hr_workflow_steps (status);
create index if not exists hr_workflow_steps_assigned_to_idx on public.hr_workflow_steps (assigned_to_user_id);
create index if not exists hr_workflow_steps_due_at_idx on public.hr_workflow_steps (due_at);
create index if not exists hr_workflow_steps_created_at_idx on public.hr_workflow_steps (created_at);
create index if not exists hr_workflow_steps_deleted_at_idx on public.hr_workflow_steps (deleted_at);
create index if not exists hr_workflow_steps_unit_status_due_at_idx
  on public.hr_workflow_steps (unit_id, status, due_at);
create index if not exists hr_workflow_steps_assigned_status_due_at_idx
  on public.hr_workflow_steps (assigned_to_user_id, status, due_at);

create index if not exists hr_workflow_events_organization_idx on public.hr_workflow_events (organization_id);
create index if not exists hr_workflow_events_unit_idx on public.hr_workflow_events (unit_id);
create index if not exists hr_workflow_events_workflow_idx on public.hr_workflow_events (workflow_id);
create index if not exists hr_workflow_events_step_idx on public.hr_workflow_events (workflow_step_id);
create index if not exists hr_workflow_events_employee_idx on public.hr_workflow_events (employee_id);
create index if not exists hr_workflow_events_scope_idx on public.hr_workflow_events (event_scope);
create index if not exists hr_workflow_events_type_idx on public.hr_workflow_events (event_type);
create index if not exists hr_workflow_events_occurred_at_idx on public.hr_workflow_events (occurred_at);
create index if not exists hr_workflow_events_sensitive_idx on public.hr_workflow_events (is_sensitive);
create index if not exists hr_workflow_events_actor_user_idx on public.hr_workflow_events (actor_user_id);
create index if not exists hr_workflow_events_status_idx on public.hr_workflow_events (status);
create index if not exists hr_workflow_events_deleted_at_idx on public.hr_workflow_events (deleted_at);
create index if not exists hr_workflow_events_workflow_occurred_at_idx
  on public.hr_workflow_events (workflow_id, occurred_at);

alter table public.hr_workflows enable row level security;
alter table public.hr_workflow_steps enable row level security;
alter table public.hr_workflow_events enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para workflows de RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_workflows',
    'hr_workflow_steps',
    'hr_workflow_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || table_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
      'set_updated_at_' || table_name,
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de workflows de RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_workflows',
    'hr_workflow_steps',
    'hr_workflow_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || table_name, table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_trail()',
      'audit_' || table_name,
      table_name
    );
  end loop;
end;
$$;

comment on table public.hr_workflows is
  'Processo administrativo principal do RH. Nao substitui employee_functional_events nem audit_trail.';
comment on column public.hr_workflows.workflow_type is
  'Tipo administrativo do processo: admission, termination, transfer, promotion, job_position_change, training, vacation, absence, warning, equipment_delivery ou general_note.';
comment on column public.hr_workflows.employee_id is
  'Colaborador vinculado ao processo. Pode ser nulo apenas para admissao pre-cadastro, treinamento geral ou nota administrativa geral.';
comment on column public.hr_workflows.is_sensitive is
  'Workflows sensiveis exigem controle especifico de leitura; termination, absence e warning devem nascer restritos.';
comment on column public.hr_workflows.metadata is
  'Metadados administrativos controlados. Nao deve armazenar file_path, URL assinada, documentos sensiveis ou dados pessoais excessivos.';

comment on table public.hr_workflow_steps is
  'Etapas operacionais de um workflow administrativo de RH. Controla ordem, responsavel, prazo, conclusao, devolucao e aprovacao da etapa.';
comment on column public.hr_workflow_steps.metadata is
  'Metadados operacionais controlados da etapa. Nao deve armazenar anexos, URLs assinadas ou dados pessoais excessivos.';

comment on table public.hr_workflow_events is
  'Trilha operacional dos workflows de RH. Registra microeventos do processo sem poluir o historico funcional do colaborador.';
comment on column public.hr_workflow_events.event_type is
  'Codigo operacional controlado do evento, como workflow_created, workflow_submitted_for_approval, workflow_approved, step_completed, document_linked ou note_added.';
comment on column public.hr_workflow_events.event_payload is
  'Payload estruturado do microevento. Deve ser minimo, auditavel e sem file_path, URL assinada, documento sensivel ou anexo sensivel.';
comment on column public.hr_workflow_events.is_sensitive is
  'Eventos com observacoes internas, advertencia, afastamento, desligamento ou payload critico devem ser marcados como sensiveis.';
