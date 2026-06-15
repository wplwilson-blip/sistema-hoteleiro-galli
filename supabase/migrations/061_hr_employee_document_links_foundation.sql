-- RH-29F.3B - Foundation de anexos contextuais de RH.
-- Cria apenas o vinculo contextual entre dossie documental, arquivo fisico e origem de RH.
-- Nao altera Compras, /api/attachments, Auth, login, RLS tecnico ou fluxos dos modulos.

create table if not exists public.employee_document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_document_id uuid not null references public.employee_documents(id) on delete restrict,
  attachment_id uuid references public.attachments(id) on delete set null,

  source_module text not null default 'hr',
  source_entity_type text not null,
  source_entity_id uuid not null,
  source_context_label text,
  document_role text not null,

  is_required boolean not null default false,
  requirement_status text not null default 'pending',
  is_sensitive boolean not null default true,
  visibility_scope text not null default 'restricted',

  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.app_users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  waived_by uuid references public.app_users(id) on delete set null,
  waived_at timestamptz,
  waiver_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.app_users(id) on delete set null,

  constraint employee_document_links_source_module_check check (source_module = 'hr'),
  constraint employee_document_links_source_entity_type_check check (
    source_entity_type in (
      'conduct',
      'occupational_health',
      'nr_certification',
      'training',
      'termination',
      'termination_checklist_item',
      'onboarding',
      'movement',
      'evaluation'
    )
  ),
  constraint employee_document_links_document_role_check check (
    document_role in (
      'evidence',
      'aso',
      'exam',
      'restriction',
      'nr_certificate',
      'training_certificate',
      'attendance_list',
      'termination_document',
      'other'
    )
  ),
  constraint employee_document_links_requirement_status_check check (
    requirement_status in ('pending', 'attached', 'under_review', 'approved', 'rejected', 'waived')
  ),
  constraint employee_document_links_visibility_scope_check check (
    visibility_scope in ('restricted', 'unit', 'organization')
  ),
  constraint employee_document_links_sensitive_visibility_check check (
    is_sensitive = false or visibility_scope = 'restricted'
  ),
  constraint employee_document_links_attachment_by_status_check check (
    (requirement_status in ('pending', 'waived') and attachment_id is null)
    or (requirement_status in ('attached', 'under_review', 'approved', 'rejected') and attachment_id is not null)
  ),
  constraint employee_document_links_rejection_reason_check check (
    requirement_status <> 'rejected' or btrim(coalesce(rejection_reason, '')) <> ''
  ),
  constraint employee_document_links_waiver_reason_check check (
    requirement_status <> 'waived' or btrim(coalesce(waiver_reason, '')) <> ''
  )
);

create index if not exists employee_document_links_employee_idx
  on public.employee_document_links (employee_id)
  where deleted_at is null;

create index if not exists employee_document_links_document_idx
  on public.employee_document_links (employee_document_id)
  where deleted_at is null;

create index if not exists employee_document_links_attachment_idx
  on public.employee_document_links (attachment_id)
  where deleted_at is null;

create index if not exists employee_document_links_source_idx
  on public.employee_document_links (source_entity_type, source_entity_id)
  where deleted_at is null;

create index if not exists employee_document_links_role_idx
  on public.employee_document_links (document_role)
  where deleted_at is null;

create index if not exists employee_document_links_requirement_status_idx
  on public.employee_document_links (requirement_status)
  where deleted_at is null;

create index if not exists employee_document_links_sensitive_idx
  on public.employee_document_links (is_sensitive)
  where deleted_at is null;

create index if not exists employee_document_links_deleted_at_idx
  on public.employee_document_links (deleted_at);

create unique index if not exists employee_document_links_context_unique
  on public.employee_document_links (
    employee_id,
    source_entity_type,
    source_entity_id,
    document_role
  )
  where deleted_at is null;

alter table public.employee_document_links enable row level security;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao criado para employee_document_links.';
    return;
  end if;

  drop trigger if exists set_updated_at_employee_document_links on public.employee_document_links;
  create trigger set_updated_at_employee_document_links
    before update on public.employee_document_links
    for each row
    execute function public.update_updated_at_column();
end $$;

comment on table public.employee_document_links is
  'Vincula documentos/anexos do dossie oficial do colaborador a origens contextuais de RH sem duplicar arquivos.';

comment on column public.employee_document_links.employee_document_id is
  'Documento logico central no dossie oficial do colaborador.';

comment on column public.employee_document_links.attachment_id is
  'Arquivo fisico atual quando o requisito contextual ja possui anexo.';

comment on column public.employee_document_links.source_entity_type is
  'Origem contextual de RH, como conduta, saude ocupacional, treinamento ou desligamento.';

comment on column public.employee_document_links.document_role is
  'Papel documental no contexto de origem, como evidencia, ASO, certificado NR ou documento de saida.';

comment on column public.employee_document_links.requirement_status is
  'Status contextual do requisito documental; pode divergir temporariamente do status do documento central ate sincronizacao pela API.';
