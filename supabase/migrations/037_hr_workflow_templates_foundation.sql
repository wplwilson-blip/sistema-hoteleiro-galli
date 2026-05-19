-- RH-7G - Fundacao de Templates de Workflow RH.
-- Cria apenas estrutura reutilizavel de templates e etapas padrao.
-- Nao cria UI, editor visual, drag and drop, automacao externa ou templates fora de RH.

create table if not exists public.hr_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  workflow_type text not null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_system boolean not null default false,
  default_sla_minutes integer,
  default_escalation_enabled boolean not null default true,
  default_escalation_max_level integer not null default 3,
  default_notification_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_templates_code_not_blank check (btrim(code) <> ''),
  constraint hr_workflow_templates_code_format check (code ~ '^[A-Z0-9_.-]{2,80}$'),
  constraint hr_workflow_templates_name_not_blank check (btrim(name) <> ''),
  constraint hr_workflow_templates_type_check check (
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
      'general_note',
      'vacation_request',
      'salary_increase',
      'document_request'
    )
  ),
  constraint hr_workflow_templates_sla_minutes_check check (
    default_sla_minutes is null or (default_sla_minutes > 0 and default_sla_minutes <= 525600)
  ),
  constraint hr_workflow_templates_escalation_max_check check (
    default_escalation_max_level >= 0 and default_escalation_max_level <= 10
  ),
  constraint hr_workflow_templates_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflow_templates_metadata_safe_check check (
    metadata::text !~* '"(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)"\s*:'
  )
);

create table if not exists public.hr_workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.hr_workflow_templates(id) on delete restrict,
  step_key text not null,
  name text not null,
  description text,
  step_type text not null default 'task',
  order_index integer not null,
  is_required boolean not null default true,
  default_assigned_role text,
  default_assigned_profile_id uuid references public.access_profiles(id) on delete set null,
  default_sla_minutes integer,
  requires_approval boolean not null default false,
  default_notification_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_template_steps_key_not_blank check (btrim(step_key) <> ''),
  constraint hr_workflow_template_steps_key_format check (step_key ~ '^[A-Z0-9_.-]{2,80}$'),
  constraint hr_workflow_template_steps_name_not_blank check (btrim(name) <> ''),
  constraint hr_workflow_template_steps_order_positive check (order_index > 0),
  constraint hr_workflow_template_steps_type_check check (
    step_type in ('task', 'approval', 'review', 'document', 'notification', 'escalation')
  ),
  constraint hr_workflow_template_steps_role_format check (
    default_assigned_role is null or default_assigned_role ~ '^[A-Z0-9_.-]{2,80}$'
  ),
  constraint hr_workflow_template_steps_sla_minutes_check check (
    default_sla_minutes is null or (default_sla_minutes > 0 and default_sla_minutes <= 525600)
  ),
  constraint hr_workflow_template_steps_approval_check check (
    step_type <> 'approval' or requires_approval = true
  ),
  constraint hr_workflow_template_steps_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflow_template_steps_metadata_safe_check check (
    metadata::text !~* '"(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)"\s*:'
  )
);

create unique index if not exists hr_workflow_templates_scope_code_active_unique
  on public.hr_workflow_templates (organization_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(code))
  where deleted_at is null;

create unique index if not exists hr_workflow_template_steps_order_active_unique
  on public.hr_workflow_template_steps (template_id, order_index)
  where deleted_at is null;

create unique index if not exists hr_workflow_template_steps_key_active_unique
  on public.hr_workflow_template_steps (template_id, upper(step_key))
  where deleted_at is null;

create index if not exists hr_workflow_templates_organization_idx
  on public.hr_workflow_templates (organization_id)
  where deleted_at is null;

create index if not exists hr_workflow_templates_unit_idx
  on public.hr_workflow_templates (unit_id)
  where deleted_at is null;

create index if not exists hr_workflow_templates_type_active_idx
  on public.hr_workflow_templates (workflow_type, is_active)
  where deleted_at is null;

create index if not exists hr_workflow_template_steps_template_idx
  on public.hr_workflow_template_steps (template_id, order_index)
  where deleted_at is null;

alter table public.hr_workflow_templates enable row level security;
alter table public.hr_workflow_template_steps enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para templates de workflows de RH.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_workflow_templates on public.hr_workflow_templates;
  create trigger set_updated_at_hr_workflow_templates
    before update on public.hr_workflow_templates
    for each row execute function public.update_updated_at_column();

  drop trigger if exists set_updated_at_hr_workflow_template_steps on public.hr_workflow_template_steps;
  create trigger set_updated_at_hr_workflow_template_steps
    before update on public.hr_workflow_template_steps
    for each row execute function public.update_updated_at_column();
end $$;

comment on table public.hr_workflow_templates is
  'Templates reutilizaveis de workflows administrativos de RH. Podem ser globais da organizacao ou especificos por unidade.';

comment on table public.hr_workflow_template_steps is
  'Etapas padrao ordenadas de templates de workflows RH. Nao executam automacao nem notificacoes reais.';

comment on column public.hr_workflow_templates.metadata is
  'Metadados administrativos seguros do template. Nao deve conter documentos, dados medicos, salarios, caminhos de arquivo ou URLs assinadas.';

comment on column public.hr_workflow_template_steps.metadata is
  'Metadados administrativos seguros da etapa do template. Nao deve conter dados pessoais sensiveis ou anexos.';
