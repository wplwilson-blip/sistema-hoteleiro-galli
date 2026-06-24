-- Migration 066 - RLS policies, etapa 1, tabelas nao sensiveis.
-- Defesa em profundidade caso chaves anon/authenticated sejam usadas direto contra o Supabase.
--
-- Premissas (ver docs/2-plano-rls.md):
--   * RLS ja foi habilitado nestas tabelas nas migrations 009/015/017/019.
--   * service_role ignora RLS por natureza; APIs server-side seguem usando service_role.
--   * Helpers reutilizados (definidos na 009, NAO recriados aqui):
--       public.current_app_user_id()
--       public.user_has_unit_access(target_unit_id uuid)
--   * Sem policy de delete: delete fica negado para anon/authenticated.
--   * Sem policy para anon: anon fica negado em tudo.
--   * Nenhuma tabela de RH sensivel entra nesta etapa (lista de exclusao no plano).
--
-- Esta migration nao altera estrutura de tabela e nao edita migrations ja aplicadas.

-- =====================================================================
-- 4.1 Escopo direto por unidade
--     SELECT/INSERT/UPDATE por public.user_has_unit_access(unit_id).
-- =====================================================================

-- unit_settings
drop policy if exists "unit_settings_authenticated_select_by_unit" on public.unit_settings;
create policy "unit_settings_authenticated_select_by_unit"
on public.unit_settings
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "unit_settings_authenticated_insert_by_unit" on public.unit_settings;
create policy "unit_settings_authenticated_insert_by_unit"
on public.unit_settings
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "unit_settings_authenticated_update_by_unit" on public.unit_settings;
create policy "unit_settings_authenticated_update_by_unit"
on public.unit_settings
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- departments
drop policy if exists "departments_authenticated_select_by_unit" on public.departments;
create policy "departments_authenticated_select_by_unit"
on public.departments
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "departments_authenticated_insert_by_unit" on public.departments;
create policy "departments_authenticated_insert_by_unit"
on public.departments
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "departments_authenticated_update_by_unit" on public.departments;
create policy "departments_authenticated_update_by_unit"
on public.departments
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- job_positions
drop policy if exists "job_positions_authenticated_select_by_unit" on public.job_positions;
create policy "job_positions_authenticated_select_by_unit"
on public.job_positions
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "job_positions_authenticated_insert_by_unit" on public.job_positions;
create policy "job_positions_authenticated_insert_by_unit"
on public.job_positions
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "job_positions_authenticated_update_by_unit" on public.job_positions;
create policy "job_positions_authenticated_update_by_unit"
on public.job_positions
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- blocks
drop policy if exists "blocks_authenticated_select_by_unit" on public.blocks;
create policy "blocks_authenticated_select_by_unit"
on public.blocks
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "blocks_authenticated_insert_by_unit" on public.blocks;
create policy "blocks_authenticated_insert_by_unit"
on public.blocks
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "blocks_authenticated_update_by_unit" on public.blocks;
create policy "blocks_authenticated_update_by_unit"
on public.blocks
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- floors
drop policy if exists "floors_authenticated_select_by_unit" on public.floors;
create policy "floors_authenticated_select_by_unit"
on public.floors
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "floors_authenticated_insert_by_unit" on public.floors;
create policy "floors_authenticated_insert_by_unit"
on public.floors
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "floors_authenticated_update_by_unit" on public.floors;
create policy "floors_authenticated_update_by_unit"
on public.floors
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- rooms
drop policy if exists "rooms_authenticated_select_by_unit" on public.rooms;
create policy "rooms_authenticated_select_by_unit"
on public.rooms
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "rooms_authenticated_insert_by_unit" on public.rooms;
create policy "rooms_authenticated_insert_by_unit"
on public.rooms
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "rooms_authenticated_update_by_unit" on public.rooms;
create policy "rooms_authenticated_update_by_unit"
on public.rooms
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- operational_areas
drop policy if exists "operational_areas_authenticated_select_by_unit" on public.operational_areas;
create policy "operational_areas_authenticated_select_by_unit"
on public.operational_areas
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "operational_areas_authenticated_insert_by_unit" on public.operational_areas;
create policy "operational_areas_authenticated_insert_by_unit"
on public.operational_areas
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "operational_areas_authenticated_update_by_unit" on public.operational_areas;
create policy "operational_areas_authenticated_update_by_unit"
on public.operational_areas
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- operational_locations
drop policy if exists "operational_locations_authenticated_select_by_unit" on public.operational_locations;
create policy "operational_locations_authenticated_select_by_unit"
on public.operational_locations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "operational_locations_authenticated_insert_by_unit" on public.operational_locations;
create policy "operational_locations_authenticated_insert_by_unit"
on public.operational_locations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "operational_locations_authenticated_update_by_unit" on public.operational_locations;
create policy "operational_locations_authenticated_update_by_unit"
on public.operational_locations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- equipment_assets
drop policy if exists "equipment_assets_authenticated_select_by_unit" on public.equipment_assets;
create policy "equipment_assets_authenticated_select_by_unit"
on public.equipment_assets
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "equipment_assets_authenticated_insert_by_unit" on public.equipment_assets;
create policy "equipment_assets_authenticated_insert_by_unit"
on public.equipment_assets
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "equipment_assets_authenticated_update_by_unit" on public.equipment_assets;
create policy "equipment_assets_authenticated_update_by_unit"
on public.equipment_assets
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- cost_centers
drop policy if exists "cost_centers_authenticated_select_by_unit" on public.cost_centers;
create policy "cost_centers_authenticated_select_by_unit"
on public.cost_centers
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "cost_centers_authenticated_insert_by_unit" on public.cost_centers;
create policy "cost_centers_authenticated_insert_by_unit"
on public.cost_centers
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "cost_centers_authenticated_update_by_unit" on public.cost_centers;
create policy "cost_centers_authenticated_update_by_unit"
on public.cost_centers
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- approval_requests
drop policy if exists "approval_requests_authenticated_select_by_unit" on public.approval_requests;
create policy "approval_requests_authenticated_select_by_unit"
on public.approval_requests
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "approval_requests_authenticated_insert_by_unit" on public.approval_requests;
create policy "approval_requests_authenticated_insert_by_unit"
on public.approval_requests
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "approval_requests_authenticated_update_by_unit" on public.approval_requests;
create policy "approval_requests_authenticated_update_by_unit"
on public.approval_requests
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- notifications
drop policy if exists "notifications_authenticated_select_by_unit" on public.notifications;
create policy "notifications_authenticated_select_by_unit"
on public.notifications
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "notifications_authenticated_insert_by_unit" on public.notifications;
create policy "notifications_authenticated_insert_by_unit"
on public.notifications
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "notifications_authenticated_update_by_unit" on public.notifications;
create policy "notifications_authenticated_update_by_unit"
on public.notifications
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- suppliers
drop policy if exists "suppliers_authenticated_select_by_unit" on public.suppliers;
create policy "suppliers_authenticated_select_by_unit"
on public.suppliers
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "suppliers_authenticated_insert_by_unit" on public.suppliers;
create policy "suppliers_authenticated_insert_by_unit"
on public.suppliers
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "suppliers_authenticated_update_by_unit" on public.suppliers;
create policy "suppliers_authenticated_update_by_unit"
on public.suppliers
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- attachments (apenas protecao por unidade nesta etapa; regras finas de visibility_scope/LGPD ficam para etapa especifica)
drop policy if exists "attachments_authenticated_select_by_unit" on public.attachments;
create policy "attachments_authenticated_select_by_unit"
on public.attachments
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "attachments_authenticated_insert_by_unit" on public.attachments;
create policy "attachments_authenticated_insert_by_unit"
on public.attachments
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "attachments_authenticated_update_by_unit" on public.attachments;
create policy "attachments_authenticated_update_by_unit"
on public.attachments
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- comments
drop policy if exists "comments_authenticated_select_by_unit" on public.comments;
create policy "comments_authenticated_select_by_unit"
on public.comments
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "comments_authenticated_insert_by_unit" on public.comments;
create policy "comments_authenticated_insert_by_unit"
on public.comments
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "comments_authenticated_update_by_unit" on public.comments;
create policy "comments_authenticated_update_by_unit"
on public.comments
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- room_status_history
drop policy if exists "room_status_history_authenticated_select_by_unit" on public.room_status_history;
create policy "room_status_history_authenticated_select_by_unit"
on public.room_status_history
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "room_status_history_authenticated_insert_by_unit" on public.room_status_history;
create policy "room_status_history_authenticated_insert_by_unit"
on public.room_status_history
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "room_status_history_authenticated_update_by_unit" on public.room_status_history;
create policy "room_status_history_authenticated_update_by_unit"
on public.room_status_history
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- budget_periods
drop policy if exists "budget_periods_authenticated_select_by_unit" on public.budget_periods;
create policy "budget_periods_authenticated_select_by_unit"
on public.budget_periods
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "budget_periods_authenticated_insert_by_unit" on public.budget_periods;
create policy "budget_periods_authenticated_insert_by_unit"
on public.budget_periods
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "budget_periods_authenticated_update_by_unit" on public.budget_periods;
create policy "budget_periods_authenticated_update_by_unit"
on public.budget_periods
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- budget_lines
drop policy if exists "budget_lines_authenticated_select_by_unit" on public.budget_lines;
create policy "budget_lines_authenticated_select_by_unit"
on public.budget_lines
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "budget_lines_authenticated_insert_by_unit" on public.budget_lines;
create policy "budget_lines_authenticated_insert_by_unit"
on public.budget_lines
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "budget_lines_authenticated_update_by_unit" on public.budget_lines;
create policy "budget_lines_authenticated_update_by_unit"
on public.budget_lines
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- budget_movements
drop policy if exists "budget_movements_authenticated_select_by_unit" on public.budget_movements;
create policy "budget_movements_authenticated_select_by_unit"
on public.budget_movements
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "budget_movements_authenticated_insert_by_unit" on public.budget_movements;
create policy "budget_movements_authenticated_insert_by_unit"
on public.budget_movements
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "budget_movements_authenticated_update_by_unit" on public.budget_movements;
create policy "budget_movements_authenticated_update_by_unit"
on public.budget_movements
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- budget_reservations
drop policy if exists "budget_reservations_authenticated_select_by_unit" on public.budget_reservations;
create policy "budget_reservations_authenticated_select_by_unit"
on public.budget_reservations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "budget_reservations_authenticated_insert_by_unit" on public.budget_reservations;
create policy "budget_reservations_authenticated_insert_by_unit"
on public.budget_reservations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "budget_reservations_authenticated_update_by_unit" on public.budget_reservations;
create policy "budget_reservations_authenticated_update_by_unit"
on public.budget_reservations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- budget_change_requests
drop policy if exists "budget_change_requests_authenticated_select_by_unit" on public.budget_change_requests;
create policy "budget_change_requests_authenticated_select_by_unit"
on public.budget_change_requests
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "budget_change_requests_authenticated_insert_by_unit" on public.budget_change_requests;
create policy "budget_change_requests_authenticated_insert_by_unit"
on public.budget_change_requests
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "budget_change_requests_authenticated_update_by_unit" on public.budget_change_requests;
create policy "budget_change_requests_authenticated_update_by_unit"
on public.budget_change_requests
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_requests
drop policy if exists "purchase_requests_authenticated_select_by_unit" on public.purchase_requests;
create policy "purchase_requests_authenticated_select_by_unit"
on public.purchase_requests
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_requests_authenticated_insert_by_unit" on public.purchase_requests;
create policy "purchase_requests_authenticated_insert_by_unit"
on public.purchase_requests
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_requests_authenticated_update_by_unit" on public.purchase_requests;
create policy "purchase_requests_authenticated_update_by_unit"
on public.purchase_requests
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_quotes
drop policy if exists "purchase_quotes_authenticated_select_by_unit" on public.purchase_quotes;
create policy "purchase_quotes_authenticated_select_by_unit"
on public.purchase_quotes
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_quotes_authenticated_insert_by_unit" on public.purchase_quotes;
create policy "purchase_quotes_authenticated_insert_by_unit"
on public.purchase_quotes
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_quotes_authenticated_update_by_unit" on public.purchase_quotes;
create policy "purchase_quotes_authenticated_update_by_unit"
on public.purchase_quotes
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_receipts
drop policy if exists "purchase_receipts_authenticated_select_by_unit" on public.purchase_receipts;
create policy "purchase_receipts_authenticated_select_by_unit"
on public.purchase_receipts
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_receipts_authenticated_insert_by_unit" on public.purchase_receipts;
create policy "purchase_receipts_authenticated_insert_by_unit"
on public.purchase_receipts
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_receipts_authenticated_update_by_unit" on public.purchase_receipts;
create policy "purchase_receipts_authenticated_update_by_unit"
on public.purchase_receipts
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_request_events
drop policy if exists "purchase_request_events_authenticated_select_by_unit" on public.purchase_request_events;
create policy "purchase_request_events_authenticated_select_by_unit"
on public.purchase_request_events
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_request_events_authenticated_insert_by_unit" on public.purchase_request_events;
create policy "purchase_request_events_authenticated_insert_by_unit"
on public.purchase_request_events
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_request_events_authenticated_update_by_unit" on public.purchase_request_events;
create policy "purchase_request_events_authenticated_update_by_unit"
on public.purchase_request_events
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_approval_decisions
drop policy if exists "purchase_approval_decisions_authenticated_select_by_unit" on public.purchase_approval_decisions;
create policy "purchase_approval_decisions_authenticated_select_by_unit"
on public.purchase_approval_decisions
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_approval_decisions_authenticated_insert_by_unit" on public.purchase_approval_decisions;
create policy "purchase_approval_decisions_authenticated_insert_by_unit"
on public.purchase_approval_decisions
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_approval_decisions_authenticated_update_by_unit" on public.purchase_approval_decisions;
create policy "purchase_approval_decisions_authenticated_update_by_unit"
on public.purchase_approval_decisions
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_quote_negotiations
drop policy if exists "purchase_quote_negotiations_authenticated_select_by_unit" on public.purchase_quote_negotiations;
create policy "purchase_quote_negotiations_authenticated_select_by_unit"
on public.purchase_quote_negotiations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_quote_negotiations_authenticated_insert_by_unit" on public.purchase_quote_negotiations;
create policy "purchase_quote_negotiations_authenticated_insert_by_unit"
on public.purchase_quote_negotiations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_quote_negotiations_authenticated_update_by_unit" on public.purchase_quote_negotiations;
create policy "purchase_quote_negotiations_authenticated_update_by_unit"
on public.purchase_quote_negotiations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- purchase_approval_snapshots
drop policy if exists "purchase_approval_snapshots_authenticated_select_by_unit" on public.purchase_approval_snapshots;
create policy "purchase_approval_snapshots_authenticated_select_by_unit"
on public.purchase_approval_snapshots
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_approval_snapshots_authenticated_insert_by_unit" on public.purchase_approval_snapshots;
create policy "purchase_approval_snapshots_authenticated_insert_by_unit"
on public.purchase_approval_snapshots
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "purchase_approval_snapshots_authenticated_update_by_unit" on public.purchase_approval_snapshots;
create policy "purchase_approval_snapshots_authenticated_update_by_unit"
on public.purchase_approval_snapshots
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- =====================================================================
-- 4.2 Tabela units (a propria coluna id representa a unidade alvo)
-- =====================================================================

