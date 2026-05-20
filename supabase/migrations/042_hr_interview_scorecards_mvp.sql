-- RH-9.2D - Scorecards estruturados de entrevista.
-- Adiciona templates, perguntas e respostas vinculadas a entrevistas de candidatos.
-- Nao cria IA, ranking automatico, reprovação automatica, OCR, parsing ou decisao automatizada.

create table if not exists public.hr_scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  status public.record_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_scorecard_templates_code_not_blank check (btrim(code) <> ''),
  constraint hr_scorecard_templates_code_format check (code ~ '^[A-Z0-9_-]{2,80}$'),
  constraint hr_scorecard_templates_name_not_blank check (btrim(name) <> ''),
  constraint hr_scorecard_templates_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint hr_scorecard_templates_unit_requires_org_check check (
    unit_id is null or organization_id is not null
  )
);

create unique index if not exists hr_scorecard_templates_scope_code_active_unique
  on public.hr_scorecard_templates (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(code)
  )
  where deleted_at is null;

create table if not exists public.hr_scorecard_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.hr_scorecard_templates(id) on delete restrict,
  question_text text not null,
  category text not null,
  weight numeric(6,2) not null default 1,
  is_required boolean not null default true,
  order_index integer not null,
  status public.record_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_scorecard_questions_text_not_blank check (btrim(question_text) <> ''),
  constraint hr_scorecard_questions_category_not_blank check (btrim(category) <> ''),
  constraint hr_scorecard_questions_weight_positive check (weight > 0 and weight <= 10),
  constraint hr_scorecard_questions_order_positive check (order_index > 0),
  constraint hr_scorecard_questions_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists hr_scorecard_questions_template_order_active_unique
  on public.hr_scorecard_questions (template_id, order_index)
  where deleted_at is null;

