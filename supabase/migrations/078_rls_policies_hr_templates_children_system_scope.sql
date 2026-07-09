-- Migration 078 - RLS Fatia 3b: templates de RH (nullable-unit) + filhos + tabelas de sistema.
--
-- 12 tabelas com RLS habilitado e SEM policy. Defesa em profundidade por unidade. Espelha
-- EXATAMENTE as formas das migrations 071 (unit direto) e 072 (assimetrico nullable-unit e
-- filho-via-pai). service_role ignora RLS; o app segue via service_role (inalterado).
--
-- Premissas (ver docs/codex/39-plano-rls-fatia3b.md):
--   * RLS ja habilitado; o bloco "enable row level security" abaixo e idempotente/defensivo.
--   * Helper reutilizado (009, NAO recriado): public.user_has_unit_access(target_unit_id uuid).
--   * Sem delete; sem anon. Re-runnavel (drop policy if exists antes de cada create).
--   * SECAO A (assimetrico nullable-unit): LE rede (unit_id null) + propria unidade;
--       ESCREVE so unit-scoped (linha de rede e' gerida via service_role).
--   * SECAO B (filho-via-pai): EXISTS no pai; le se pai e' rede/unidade-acessivel,
--       escreve so se pai tem unit_id not null e acessivel.
--       hr_evaluation_template_criteria e' NETO (EXISTS de 2 niveis: section + template).
--   * SECAO C:
--       - hr_background_jobs: NOT NULL, READ-ONLY (so select). Escrita = service_role/cron.
--       - hr_workflow_idempotency_keys: mecanismo interno de transacao, nunca lido por
--         authenticated. SEM policy por design (service-role-only): RLS habilitado sem policy
--         ja nega authenticated. So enable RLS defensivo.
--   * CAMADA 1 = so escopo de unidade. Gating sensivel (HR:*.sensitive) fica FORA (aplicacao).
--
-- Nomes: <tabela>_authenticated_<comando>_by_unit (Secao A/C) | _by_parent (Secao B, uniforme
-- nas 4 filhas, para caber em 63 chars). Ver plano §0.3.
--
-- NAO altera estrutura de tabela, triggers nem helpers. Nao edita migrations aplicadas.

-- ---------------------------------------------------------------------
-- 0) Defensivo/idempotente: garante RLS habilitado (no-op se ja estiver).
-- ---------------------------------------------------------------------
alter table public.hr_evaluation_templates enable row level security;
alter table public.hr_onboarding_plans enable row level security;
alter table public.hr_trainings enable row level security;
alter table public.hr_document_types enable row level security;
alter table public.hr_document_rules enable row level security;
alter table public.hr_workflow_templates enable row level security;
alter table public.hr_evaluation_template_sections enable row level security;
alter table public.hr_onboarding_plan_items enable row level security;
alter table public.hr_workflow_template_steps enable row level security;
alter table public.hr_evaluation_template_criteria enable row level security;
alter table public.hr_background_jobs enable row level security;
alter table public.hr_workflow_idempotency_keys enable row level security;

-- =====================================================================
-- SECAO A - Assimetrico nullable-unit (padrao 072 hr_scorecard_templates)
--   SELECT: unit_id is null OR user_has_unit_access(unit_id)   (le rede + propria unidade)
--   INSERT: with check user_has_unit_access(unit_id)           (escreve so unit-scoped)
--   UPDATE: using/with check user_has_unit_access(unit_id)     (idem)
-- =====================================================================

