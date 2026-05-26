-- RH-15B - Fundacao de avaliacoes de colaboradores e PDI.
-- Cria base estrutural minima para avaliacao de desempenho e desenvolvimento.
-- Nao cria UI, API, dashboard, disciplina, calculo salarial, workflow paralelo ou automacao.

create table if not exists public.hr_evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  job_position_id uuid references public.job_positions(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  evaluation_type text not null default 'periodic',
  status text not null default 'draft',
  scale_min integer not null default 1,
  scale_max integer not null default 5,
  passing_score numeric(6,2),
  requires_feedback boolean not null default true,
  requires_employee_acknowledgement boolean not null default true,
  default_frequency text,
  is_system_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_evaluation_templates_code_not_blank check (btrim(code) <> ''),
  constraint hr_evaluation_templates_code_format check (code ~ '^[A-Z0-9_-]{2,80}$'),
  constraint hr_evaluation_templates_name_not_blank check (btrim(name) <> ''),
  constraint hr_evaluation_templates_description_length check (description is null or length(description) <= 2000),
  constraint hr_evaluation_templates_type_check check (
    evaluation_type in ('experience', 'periodic', 'promotion', 'corrective', 'specific')
  ),
  constraint hr_evaluation_templates_status_check check (
    status in ('draft', 'active', 'inactive', 'archived')
  ),
  constraint hr_evaluation_templates_scale_check check (
    scale_min >= 0 and scale_max > scale_min
  ),
  constraint hr_evaluation_templates_passing_score_check check (
    passing_score is null or (passing_score >= scale_min and passing_score <= scale_max)
  ),
  constraint hr_evaluation_templates_frequency_check check (
    default_frequency is null or default_frequency in ('experience_45_days', 'experience_90_days', 'semiannual', 'annual', 'on_demand')
  ),
  constraint hr_evaluation_templates_unit_requires_org check (
    unit_id is null or organization_id is not null
  ),
  constraint hr_evaluation_templates_department_requires_scope check (
    department_id is null or organization_id is not null or unit_id is not null
  ),
  constraint hr_evaluation_templates_job_requires_scope check (
    job_position_id is null or organization_id is not null or unit_id is not null or department_id is not null
  ),
  constraint hr_evaluation_templates_system_scope_check check (
    is_system_default = false or (organization_id is null and unit_id is null and department_id is null and job_position_id is null)
  )
);

create table if not exists public.hr_evaluation_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.hr_evaluation_templates(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  weight numeric(8,3) not null default 1,
  sort_order integer not null default 0,
  applies_to_all boolean not null default true,
  is_required boolean not null default true,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_evaluation_template_sections_code_not_blank check (btrim(code) <> ''),
  constraint hr_evaluation_template_sections_code_format check (code ~ '^[A-Z0-9_-]{2,80}$'),
  constraint hr_evaluation_template_sections_title_not_blank check (btrim(title) <> ''),
  constraint hr_evaluation_template_sections_description_length check (description is null or length(description) <= 2000),
  constraint hr_evaluation_template_sections_weight_non_negative check (weight >= 0),
  constraint hr_evaluation_template_sections_sort_order_non_negative check (sort_order >= 0)
);

