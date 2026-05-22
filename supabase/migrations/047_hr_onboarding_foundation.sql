-- RH-12B.1 - Fundacao de banco para onboarding operacional.
-- Cria planos, itens padrao, onboardings reais e itens reais do colaborador.
-- Nao cria UI, API, seed, folha, ponto, salario, LMS, portal, workflow engine
-- paralela, automacao externa, OCR ou IA.

create table if not exists public.hr_onboarding_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  job_position_id uuid references public.job_positions(id) on delete restrict,
  admission_type text,
  name text not null,
  description text,
  priority integer not null default 100,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_onboarding_plans_name_not_blank check (btrim(name) <> ''),
  constraint hr_onboarding_plans_description_length check (
    description is null or length(description) <= 2000
  ),
  constraint hr_onboarding_plans_admission_type_format check (
    admission_type is null or admission_type ~ '^[a-z0-9_-]{2,60}$'
  ),
  constraint hr_onboarding_plans_priority_non_negative check (priority >= 0),
  constraint hr_onboarding_plans_unit_requires_org check (
    unit_id is null or organization_id is not null
  ),
  constraint hr_onboarding_plans_department_requires_scope check (
    department_id is null or organization_id is not null or unit_id is not null
  ),
  constraint hr_onboarding_plans_job_requires_scope check (
    job_position_id is null or organization_id is not null or unit_id is not null or department_id is not null
  )
);

create table if not exists public.hr_onboarding_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.hr_onboarding_plans(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  description text,
  category text not null default 'other',
  owner_area text not null default 'RH',
  responsible_profile_code text,
  due_days_after_start integer,
  is_required boolean not null default true,
  is_critical boolean not null default false,
  blocks_operational_release boolean not null default false,
  related_document_type_id uuid references public.hr_document_types(id) on delete set null,
  sort_order integer not null default 0,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_onboarding_plan_items_title_not_blank check (btrim(title) <> ''),
  constraint hr_onboarding_plan_items_description_length check (
    description is null or length(description) <= 2000
  ),
  constraint hr_onboarding_plan_items_category_check check (
    category in (
      'document',
      'training',
      'access',
      'uniform',
      'epi',
      'equipment',
      'policy',
      'operational_orientation',
      'manager_validation',
      'other'
    )
  ),
  constraint hr_onboarding_plan_items_owner_area_check check (
    owner_area in (
      'RH',
      'GESTOR',
      'TI',
      'GOVERNANCA',
      'RECEPCAO',
      'COZINHA',
      'MANUTENCAO',
      'AB',
      'ADMINISTRATIVO'
    )
  ),
  constraint hr_onboarding_plan_items_responsible_profile_format check (
    responsible_profile_code is null or responsible_profile_code ~ '^[A-Z0-9_]{2,40}$'
  ),
  constraint hr_onboarding_plan_items_due_days_non_negative check (
    due_days_after_start is null or due_days_after_start >= 0
  ),
  constraint hr_onboarding_plan_items_sort_order_non_negative check (sort_order >= 0)
);

create table if not exists public.employee_onboardings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  plan_id uuid references public.hr_onboarding_plans(id) on delete restrict,
  status text not null default 'not_started',
  operational_release_status text not null default 'blocked',
  started_at timestamptz,
  expected_release_at timestamptz,
  released_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancellation_reason text,
  blocked_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_onboardings_status_check check (
    status in ('not_started', 'in_progress', 'completed', 'cancelled')
  ),
  constraint employee_onboardings_release_status_check check (
    operational_release_status in ('blocked', 'partial', 'released', 'critical_pending')
  ),
  constraint employee_onboardings_expected_release_range_check check (
    started_at is null or expected_release_at is null or expected_release_at >= started_at
  ),
  constraint employee_onboardings_released_range_check check (
    started_at is null or released_at is null or released_at >= started_at
  ),
  constraint employee_onboardings_completed_range_check check (
    started_at is null or completed_at is null or completed_at >= started_at
  ),
  constraint employee_onboardings_cancelled_range_check check (
    started_at is null or cancelled_at is null or cancelled_at >= started_at
  ),
  constraint employee_onboardings_released_timestamp_check check (
    operational_release_status <> 'released' or released_at is not null
  ),
  constraint employee_onboardings_completed_timestamp_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint employee_onboardings_cancelled_timestamp_check check (
    status <> 'cancelled' or cancelled_at is not null
  ),
  constraint employee_onboardings_cancellation_reason_length check (
    cancellation_reason is null or length(cancellation_reason) <= 1000
  ),
  constraint employee_onboardings_blocked_reason_length check (
    blocked_reason is null or length(blocked_reason) <= 1000
  ),
  constraint employee_onboardings_notes_length check (
    notes is null or length(notes) <= 2000
  )
);

