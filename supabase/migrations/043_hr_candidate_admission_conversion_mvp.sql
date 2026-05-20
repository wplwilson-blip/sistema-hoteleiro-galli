-- RH-9.2E - Conversao candidato para admissao.
-- Cria vinculo leve entre candidato aprovado e workflow admission.
-- Nao cria employee, salario, folha, ponto, IA, ranking ou decisao automatica.

create table if not exists public.hr_candidate_admission_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  source_job_opening_workflow_id uuid not null references public.hr_workflows(id) on delete restrict,
  candidate_id uuid not null references public.hr_job_candidates(id) on delete restrict,
  admission_workflow_id uuid references public.hr_workflows(id) on delete restrict,
  status text not null default 'processing',
  error_message text,
  converted_at timestamptz,
  converted_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_candidate_admission_conversions_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint hr_candidate_admission_conversions_error_size_check check (
    error_message is null or length(error_message) <= 500
  )
);

create unique index if not exists hr_candidate_admission_conversions_candidate_active_unique
  on public.hr_candidate_admission_conversions (candidate_id)
  where deleted_at is null;

create unique index if not exists hr_candidate_admission_conversions_admission_active_unique
  on public.hr_candidate_admission_conversions (admission_workflow_id)
  where admission_workflow_id is not null
    and deleted_at is null;

create index if not exists hr_candidate_admission_conversions_workflow_idx
  on public.hr_candidate_admission_conversions (source_job_opening_workflow_id);

create index if not exists hr_candidate_admission_conversions_status_idx
  on public.hr_candidate_admission_conversions (status);

create index if not exists hr_candidate_admission_conversions_deleted_at_idx
  on public.hr_candidate_admission_conversions (deleted_at);

alter table public.hr_candidate_admission_conversions enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para conversao candidato admissao.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_candidate_admission_conversions on public.hr_candidate_admission_conversions;
  create trigger set_updated_at_hr_candidate_admission_conversions
    before update on public.hr_candidate_admission_conversions
    for each row execute function public.update_updated_at_column();
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de conversao candidato admissao devera ser adicionada em migration futura.';
    return;
  end if;

  drop trigger if exists audit_hr_candidate_admission_conversions on public.hr_candidate_admission_conversions;
  create trigger audit_hr_candidate_admission_conversions
    after insert or update or delete on public.hr_candidate_admission_conversions
    for each row execute function public.write_audit_trail();
end;
$$;

comment on table public.hr_candidate_admission_conversions is
  'Vinculo entre candidato aprovado em solicitacao de vaga e workflow de admissao. Nao cria employee automaticamente.';
comment on column public.hr_candidate_admission_conversions.admission_workflow_id is
  'Workflow RH do tipo admission gerado a partir do candidato aprovado.';
comment on column public.hr_candidate_admission_conversions.status is
  'Estado tecnico da conversao: processing, completed ou failed. Usado para evitar admissoes duplicadas.';
