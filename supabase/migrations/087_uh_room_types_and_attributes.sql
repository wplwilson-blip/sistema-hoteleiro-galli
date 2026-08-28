-- ============================================================================
-- 087 — UH Fatia 1: tipos de unidade habitacional e atributos das UHs
--
-- NAO APLICADA PELO CODEX. O Wilson aplica no Supabase.
--
-- SO' ESTRUTURA, 100% ADITIVA:
--   * cria public.room_types (tabela nova, por unidade);
--   * acrescenta colunas a public.rooms -- todas NULLABLE ou com default, nenhuma
--     coluna existente e' alterada, renomeada ou removida.
--
-- public.rooms JA' EXISTE (migration 004): id, unit_id, block_id, floor_id,
-- room_number, display_name, capacity, room_status, status, auditoria/soft-delete.
-- Esta migration NAO a recria -- usa ALTER TABLE. Em especial, NAO adiciona coluna de
-- capacidade: `capacity integer` ja' existe la' (004:45), com o check
-- rooms_capacity_positive.
--
-- Helpers e funcoes reutilizados (definidos em migrations ja' aplicadas, NAO recriados):
--   public.update_updated_at_column()   -- 008
--   public.write_audit_trail()          -- 008
--   public.user_has_unit_access(uuid)   -- 009
--
-- Idempotente: `if not exists` em tabela, colunas, indices e policies; triggers com
-- `drop trigger if exists` antes do create.
-- ============================================================================


-- ============================================================================
-- A) public.room_types — catalogo de tipos de UH, POR UNIDADE
--
-- Escopo por unidade (unit_id not null, on delete restrict) igual ao resto da estrutura
-- operacional: cada unidade define os proprios tipos, e apagar unidade com tipos
-- cadastrados e' bloqueado em vez de arrastar o catalogo junto.
-- ============================================================================

create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete restrict,
  code text not null,
  name text not null,
  category text not null,
  bed_config text,
  -- Capacidade do TIPO (quantas pessoas o tipo comporta). Nao confundir com
  -- public.rooms.capacity, que e' a da UH individual e ja' existia na 004.
  capacity integer not null,
  beds integer,
  -- Quantas reservas alem da disponibilidade real o tipo aceita. default 0 = sem
  -- overbooking, que e' o comportamento seguro para quem nao configurar nada.
  overbooking_limit integer not null default 0,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint room_types_unit_code_unique unique (unit_id, code),
  constraint room_types_name_not_blank check (btrim(name) <> ''),
  constraint room_types_code_not_blank check (btrim(code) <> ''),
  constraint room_types_category_check check (category in ('standard', 'luxo', 'super_luxo')),
  constraint room_types_capacity_positive check (capacity >= 1),
  constraint room_types_beds_positive check (beds is null or beds >= 1),
  constraint room_types_overbooking_non_negative check (overbooking_limit >= 0)
);

comment on table public.room_types is
  'Catalogo de tipos de unidade habitacional, por unidade. Define categoria, capacidade, configuracao de camas e limite de overbooking. As UHs (public.rooms) apontam para um tipo via rooms.room_type_id.';

comment on column public.room_types.capacity is
  'Capacidade do TIPO. Nao confundir com public.rooms.capacity, que e a da UH individual (migration 004).';

comment on column public.room_types.overbooking_limit is
  'Quantas reservas alem da disponibilidade real este tipo aceita. 0 = sem overbooking (default).';

create index if not exists room_types_unit_id_idx on public.room_types (unit_id);
create index if not exists room_types_status_idx on public.room_types (status);
create index if not exists room_types_created_at_idx on public.room_types (created_at);


-- ============================================================================
-- B) public.rooms — SOMENTE ADD COLUMN
--
-- Tudo nullable ou com default: nenhuma linha existente precisa ser preenchida e nenhuma
-- escrita atual passa a falhar. `room_type_id` nasce nulo em todas as UHs ja' cadastradas
-- -- a associacao e' feita pela aplicacao, em fatia posterior.
-- ============================================================================

alter table public.rooms
  -- on delete set null: apagar um tipo NAO apaga a UH. A UH fica sem tipo e reaparece
  -- para reclassificacao, em vez de sumir do inventario junto com o catalogo.
  add column if not exists room_type_id uuid references public.room_types(id) on delete set null,
  add column if not exists is_connecting boolean not null default false,
  -- Auto-referencia: a UH conjugada e' outra UH. on delete set null pelo mesmo motivo
  -- acima -- remover uma das duas nao pode arrastar a outra.
  add column if not exists connecting_room_id uuid references public.rooms(id) on delete set null,
  add column if not exists climate_control text,
  add column if not exists has_minibar boolean not null default false;

-- Check em coluna nova, com `null or ...`: as linhas existentes tem climate_control nulo e
-- continuam validas. `if not exists` nao existe para constraint, entao o bloco e' guardado
-- pelo catalogo para a migration poder ser reaplicada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_climate_control_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms
      add constraint rooms_climate_control_check
      check (climate_control is null or climate_control in ('ar_condicionado', 'ventilador'));
  end if;
end;
$$;

comment on column public.rooms.room_type_id is
  'Tipo da UH (public.room_types). Nulo = ainda nao classificada. on delete set null: apagar o tipo nao apaga a UH.';