drop policy if exists "units_authenticated_select_by_own_unit" on public.units;
create policy "units_authenticated_select_by_own_unit"
on public.units
for select
to authenticated
using (public.user_has_unit_access(id));

drop policy if exists "units_authenticated_insert_by_own_unit" on public.units;
create policy "units_authenticated_insert_by_own_unit"
on public.units
for insert
to authenticated
with check (public.user_has_unit_access(id));

drop policy if exists "units_authenticated_update_by_own_unit" on public.units;
create policy "units_authenticated_update_by_own_unit"
on public.units
for update
to authenticated
using (public.user_has_unit_access(id))
with check (public.user_has_unit_access(id));

-- =====================================================================
-- 4.3 Catalogos globais e cadastros de permissao (SELECT para authenticated)
-- =====================================================================

drop policy if exists "organizations_authenticated_select_catalog" on public.organizations;
create policy "organizations_authenticated_select_catalog"
on public.organizations
for select
to authenticated
using (true);

drop policy if exists "permissions_authenticated_select_catalog" on public.permissions;
create policy "permissions_authenticated_select_catalog"
on public.permissions
for select
to authenticated
using (true);

drop policy if exists "access_profiles_authenticated_select_catalog" on public.access_profiles;
create policy "access_profiles_authenticated_select_catalog"
on public.access_profiles
for select
to authenticated
using (true);

