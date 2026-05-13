-- RH-1B - Fundacao segura do modulo de RH administrativo.
-- Cria apenas permissoes e tabelas base para documentos e historico funcional.
-- Nao cria folha, ponto, calculos trabalhistas, eSocial, financeiro, PMS, reservas,
-- check-in, check-out, tarifas ou disponibilidade.

insert into public.permissions (module_code, action_code, name, description)
values
  ('HR', 'dashboard.view', 'Visualizar painel de RH', 'Permite visualizar indicadores administrativos basicos do RH.'),
  ('HR', 'employees.view', 'Visualizar colaboradores no RH', 'Permite consultar colaboradores no contexto do RH.'),
  ('HR', 'employees.manage', 'Gerenciar colaboradores no RH', 'Permite manter dados administrativos de colaboradores no contexto do RH.'),
  ('HR', 'employees.sensitive.view', 'Visualizar dados sensiveis de colaboradores', 'Permite consultar dados pessoais sensiveis de colaboradores.'),
  ('HR', 'documents.view', 'Visualizar documentos de RH', 'Permite consultar documentos logicos de RH sem download sensivel automatico.'),
  ('HR', 'documents.manage', 'Gerenciar documentos de RH', 'Permite criar, atualizar e arquivar documentos logicos de RH.'),
  ('HR', 'documents.sensitive.view', 'Visualizar documentos sensiveis de RH', 'Permite acessar documentos e anexos sensiveis de RH.'),
  ('HR', 'documents.verify', 'Conferir documentos de RH', 'Permite aprovar, rejeitar ou dispensar documentos de RH.'),
  ('HR', 'admissions.view', 'Visualizar admissoes administrativas', 'Permite consultar processos administrativos de admissao.'),
  ('HR', 'admissions.manage', 'Gerenciar admissoes administrativas', 'Permite manter processos administrativos de admissao sem folha ou eSocial.'),
  ('HR', 'admissions.approve', 'Aprovar admissoes administrativas', 'Permite aprovar etapas administrativas de admissao.'),
  ('HR', 'terminations.view', 'Visualizar desligamentos administrativos', 'Permite consultar processos administrativos de desligamento.'),
  ('HR', 'terminations.manage', 'Gerenciar desligamentos administrativos', 'Permite manter processos administrativos de desligamento sem calculo rescisorio.'),
  ('HR', 'terminations.approve', 'Aprovar desligamentos administrativos', 'Permite aprovar etapas administrativas de desligamento.'),
  ('HR', 'history.view', 'Visualizar historico funcional', 'Permite consultar historico funcional nao sensivel de colaboradores.'),
  ('HR', 'history.sensitive.view', 'Visualizar historico funcional sensivel', 'Permite consultar eventos funcionais marcados como sensiveis.'),
  ('HR', 'training.view', 'Visualizar treinamentos de RH', 'Permite consultar registros administrativos de treinamento.'),
  ('HR', 'training.manage', 'Gerenciar treinamentos de RH', 'Permite manter registros administrativos de treinamento.'),
  ('HR', 'warnings.view', 'Visualizar advertencias', 'Permite consultar registros disciplinares sensiveis.'),
  ('HR', 'warnings.manage', 'Gerenciar advertencias', 'Permite manter registros disciplinares sensiveis.'),
  ('HR', 'vacations.view', 'Visualizar ferias administrativas', 'Permite consultar registros administrativos de ferias sem calculos trabalhistas.'),
  ('HR', 'vacations.manage', 'Gerenciar ferias administrativas', 'Permite manter registros administrativos de ferias sem calculos trabalhistas.'),
  ('HR', 'audit.view', 'Visualizar auditoria de RH', 'Permite consultar trilhas e eventos de auditoria do modulo de RH.'),
  ('HR', 'reports.view', 'Visualizar relatorios de RH', 'Permite consultar relatorios administrativos de RH.'),
  ('HR', 'reports.export', 'Exportar relatorios de RH', 'Permite exportar dados administrativos de RH mediante controle de acesso.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.profile_permissions (access_profile_id, permission_id, is_allowed)
select ap.id, p.id, true
from public.access_profiles ap
join public.permissions p on p.module_code = 'HR'
where ap.code = 'SUPER_ADMIN'
  and ap.deleted_at is null
  and p.deleted_at is null
on conflict (access_profile_id, permission_id) do update set
  is_allowed = excluded.is_allowed,
  updated_at = now();

create table if not exists public.hr_document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  category text not null,
  is_system_default boolean not null default false,
  is_required boolean not null default false,
  requires_valid_until boolean not null default false,
  default_validity_days integer,
  recurrence_months integer,
  is_sensitive_default boolean not null default true,
  visibility_scope_default text not null default 'restricted',
  sort_order integer not null default 0,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint hr_document_types_code_not_blank check (btrim(code) <> ''),
  constraint hr_document_types_code_format check (code ~ '^[A-Z0-9_-]{2,80}$'),
  constraint hr_document_types_name_not_blank check (btrim(name) <> ''),
  constraint hr_document_types_category_check check (
    category in ('personal', 'admission', 'contract', 'training', 'termination', 'internal', 'other')
  ),
  constraint hr_document_types_visibility_scope_check check (
    visibility_scope_default in ('restricted', 'unit', 'organization')
  ),
  constraint hr_document_types_default_validity_days_positive check (
    default_validity_days is null or default_validity_days > 0
  ),
  constraint hr_document_types_recurrence_months_positive check (
    recurrence_months is null or recurrence_months > 0
  ),
  constraint hr_document_types_system_scope_check check (
    is_system_default = false or (organization_id is null and unit_id is null)
  ),
  constraint hr_document_types_unit_requires_org_check check (
    unit_id is null or organization_id is not null
  )
);