-- hr_evaluation_templates
drop policy if exists "hr_evaluation_templates_authenticated_select_by_unit" on public.hr_evaluation_templates;
create policy "hr_evaluation_templates_authenticated_select_by_unit"
on public.hr_evaluation_templates
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_evaluation_templates_authenticated_insert_by_unit" on public.hr_evaluation_templates;
create policy "hr_evaluation_templates_authenticated_insert_by_unit"
on public.hr_evaluation_templates
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_evaluation_templates_authenticated_update_by_unit" on public.hr_evaluation_templates;
create policy "hr_evaluation_templates_authenticated_update_by_unit"
on public.hr_evaluation_templates
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_onboarding_plans
drop policy if exists "hr_onboarding_plans_authenticated_select_by_unit" on public.hr_onboarding_plans;
create policy "hr_onboarding_plans_authenticated_select_by_unit"
on public.hr_onboarding_plans
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_onboarding_plans_authenticated_insert_by_unit" on public.hr_onboarding_plans;
create policy "hr_onboarding_plans_authenticated_insert_by_unit"
on public.hr_onboarding_plans
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_onboarding_plans_authenticated_update_by_unit" on public.hr_onboarding_plans;
create policy "hr_onboarding_plans_authenticated_update_by_unit"
on public.hr_onboarding_plans
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_trainings
drop policy if exists "hr_trainings_authenticated_select_by_unit" on public.hr_trainings;
create policy "hr_trainings_authenticated_select_by_unit"
on public.hr_trainings
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_trainings_authenticated_insert_by_unit" on public.hr_trainings;
create policy "hr_trainings_authenticated_insert_by_unit"
on public.hr_trainings
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_trainings_authenticated_update_by_unit" on public.hr_trainings;
create policy "hr_trainings_authenticated_update_by_unit"
on public.hr_trainings
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_document_types
drop policy if exists "hr_document_types_authenticated_select_by_unit" on public.hr_document_types;
create policy "hr_document_types_authenticated_select_by_unit"
on public.hr_document_types
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_document_types_authenticated_insert_by_unit" on public.hr_document_types;
create policy "hr_document_types_authenticated_insert_by_unit"
on public.hr_document_types
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_document_types_authenticated_update_by_unit" on public.hr_document_types;
create policy "hr_document_types_authenticated_update_by_unit"
on public.hr_document_types
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_document_rules
drop policy if exists "hr_document_rules_authenticated_select_by_unit" on public.hr_document_rules;
create policy "hr_document_rules_authenticated_select_by_unit"
on public.hr_document_rules
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_document_rules_authenticated_insert_by_unit" on public.hr_document_rules;
create policy "hr_document_rules_authenticated_insert_by_unit"
on public.hr_document_rules
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_document_rules_authenticated_update_by_unit" on public.hr_document_rules;
create policy "hr_document_rules_authenticated_update_by_unit"
on public.hr_document_rules
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_workflow_templates
drop policy if exists "hr_workflow_templates_authenticated_select_by_unit" on public.hr_workflow_templates;
create policy "hr_workflow_templates_authenticated_select_by_unit"
on public.hr_workflow_templates
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_templates_authenticated_insert_by_unit" on public.hr_workflow_templates;
create policy "hr_workflow_templates_authenticated_insert_by_unit"
on public.hr_workflow_templates
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_workflow_templates_authenticated_update_by_unit" on public.hr_workflow_templates;
create policy "hr_workflow_templates_authenticated_update_by_unit"
on public.hr_workflow_templates
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- =====================================================================
-- SECAO B - Filho-via-pai (padrao 072 hr_scorecard_questions)
--   SELECT: EXISTS pai com (p.unit_id is null OR user_has_unit_access(p.unit_id))
--   INSERT/UPDATE: EXISTS pai com (p.unit_id is not null AND user_has_unit_access(p.unit_id))
--   Sufixo _by_parent uniforme nas 4 filhas (cabe em 63 chars).
-- =====================================================================

-- hr_evaluation_template_sections -> hr_evaluation_templates (template_id)
drop policy if exists "hr_evaluation_template_sections_authenticated_select_by_parent" on public.hr_evaluation_template_sections;
create policy "hr_evaluation_template_sections_authenticated_select_by_parent"
on public.hr_evaluation_template_sections
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_evaluation_templates p
    where p.id = hr_evaluation_template_sections.template_id
      and (p.unit_id is null or public.user_has_unit_access(p.unit_id))
  )
);

drop policy if exists "hr_evaluation_template_sections_authenticated_insert_by_parent" on public.hr_evaluation_template_sections;
create policy "hr_evaluation_template_sections_authenticated_insert_by_parent"
on public.hr_evaluation_template_sections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_evaluation_templates p
    where p.id = hr_evaluation_template_sections.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_evaluation_template_sections_authenticated_update_by_parent" on public.hr_evaluation_template_sections;
create policy "hr_evaluation_template_sections_authenticated_update_by_parent"
on public.hr_evaluation_template_sections
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_evaluation_templates p
    where p.id = hr_evaluation_template_sections.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_evaluation_templates p
    where p.id = hr_evaluation_template_sections.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

-- hr_onboarding_plan_items -> hr_onboarding_plans (plan_id)
drop policy if exists "hr_onboarding_plan_items_authenticated_select_by_parent" on public.hr_onboarding_plan_items;
create policy "hr_onboarding_plan_items_authenticated_select_by_parent"
on public.hr_onboarding_plan_items
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_onboarding_plans p
    where p.id = hr_onboarding_plan_items.plan_id
      and (p.unit_id is null or public.user_has_unit_access(p.unit_id))
  )
);