drop policy if exists "profile_permissions_authenticated_select_catalog" on public.profile_permissions;
create policy "profile_permissions_authenticated_select_catalog"
on public.profile_permissions
for select
to authenticated
using (true);

drop policy if exists "system_statuses_authenticated_select_catalog" on public.system_statuses;
create policy "system_statuses_authenticated_select_catalog"
on public.system_statuses
for select
to authenticated
using (true);

drop policy if exists "request_types_authenticated_select_catalog" on public.request_types;
create policy "request_types_authenticated_select_catalog"
on public.request_types
for select
to authenticated
using (true);

drop policy if exists "attachment_types_authenticated_select_catalog" on public.attachment_types;
create policy "attachment_types_authenticated_select_catalog"
on public.attachment_types
for select
to authenticated
using (true);

drop policy if exists "operational_categories_authenticated_select_catalog" on public.operational_categories;
create policy "operational_categories_authenticated_select_catalog"
on public.operational_categories
for select
to authenticated
using (true);

drop policy if exists "approval_levels_authenticated_select_catalog" on public.approval_levels;
create policy "approval_levels_authenticated_select_catalog"
on public.approval_levels
for select
to authenticated
using (true);

drop policy if exists "notification_rules_authenticated_select_catalog" on public.notification_rules;
create policy "notification_rules_authenticated_select_catalog"
on public.notification_rules
for select
to authenticated
using (true);