create unique index if not exists hr_document_types_system_code_unique
  on public.hr_document_types (code)
  where is_system_default = true
    and organization_id is null
    and unit_id is null
    and deleted_at is null;

create unique index if not exists hr_document_types_scope_code_active_unique
  on public.hr_document_types (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(code)
  )
  where is_system_default = false
    and deleted_at is null;

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  document_type_id uuid not null references public.hr_document_types(id) on delete restrict,
  current_attachment_id uuid references public.attachments(id) on delete set null,
  status text not null default 'pending',
  issue_date date,
  received_at timestamptz,
  valid_until date,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_at timestamptz,
  rejected_by uuid references public.app_users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  waived_by uuid references public.app_users(id) on delete set null,
  waived_at timestamptz,
  waiver_reason text,
  replaced_by_document_id uuid references public.employee_documents(id) on delete set null,
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,
  constraint employee_documents_status_check check (
    status in ('pending', 'received', 'under_review', 'approved', 'rejected', 'expired', 'replaced', 'waived')
  ),
  constraint employee_documents_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_documents_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint employee_documents_rejection_reason_check check (
    status <> 'rejected' or btrim(coalesce(rejection_reason, '')) <> ''
  ),
  constraint employee_documents_waiver_reason_check check (
    status <> 'waived' or btrim(coalesce(waiver_reason, '')) <> ''
  ),
  constraint employee_documents_validity_range_check check (
    issue_date is null or valid_until is null or valid_until >= issue_date
  ),
  constraint employee_documents_attachment_status_check check (
    current_attachment_id is null or status <> 'pending'
  ),
  constraint employee_documents_replacement_not_self check (
    replaced_by_document_id is null or replaced_by_document_id <> id
  )
);

