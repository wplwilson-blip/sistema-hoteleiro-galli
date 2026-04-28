-- Sprint 2 - Notificacoes, logs tecnicos e trilha de auditoria.
-- V1 usa notificacoes in-app. E-mail fica opcional para uso futuro.

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  module_code text not null,
  event_code text not null,
  channel public.notification_channel not null default 'in_app',
  title_template text not null,
  body_template text not null,
  is_enabled boolean not null default true,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint notification_rules_unique unique (module_code, event_code, channel)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.app_users(id) on delete set null,
  unit_id uuid references public.units(id) on delete restrict,
  channel public.notification_channel not null default 'in_app',
  status public.notification_status not null default 'queued',
  title text not null,
  body text,
  module_code text,
  entity_type text,
  entity_id uuid,
  sent_at timestamptz,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint notifications_title_not_blank check (btrim(title) <> '')
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info',
  action text not null,
  module_code text,
  entity_type text,
  entity_id uuid,
  app_user_id uuid references public.app_users(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  ip_address inet,
  user_agent text,
  message text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint system_logs_level_check check (level in ('debug', 'info', 'warning', 'error', 'critical'))
);

create table if not exists public.audit_trail (
  id uuid primary key default gen_random_uuid(),
  action public.audit_action not null,
  module_code text,
  entity_type text not null,
  entity_id uuid,
  table_name text,
  app_user_id uuid references public.app_users(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  ip_address inet,
  user_agent text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.system_logs is 'Logs tecnicos para diagnostico. Nao substituem audit_trail.';
comment on table public.audit_trail is 'Trilha de auditoria para alteracoes criticas, incluindo old_value e new_value em JSONB.';

create index if not exists notification_rules_status_idx on public.notification_rules (status);
create index if not exists notifications_recipient_user_id_idx on public.notifications (recipient_user_id);
create index if not exists notifications_unit_id_idx on public.notifications (unit_id);
create index if not exists notifications_status_idx on public.notifications (status);
create index if not exists notifications_created_at_idx on public.notifications (created_at);
create index if not exists notifications_entity_idx on public.notifications (entity_type, entity_id);
create index if not exists system_logs_level_idx on public.system_logs (level);
create index if not exists system_logs_created_at_idx on public.system_logs (created_at);
create index if not exists system_logs_entity_idx on public.system_logs (entity_type, entity_id);
create index if not exists system_logs_unit_id_idx on public.system_logs (unit_id);
create index if not exists audit_trail_action_idx on public.audit_trail (action);
create index if not exists audit_trail_created_at_idx on public.audit_trail (created_at);
create index if not exists audit_trail_entity_idx on public.audit_trail (entity_type, entity_id);
create index if not exists audit_trail_unit_id_idx on public.audit_trail (unit_id);