-- =====================================================================
-- 4.4 Catalogo misto: approval_flows (global OU por unidade)
-- =====================================================================

drop policy if exists "approval_flows_authenticated_select_scoped" on public.approval_flows;
create policy "approval_flows_authenticated_select_scoped"
on public.approval_flows
for select
to authenticated
using (
  is_global = true
  or (unit_id is not null and public.user_has_unit_access(unit_id))
);

-- =====================================================================
-- 4.5 Identidade e vinculos do proprio usuario
-- =====================================================================

drop policy if exists "app_users_authenticated_select_self" on public.app_users;
create policy "app_users_authenticated_select_self"
on public.app_users
for select
to authenticated
using (id = public.current_app_user_id());

drop policy if exists "user_unit_links_authenticated_select_self" on public.user_unit_links;
create policy "user_unit_links_authenticated_select_self"
on public.user_unit_links
for select
to authenticated
using (app_user_id = public.current_app_user_id());

drop policy if exists "user_permission_overrides_authenticated_select_self" on public.user_permission_overrides;
create policy "user_permission_overrides_authenticated_select_self"
on public.user_permission_overrides
for select
to authenticated
using (app_user_id = public.current_app_user_id());

drop policy if exists "user_employee_links_authenticated_select_self" on public.user_employee_links;
create policy "user_employee_links_authenticated_select_self"
on public.user_employee_links
for select
to authenticated
using (app_user_id = public.current_app_user_id());

