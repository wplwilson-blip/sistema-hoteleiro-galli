-- Migration 077 - RLS Fatia 3a: workflows de RH + admissao, escopo por UNIDADE.
--
-- Estas 8 tabelas operacionais tem RLS habilitado (022/033/035/038/062) mas ficaram SEM
-- policy. Esta migration adiciona policies de unidade como defesa em profundidade contra
-- acesso cross-unidade a dado de RH. Espelha EXATAMENTE a forma da migration 071.
--
-- Premissas (ver docs/codex/38-plano-rls-fatia3a.md):
--   * RLS ja habilitado; o bloco "enable row level security" abaixo e idempotente/defensivo.
--   * service_role ignora RLS por natureza; APIs de RH seguem via service_role (app inalterado).
--   * Helper reutilizado (definido na 009, NAO recriado aqui):
--       public.user_has_unit_access(target_unit_id uuid)
--   * Sem policy de delete: delete fica negado para anon/authenticated (soft delete via update).
--   * Sem policy para anon: anon fica negado.
--   * hr_workflow_audit_logs e APPEND-ONLY: so select + insert, SEM update por design
--       (trilha de auditoria imutavel). As outras 7 tabelas tem select/insert/update.
--       Total: 23 policies (7 tabelas x 3 + audit_logs x 2).
--   * hr_admission_processes e hr_admission_checklist_items tem unit_id NULLABLE:
--       user_has_unit_access(NULL) = false => linha sem unidade fica SEM acesso authenticated
--       (fail-closed, seguro e intencional; ver plano §2).
--   * CAMADA 1 = so escopo de unidade. Gating sensivel (HR:*.sensitive) NAO entra nesta fatia
--     (fora de escopo; ver plano §6). Continua checado na aplicacao (api-auth.ts).
--
-- NAO altera estrutura de tabela, triggers nem helpers. Nao edita migrations aplicadas.

-- ---------------------------------------------------------------------
-- 0) Defensivo/idempotente: garante RLS habilitado (no-op se ja estiver).
-- ---------------------------------------------------------------------
alter table public.hr_workflows enable row level security;
alter table public.hr_workflow_steps enable row level security;
alter table public.hr_workflow_events enable row level security;
alter table public.hr_workflow_notifications enable row level security;
alter table public.hr_workflow_audit_logs enable row level security;
alter table public.hr_workflow_approver_delegations enable row level security;
alter table public.hr_admission_processes enable row level security;
alter table public.hr_admission_checklist_items enable row level security;

-- =====================================================================
-- Tabelas com unit_id proprio
--   SELECT/INSERT/UPDATE por public.user_has_unit_access(unit_id).
-- =====================================================================

-- hr_workflows
drop policy if exists "hr_workflows_authenticated_select_by_unit" on public.hr_workflows;
create policy "hr_workflows_authenticated_select_by_unit"
on public.hr_workflows
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflows_authenticated_insert_by_unit" on public.hr_workflows;
create policy "hr_workflows_authenticated_insert_by_unit"
on public.hr_workflows
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflows_authenticated_update_by_unit" on public.hr_workflows;
create policy "hr_workflows_authenticated_update_by_unit"
on public.hr_workflows
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_steps
drop policy if exists "hr_workflow_steps_authenticated_select_by_unit" on public.hr_workflow_steps;
create policy "hr_workflow_steps_authenticated_select_by_unit"
on public.hr_workflow_steps
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_steps_authenticated_insert_by_unit" on public.hr_workflow_steps;
create policy "hr_workflow_steps_authenticated_insert_by_unit"
on public.hr_workflow_steps
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_steps_authenticated_update_by_unit" on public.hr_workflow_steps;
create policy "hr_workflow_steps_authenticated_update_by_unit"
on public.hr_workflow_steps
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_events
drop policy if exists "hr_workflow_events_authenticated_select_by_unit" on public.hr_workflow_events;
create policy "hr_workflow_events_authenticated_select_by_unit"
on public.hr_workflow_events
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_events_authenticated_insert_by_unit" on public.hr_workflow_events;
create policy "hr_workflow_events_authenticated_insert_by_unit"
on public.hr_workflow_events
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_events_authenticated_update_by_unit" on public.hr_workflow_events;
create policy "hr_workflow_events_authenticated_update_by_unit"
on public.hr_workflow_events
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_notifications
drop policy if exists "hr_workflow_notifications_authenticated_select_by_unit" on public.hr_workflow_notifications;
create policy "hr_workflow_notifications_authenticated_select_by_unit"
on public.hr_workflow_notifications
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_notifications_authenticated_insert_by_unit" on public.hr_workflow_notifications;
create policy "hr_workflow_notifications_authenticated_insert_by_unit"
on public.hr_workflow_notifications
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_notifications_authenticated_update_by_unit" on public.hr_workflow_notifications;
create policy "hr_workflow_notifications_authenticated_update_by_unit"
on public.hr_workflow_notifications
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_audit_logs  (APPEND-ONLY: so select + insert; SEM update por design)
drop policy if exists "hr_workflow_audit_logs_authenticated_select_by_unit" on public.hr_workflow_audit_logs;
create policy "hr_workflow_audit_logs_authenticated_select_by_unit"
on public.hr_workflow_audit_logs
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_audit_logs_authenticated_insert_by_unit" on public.hr_workflow_audit_logs;
create policy "hr_workflow_audit_logs_authenticated_insert_by_unit"
on public.hr_workflow_audit_logs
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_approver_delegations
drop policy if exists "hr_workflow_approver_delegations_authenticated_select_by_unit" on public.hr_workflow_approver_delegations;
create policy "hr_workflow_approver_delegations_authenticated_select_by_unit"
on public.hr_workflow_approver_delegations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_approver_delegations_authenticated_insert_by_unit" on public.hr_workflow_approver_delegations;
create policy "hr_workflow_approver_delegations_authenticated_insert_by_unit"
on public.hr_workflow_approver_delegations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_approver_delegations_authenticated_update_by_unit" on public.hr_workflow_approver_delegations;
create policy "hr_workflow_approver_delegations_authenticated_update_by_unit"
on public.hr_workflow_approver_delegations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_admission_processes  (unit_id NULLABLE -> fail-closed; ver plano §2)
drop policy if exists "hr_admission_processes_authenticated_select_by_unit" on public.hr_admission_processes;
create policy "hr_admission_processes_authenticated_select_by_unit"
on public.hr_admission_processes
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_admission_processes_authenticated_insert_by_unit" on public.hr_admission_processes;
create policy "hr_admission_processes_authenticated_insert_by_unit"
on public.hr_admission_processes
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_admission_processes_authenticated_update_by_unit" on public.hr_admission_processes;
create policy "hr_admission_processes_authenticated_update_by_unit"
on public.hr_admission_processes
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_admission_checklist_items  (unit_id NULLABLE -> fail-closed; ver plano §2)
drop policy if exists "hr_admission_checklist_items_authenticated_select_by_unit" on public.hr_admission_checklist_items;
create policy "hr_admission_checklist_items_authenticated_select_by_unit"
on public.hr_admission_checklist_items
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_admission_checklist_items_authenticated_insert_by_unit" on public.hr_admission_checklist_items;
create policy "hr_admission_checklist_items_authenticated_insert_by_unit"
on public.hr_admission_checklist_items
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_admission_checklist_items_authenticated_update_by_unit" on public.hr_admission_checklist_items;
create policy "hr_admission_checklist_items_authenticated_update_by_unit"
on public.hr_admission_checklist_items
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));
