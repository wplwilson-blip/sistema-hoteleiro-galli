-- Migration 071 - RLS Fatia 1: RH ligado a empregado, escopo por UNIDADE.
--
-- Estas tabelas tem RLS habilitado (migrations 003/021/047/048/052/053/054) mas ficaram SEM
-- policy. Esta migration adiciona policies de unidade, como defesa em profundidade contra acesso
-- cross-unidade a dado de RH. Espelha EXATAMENTE a forma da migration 069.
--
-- Premissas (ver docs/codex/19-plano-rls-fatia1.md):
--   * RLS ja habilitado nestas tabelas; aqui so criamos policies.
--   * service_role ignora RLS por natureza; APIs de RH seguem via service_role.
--   * Helper reutilizado (definido na 009, NAO recriado aqui):
--       public.user_has_unit_access(target_unit_id uuid)
--   * Sem policy de delete: delete fica negado para anon/authenticated (soft delete via update).
--   * Sem policy para anon: anon fica negado.
--   * CAMADA 1 = so escopo de unidade. A permissao sensivel (HR:*.sensitive.view)
--     continua checada na aplicacao (api-auth.ts) e sera levada ao banco na CAMADA 2.
--
-- NAO altera estrutura de tabela, triggers nem helpers. Nao edita migrations aplicadas.

-- =====================================================================
-- Tabelas com unit_id proprio
--   SELECT/INSERT/UPDATE por public.user_has_unit_access(unit_id).
-- =====================================================================

-- employees
drop policy if exists "employees_authenticated_select_by_unit" on public.employees;
create policy "employees_authenticated_select_by_unit"
on public.employees
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employees_authenticated_insert_by_unit" on public.employees;
create policy "employees_authenticated_insert_by_unit"
on public.employees
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employees_authenticated_update_by_unit" on public.employees;
create policy "employees_authenticated_update_by_unit"
on public.employees
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_functional_events
drop policy if exists "employee_functional_events_authenticated_select_by_unit" on public.employee_functional_events;
create policy "employee_functional_events_authenticated_select_by_unit"
on public.employee_functional_events
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_functional_events_authenticated_insert_by_unit" on public.employee_functional_events;
create policy "employee_functional_events_authenticated_insert_by_unit"
on public.employee_functional_events
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_functional_events_authenticated_update_by_unit" on public.employee_functional_events;
create policy "employee_functional_events_authenticated_update_by_unit"
on public.employee_functional_events
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_movements
drop policy if exists "employee_movements_authenticated_select_by_unit" on public.employee_movements;
create policy "employee_movements_authenticated_select_by_unit"
on public.employee_movements
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_movements_authenticated_insert_by_unit" on public.employee_movements;
create policy "employee_movements_authenticated_insert_by_unit"
on public.employee_movements
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_movements_authenticated_update_by_unit" on public.employee_movements;
create policy "employee_movements_authenticated_update_by_unit"
on public.employee_movements
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_development_plans
drop policy if exists "employee_development_plans_authenticated_select_by_unit" on public.employee_development_plans;
create policy "employee_development_plans_authenticated_select_by_unit"
on public.employee_development_plans
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_development_plans_authenticated_insert_by_unit" on public.employee_development_plans;
create policy "employee_development_plans_authenticated_insert_by_unit"
on public.employee_development_plans
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_development_plans_authenticated_update_by_unit" on public.employee_development_plans;
create policy "employee_development_plans_authenticated_update_by_unit"
on public.employee_development_plans
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_onboardings
drop policy if exists "employee_onboardings_authenticated_select_by_unit" on public.employee_onboardings;
create policy "employee_onboardings_authenticated_select_by_unit"
on public.employee_onboardings
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_onboardings_authenticated_insert_by_unit" on public.employee_onboardings;
create policy "employee_onboardings_authenticated_insert_by_unit"
on public.employee_onboardings
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_onboardings_authenticated_update_by_unit" on public.employee_onboardings;
create policy "employee_onboardings_authenticated_update_by_unit"
on public.employee_onboardings
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_onboarding_items (unit_id proprio/denormalizado)
drop policy if exists "employee_onboarding_items_authenticated_select_by_unit" on public.employee_onboarding_items;
create policy "employee_onboarding_items_authenticated_select_by_unit"
on public.employee_onboarding_items
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_onboarding_items_authenticated_insert_by_unit" on public.employee_onboarding_items;
create policy "employee_onboarding_items_authenticated_insert_by_unit"
on public.employee_onboarding_items
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_onboarding_items_authenticated_update_by_unit" on public.employee_onboarding_items;
create policy "employee_onboarding_items_authenticated_update_by_unit"
on public.employee_onboarding_items
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_trainings
drop policy if exists "employee_trainings_authenticated_select_by_unit" on public.employee_trainings;
create policy "employee_trainings_authenticated_select_by_unit"
on public.employee_trainings
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_trainings_authenticated_insert_by_unit" on public.employee_trainings;
create policy "employee_trainings_authenticated_insert_by_unit"
on public.employee_trainings
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_trainings_authenticated_update_by_unit" on public.employee_trainings;
create policy "employee_trainings_authenticated_update_by_unit"
on public.employee_trainings
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- =====================================================================
-- Tabelas filhas sem unit_id proprio (heranca por exists contra o pai)
-- =====================================================================

-- employee_movement_approvals -> employee_movements (movement_id)
drop policy if exists "employee_movement_approvals_authenticated_select_by_parent_unit" on public.employee_movement_approvals;
create policy "employee_movement_approvals_authenticated_select_by_parent_unit"
on public.employee_movement_approvals
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_movements p
    where p.id = employee_movement_approvals.movement_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_movement_approvals_authenticated_insert_by_parent_unit" on public.employee_movement_approvals;
create policy "employee_movement_approvals_authenticated_insert_by_parent_unit"
on public.employee_movement_approvals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_movements p
    where p.id = employee_movement_approvals.movement_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_movement_approvals_authenticated_update_by_parent_unit" on public.employee_movement_approvals;
create policy "employee_movement_approvals_authenticated_update_by_parent_unit"
on public.employee_movement_approvals
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_movements p
    where p.id = employee_movement_approvals.movement_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.employee_movements p
    where p.id = employee_movement_approvals.movement_id
      and public.user_has_unit_access(p.unit_id)
  )
);

-- employee_development_plan_items -> employee_development_plans (development_plan_id)
drop policy if exists "employee_development_plan_items_authenticated_select_by_parent_unit" on public.employee_development_plan_items;
create policy "employee_development_plan_items_authenticated_select_by_parent_unit"
on public.employee_development_plan_items
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_development_plans p
    where p.id = employee_development_plan_items.development_plan_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_development_plan_items_authenticated_insert_by_parent_unit" on public.employee_development_plan_items;
create policy "employee_development_plan_items_authenticated_insert_by_parent_unit"
on public.employee_development_plan_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_development_plans p
    where p.id = employee_development_plan_items.development_plan_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_development_plan_items_authenticated_update_by_parent_unit" on public.employee_development_plan_items;
create policy "employee_development_plan_items_authenticated_update_by_parent_unit"
on public.employee_development_plan_items
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_development_plans p
    where p.id = employee_development_plan_items.development_plan_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.employee_development_plans p
    where p.id = employee_development_plan_items.development_plan_id
      and public.user_has_unit_access(p.unit_id)
  )
);