drop policy if exists "hr_onboarding_plan_items_authenticated_insert_by_parent" on public.hr_onboarding_plan_items;
create policy "hr_onboarding_plan_items_authenticated_insert_by_parent"
on public.hr_onboarding_plan_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_onboarding_plans p
    where p.id = hr_onboarding_plan_items.plan_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_onboarding_plan_items_authenticated_update_by_parent" on public.hr_onboarding_plan_items;
create policy "hr_onboarding_plan_items_authenticated_update_by_parent"
on public.hr_onboarding_plan_items
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_onboarding_plans p
    where p.id = hr_onboarding_plan_items.plan_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_onboarding_plans p
    where p.id = hr_onboarding_plan_items.plan_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

-- hr_workflow_template_steps -> hr_workflow_templates (template_id)
drop policy if exists "hr_workflow_template_steps_authenticated_select_by_parent" on public.hr_workflow_template_steps;
create policy "hr_workflow_template_steps_authenticated_select_by_parent"
on public.hr_workflow_template_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_workflow_templates p
    where p.id = hr_workflow_template_steps.template_id
      and (p.unit_id is null or public.user_has_unit_access(p.unit_id))
  )
);

drop policy if exists "hr_workflow_template_steps_authenticated_insert_by_parent" on public.hr_workflow_template_steps;
create policy "hr_workflow_template_steps_authenticated_insert_by_parent"
on public.hr_workflow_template_steps
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_workflow_templates p
    where p.id = hr_workflow_template_steps.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_workflow_template_steps_authenticated_update_by_parent" on public.hr_workflow_template_steps;
create policy "hr_workflow_template_steps_authenticated_update_by_parent"
on public.hr_workflow_template_steps
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_workflow_templates p
    where p.id = hr_workflow_template_steps.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_workflow_templates p
    where p.id = hr_workflow_template_steps.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

-- hr_evaluation_template_criteria -> NETO (section_id -> section -> template_id -> template)
--   EXISTS de 2 niveis para alcancar o unit_id (nullable) do template.
drop policy if exists "hr_evaluation_template_criteria_authenticated_select_by_parent" on public.hr_evaluation_template_criteria;
create policy "hr_evaluation_template_criteria_authenticated_select_by_parent"
on public.hr_evaluation_template_criteria
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_evaluation_template_sections s
    join public.hr_evaluation_templates t on t.id = s.template_id
    where s.id = hr_evaluation_template_criteria.section_id
      and (t.unit_id is null or public.user_has_unit_access(t.unit_id))
  )
);

drop policy if exists "hr_evaluation_template_criteria_authenticated_insert_by_parent" on public.hr_evaluation_template_criteria;
create policy "hr_evaluation_template_criteria_authenticated_insert_by_parent"
on public.hr_evaluation_template_criteria
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_evaluation_template_sections s
    join public.hr_evaluation_templates t on t.id = s.template_id
    where s.id = hr_evaluation_template_criteria.section_id
      and t.unit_id is not null
      and public.user_has_unit_access(t.unit_id)
  )
);

drop policy if exists "hr_evaluation_template_criteria_authenticated_update_by_parent" on public.hr_evaluation_template_criteria;
create policy "hr_evaluation_template_criteria_authenticated_update_by_parent"
on public.hr_evaluation_template_criteria
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_evaluation_template_sections s
    join public.hr_evaluation_templates t on t.id = s.template_id
    where s.id = hr_evaluation_template_criteria.section_id
      and t.unit_id is not null
      and public.user_has_unit_access(t.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_evaluation_template_sections s
    join public.hr_evaluation_templates t on t.id = s.template_id
    where s.id = hr_evaluation_template_criteria.section_id
      and t.unit_id is not null
      and public.user_has_unit_access(t.unit_id)
  )
);

-- =====================================================================
-- SECAO C - Globais / sistema
-- =====================================================================

-- hr_background_jobs (unit_id NOT NULL) - READ-ONLY: so SELECT (escrita = service_role/cron).
drop policy if exists "hr_background_jobs_authenticated_select_by_unit" on public.hr_background_jobs;
create policy "hr_background_jobs_authenticated_select_by_unit"
on public.hr_background_jobs
for select
to authenticated
using (public.user_has_unit_access(unit_id));

-- hr_workflow_idempotency_keys - SERVICE-ROLE-ONLY: SEM policy por design.
--   RLS habilitado (acima) sem nenhuma policy => authenticated/anon ficam totalmente negados.
--   O mecanismo de idempotencia so e' usado por rotas server-side com service_role.
--   NAO criar policy aqui.
