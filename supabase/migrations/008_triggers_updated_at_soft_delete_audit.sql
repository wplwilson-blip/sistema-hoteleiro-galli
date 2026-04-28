-- Sprint 2 - Triggers de updated_at, soft delete e auditoria base.
-- A auditoria sera expandida nas proximas sprints com contexto de usuario vindo do Supabase Auth.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_actor_id_from_setting()
returns uuid
language plpgsql
stable
as $$
declare
  raw_value text;
begin
  raw_value := current_setting('app.current_user_id', true);

  if raw_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return raw_value::uuid;
  end if;

  return null;
end;
$$;

create or replace function public.write_audit_trail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_action_value public.audit_action;
  actor_id uuid;
  row_unit_id uuid;
  row_entity_id uuid;
  old_json jsonb;
  new_json jsonb;
begin
  actor_id := public.current_actor_id_from_setting();
  old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  if tg_op = 'INSERT' then
    audit_action_value := 'insert';
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  elsif tg_op = 'UPDATE'
    and old_json->>'deleted_at' is null
    and new_json->>'deleted_at' is not null then
    audit_action_value := 'soft_delete';
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  elsif tg_op = 'UPDATE' then
    audit_action_value := 'update';
    row_unit_id := nullif(new_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(new_json->>'id', '')::uuid;
  else
    audit_action_value := 'delete';
    row_unit_id := nullif(old_json->>'unit_id', '')::uuid;
    row_entity_id := nullif(old_json->>'id', '')::uuid;
  end if;

  insert into public.audit_trail (
    action,
    entity_type,
    entity_id,
    table_name,
    app_user_id,
    unit_id,
    old_value,
    new_value,
    metadata
  )
  values (
    audit_action_value,
    tg_table_name,
    coalesce(row_entity_id, gen_random_uuid()),
    tg_table_schema || '.' || tg_table_name,
    actor_id,
    row_unit_id,
    old_json,
    new_json,
    jsonb_build_object('trigger', tg_name, 'operation', tg_op)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
exception
  when others then
    -- Auditoria nao deve impedir gravacao nesta sprint inicial.
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'units',
    'unit_settings',
    'departments',
    'job_positions',
    'app_users',
    'employees',
    'user_employee_links',
    'access_profiles',
    'permissions',
    'profile_permissions',
    'user_unit_links',
    'user_permission_overrides',
    'blocks',
    'floors',
    'rooms',
    'operational_areas',
    'operational_locations',
    'equipment_assets',
    'cost_centers',
    'operational_categories',
    'request_types',
    'attachment_types',
    'system_statuses',
    'approval_flows',
    'approval_levels',
    'approval_requests',
    'approval_steps',
    'notification_rules',
    'notifications'
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
    'organizations',
    'units',
    'departments',
    'job_positions',
    'app_users',
    'employees',
    'user_employee_links',
    'access_profiles',
    'permissions',
    'profile_permissions',
    'user_unit_links',
    'user_permission_overrides',
    'rooms',
    'operational_locations',
    'equipment_assets',
    'approval_flows',
    'approval_requests',
    'approval_steps',
    'approval_actions',
    'notifications'
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

comment on function public.write_audit_trail() is
  'Auditoria base da Sprint 2. Nas Sprints 3/4 recebera contexto real de auth.uid(), IP e user_agent pela camada de aplicacao.';

comment on function public.update_updated_at_column() is
  'Atualiza updated_at automaticamente antes de updates nas tabelas principais.';
