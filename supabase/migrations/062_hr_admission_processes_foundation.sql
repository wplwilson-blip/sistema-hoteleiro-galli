-- RH-32A - Foundation de admissao persistente.
-- Cria processo admissional proprio e checklist persistente minimo.
-- Nao gera documentos, treinamentos, ASO, EPIs, alertas, onboarding, employee,
-- folha, eSocial, calculos, valores financeiros ou contabilidade.

create table if not exists public.hr_admission_processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  source_job_opening_workflow_id uuid references public.hr_workflows(id) on delete restrict,
  source_candidate_id uuid references public.hr_job_candidates(id) on delete restrict,
  admission_workflow_id uuid references public.hr_workflows(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  job_position_id uuid references public.job_positions(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  job_title text,
  cbo_code text,
  department_name text,
  status text not null default 'draft',
  current_step text not null default 'draft',
  expected_start_date date,
  documents_status text not null default 'not_started',
  accounting_status text not null default 'not_started',
  registration_status text not null default 'not_started',
  occupational_health_status text not null default 'not_started',
  uniform_status text not null default 'not_started',
  onboarding_status text not null default 'not_started',
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_admission_processes_status_check check (
    status in (
      'draft',
      'documents_requested',
      'documents_under_review',
      'sent_to_accounting',
      'registration_pending',
      'registered',
      'onboarding_ready',
      'completed',
      'cancelled'
    )
  ),
  constraint hr_admission_processes_current_step_check check (
    current_step in (
      'draft',
      'documents_requested',
      'documents_under_review',
      'sent_to_accounting',
      'registration_pending',
      'registered',
      'onboarding_ready',
      'completed',
      'cancelled'
    )
  ),
  constraint hr_admission_processes_documents_status_check check (
    documents_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_accounting_status_check check (
    accounting_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_registration_status_check check (
    registration_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_occupational_status_check check (
    occupational_health_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_uniform_status_check check (
    uniform_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_onboarding_status_check check (
    onboarding_status in ('not_started', 'pending', 'in_progress', 'completed', 'blocked', 'waived', 'cancelled')
  ),
  constraint hr_admission_processes_job_title_length check (
    job_title is null or length(job_title) <= 180
  ),
  constraint hr_admission_processes_cbo_code_format check (
    cbo_code is null or cbo_code ~ '^[0-9A-Za-z_.-]{2,20}$'
  ),
  constraint hr_admission_processes_department_name_length check (
    department_name is null or length(department_name) <= 180
  ),
  constraint hr_admission_processes_notes_length check (
    notes is null or length(notes) <= 2000
  ),
  constraint hr_admission_processes_text_safe_check check (
    coalesce(job_title, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(cbo_code, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(department_name, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(notes, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
  )
);

create table if not exists public.hr_admission_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  admission_process_id uuid not null references public.hr_admission_processes(id) on delete cascade,
  item_type text not null,
  item_key text not null,
  title text not null,
  description text,
  requirement_level text not null default 'required',
  status text not null default 'pending',
  is_required boolean not null default true,
  blocks_activation boolean not null default false,
  source_requirement_key text,
  source_rule_group text,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.app_users(id) on delete set null,
  waived_at timestamptz,
  waived_by uuid references public.app_users(id) on delete set null,
  waiver_reason text,
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_admission_checklist_items_type_check check (
    item_type in (
      'document',
      'occupational_health',
      'training',
      'uniform',
      'epi',
      'onboarding',
      'accounting',
      'registration',
      'sst_confirmation',
      'general'
    )
  ),
  constraint hr_admission_checklist_items_requirement_level_check check (
    requirement_level in ('required', 'recommended', 'confirm_with_sst', 'conditional')
  ),
  constraint hr_admission_checklist_items_status_check check (
    status in (
      'pending',
      'requested',
      'received',
      'under_review',
      'approved',
      'rejected',
      'waived',
      'completed',
      'not_applicable',
      'cancelled'
    )
  ),
  constraint hr_admission_checklist_items_key_format check (
    item_key ~ '^[a-z0-9_.:-]{2,120}$'
  ),
  constraint hr_admission_checklist_items_title_not_blank check (btrim(title) <> ''),
  constraint hr_admission_checklist_items_title_length check (length(title) <= 180),
  constraint hr_admission_checklist_items_description_length check (
    description is null or length(description) <= 2000
  ),
  constraint hr_admission_checklist_items_source_key_length check (
    source_requirement_key is null or length(source_requirement_key) <= 140
  ),
  constraint hr_admission_checklist_items_source_group_length check (
    source_rule_group is null or length(source_rule_group) <= 80
  ),
  constraint hr_admission_checklist_items_waiver_reason_length check (
    waiver_reason is null or length(waiver_reason) <= 1000
  ),
  constraint hr_admission_checklist_items_notes_length check (
    notes is null or length(notes) <= 2000
  ),
  constraint hr_admission_checklist_items_sort_order_check check (sort_order >= 0),
  constraint hr_admission_checklist_items_completed_status_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint hr_admission_checklist_items_completed_by_requires_date check (
    completed_by is null or completed_at is not null
  ),
  constraint hr_admission_checklist_items_waived_status_check check (
    status <> 'waived' or waived_at is not null
  ),
  constraint hr_admission_checklist_items_waived_by_requires_date check (
    waived_by is null or waived_at is not null
  ),
  constraint hr_admission_checklist_items_text_safe_check check (
    item_key !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and title !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(description, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(source_requirement_key, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(source_rule_group, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(waiver_reason, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
    and coalesce(notes, '') !~* '(cpf|rg|ctps|pis|salario|salário|salary|folha|esocial|calculo|cálculo|financeiro|valor|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url)'
  )
);

create unique index if not exists hr_admission_processes_candidate_active_unique
  on public.hr_admission_processes (source_candidate_id)
  where source_candidate_id is not null
    and deleted_at is null;

create unique index if not exists hr_admission_processes_admission_workflow_active_unique
  on public.hr_admission_processes (admission_workflow_id)
  where admission_workflow_id is not null
    and deleted_at is null;

create unique index if not exists hr_admission_checklist_items_process_key_active_unique
  on public.hr_admission_checklist_items (admission_process_id, item_key)
  where deleted_at is null;

create index if not exists hr_admission_processes_organization_idx on public.hr_admission_processes (organization_id);
create index if not exists hr_admission_processes_unit_idx on public.hr_admission_processes (unit_id);
create index if not exists hr_admission_processes_source_candidate_idx on public.hr_admission_processes (source_candidate_id);
create index if not exists hr_admission_processes_source_job_opening_idx on public.hr_admission_processes (source_job_opening_workflow_id);
create index if not exists hr_admission_processes_admission_workflow_idx on public.hr_admission_processes (admission_workflow_id);
create index if not exists hr_admission_processes_employee_idx on public.hr_admission_processes (employee_id);
create index if not exists hr_admission_processes_job_position_idx on public.hr_admission_processes (job_position_id);
create index if not exists hr_admission_processes_department_idx on public.hr_admission_processes (department_id);
create index if not exists hr_admission_processes_status_idx on public.hr_admission_processes (status);
create index if not exists hr_admission_processes_current_step_idx on public.hr_admission_processes (current_step);
create index if not exists hr_admission_processes_expected_start_idx on public.hr_admission_processes (expected_start_date);
create index if not exists hr_admission_processes_deleted_at_idx on public.hr_admission_processes (deleted_at);
create index if not exists hr_admission_processes_unit_status_idx
  on public.hr_admission_processes (unit_id, status, expected_start_date)
  where deleted_at is null;

create index if not exists hr_admission_checklist_items_organization_idx on public.hr_admission_checklist_items (organization_id);
create index if not exists hr_admission_checklist_items_unit_idx on public.hr_admission_checklist_items (unit_id);
create index if not exists hr_admission_checklist_items_process_idx on public.hr_admission_checklist_items (admission_process_id);
create index if not exists hr_admission_checklist_items_type_idx on public.hr_admission_checklist_items (item_type);
create index if not exists hr_admission_checklist_items_level_idx on public.hr_admission_checklist_items (requirement_level);
create index if not exists hr_admission_checklist_items_status_idx on public.hr_admission_checklist_items (status);
create index if not exists hr_admission_checklist_items_due_at_idx on public.hr_admission_checklist_items (due_at);
create index if not exists hr_admission_checklist_items_blocks_activation_idx on public.hr_admission_checklist_items (blocks_activation);
create index if not exists hr_admission_checklist_items_deleted_at_idx on public.hr_admission_checklist_items (deleted_at);
create index if not exists hr_admission_checklist_items_process_order_idx
  on public.hr_admission_checklist_items (admission_process_id, sort_order, created_at)
  where deleted_at is null;

alter table public.hr_admission_processes enable row level security;
alter table public.hr_admission_checklist_items enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para admissao persistente.';
    return;
  end if;

  foreach table_name in array array[
    'hr_admission_processes',
    'hr_admission_checklist_items'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de admissao persistente devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_admission_processes',
    'hr_admission_checklist_items'
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

comment on table public.hr_admission_processes is
  'Processo admissional persistente proprio, vinculado a candidato, vaga/workflow e futuro colaborador. Foundation sem geracao automatica de documentos, treinamentos, ASO, EPIs, onboarding, folha, eSocial ou valores.';
comment on column public.hr_admission_processes.employee_id is
  'Nullable porque a admissao comeca antes de existir colaborador ativo.';
comment on column public.hr_admission_processes.admission_workflow_id is
  'Workflow RH do tipo admission usado no fluxo visual atual. Esta tabela nao substitui hr_workflows.';
comment on column public.hr_admission_processes.accounting_status is
  'Status administrativo de envio/retorno cadastral. Nao representa folha, eSocial, calculo, salario, valores ou contabilidade financeira.';
comment on column public.hr_admission_processes.uniform_status is
  'Status operacional futuro de uniforme, separado de EPI tecnico.';

comment on table public.hr_admission_checklist_items is
  'Checklist admissional persistente minimo por processo. RH-32A nao cria itens automaticamente e nao bloqueia ativacao.';
comment on column public.hr_admission_checklist_items.blocks_activation is
  'Campo de foundation para bloqueio futuro. Nao deve ser aplicado por regra real nesta etapa.';
comment on column public.hr_admission_checklist_items.item_type is
  'Tipo operacional do item: document, occupational_health, training, uniform, epi, onboarding, accounting, registration, sst_confirmation ou general.';
comment on column public.hr_admission_checklist_items.requirement_level is
  'Nivel vindo da matriz de regras quando houver integracao futura: required, recommended, confirm_with_sst ou conditional.';