create table if not exists public.employee_functional_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  event_type text not null,
  event_date timestamptz not null default now(),
  title text not null,
  description text,
  severity text not null default 'info',
  visibility_scope text not null default 'unit',
  is_sensitive boolean not null default false,
  source_module text not null default 'HR',
  source_entity_type text,
  source_entity_id uuid,
  related_document_id uuid references public.employee_documents(id) on delete set null,
  related_attachment_id uuid references public.attachments(id) on delete set null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_employee_id uuid references public.employees(id) on delete set null,
  event_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  correction_of_event_id uuid references public.employee_functional_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  constraint employee_functional_events_type_check check (
    event_type in (
      'employee_created',
      'employee_basic_updated',
      'employee_sensitive_updated',
      'unit_changed',
      'department_changed',
      'job_position_changed',
      'document_requested',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_expired',
      'document_replaced',
      'document_waived',
      'admission_started',
      'admission_completed',
      'termination_started',
      'termination_completed',
      'training_registered',
      'warning_registered',
      'vacation_registered',
      'note_added'
    )
  ),
  constraint employee_functional_events_title_not_blank check (btrim(title) <> ''),
  constraint employee_functional_events_severity_check check (
    severity in ('info', 'notice', 'warning', 'critical')
  ),
  constraint employee_functional_events_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_functional_events_status_check check (
    status in ('active', 'cancelled', 'corrected')
  ),
  constraint employee_functional_events_payload_object_check check (jsonb_typeof(event_payload) = 'object'),
  constraint employee_functional_events_correction_not_self check (
    correction_of_event_id is null or correction_of_event_id <> id
  ),
  constraint employee_functional_events_source_module_not_blank check (btrim(source_module) <> '')
);

create index if not exists hr_document_types_organization_idx on public.hr_document_types (organization_id);
create index if not exists hr_document_types_unit_idx on public.hr_document_types (unit_id);
create index if not exists hr_document_types_status_idx on public.hr_document_types (status);
create index if not exists hr_document_types_category_idx on public.hr_document_types (category);
create index if not exists hr_document_types_code_upper_idx on public.hr_document_types (upper(code));
create index if not exists hr_document_types_is_required_idx on public.hr_document_types (is_required);
create index if not exists hr_document_types_deleted_at_idx on public.hr_document_types (deleted_at);

create index if not exists employee_documents_organization_idx on public.employee_documents (organization_id);
create index if not exists employee_documents_unit_idx on public.employee_documents (unit_id);
create index if not exists employee_documents_employee_idx on public.employee_documents (employee_id);
create index if not exists employee_documents_type_idx on public.employee_documents (document_type_id);
create index if not exists employee_documents_attachment_idx on public.employee_documents (current_attachment_id);
create index if not exists employee_documents_status_idx on public.employee_documents (status);
create index if not exists employee_documents_valid_until_idx on public.employee_documents (valid_until);
create index if not exists employee_documents_sensitive_idx on public.employee_documents (is_sensitive);
create index if not exists employee_documents_deleted_at_idx on public.employee_documents (deleted_at);
create index if not exists employee_documents_employee_type_status_idx
  on public.employee_documents (employee_id, document_type_id, status);

create index if not exists employee_functional_events_organization_idx on public.employee_functional_events (organization_id);
create index if not exists employee_functional_events_unit_idx on public.employee_functional_events (unit_id);
create index if not exists employee_functional_events_employee_idx on public.employee_functional_events (employee_id);
create index if not exists employee_functional_events_type_idx on public.employee_functional_events (event_type);
create index if not exists employee_functional_events_date_idx on public.employee_functional_events (event_date);
create index if not exists employee_functional_events_status_idx on public.employee_functional_events (status);
create index if not exists employee_functional_events_sensitive_idx on public.employee_functional_events (is_sensitive);
create index if not exists employee_functional_events_document_idx on public.employee_functional_events (related_document_id);
create index if not exists employee_functional_events_attachment_idx on public.employee_functional_events (related_attachment_id);

alter table public.hr_document_types enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employee_functional_events enable row level security;