create table if not exists public.hr_interview_scorecards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  candidate_id uuid not null references public.hr_job_candidates(id) on delete restrict,
  interview_id uuid not null references public.hr_candidate_interviews(id) on delete restrict,
  template_id uuid not null references public.hr_scorecard_templates(id) on delete restrict,
  total_score numeric(5,2) not null default 0,
  final_opinion text not null,
  human_opinion text,
  evaluated_by uuid references public.app_users(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  status public.record_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_interview_scorecards_score_check check (total_score >= 0 and total_score <= 5),
  constraint hr_interview_scorecards_final_opinion_check check (
    final_opinion in (
      'recomendado',
      'parcialmente_recomendado',
      'nao_recomendado'
    )
  ),
  constraint hr_interview_scorecards_human_opinion_size_check check (
    human_opinion is null or length(human_opinion) <= 2000
  ),
  constraint hr_interview_scorecards_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists hr_interview_scorecards_interview_active_unique
  on public.hr_interview_scorecards (interview_id)
  where deleted_at is null;

create table if not exists public.hr_interview_scorecard_responses (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.hr_interview_scorecards(id) on delete restrict,
  question_id uuid not null references public.hr_scorecard_questions(id) on delete restrict,
  category text not null,
  weight numeric(6,2) not null default 1,
  score integer not null,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_interview_scorecard_responses_category_not_blank check (btrim(category) <> ''),
  constraint hr_interview_scorecard_responses_weight_positive check (weight > 0 and weight <= 10),
  constraint hr_interview_scorecard_responses_score_check check (score between 1 and 5),
  constraint hr_interview_scorecard_responses_observation_size_check check (
    observation is null or length(observation) <= 1000
  )
);

create unique index if not exists hr_interview_scorecard_responses_unique_question_active
  on public.hr_interview_scorecard_responses (scorecard_id, question_id)
  where deleted_at is null;

create index if not exists hr_scorecard_templates_status_idx on public.hr_scorecard_templates (status);
create index if not exists hr_scorecard_templates_deleted_at_idx on public.hr_scorecard_templates (deleted_at);
create index if not exists hr_scorecard_questions_template_idx on public.hr_scorecard_questions (template_id);
create index if not exists hr_scorecard_questions_deleted_at_idx on public.hr_scorecard_questions (deleted_at);
create index if not exists hr_interview_scorecards_workflow_idx on public.hr_interview_scorecards (workflow_id);
create index if not exists hr_interview_scorecards_candidate_idx on public.hr_interview_scorecards (candidate_id);
create index if not exists hr_interview_scorecards_interview_idx on public.hr_interview_scorecards (interview_id);
create index if not exists hr_interview_scorecards_template_idx on public.hr_interview_scorecards (template_id);
create index if not exists hr_interview_scorecards_deleted_at_idx on public.hr_interview_scorecards (deleted_at);
create index if not exists hr_interview_scorecard_responses_scorecard_idx on public.hr_interview_scorecard_responses (scorecard_id);
create index if not exists hr_interview_scorecard_responses_question_idx on public.hr_interview_scorecard_responses (question_id);
create index if not exists hr_interview_scorecard_responses_deleted_at_idx on public.hr_interview_scorecard_responses (deleted_at);

alter table public.hr_scorecard_templates enable row level security;
alter table public.hr_scorecard_questions enable row level security;
alter table public.hr_interview_scorecards enable row level security;
alter table public.hr_interview_scorecard_responses enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para scorecards RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_scorecard_templates',
    'hr_scorecard_questions',
    'hr_interview_scorecards',
    'hr_interview_scorecard_responses'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de scorecards RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_scorecard_templates',
    'hr_scorecard_questions',
    'hr_interview_scorecards',
    'hr_interview_scorecard_responses'
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

with template_seed(code, name, description) as (
  values
    ('RECEPCAO', 'Recepcao', 'Scorecard operacional para candidatos de recepcao.'),
    ('GOVERNANCA', 'Governanca', 'Scorecard operacional para governanca.'),
    ('MANUTENCAO', 'Manutencao', 'Scorecard operacional para manutencao.'),
    ('COZINHA', 'Cozinha', 'Scorecard operacional para cozinha.'),
    ('ADMINISTRATIVO', 'Administrativo', 'Scorecard operacional para administrativo.'),
    ('RH', 'RH', 'Scorecard operacional para RH.')
)
insert into public.hr_scorecard_templates (
  code,
  name,
  description,
  is_system,
  metadata
)
select
  template_seed.code,
  template_seed.name,
  template_seed.description,
  true,
  '{"source":"rh_9_2d","mvp":true}'::jsonb
from template_seed
where not exists (
  select 1
  from public.hr_scorecard_templates existing
  where existing.organization_id is null
    and existing.unit_id is null
    and upper(existing.code) = template_seed.code
    and existing.deleted_at is null
);

with question_seed(template_code, question_text, category, weight, is_required, order_index) as (
  values
    ('RECEPCAO', 'Comunicacao clara com hospedes e equipe', 'Comunicacao', 1.20, true, 1),
    ('RECEPCAO', 'Postura profissional e cordialidade', 'Postura', 1.00, true, 2),
    ('RECEPCAO', 'Conhecimento basico de informatica', 'Tecnica', 1.00, true, 3),
    ('RECEPCAO', 'Atendimento ao cliente', 'Atendimento', 1.30, true, 4),
    ('RECEPCAO', 'Disponibilidade de horarios', 'Disponibilidade', 1.00, true, 5),
    ('RECEPCAO', 'Ingles ou segundo idioma', 'Idioma', 0.80, false, 6),
    ('RECEPCAO', 'Resolucao de conflitos', 'Comportamental', 1.00, true, 7),
    ('GOVERNANCA', 'Organizacao no trabalho', 'Organizacao', 1.20, true, 1),
    ('GOVERNANCA', 'Atencao a detalhes', 'Qualidade', 1.30, true, 2),
    ('GOVERNANCA', 'Agilidade com padrao de qualidade', 'Produtividade', 1.00, true, 3),
    ('GOVERNANCA', 'Disciplina e cumprimento de rotinas', 'Postura', 1.00, true, 4),
    ('GOVERNANCA', 'Disponibilidade de horario', 'Disponibilidade', 1.00, true, 5),
    ('MANUTENCAO', 'Experiencia tecnica geral', 'Tecnica', 1.30, true, 1),
    ('MANUTENCAO', 'Conhecimento de eletrica', 'Tecnica', 1.00, false, 2),
    ('MANUTENCAO', 'Conhecimento de hidraulica', 'Tecnica', 1.00, false, 3),
    ('MANUTENCAO', 'Capacidade de improviso seguro', 'Resolucao', 1.00, true, 4),
    ('MANUTENCAO', 'Responsabilidade com prazos e seguranca', 'Postura', 1.20, true, 5),
    ('COZINHA', 'Organizacao e higiene operacional', 'Organizacao', 1.30, true, 1),
    ('COZINHA', 'Experiencia na funcao', 'Tecnica', 1.20, true, 2),
    ('COZINHA', 'Agilidade em rotina de cozinha', 'Produtividade', 1.00, true, 3),
    ('COZINHA', 'Trabalho em equipe', 'Comportamental', 1.00, true, 4),
    ('COZINHA', 'Disponibilidade de horarios', 'Disponibilidade', 1.00, true, 5),
    ('ADMINISTRATIVO', 'Organizacao documental e operacional', 'Organizacao', 1.20, true, 1),
    ('ADMINISTRATIVO', 'Comunicacao escrita e verbal', 'Comunicacao', 1.00, true, 2),
    ('ADMINISTRATIVO', 'Atencao a prazos', 'Qualidade', 1.00, true, 3),
    ('ADMINISTRATIVO', 'Conhecimento de ferramentas administrativas', 'Tecnica', 1.00, true, 4),
    ('ADMINISTRATIVO', 'Postura profissional', 'Postura', 1.00, true, 5),
    ('RH', 'Escuta e comunicacao com colaboradores', 'Comunicacao', 1.20, true, 1),
    ('RH', 'Organizacao de processos de RH', 'Organizacao', 1.00, true, 2),
    ('RH', 'Cuidado com confidencialidade', 'Compliance', 1.30, true, 3),
    ('RH', 'Atendimento interno', 'Atendimento', 1.00, true, 4),
    ('RH', 'Postura profissional', 'Postura', 1.00, true, 5)
)
insert into public.hr_scorecard_questions (
  template_id,
  question_text,
  category,
  weight,
  is_required,
  order_index,
  metadata
)
select
  template.id,
  question_seed.question_text,
  question_seed.category,
  question_seed.weight,
  question_seed.is_required,
  question_seed.order_index,
  '{"source":"rh_9_2d","mvp":true}'::jsonb
from question_seed
join public.hr_scorecard_templates template
  on template.organization_id is null
 and template.unit_id is null
 and upper(template.code) = question_seed.template_code
 and template.deleted_at is null
where not exists (
  select 1
  from public.hr_scorecard_questions existing
  where existing.template_id = template.id
    and existing.order_index = question_seed.order_index
    and existing.deleted_at is null
);

comment on table public.hr_scorecard_templates is
  'Templates de scorecard estruturado para entrevista. Organizam criterios sem decisao automatica, IA ou ranking.';
comment on table public.hr_scorecard_questions is
  'Perguntas do scorecard com categoria, peso e obrigatoriedade. Devem evitar criterios discriminatorios ou sensiveis.';
comment on table public.hr_interview_scorecards is
  'Avaliacao estruturada vinculada a entrevista do candidato. O score e calculo matematico de apoio e a decisao permanece humana.';
comment on table public.hr_interview_scorecard_responses is
  'Respostas e notas humanas por pergunta do scorecard. Nao deve conter dados medicos, discriminatorios, religiosos ou politicos.';
comment on column public.hr_interview_scorecards.total_score is
  'Media ponderada das notas humanas de 1 a 5. Nao e ranking automatico nem criterio eliminatorio automatico.';
comment on column public.hr_interview_scorecards.final_opinion is
  'Parecer final humano: recomendado, parcialmente_recomendado ou nao_recomendado.';