-- =====================================================================
-- 4.6 Filhas sem unit_id proprio (heranca por exists contra o pai)
-- =====================================================================

-- approval_steps -> approval_requests
drop policy if exists "approval_steps_authenticated_select_by_parent_unit" on public.approval_steps;
create policy "approval_steps_authenticated_select_by_parent_unit"
on public.approval_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_steps.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

drop policy if exists "approval_steps_authenticated_insert_by_parent_unit" on public.approval_steps;
create policy "approval_steps_authenticated_insert_by_parent_unit"
on public.approval_steps
for insert
to authenticated
with check (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_steps.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

drop policy if exists "approval_steps_authenticated_update_by_parent_unit" on public.approval_steps;
create policy "approval_steps_authenticated_update_by_parent_unit"
on public.approval_steps
for update
to authenticated
using (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_steps.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_steps.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

-- approval_actions -> approval_requests
drop policy if exists "approval_actions_authenticated_select_by_parent_unit" on public.approval_actions;
create policy "approval_actions_authenticated_select_by_parent_unit"
on public.approval_actions
for select
to authenticated
using (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_actions.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

drop policy if exists "approval_actions_authenticated_insert_by_parent_unit" on public.approval_actions;
create policy "approval_actions_authenticated_insert_by_parent_unit"
on public.approval_actions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_actions.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

drop policy if exists "approval_actions_authenticated_update_by_parent_unit" on public.approval_actions;
create policy "approval_actions_authenticated_update_by_parent_unit"
on public.approval_actions
for update
to authenticated
using (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_actions.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.approval_requests ar
    where ar.id = approval_actions.approval_request_id
      and ar.unit_id is not null
      and public.user_has_unit_access(ar.unit_id)
  )
);

-- =====================================================================
-- 4.7 Filhas de compras com unit_id proprio e pai obrigatorio
--     Policy direta por unit_id + consistencia com o pai.
-- =====================================================================

-- purchase_request_items -> purchase_requests
drop policy if exists "purchase_request_items_authenticated_select_by_unit" on public.purchase_request_items;
create policy "purchase_request_items_authenticated_select_by_unit"
on public.purchase_request_items
for select
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_requests pr
    where pr.id = purchase_request_items.purchase_request_id
      and pr.unit_id = purchase_request_items.unit_id
      and public.user_has_unit_access(pr.unit_id)
  )
);

