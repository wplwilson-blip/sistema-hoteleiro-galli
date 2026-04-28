-- Sprint 2C - Entidades transversais compartilhadas.
-- Esta migration adiciona a base comum para fornecedores, anexos,
-- comentarios e historico operacional de UHs sem criar modulos operacionais.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  name text not null,
  trade_name text,
  document_type text not null default 'OTHER',
  document_number text,
  email text,
  phone text,
  whatsapp text,
  contact_name text,
  address_json jsonb,
  bank_data_json jsonb,
  category text,
  notes text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint suppliers_name_not_blank check (btrim(name) <> ''),
  constraint suppliers_document_type_check check (document_type in ('CNPJ', 'CPF', 'OTHER')),
  constraint suppliers_email_format check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  module text not null,
  entity_type text not null,
  entity_id uuid not null,
  attachment_type_id uuid references public.attachment_types(id) on delete set null,
  file_name text not null,
  file_path text not null,
  file_mime_type text not null,
  file_size_bytes bigint not null,
  storage_bucket text,
  description text,
  is_sensitive boolean not null default false,
  visibility_scope text not null default 'unit',
  valid_until date,
  uploaded_by uuid references public.app_users(id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint attachments_module_not_blank check (btrim(module) <> ''),
  constraint attachments_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint attachments_file_name_not_blank check (btrim(file_name) <> ''),
  constraint attachments_file_path_not_blank check (btrim(file_path) <> ''),
  constraint attachments_file_size_positive check (file_size_bytes > 0),
  constraint attachments_visibility_scope_check check (visibility_scope in ('own', 'department', 'unit', 'all', 'restricted'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid references public.units(id) on delete restrict,
  module text not null,
  entity_type text not null,
  entity_id uuid not null,
  author_id uuid references public.app_users(id) on delete set null,
  comment_text text not null,
  is_internal boolean not null default true,
  is_sensitive boolean not null default false,
  visibility_scope text not null default 'unit',
  parent_comment_id uuid references public.comments(id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint comments_module_not_blank check (btrim(module) <> ''),
  constraint comments_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint comments_text_not_blank check (btrim(comment_text) <> ''),
  constraint comments_visibility_scope_check check (visibility_scope in ('own', 'department', 'unit', 'all', 'restricted'))
);

create table if not exists public.room_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  previous_status public.room_status,
  new_status public.room_status not null,
  changed_by uuid references public.app_users(id) on delete set null,
  changed_at timestamptz not null default now(),
  source_module text,
  source_entity_type text,
  source_entity_id uuid,
  reason text,
  notes text,
  is_automatic boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.suppliers is
  'Cadastro compartilhado de fornecedores para Compras, Contas a Pagar, Administrativo, Manutencao e A&B.';

comment on table public.attachments is
  'Tabela generica de anexos com relacao polimorfica por module, entity_type e entity_id. Acesso deve considerar unit_id, visibility_scope e is_sensitive.';

comment on table public.comments is
  'Comentarios compartilhados para solicitacoes, chamados, compras, pagamentos, RH, POPs e planos de acao. Comentarios criticos usam soft delete.';

comment on table public.room_status_history is
  'Historico operacional de status de UH/quarto. A regra de que somente Governanta ou Gerente Operacional pode retornar a UH para Disponivel Operacionalmente sera aplicada na aplicacao/RLS futuramente.';

comment on column public.room_status_history.new_status is
  'Deve permitir rastrear UHs aguardando manutencao, em manutencao, aguardando peca, liberada tecnicamente, liberada para governanca e disponivel operacionalmente.';

create index if not exists suppliers_organization_id_idx on public.suppliers (organization_id);
create index if not exists suppliers_unit_id_idx on public.suppliers (unit_id);
create index if not exists suppliers_document_number_idx on public.suppliers (document_number);
create index if not exists suppliers_status_idx on public.suppliers (status);
create index if not exists suppliers_name_idx on public.suppliers (name);
create index if not exists suppliers_created_at_idx on public.suppliers (created_at);

create index if not exists attachments_unit_id_idx on public.attachments (unit_id);
create index if not exists attachments_module_idx on public.attachments (module);
create index if not exists attachments_entity_idx on public.attachments (entity_type, entity_id);
create index if not exists attachments_attachment_type_id_idx on public.attachments (attachment_type_id);
create index if not exists attachments_uploaded_by_idx on public.attachments (uploaded_by);
create index if not exists attachments_status_idx on public.attachments (status);
create index if not exists attachments_created_at_idx on public.attachments (created_at);

create index if not exists comments_unit_id_idx on public.comments (unit_id);
create index if not exists comments_module_idx on public.comments (module);
create index if not exists comments_entity_idx on public.comments (entity_type, entity_id);
create index if not exists comments_author_id_idx on public.comments (author_id);
create index if not exists comments_created_at_idx on public.comments (created_at);
create index if not exists comments_status_idx on public.comments (status);
create index if not exists comments_parent_comment_id_idx on public.comments (parent_comment_id);

create index if not exists room_status_history_unit_id_idx on public.room_status_history (unit_id);
create index if not exists room_status_history_room_id_idx on public.room_status_history (room_id);
create index if not exists room_status_history_new_status_idx on public.room_status_history (new_status);
create index if not exists room_status_history_changed_by_idx on public.room_status_history (changed_by);
create index if not exists room_status_history_changed_at_idx on public.room_status_history (changed_at);
create index if not exists room_status_history_source_module_idx on public.room_status_history (source_module);
create index if not exists room_status_history_source_entity_idx on public.room_status_history (source_entity_type, source_entity_id);

alter table public.suppliers enable row level security;
alter table public.attachments enable row level security;
alter table public.comments enable row level security;
alter table public.room_status_history enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'suppliers',
    'attachments',
    'comments',
    'room_status_history'
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
  foreach table_name in array array[
    'suppliers',
    'attachments',
    'comments',
    'room_status_history'
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