comment on column public.rooms.connecting_room_id is
  'UH conjugada a esta. Auto-referencia; on delete set null para que remover uma nao arraste a outra.';

create index if not exists rooms_room_type_id_idx on public.rooms (room_type_id);


-- ============================================================================
-- C) Triggers de room_types
--
-- Mesmo padrao da 054: guarda com to_regprocedure, para a migration nao quebrar caso a
-- funcao ainda nao exista no destino -- avisa e segue, em vez de abortar tudo.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is null then
    raise notice 'Funcao public.update_updated_at_column() nao encontrada. Trigger de updated_at nao foi criado para room_types.';
    return;
  end if;

  execute format('drop trigger if exists %I on public.%I', 'set_updated_at_room_types', 'room_types');
  execute format(
    'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
    'set_updated_at_room_types',
    'room_types'
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.write_audit_trail()') is null then
    raise notice 'Funcao public.write_audit_trail() nao encontrada. Auditoria generica de room_types devera ser adicionada em migration futura.';
    return;
  end if;

  execute format('drop trigger if exists %I on public.%I', 'audit_room_types', 'room_types');
  execute format(
    'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_trail()',
    'audit_room_types',
    'room_types'
  );
end;
$$;


-- ============================================================================
-- D) RLS de room_types — mesmo desenho da 066
--
--   * escopo direto por unidade, via public.user_has_unit_access(unit_id);
--   * SEM policy de delete  -> delete fica negado para anon/authenticated;
--   * SEM policy para anon  -> anon fica negado em tudo.
--
-- A service_role ignora RLS, entao as rotas do servidor seguem funcionando.
-- ============================================================================

alter table public.room_types enable row level security;

drop policy if exists "room_types_authenticated_select_by_unit" on public.room_types;
create policy "room_types_authenticated_select_by_unit"
on public.room_types
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "room_types_authenticated_insert_by_unit" on public.room_types;
create policy "room_types_authenticated_insert_by_unit"
on public.room_types
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "room_types_authenticated_update_by_unit" on public.room_types;
create policy "room_types_authenticated_update_by_unit"
on public.room_types
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));


-- ============================================================================
-- VALIDACAO (rodar APOS aplicar, staging antes de producao)
-- ============================================================================
--
-- 1) A tabela nova existe com as constraints esperadas:
--
--    select conname, pg_get_constraintdef(oid)
--    from pg_constraint where conrelid = 'public.room_types'::regclass
--    order by conname;
--
-- 2) As 5 colunas novas entraram em rooms, e as antigas continuam la':
--
--    select column_name, data_type, is_nullable, column_default
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'rooms'
--    order by ordinal_position;
--    -- esperado: capacity (a de 004) presente e INTACTA; room_type_id, is_connecting,
--    --           connecting_room_id, climate_control, has_minibar acrescentadas.
--
-- 3) Nenhuma UH existente foi afetada:
--
--    select count(*) as total,
--           count(*) filter (where room_type_id is null) as sem_tipo,
--           count(*) filter (where is_connecting) as conjugadas
--    from public.rooms where deleted_at is null;
--    -- esperado: sem_tipo = total, conjugadas = 0 (as colunas nascem vazias/false)
--
-- 4) Triggers ligados:
--
--    select tgname from pg_trigger
--    where tgrelid = 'public.room_types'::regclass and not tgisinternal;
--    -- esperado: set_updated_at_room_types, audit_room_types
--
-- 5) RLS ligada com exatamente 3 policies, nenhuma de delete e nenhuma para anon:
--
--    select relrowsecurity from pg_class where oid = 'public.room_types'::regclass;
--    -- esperado: t
--
--    select policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename = 'room_types' order by policyname;
--    -- esperado: 3 linhas (select/insert/update), todas para {authenticated}
--
--
-- ============================================================================
-- ROLLBACK (nao executar junto; so' se for preciso desfazer)
-- ============================================================================
--
-- ATENCAO A ORDEM: as colunas de rooms saem ANTES da tabela room_types, porque
-- rooms.room_type_id referencia room_types. Na ordem inversa o drop da tabela falha.
--
-- CUIDADO: `drop column` DESTROI dado. Se ja' houver UHs classificadas, a associacao
-- tipo<->UH e' perdida e nao volta. Exporte antes se isso importar.
--
--   -- 1) colunas acrescentadas em rooms (e o check da climate_control)
--   alter table public.rooms drop constraint if exists rooms_climate_control_check;
--   drop index if exists public.rooms_room_type_id_idx;
--   alter table public.rooms
--     drop column if exists has_minibar,
--     drop column if exists climate_control,
--     drop column if exists connecting_room_id,
--     drop column if exists is_connecting,
--     drop column if exists room_type_id;
--
--   -- 2) policies, triggers e a tabela nova
--   drop policy if exists "room_types_authenticated_update_by_unit" on public.room_types;
--   drop policy if exists "room_types_authenticated_insert_by_unit" on public.room_types;
--   drop policy if exists "room_types_authenticated_select_by_unit" on public.room_types;
--   drop trigger if exists audit_room_types on public.room_types;
--   drop trigger if exists set_updated_at_room_types on public.room_types;
--   drop index if exists public.room_types_created_at_idx;
--   drop index if exists public.room_types_status_idx;
--   drop index if exists public.room_types_unit_id_idx;
--   drop table if exists public.room_types;
--
-- ============================================================================
