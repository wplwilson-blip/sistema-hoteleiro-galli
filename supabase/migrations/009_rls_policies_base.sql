-- Sprint 2 - Preparacao de RLS.
-- RLS e habilitado nas tabelas criticas, mas as policies finais ficam para Sprint 3/4.
-- Motivo: ainda nao existe autenticacao real nem mapeamento definitivo auth.uid() -> app_users.

create or replace function public.current_auth_user_id()
returns uuid
language sql
stable
as $$
  select case
    when nullif(current_setting('request.jwt.claim.sub', true), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then current_setting('request.jwt.claim.sub', true)::uuid
    else null
  end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from public.app_users au
  where au.auth_user_id = public.current_auth_user_id()
    and au.deleted_at is null
    and au.status = 'active'
  limit 1;
$$;

create or replace function public.user_has_unit_access(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_unit_links uul
    where uul.app_user_id = public.current_app_user_id()
      and uul.unit_id = target_unit_id
      and uul.status = 'active'
      and uul.deleted_at is null
      and (uul.starts_at is null or uul.starts_at <= now())
      and (uul.ends_at is null or uul.ends_at >= now())
  );
$$;

alter table public.organizations enable row level security;
alter table public.units enable row level security;
alter table public.unit_settings enable row level security;
alter table public.departments enable row level security;
alter table public.job_positions enable row level security;
alter table public.app_users enable row level security;
alter table public.employees enable row level security;
alter table public.user_employee_links enable row level security;
alter table public.access_profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.profile_permissions enable row level security;
alter table public.user_unit_links enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.blocks enable row level security;
alter table public.floors enable row level security;
alter table public.rooms enable row level security;
alter table public.operational_areas enable row level security;
alter table public.operational_locations enable row level security;
alter table public.equipment_assets enable row level security;
alter table public.cost_centers enable row level security;
alter table public.operational_categories enable row level security;
alter table public.request_types enable row level security;
alter table public.attachment_types enable row level security;
alter table public.system_statuses enable row level security;
alter table public.approval_flows enable row level security;
alter table public.approval_levels enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approval_actions enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.system_logs enable row level security;
alter table public.audit_trail enable row level security;

comment on function public.current_app_user_id() is
  'Helper preparado para Sprint 3, quando Supabase Auth sera ligado ao app_users.auth_user_id.';
comment on function public.user_has_unit_access(uuid) is
  'Helper base para policies multiunidade. Policies finais serao criadas quando o login real existir.';
comment on table public.app_users is
  'RLS habilitado. Policies finais dependem de autenticacao real por username + senha na Sprint 3.';
comment on table public.rooms is
  'Tabela operacional com unit_id. Policies futuras devem filtrar por public.user_has_unit_access(unit_id).';