create table if not exists public.employee_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.employee_onboardings(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  plan_item_id uuid references public.hr_onboarding_plan_items(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'other',
  owner_area text not null default 'RH',
  responsible_user_id uuid references public.app_users(id) on delete set null,
  responsible_profile_code text,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  status text not null default 'pending',
  is_required boolean not null default true,
  is_critical boolean not null default false,
  blocks_operational_release boolean not null default false,
  related_document_type_id uuid references public.hr_document_types(id) on delete set null,
  related_employee_document_id uuid references public.employee_documents(id) on delete set null,
  evidence_attachment_id uuid references public.attachments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_onboarding_items_title_not_blank check (btrim(title) <> ''),
  constraint employee_onboarding_items_description_length check (
    description is null or length(description) <= 2000
  ),
  constraint employee_onboarding_items_category_check check (
    category in (
      'document',
      'training',
      'access',
      'uniform',
      'epi',
      'equipment',
      'policy',
      'operational_orientation',
      'manager_validation',
      'other'
    )
  ),
  constraint employee_onboarding_items_owner_area_check check (
    owner_area in (
      'RH',
      'GESTOR',
      'TI',
      'GOVERNANCA',
      'RECEPCAO',
      'COZINHA',
      'MANUTENCAO',
      'AB',
      'ADMINISTRATIVO'
    )
  ),
  constraint employee_onboarding_items_responsible_profile_format check (
    responsible_profile_code is null or responsible_profile_code ~ '^[A-Z0-9_]{2,40}$'
  ),
  constraint employee_onboarding_items_status_check check (
    status in ('pending', 'in_progress', 'completed', 'waived', 'blocked', 'cancelled')
  ),
  constraint employee_onboarding_items_completed_timestamp_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint employee_onboarding_items_completed_by_requires_date check (
    completed_by is null or completed_at is not null
  ),
  constraint employee_onboarding_items_notes_length check (
    notes is null or length(notes) <= 2000
  )
);

create unique index if not exists hr_onboarding_plans_active_scope_name_unique
  on public.hr_onboarding_plans (
    organization_id,
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(job_position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(admission_type, ''),
    upper(name)
  )
  where deleted_at is null;

create unique index if not exists employee_onboardings_employee_open_unique
  on public.employee_onboardings (employee_id)
  where deleted_at is null
    and status in ('not_started', 'in_progress');

create index if not exists hr_onboarding_plans_organization_idx on public.hr_onboarding_plans (organization_id);
create index if not exists hr_onboarding_plans_unit_idx on public.hr_onboarding_plans (unit_id);
create index if not exists hr_onboarding_plans_department_idx on public.hr_onboarding_plans (department_id);
create index if not exists hr_onboarding_plans_job_position_idx on public.hr_onboarding_plans (job_position_id);
create index if not exists hr_onboarding_plans_status_idx on public.hr_onboarding_plans (status);
create index if not exists hr_onboarding_plans_priority_idx on public.hr_onboarding_plans (priority);
create index if not exists hr_onboarding_plans_deleted_at_idx on public.hr_onboarding_plans (deleted_at);
create index if not exists hr_onboarding_plans_active_lookup_idx
  on public.hr_onboarding_plans (
    status,
    organization_id,
    unit_id,
    department_id,
    job_position_id,
    priority
  )
  where deleted_at is null;

create index if not exists hr_onboarding_plan_items_plan_idx on public.hr_onboarding_plan_items (plan_id);
create index if not exists hr_onboarding_plan_items_organization_idx on public.hr_onboarding_plan_items (organization_id);
create index if not exists hr_onboarding_plan_items_category_idx on public.hr_onboarding_plan_items (category);
create index if not exists hr_onboarding_plan_items_owner_area_idx on public.hr_onboarding_plan_items (owner_area);
create index if not exists hr_onboarding_plan_items_document_type_idx on public.hr_onboarding_plan_items (related_document_type_id);
create index if not exists hr_onboarding_plan_items_status_idx on public.hr_onboarding_plan_items (status);
create index if not exists hr_onboarding_plan_items_release_blocker_idx on public.hr_onboarding_plan_items (blocks_operational_release);
create index if not exists hr_onboarding_plan_items_critical_idx on public.hr_onboarding_plan_items (is_critical);
create index if not exists hr_onboarding_plan_items_deleted_at_idx on public.hr_onboarding_plan_items (deleted_at);
create index if not exists hr_onboarding_plan_items_order_idx
  on public.hr_onboarding_plan_items (plan_id, sort_order)
  where deleted_at is null;

create index if not exists employee_onboardings_organization_idx on public.employee_onboardings (organization_id);
create index if not exists employee_onboardings_unit_idx on public.employee_onboardings (unit_id);
create index if not exists employee_onboardings_employee_idx on public.employee_onboardings (employee_id);
create index if not exists employee_onboardings_plan_idx on public.employee_onboardings (plan_id);
create index if not exists employee_onboardings_status_idx on public.employee_onboardings (status);
create index if not exists employee_onboardings_release_status_idx on public.employee_onboardings (operational_release_status);
create index if not exists employee_onboardings_expected_release_idx on public.employee_onboardings (expected_release_at);
create index if not exists employee_onboardings_deleted_at_idx on public.employee_onboardings (deleted_at);

create index if not exists employee_onboarding_items_onboarding_idx on public.employee_onboarding_items (onboarding_id);
create index if not exists employee_onboarding_items_organization_idx on public.employee_onboarding_items (organization_id);
create index if not exists employee_onboarding_items_unit_idx on public.employee_onboarding_items (unit_id);
create index if not exists employee_onboarding_items_employee_idx on public.employee_onboarding_items (employee_id);
create index if not exists employee_onboarding_items_plan_item_idx on public.employee_onboarding_items (plan_item_id);
create index if not exists employee_onboarding_items_status_idx on public.employee_onboarding_items (status);
create index if not exists employee_onboarding_items_category_idx on public.employee_onboarding_items (category);
create index if not exists employee_onboarding_items_owner_area_idx on public.employee_onboarding_items (owner_area);
create index if not exists employee_onboarding_items_responsible_user_idx on public.employee_onboarding_items (responsible_user_id);
create index if not exists employee_onboarding_items_due_at_idx on public.employee_onboarding_items (due_at);
create index if not exists employee_onboarding_items_release_blocker_idx on public.employee_onboarding_items (blocks_operational_release);
create index if not exists employee_onboarding_items_critical_idx on public.employee_onboarding_items (is_critical);
create index if not exists employee_onboarding_items_document_type_idx on public.employee_onboarding_items (related_document_type_id);
create index if not exists employee_onboarding_items_employee_document_idx on public.employee_onboarding_items (related_employee_document_id);
create index if not exists employee_onboarding_items_attachment_idx on public.employee_onboarding_items (evidence_attachment_id);
create index if not exists employee_onboarding_items_deleted_at_idx on public.employee_onboarding_items (deleted_at);
create index if not exists employee_onboarding_items_open_due_idx
  on public.employee_onboarding_items (unit_id, due_at, status)
  where deleted_at is null
    and status in ('pending', 'in_progress', 'blocked');

alter table public.hr_onboarding_plans enable row level security;
alter table public.hr_onboarding_plan_items enable row level security;
alter table public.employee_onboardings enable row level security;
alter table public.employee_onboarding_items enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para onboarding RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_onboarding_plans',
    'hr_onboarding_plan_items',
    'employee_onboardings',
    'employee_onboarding_items'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de onboarding RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_onboarding_plans',
    'hr_onboarding_plan_items',
    'employee_onboardings',
    'employee_onboarding_items'
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

comment on table public.hr_onboarding_plans is
  'Planos operacionais de onboarding por organizacao, unidade, departamento, cargo e tipo de admissao. Nao substitui a workflow engine.';
comment on column public.hr_onboarding_plans.priority is
  'Prioridade de desempate entre planos aplicaveis. A especificidade do contexto deve prevalecer na aplicacao.';
comment on column public.hr_onboarding_plans.admission_type is
  'Tipo operacional de admissao para selecao futura de plano. Nao altera contratos de workflows de admissao.';

comment on table public.hr_onboarding_plan_items is
  'Itens padrao de um plano de onboarding operacional, usados para gerar tarefas reais do colaborador.';
comment on column public.hr_onboarding_plan_items.category is
  'Categoria operacional do item: document, training, access, uniform, epi, equipment, policy, operational_orientation, manager_validation ou other.';
comment on column public.hr_onboarding_plan_items.owner_area is
  'Area responsavel esperada pelo item operacional.';
comment on column public.hr_onboarding_plan_items.blocks_operational_release is
  'Indica se a pendencia do item deve bloquear a liberacao operacional do colaborador.';
comment on column public.hr_onboarding_plan_items.related_document_type_id is
  'Vinculo opcional com tipo documental de RH. Nao armazena arquivo e nao duplica employee_documents.';

comment on table public.employee_onboardings is
  'Execucao real do onboarding operacional de um colaborador, com status e liberacao operacional.';
comment on column public.employee_onboardings.operational_release_status is
  'Status operacional futuro de liberacao: blocked, partial, released ou critical_pending.';
comment on column public.employee_onboardings.blocked_reason is
  'Motivo operacional de bloqueio. Deve evitar dados pessoais excessivos e respeitar LGPD.';

comment on table public.employee_onboarding_items is
  'Itens reais do onboarding do colaborador, rastreaveis por responsavel, prazo, status e evidencias.';
comment on column public.employee_onboarding_items.related_employee_document_id is
  'Documento logico do colaborador vinculado ao item quando houver integracao documental.';
comment on column public.employee_onboarding_items.evidence_attachment_id is
  'Anexo de evidencia operacional opcional. Arquivos continuam centralizados em public.attachments.';
comment on column public.employee_onboarding_items.blocks_operational_release is
  'Indica se o item pendente bloqueia a liberacao operacional do colaborador.';
