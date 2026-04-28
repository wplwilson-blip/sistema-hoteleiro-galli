-- Sprint 2 - Base database: extensions and shared enums.
-- Esta migration cria somente tipos e extensoes reutilizaveis.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'record_status') then
    create type public.record_status as enum ('active', 'inactive', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'access_status') then
    create type public.access_status as enum ('active', 'inactive', 'blocked', 'pending');
  end if;

  if not exists (select 1 from pg_type where typname = 'user_link_status') then
    create type public.user_link_status as enum ('active', 'inactive', 'pending', 'revoked');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('draft', 'pending', 'approved', 'rejected', 'cancelled', 'escalated');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_action') then
    create type public.approval_action as enum ('submit', 'approve', 'reject', 'escalate', 'cancel', 'return');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('in_app', 'email');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('queued', 'sent', 'read', 'dismissed', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'location_type') then
    create type public.location_type as enum ('room', 'common_area', 'internal_area', 'physical_sector', 'service_area', 'external_area');
  end if;

  if not exists (select 1 from pg_type where typname = 'room_status') then
    create type public.room_status as enum ('available', 'occupied', 'dirty', 'cleaning', 'maintenance', 'blocked', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'equipment_status') then
    create type public.equipment_status as enum ('operational', 'maintenance', 'out_of_service', 'inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_action') then
    create type public.audit_action as enum ('insert', 'update', 'soft_delete', 'restore', 'delete', 'login', 'logout', 'approve', 'reject', 'system');
  end if;
end
$$;