drop policy if exists "purchase_request_items_authenticated_insert_by_unit" on public.purchase_request_items;
create policy "purchase_request_items_authenticated_insert_by_unit"
on public.purchase_request_items
for insert
to authenticated
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_requests pr
    where pr.id = purchase_request_items.purchase_request_id
      and pr.unit_id = purchase_request_items.unit_id
      and public.user_has_unit_access(pr.unit_id)
  )
);

drop policy if exists "purchase_request_items_authenticated_update_by_unit" on public.purchase_request_items;
create policy "purchase_request_items_authenticated_update_by_unit"
on public.purchase_request_items
for update
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_requests pr
    where pr.id = purchase_request_items.purchase_request_id
      and pr.unit_id = purchase_request_items.unit_id
      and public.user_has_unit_access(pr.unit_id)
  )
)
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_requests pr
    where pr.id = purchase_request_items.purchase_request_id
      and pr.unit_id = purchase_request_items.unit_id
      and public.user_has_unit_access(pr.unit_id)
  )
);

-- purchase_quote_items -> purchase_quotes
drop policy if exists "purchase_quote_items_authenticated_select_by_unit" on public.purchase_quote_items;
create policy "purchase_quote_items_authenticated_select_by_unit"
on public.purchase_quote_items
for select
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_quotes pq
    where pq.id = purchase_quote_items.purchase_quote_id
      and pq.unit_id = purchase_quote_items.unit_id
      and public.user_has_unit_access(pq.unit_id)
  )
);

