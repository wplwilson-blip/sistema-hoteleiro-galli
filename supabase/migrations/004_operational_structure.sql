-- Sprint 2 - Estrutura operacional base.
-- Inclui quartos/UHs, andares, blocos, locais operacionais e equipamentos.

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint blocks_unit_code_unique unique (unit_id, code),
  constraint blocks_code_format check (code ~ '^[A-Z0-9_-]{1,20}$')
);

create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  block_id uuid references public.blocks(id) on delete set null,
  number integer,
  code text not null,
  name text not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint floors_unit_code_unique unique (unit_id, code)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  block_id uuid references public.blocks(id) on delete set null,
  floor_id uuid references public.floors(id) on delete set null,
  room_number text not null,
  display_name text,
  capacity integer,
  room_status public.room_status not null default 'available',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint rooms_unit_number_unique unique (unit_id, room_number),
  constraint rooms_capacity_positive check (capacity is null or capacity >= 0)
);

create table if not exists public.operational_areas (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint operational_areas_unit_code_unique unique (unit_id, code)
);

create table if not exists public.operational_locations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  operational_area_id uuid references public.operational_areas(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  parent_location_id uuid references public.operational_locations(id) on delete set null,
  location_type public.location_type not null,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint operational_locations_unit_code_unique unique (unit_id, code),
  constraint operational_locations_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  operational_location_id uuid references public.operational_locations(id) on delete set null,
  code text not null,
  name text not null,
  asset_tag text,
  manufacturer text,
  model text,
  serial_number text,
  installed_at date,
  equipment_status public.equipment_status not null default 'operational',
  status public.record_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint equipment_assets_unit_code_unique unique (unit_id, code),
  constraint equipment_assets_name_not_blank check (btrim(name) <> '')
);

create index if not exists blocks_unit_id_idx on public.blocks (unit_id);
create index if not exists blocks_status_idx on public.blocks (status);
create index if not exists blocks_created_at_idx on public.blocks (created_at);
create index if not exists floors_unit_id_idx on public.floors (unit_id);
create index if not exists floors_block_id_idx on public.floors (block_id);
create index if not exists floors_status_idx on public.floors (status);
create index if not exists floors_created_at_idx on public.floors (created_at);
create index if not exists rooms_unit_id_idx on public.rooms (unit_id);
create index if not exists rooms_floor_id_idx on public.rooms (floor_id);
create index if not exists rooms_block_id_idx on public.rooms (block_id);
create index if not exists rooms_room_status_idx on public.rooms (room_status);
create index if not exists rooms_status_idx on public.rooms (status);
create index if not exists rooms_created_at_idx on public.rooms (created_at);
create index if not exists operational_areas_unit_id_idx on public.operational_areas (unit_id);
create index if not exists operational_areas_status_idx on public.operational_areas (status);
create index if not exists operational_locations_unit_id_idx on public.operational_locations (unit_id);
create index if not exists operational_locations_type_idx on public.operational_locations (location_type);
create index if not exists operational_locations_status_idx on public.operational_locations (status);
create index if not exists equipment_assets_unit_id_idx on public.equipment_assets (unit_id);
create index if not exists equipment_assets_location_id_idx on public.equipment_assets (operational_location_id);
create index if not exists equipment_assets_equipment_status_idx on public.equipment_assets (equipment_status);
create index if not exists equipment_assets_status_idx on public.equipment_assets (status);
create index if not exists equipment_assets_created_at_idx on public.equipment_assets (created_at);
