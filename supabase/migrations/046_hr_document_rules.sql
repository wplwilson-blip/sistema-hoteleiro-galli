-- RH-11C - Regras documentais por contexto operacional.
-- Cria regras de obrigatoriedade documental sem alterar folha, ponto, salario,
-- workflow engine, auth, RLS existente ou contratos de documentos ja criados.

create table if not exists public.hr_document_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  job_position_id uuid references public.job_positions(id) on delete restrict,
  admission_type text,
  document_type_id uuid not null references public.hr_document_types(id) on delete restrict,
  is_required boolean not null default true,
  due_days_after_admission integer,
  recurrence_months integer,
  priority integer not null default 100,
  notes text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_document_rules_admission_type_format check (
    admission_type is null or admission_type ~ '^[a-z0-9_-]{2,60}$'
  ),
  constraint hr_document_rules_due_days_non_negative check (
    due_days_after_admission is null or due_days_after_admission >= 0
  ),
  constraint hr_document_rules_recurrence_months_positive check (
    recurrence_months is null or recurrence_months > 0
  ),
  constraint hr_document_rules_priority_non_negative check (priority >= 0),
  constraint hr_document_rules_unit_requires_org check (
    unit_id is null or organization_id is not null
  ),
  constraint hr_document_rules_department_requires_scope check (
    department_id is null or organization_id is not null or unit_id is not null
  ),
  constraint hr_document_rules_job_requires_scope check (
    job_position_id is null or organization_id is not null or unit_id is not null or department_id is not null
  ),
  constraint hr_document_rules_notes_length check (notes is null or length(notes) <= 1000)
);

create unique index if not exists hr_document_rules_active_scope_unique
  on public.hr_document_rules (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(job_position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(admission_type, ''),
    document_type_id
  )
  where deleted_at is null;

create index if not exists hr_document_rules_organization_idx on public.hr_document_rules (organization_id);
create index if not exists hr_document_rules_unit_idx on public.hr_document_rules (unit_id);
create index if not exists hr_document_rules_department_idx on public.hr_document_rules (department_id);
create index if not exists hr_document_rules_job_position_idx on public.hr_document_rules (job_position_id);
create index if not exists hr_document_rules_document_type_idx on public.hr_document_rules (document_type_id);
create index if not exists hr_document_rules_status_idx on public.hr_document_rules (status);
create index if not exists hr_document_rules_priority_idx on public.hr_document_rules (priority);
create index if not exists hr_document_rules_deleted_at_idx on public.hr_document_rules (deleted_at);
create index if not exists hr_document_rules_active_lookup_idx
  on public.hr_document_rules (
    status,
    document_type_id,
    organization_id,
    unit_id,
    department_id,
    job_position_id,
    priority
  )
  where deleted_at is null;

alter table public.hr_document_rules enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para hr_document_rules.';
    return;
  end if;

  drop trigger if exists set_updated_at_hr_document_rules on public.hr_document_rules;
  create trigger set_updated_at_hr_document_rules
    before update on public.hr_document_rules
    for each row execute function public.update_updated_at_column();
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de hr_document_rules devera ser adicionada em migration futura.';
    return;
  end if;

  drop trigger if exists audit_hr_document_rules on public.hr_document_rules;
  create trigger audit_hr_document_rules
    after insert or update or delete on public.hr_document_rules
    for each row execute function public.write_audit_trail();
end;
$$;

comment on table public.hr_document_rules is
  'Regras operacionais de obrigatoriedade documental por organizacao, unidade, departamento, cargo e tipo de admissao.';
comment on column public.hr_document_rules.document_type_id is
  'Tipo documental do catalogo de RH ao qual a regra se aplica.';
comment on column public.hr_document_rules.is_required is
  'Define se o documento e obrigatorio neste contexto. Regras mais especificas podem desobrigar um tipo global.';
comment on column public.hr_document_rules.due_days_after_admission is
  'Prazo esperado, em dias apos admissao, para cumprir a pendencia documental.';
comment on column public.hr_document_rules.recurrence_months is
  'Recorrencia operacional sugerida para renovacao documental, quando aplicavel.';
comment on column public.hr_document_rules.priority is
  'Desempate entre regras de mesmo escopo. A especificidade do contexto continua sendo o criterio principal.';
