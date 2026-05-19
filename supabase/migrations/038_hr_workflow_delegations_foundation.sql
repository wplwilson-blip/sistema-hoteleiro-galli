-- RH-7H - Fundacao de Delegacao/Substituicao de aprovadores.
-- Cria infraestrutura unit scoped para delegacoes de aprovacao em workflows RH.
-- Nao cria UI, cron, notificacoes automaticas, calendario ou automacao externa.

create table if not exists public.hr_workflow_approver_delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  delegator_user_id uuid not null references public.app_users(id) on delete restrict,
  delegate_user_id uuid not null references public.app_users(id) on delete restrict,
  workflow_type text,
  step_type text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_active boolean not null default true,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.app_users(id) on delete set null,
  revocation_reason text,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_workflow_delegations_distinct_users_check check (delegator_user_id <> delegate_user_id),
  constraint hr_workflow_delegations_reason_not_blank check (btrim(reason) <> ''),
  constraint hr_workflow_delegations_revocation_reason_not_blank check (
    revocation_reason is null or btrim(revocation_reason) <> ''
  ),
  constraint hr_workflow_delegations_period_check check (ends_at is null or ends_at >= starts_at),
  constraint hr_workflow_delegations_workflow_type_check check (
    workflow_type is null
    or workflow_type in (
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
  constraint hr_workflow_delegations_step_type_check check (
    step_type is null or step_type in ('task', 'approval', 'review', 'document', 'notification', 'escalation')
  ),
  constraint hr_workflow_delegations_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_workflow_delegations_reason_safe_check check (
    reason !~* '(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)'
  ),
  constraint hr_workflow_delegations_revocation_reason_safe_check check (
    revocation_reason is null
    or revocation_reason !~* '(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)'
  ),
  constraint hr_workflow_delegations_metadata_safe_check check (
    metadata::text !~* '"(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)"\s*:'
  )
);

create index if not exists hr_workflow_delegations_unit_idx
  on public.hr_workflow_approver_delegations (unit_id)
  where deleted_at is null;

create index if not exists hr_workflow_delegations_delegator_idx
  on public.hr_workflow_approver_delegations (delegator_user_id)
  where deleted_at is null;

create index if not exists hr_workflow_delegations_delegate_idx
  on public.hr_workflow_approver_delegations (delegate_user_id)
  where deleted_at is null;

create index if not exists hr_workflow_delegations_active_period_idx
  on public.hr_workflow_approver_delegations (unit_id, is_active, starts_at, ends_at)
  where deleted_at is null and revoked_at is null;

create index if not exists hr_workflow_delegations_scope_idx
  on public.hr_workflow_approver_delegations (unit_id, workflow_type, step_type)
  where deleted_at is null;

alter table public.hr_workflow_approver_delegations enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para delegacoes de workflows de RH.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_workflow_approver_delegations on public.hr_workflow_approver_delegations;
  create trigger set_updated_at_hr_workflow_approver_delegations
    before update on public.hr_workflow_approver_delegations
    for each row execute function public.update_updated_at_column();
end $$;

comment on table public.hr_workflow_approver_delegations is
  'Delegacoes unit scoped para aprovadores de workflows RH. Nao executa troca automatica em massa.';

comment on column public.hr_workflow_approver_delegations.workflow_type is
  'Quando nulo, a delegacao vale para todos os tipos de workflow RH da unidade.';

comment on column public.hr_workflow_approver_delegations.step_type is
  'Quando nulo, a delegacao vale para qualquer tipo de etapa aplicavel.';

comment on column public.hr_workflow_approver_delegations.metadata is
  'Metadados administrativos seguros. Nao deve conter documentos, dados medicos, salarios, caminhos de arquivo ou URLs assinadas.';
