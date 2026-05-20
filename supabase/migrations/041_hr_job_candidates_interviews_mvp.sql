-- RH-9.2C - Candidatos e entrevistas MVP.
-- Cria camada leve vinculada a solicitacao de vaga (job_opening).
-- Nao cria ATS completo, ranking automatico, IA, portal, upload, admissao, folha ou ponto.

create table if not exists public.hr_job_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  full_name text not null,
  phone text not null,
  source text not null,
  status text not null default 'novo',
  notes text,
  manual_score integer,
  human_opinion text,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_job_candidates_full_name_not_blank check (btrim(full_name) <> ''),
  constraint hr_job_candidates_phone_not_blank check (btrim(phone) <> ''),
  constraint hr_job_candidates_source_not_blank check (btrim(source) <> ''),
  constraint hr_job_candidates_status_check check (
    status in (
      'novo',
      'triagem',
      'entrevista',
      'aprovado',
      'banco_de_talentos',
      'reprovado',
      'desistiu'
    )
  ),
  constraint hr_job_candidates_manual_score_check check (
    manual_score is null or (manual_score >= 0 and manual_score <= 100)
  ),
  constraint hr_job_candidates_notes_size_check check (
    notes is null or length(notes) <= 1000
  ),
  constraint hr_job_candidates_human_opinion_size_check check (
    human_opinion is null or length(human_opinion) <= 2000
  )
);

create index if not exists hr_job_candidates_organization_idx
  on public.hr_job_candidates (organization_id);
create index if not exists hr_job_candidates_unit_idx
  on public.hr_job_candidates (unit_id);
create index if not exists hr_job_candidates_workflow_idx
  on public.hr_job_candidates (workflow_id);
create index if not exists hr_job_candidates_status_idx
  on public.hr_job_candidates (status);
create index if not exists hr_job_candidates_created_at_idx
  on public.hr_job_candidates (created_at);
create index if not exists hr_job_candidates_deleted_at_idx
  on public.hr_job_candidates (deleted_at);
create index if not exists hr_job_candidates_workflow_status_idx
  on public.hr_job_candidates (workflow_id, status)
  where deleted_at is null;

create table if not exists public.hr_candidate_interviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  candidate_id uuid not null references public.hr_job_candidates(id) on delete restrict,
  interviewer_user_id uuid references public.app_users(id) on delete set null,
  interview_at timestamptz not null,
  communication_score integer not null,
  posture_score integer not null,
  experience_score integer not null,
  availability_score integer not null,
  hospitality_profile_score integer not null,
  notes text,
  final_opinion text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_candidate_interviews_scores_check check (
    communication_score between 1 and 5
    and posture_score between 1 and 5
    and experience_score between 1 and 5
    and availability_score between 1 and 5
    and hospitality_profile_score between 1 and 5
  ),
  constraint hr_candidate_interviews_notes_size_check check (
    notes is null or length(notes) <= 2000
  ),
  constraint hr_candidate_interviews_final_opinion_check check (
    final_opinion in (
      'recomendado',
      'parcialmente_recomendado',
      'nao_recomendado'
    )
  )
);

create index if not exists hr_candidate_interviews_organization_idx
  on public.hr_candidate_interviews (organization_id);
create index if not exists hr_candidate_interviews_unit_idx
  on public.hr_candidate_interviews (unit_id);
create index if not exists hr_candidate_interviews_workflow_idx
  on public.hr_candidate_interviews (workflow_id);
create index if not exists hr_candidate_interviews_candidate_idx
  on public.hr_candidate_interviews (candidate_id);
create index if not exists hr_candidate_interviews_interviewer_idx
  on public.hr_candidate_interviews (interviewer_user_id);
create index if not exists hr_candidate_interviews_interview_at_idx
  on public.hr_candidate_interviews (interview_at);
create index if not exists hr_candidate_interviews_deleted_at_idx
  on public.hr_candidate_interviews (deleted_at);

alter table public.hr_job_candidates enable row level security;
alter table public.hr_candidate_interviews enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para candidatos RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_job_candidates',
    'hr_candidate_interviews'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de candidatos RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_job_candidates',
    'hr_candidate_interviews'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || table_name, table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_trail()',
      'audit_' || table_name, table_name
    );
  end loop;
end;
$$;

comment on table public.hr_job_candidates is
  'Candidatos leves vinculados a solicitacao de vaga. Nao representa admissao, colaborador, portal, curriculo, upload ou ATS completo.';
comment on column public.hr_job_candidates.workflow_id is
  'Workflow RH do tipo job_opening ao qual o candidato esta vinculado.';
comment on column public.hr_job_candidates.phone is
  'Telefone operacional para contato. Deve ser exibido apenas onde necessario.';
comment on column public.hr_job_candidates.manual_score is
  'Score manual informado por pessoa do RH. Nao e calculado automaticamente e nao deve ser usado como ranking decisorio.';
comment on column public.hr_job_candidates.human_opinion is
  'Parecer humano livre e operacional. Nao deve conter documentos, dados discriminatorios ou dados pessoais excessivos.';

comment on table public.hr_candidate_interviews is
  'Entrevistas simples de candidato para vaga. Registra avaliacao humana estruturada sem IA, ranking automatico ou decisao automatizada.';
comment on column public.hr_candidate_interviews.final_opinion is
  'Parecer final humano da entrevista: recomendado, parcialmente_recomendado ou nao_recomendado.';
comment on column public.hr_candidate_interviews.notes is
  'Observacoes operacionais da entrevista. Nao deve conter documentos, dados sensiveis ou dados discriminatorios.';