drop policy if exists "purchase_quote_items_authenticated_insert_by_unit" on public.purchase_quote_items;
create policy "purchase_quote_items_authenticated_insert_by_unit"
on public.purchase_quote_items
for insert
to authenticated
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_quotes pq
    where pq.id = purchase_quote_items.purchase_quote_id
      and pq.unit_id = purchase_quote_items.unit_id
      and public.user_has_unit_access(pq.unit_id)
  )
);

drop policy if exists "purchase_quote_items_authenticated_update_by_unit" on public.purchase_quote_items;
create policy "purchase_quote_items_authenticated_update_by_unit"
on public.purchase_quote_items
for update
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_quotes pq
    where pq.id = purchase_quote_items.purchase_quote_id
      and pq.unit_id = purchase_quote_items.unit_id
      and public.user_has_unit_access(pq.unit_id)
  )
)
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_quotes pq
    where pq.id = purchase_quote_items.purchase_quote_id
      and pq.unit_id = purchase_quote_items.unit_id
      and public.user_has_unit_access(pq.unit_id)
  )
);

-- purchase_receipt_items -> purchase_receipts
drop policy if exists "purchase_receipt_items_authenticated_select_by_unit" on public.purchase_receipt_items;
create policy "purchase_receipt_items_authenticated_select_by_unit"
on public.purchase_receipt_items
for select
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_receipts prc
    where prc.id = purchase_receipt_items.purchase_receipt_id
      and prc.unit_id = purchase_receipt_items.unit_id
      and public.user_has_unit_access(prc.unit_id)
  )
);

drop policy if exists "purchase_receipt_items_authenticated_insert_by_unit" on public.purchase_receipt_items;
create policy "purchase_receipt_items_authenticated_insert_by_unit"
on public.purchase_receipt_items
for insert
to authenticated
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_receipts prc
    where prc.id = purchase_receipt_items.purchase_receipt_id
      and prc.unit_id = purchase_receipt_items.unit_id
      and public.user_has_unit_access(prc.unit_id)
  )
);

drop policy if exists "purchase_receipt_items_authenticated_update_by_unit" on public.purchase_receipt_items;
create policy "purchase_receipt_items_authenticated_update_by_unit"
on public.purchase_receipt_items
for update
to authenticated
using (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_receipts prc
    where prc.id = purchase_receipt_items.purchase_receipt_id
      and prc.unit_id = purchase_receipt_items.unit_id
      and public.user_has_unit_access(prc.unit_id)
  )
)
with check (
  public.user_has_unit_access(unit_id)
  and exists (
    select 1
    from public.purchase_receipts prc
    where prc.id = purchase_receipt_items.purchase_receipt_id
      and prc.unit_id = purchase_receipt_items.unit_id
      and public.user_has_unit_access(prc.unit_id)
  )
);

-- =====================================================================
-- 4.8 Logs fechados para anon/authenticated (service_role segue lendo/escrevendo)
-- =====================================================================

drop policy if exists "audit_trail_no_direct_access" on public.audit_trail;
create policy "audit_trail_no_direct_access"
on public.audit_trail
for all
to authenticated
using (false)
with check (false);

drop policy if exists "system_logs_no_direct_access" on public.system_logs;
create policy "system_logs_no_direct_access"
on public.system_logs
for all
to authenticated
using (false)
with check (false);