do $$
declare
  table_name text;
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Triggers de updated_at nao foram criados para RH.';
    return;
  end if;

  foreach table_name in array array[
    'hr_document_types',
    'employee_documents',
    'employee_functional_events'
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
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de RH devera ser adicionada em migration futura.';
    return;
  end if;

  foreach table_name in array array[
    'hr_document_types',
    'employee_documents',
    'employee_functional_events'
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

insert into public.hr_document_types (
  code,
  name,
  description,
  category,
  is_system_default,
  is_required,
  requires_valid_until,
  is_sensitive_default,
  visibility_scope_default,
  sort_order
)
values
  ('RG_CNH', 'RG/CNH', 'Documento de identificacao pessoal.', 'personal', true, true, false, true, 'restricted', 10),
  ('CPF', 'CPF', 'Cadastro de pessoa fisica.', 'personal', true, true, false, true, 'restricted', 20),
  ('COMPROVANTE_RESIDENCIA', 'Comprovante de residencia', 'Comprovante de residencia para admissao e atualizacao cadastral.', 'admission', true, true, false, true, 'restricted', 30),
  ('CONTRATO_TRABALHO', 'Contrato de trabalho', 'Contrato ou instrumento equivalente mantido no prontuario funcional.', 'contract', true, true, false, true, 'restricted', 40),
  ('FICHA_ADMISSAO', 'Ficha de admissao', 'Ficha administrativa de admissao do colaborador.', 'admission', true, true, false, true, 'restricted', 50),
  ('TERMO_RESPONSABILIDADE', 'Termo de responsabilidade', 'Termo interno de responsabilidade ou ciencia.', 'internal', true, false, false, true, 'restricted', 60),
  ('CERTIFICADO_TREINAMENTO', 'Certificado de treinamento', 'Certificado ou evidencia administrativa de treinamento.', 'training', true, false, true, true, 'restricted', 70),
  ('DOCUMENTO_DESLIGAMENTO', 'Documento de desligamento', 'Documento administrativo relacionado a desligamento sem calculo rescisorio.', 'termination', true, false, false, true, 'restricted', 80)
on conflict (code)
  where is_system_default = true
    and organization_id is null
    and unit_id is null
    and deleted_at is null
do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_system_default = excluded.is_system_default,
  is_required = excluded.is_required,
  requires_valid_until = excluded.requires_valid_until,
  is_sensitive_default = excluded.is_sensitive_default,
  visibility_scope_default = excluded.visibility_scope_default,
  sort_order = excluded.sort_order,
  updated_at = now();

comment on table public.hr_document_types is
  'Catalogo logico de tipos de documentos de RH. Nao armazena arquivos fisicos; arquivos continuam em public.attachments.';
comment on column public.hr_document_types.category is
  'Categoria administrativa do documento de RH: personal, admission, contract, training, termination, internal ou other.';
comment on column public.hr_document_types.is_sensitive_default is
  'Indica se documentos desse tipo devem nascer sensiveis por padrao.';
comment on column public.hr_document_types.visibility_scope_default is
  'Escopo padrao de visibilidade para documentos desse tipo. RH usa restricted por padrao.';

comment on table public.employee_documents is
  'Documento logico do colaborador. Pode representar pendencia documental sem arquivo fisico; o anexo fisico fica em public.attachments.';
comment on column public.employee_documents.current_attachment_id is
  'Anexo fisico atual do documento, quando existir. Documentos de RH nao devem ser anexados diretamente em public.employees.';
comment on column public.employee_documents.is_sensitive is
  'Documentos de RH nascem sensiveis por padrao e exigem permissao especifica para visualizacao.';
comment on column public.employee_documents.visibility_scope is
  'Escopo de visibilidade do documento logico de RH. O padrao restricted exige controle explicito na aplicacao e nas policies futuras.';
comment on column public.employee_documents.metadata is
  'Metadados administrativos do documento. Nao deve receber dados pessoais excessivos sem necessidade LGPD.';

comment on table public.employee_functional_events is
  'Historico funcional semantico de RH. Complementa public.audit_trail, mas nao substitui a auditoria tecnica.';
comment on column public.employee_functional_events.event_type is
  'Tipo semantico do evento funcional do colaborador.';
comment on column public.employee_functional_events.event_payload is
  'Payload estruturado do evento. Deve evitar dados pessoais excessivos e respeitar permissoes sensiveis.';
comment on column public.employee_functional_events.status is
  'Eventos devem ser tratados como quase imutaveis; correcoes usam status corrected ou cancelled e novo evento de retificacao.';
comment on column public.employee_functional_events.is_sensitive is
  'Eventos funcionais sensiveis exigem permissao HR:history.sensitive.view para consulta futura.';