create table if not exists public.hr_evaluation_template_criteria (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.hr_evaluation_template_sections(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  expected_behavior text,
  weight numeric(8,3) not null default 1,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  is_critical boolean not null default false,
  requires_comment_below_score boolean not null default false,
  comment_required_score_threshold numeric(6,2),
  applies_to_job_position_id uuid references public.job_positions(id) on delete set null,
  applies_to_department_id uuid references public.departments(id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_evaluation_template_criteria_code_not_blank check (btrim(code) <> ''),
  constraint hr_evaluation_template_criteria_code_format check (code ~ '^[A-Z0-9_-]{2,80}$'),
  constraint hr_evaluation_template_criteria_title_not_blank check (btrim(title) <> ''),
  constraint hr_evaluation_template_criteria_description_length check (description is null or length(description) <= 2000),
  constraint hr_evaluation_template_criteria_expected_length check (expected_behavior is null or length(expected_behavior) <= 3000),
  constraint hr_evaluation_template_criteria_weight_non_negative check (weight >= 0),
  constraint hr_evaluation_template_criteria_sort_order_non_negative check (sort_order >= 0),
  constraint hr_evaluation_template_criteria_comment_threshold_check check (
    comment_required_score_threshold is null or comment_required_score_threshold >= 0
  ),
  constraint hr_evaluation_template_criteria_comment_threshold_required_check check (
    requires_comment_below_score = false or comment_required_score_threshold is not null
  )
);

create table if not exists public.employee_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  template_id uuid not null references public.hr_evaluation_templates(id) on delete restrict,
  evaluator_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_user_id uuid references public.app_users(id) on delete set null,
  period_start date not null,
  period_end date not null,
  evaluation_date date,
  feedback_date date,
  evaluation_type text not null,
  status text not null default 'draft',
  total_score numeric(8,3),
  weighted_score numeric(8,3),
  result_label text,
  result_level text,
  summary text,
  strengths text,
  development_points text,
  employee_comments text,
  employee_acknowledged_at timestamptz,
  reviewed_at timestamptz,
  closed_at timestamptz,
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_evaluations_period_range_check check (period_end >= period_start),
  constraint employee_evaluations_feedback_range_check check (feedback_date is null or evaluation_date is null or feedback_date >= evaluation_date),
  constraint employee_evaluations_type_check check (
    evaluation_type in ('experience', 'periodic', 'promotion', 'corrective', 'specific')
  ),
  constraint employee_evaluations_status_check check (
    status in ('draft', 'in_progress', 'submitted', 'reviewed', 'feedback_given', 'acknowledged', 'closed', 'cancelled')
  ),
  constraint employee_evaluations_result_level_check check (
    result_level is null or result_level in ('critical', 'below_expected', 'expected', 'above_expected', 'excellent')
  ),
  constraint employee_evaluations_score_non_negative check (
    (total_score is null or total_score >= 0) and (weighted_score is null or weighted_score >= 0)
  ),
  constraint employee_evaluations_result_label_length check (result_label is null or length(result_label) <= 120),
  constraint employee_evaluations_summary_length check (summary is null or length(summary) <= 5000),
  constraint employee_evaluations_strengths_length check (strengths is null or length(strengths) <= 5000),
  constraint employee_evaluations_development_points_length check (development_points is null or length(development_points) <= 5000),
  constraint employee_evaluations_employee_comments_length check (employee_comments is null or length(employee_comments) <= 5000),
  constraint employee_evaluations_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_evaluations_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint employee_evaluations_reviewed_status_check check (
    status not in ('reviewed', 'feedback_given', 'acknowledged', 'closed') or reviewed_at is not null
  ),
  constraint employee_evaluations_ack_status_check check (
    status <> 'acknowledged' or employee_acknowledged_at is not null
  ),
  constraint employee_evaluations_closed_status_check check (
    status <> 'closed' or closed_at is not null
  )
);

create table if not exists public.employee_evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.employee_evaluations(id) on delete restrict,
  criterion_id uuid not null references public.hr_evaluation_template_criteria(id) on delete restrict,
  section_id uuid not null references public.hr_evaluation_template_sections(id) on delete restrict,
  score numeric(6,2),
  is_not_applicable boolean not null default false,
  comment text,
  evidence_note text,
  weighted_score numeric(8,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_evaluation_scores_score_check check (
    (is_not_applicable = true and score is null)
    or (is_not_applicable = false and score is not null and score >= 0)
  ),
  constraint employee_evaluation_scores_weighted_non_negative check (
    weighted_score is null or weighted_score >= 0
  ),
  constraint employee_evaluation_scores_comment_length check (comment is null or length(comment) <= 3000),
  constraint employee_evaluation_scores_evidence_note_length check (evidence_note is null or length(evidence_note) <= 3000)
);

create table if not exists public.employee_development_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  evaluation_id uuid references public.employee_evaluations(id) on delete set null,
  title text not null,
  reason text,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  review_at timestamptz,
  closed_at timestamptz,
  responsible_user_id uuid references public.app_users(id) on delete set null,
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_development_plans_title_not_blank check (btrim(title) <> ''),
  constraint employee_development_plans_reason_length check (reason is null or length(reason) <= 3000),
  constraint employee_development_plans_status_check check (
    status in ('open', 'in_progress', 'under_review', 'completed', 'cancelled')
  ),
  constraint employee_development_plans_due_range_check check (due_at is null or due_at >= opened_at),
  constraint employee_development_plans_review_range_check check (review_at is null or review_at >= opened_at),
  constraint employee_development_plans_closed_range_check check (closed_at is null or closed_at >= opened_at),
  constraint employee_development_plans_completed_status_check check (
    status <> 'completed' or closed_at is not null
  ),
  constraint employee_development_plans_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_development_plans_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.employee_development_plan_items (
  id uuid primary key default gen_random_uuid(),
  development_plan_id uuid not null references public.employee_development_plans(id) on delete restrict,
  title text not null,
  description text,
  action_type text not null default 'other',
  due_at timestamptz,
  responsible_user_id uuid references public.app_users(id) on delete set null,
  status text not null default 'pending',
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_development_plan_items_title_not_blank check (btrim(title) <> ''),
  constraint employee_development_plan_items_description_length check (description is null or length(description) <= 3000),
  constraint employee_development_plan_items_action_type_check check (
    action_type in ('training', 'coaching', 'observation', 'procedure_review', 'operational_practice', 'other')
  ),
  constraint employee_development_plan_items_status_check check (
    status in ('pending', 'in_progress', 'completed', 'waived', 'overdue', 'cancelled')
  ),
  constraint employee_development_plan_items_completion_notes_length check (completion_notes is null or length(completion_notes) <= 3000),
  constraint employee_development_plan_items_completed_status_check check (
    status <> 'completed' or completed_at is not null
  )
);

create unique index if not exists hr_evaluation_templates_system_code_unique
  on public.hr_evaluation_templates (upper(code))
  where is_system_default = true
    and organization_id is null
    and unit_id is null
    and department_id is null
    and job_position_id is null
    and deleted_at is null;

create unique index if not exists hr_evaluation_templates_scope_code_unique
  on public.hr_evaluation_templates (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(job_position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(code)
  )
  where is_system_default = false
    and deleted_at is null;

create unique index if not exists hr_evaluation_template_sections_code_unique
  on public.hr_evaluation_template_sections (template_id, upper(code))
  where deleted_at is null;

create unique index if not exists hr_evaluation_template_criteria_code_unique
  on public.hr_evaluation_template_criteria (section_id, upper(code))
  where deleted_at is null;

create unique index if not exists employee_evaluation_scores_criterion_unique
  on public.employee_evaluation_scores (evaluation_id, criterion_id)
  where deleted_at is null;

create index if not exists hr_evaluation_templates_organization_idx on public.hr_evaluation_templates (organization_id);
create index if not exists hr_evaluation_templates_unit_idx on public.hr_evaluation_templates (unit_id);
create index if not exists hr_evaluation_templates_department_idx on public.hr_evaluation_templates (department_id);
create index if not exists hr_evaluation_templates_job_position_idx on public.hr_evaluation_templates (job_position_id);
create index if not exists hr_evaluation_templates_status_idx on public.hr_evaluation_templates (status);
create index if not exists hr_evaluation_templates_type_idx on public.hr_evaluation_templates (evaluation_type);
create index if not exists hr_evaluation_templates_deleted_at_idx on public.hr_evaluation_templates (deleted_at);

create index if not exists hr_evaluation_template_sections_template_idx on public.hr_evaluation_template_sections (template_id);
create index if not exists hr_evaluation_template_sections_status_idx on public.hr_evaluation_template_sections (status);
create index if not exists hr_evaluation_template_sections_order_idx on public.hr_evaluation_template_sections (template_id, sort_order) where deleted_at is null;
create index if not exists hr_evaluation_template_sections_deleted_at_idx on public.hr_evaluation_template_sections (deleted_at);

create index if not exists hr_evaluation_template_criteria_section_idx on public.hr_evaluation_template_criteria (section_id);
create index if not exists hr_evaluation_template_criteria_job_position_idx on public.hr_evaluation_template_criteria (applies_to_job_position_id);
create index if not exists hr_evaluation_template_criteria_department_idx on public.hr_evaluation_template_criteria (applies_to_department_id);
create index if not exists hr_evaluation_template_criteria_status_idx on public.hr_evaluation_template_criteria (status);
create index if not exists hr_evaluation_template_criteria_order_idx on public.hr_evaluation_template_criteria (section_id, sort_order) where deleted_at is null;
create index if not exists hr_evaluation_template_criteria_deleted_at_idx on public.hr_evaluation_template_criteria (deleted_at);

create index if not exists employee_evaluations_organization_idx on public.employee_evaluations (organization_id);
create index if not exists employee_evaluations_unit_idx on public.employee_evaluations (unit_id);
create index if not exists employee_evaluations_employee_idx on public.employee_evaluations (employee_id);
create index if not exists employee_evaluations_template_idx on public.employee_evaluations (template_id);
create index if not exists employee_evaluations_evaluator_idx on public.employee_evaluations (evaluator_user_id);
create index if not exists employee_evaluations_reviewer_idx on public.employee_evaluations (reviewer_user_id);
create index if not exists employee_evaluations_status_idx on public.employee_evaluations (status);
create index if not exists employee_evaluations_type_idx on public.employee_evaluations (evaluation_type);
create index if not exists employee_evaluations_period_idx on public.employee_evaluations (period_start, period_end);
create index if not exists employee_evaluations_feedback_date_idx on public.employee_evaluations (feedback_date);
create index if not exists employee_evaluations_result_level_idx on public.employee_evaluations (result_level);
create index if not exists employee_evaluations_sensitive_idx on public.employee_evaluations (is_sensitive);
create index if not exists employee_evaluations_deleted_at_idx on public.employee_evaluations (deleted_at);

create index if not exists employee_evaluation_scores_evaluation_idx on public.employee_evaluation_scores (evaluation_id);
create index if not exists employee_evaluation_scores_criterion_idx on public.employee_evaluation_scores (criterion_id);
create index if not exists employee_evaluation_scores_section_idx on public.employee_evaluation_scores (section_id);
create index if not exists employee_evaluation_scores_deleted_at_idx on public.employee_evaluation_scores (deleted_at);

create index if not exists employee_development_plans_organization_idx on public.employee_development_plans (organization_id);
create index if not exists employee_development_plans_unit_idx on public.employee_development_plans (unit_id);
create index if not exists employee_development_plans_employee_idx on public.employee_development_plans (employee_id);
create index if not exists employee_development_plans_evaluation_idx on public.employee_development_plans (evaluation_id);
create index if not exists employee_development_plans_responsible_idx on public.employee_development_plans (responsible_user_id);
create index if not exists employee_development_plans_status_idx on public.employee_development_plans (status);
create index if not exists employee_development_plans_due_at_idx on public.employee_development_plans (due_at);
create index if not exists employee_development_plans_review_at_idx on public.employee_development_plans (review_at);
create index if not exists employee_development_plans_sensitive_idx on public.employee_development_plans (is_sensitive);
create index if not exists employee_development_plans_deleted_at_idx on public.employee_development_plans (deleted_at);

create index if not exists employee_development_plan_items_plan_idx on public.employee_development_plan_items (development_plan_id);
create index if not exists employee_development_plan_items_responsible_idx on public.employee_development_plan_items (responsible_user_id);
create index if not exists employee_development_plan_items_status_idx on public.employee_development_plan_items (status);
create index if not exists employee_development_plan_items_action_type_idx on public.employee_development_plan_items (action_type);
create index if not exists employee_development_plan_items_due_at_idx on public.employee_development_plan_items (due_at);
create index if not exists employee_development_plan_items_deleted_at_idx on public.employee_development_plan_items (deleted_at);

alter table public.hr_evaluation_templates enable row level security;
alter table public.hr_evaluation_template_sections enable row level security;
alter table public.hr_evaluation_template_criteria enable row level security;
alter table public.employee_evaluations enable row level security;
alter table public.employee_evaluation_scores enable row level security;
alter table public.employee_development_plans enable row level security;
alter table public.employee_development_plan_items enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para avaliacoes RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_evaluation_templates',
    'hr_evaluation_template_sections',
    'hr_evaluation_template_criteria',
    'employee_evaluations',
    'employee_evaluation_scores',
    'employee_development_plans',
    'employee_development_plan_items'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de avaliacoes RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_evaluation_templates',
    'hr_evaluation_template_sections',
    'hr_evaluation_template_criteria',
    'employee_evaluations',
    'employee_evaluation_scores',
    'employee_development_plans',
    'employee_development_plan_items'
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

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'evaluations.view', 'Visualizar avaliacoes de RH', 'Permite consultar avaliacoes de desempenho de colaboradores conforme escopo de unidade.'),
  ('HR', 'evaluations.manage', 'Gerenciar avaliacoes de RH', 'Permite criar e editar avaliacoes de desempenho e seus registros operacionais.'),
  ('HR', 'evaluations.review', 'Revisar avaliacoes de RH', 'Permite revisar, validar devolutivas e concluir avaliacoes de desempenho.'),
  ('HR', 'evaluations.sensitive.view', 'Visualizar avaliacoes sensiveis de RH', 'Permite consultar conteudo sensivel de avaliacoes e devolutivas de colaboradores.'),
  ('HR', 'development.manage', 'Gerenciar PDI de RH', 'Permite criar e acompanhar planos de desenvolvimento individual de colaboradores.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

with super_admin_profile as (
  select id
  from public.access_profiles
  where code = 'SUPER_ADMIN'
    and status = 'active'
    and deleted_at is null
  limit 1
), evaluation_permissions as (
  select id
  from public.permissions
  where code in (
    'HR:evaluations.view',
    'HR:evaluations.manage',
    'HR:evaluations.review',
    'HR:evaluations.sensitive.view',
    'HR:development.manage'
  )
    and status = 'active'
    and deleted_at is null
)
insert into public.profile_permissions (access_profile_id, permission_id, is_allowed, status)
select
  super_admin_profile.id,
  evaluation_permissions.id,
  true,
  'active'
from super_admin_profile
cross join evaluation_permissions
on conflict (access_profile_id, permission_id) do update set
  is_allowed = true,
  status = 'active',
  deleted_at = null,
  deleted_by = null,
  updated_at = now();

comment on table public.hr_evaluation_templates is
  'Modelos de avaliacao de desempenho de colaboradores. Dominio separado de scorecards de candidatos, disciplina e folha.';
comment on column public.hr_evaluation_templates.evaluation_type is
  'Tipo de avaliacao: experience, periodic, promotion, corrective ou specific. Apoia decisao humana e nao gera promocao automatica.';
comment on column public.hr_evaluation_templates.passing_score is
  'Nota de referencia para apoio operacional. Nao deve ser usada isoladamente para punicao, promocao ou movimentacao salarial automatica.';

comment on table public.hr_evaluation_template_sections is
  'Secoes de um modelo de avaliacao, como competencias, tecnica, postura, atendimento ou lideranca.';
comment on table public.hr_evaluation_template_criteria is
  'Criterios avaliaveis do template. Permitem peso, criticidade, regra futura de comentario e aplicacao por cargo ou departamento.';

comment on table public.employee_evaluations is
  'Avaliacao real aplicada a um colaborador. Sensivel por padrao, com devolutiva e ciencia futuras. Nao representa advertencia ou punicao automatica.';
comment on column public.employee_evaluations.result_level is
  'Classificacao operacional de apoio: critical, below_expected, expected, above_expected ou excellent.';
comment on column public.employee_evaluations.employee_acknowledged_at is
  'Registro futuro de ciencia do colaborador. Nao implementa assinatura digital nesta etapa.';
comment on column public.employee_evaluations.metadata is
  'Metadados administrativos seguros. Nao deve conter salario, dados medicos, documentos pessoais, URLs assinadas ou paths de storage.';

comment on table public.employee_evaluation_scores is
  'Notas e respostas humanas por criterio da avaliacao. Criterios podem ser marcados como nao aplicaveis.';
comment on column public.employee_evaluation_scores.evidence_note is
  'Nota textual sobre evidencia observada, sem anexar arquivo ou expor dados sensiveis desnecessarios.';

comment on table public.employee_development_plans is
  'Plano de desenvolvimento individual vinculado a colaborador e opcionalmente a avaliacao. PDI nao e advertencia.';
comment on table public.employee_development_plan_items is
  'Itens de acao do PDI, com prazo, responsavel, status e anotacao de conclusao.';
comment on column public.employee_development_plan_items.action_type is
  'Tipo de acao de desenvolvimento: training, coaching, observation, procedure_review, operational_practice ou other.';
