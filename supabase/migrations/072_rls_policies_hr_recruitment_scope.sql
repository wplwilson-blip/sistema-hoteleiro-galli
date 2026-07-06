-- Migration 072 - RLS Fatia 2: recrutamento, escopo por UNIDADE.
--
-- Estas tabelas tem RLS habilitado (migrations 041/042/043) mas ficaram SEM policy. Esta migration
-- adiciona policies de unidade, como defesa em profundidade contra acesso cross-unidade. Espelha
-- EXATAMENTE a forma da migration 071 (que espelha a 069).
--
-- Premissas (ver docs/codex/22-plano-rls-fatia2.md):
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
-- Grupo A - Tabelas com unit_id proprio
--   SELECT/INSERT/UPDATE por public.user_has_unit_access(unit_id).
-- =====================================================================

-- hr_job_candidates
drop policy if exists "hr_job_candidates_authenticated_select_by_unit" on public.hr_job_candidates;
create policy "hr_job_candidates_authenticated_select_by_unit"
on public.hr_job_candidates
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_job_candidates_authenticated_insert_by_unit" on public.hr_job_candidates;
create policy "hr_job_candidates_authenticated_insert_by_unit"
on public.hr_job_candidates
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_job_candidates_authenticated_update_by_unit" on public.hr_job_candidates;
create policy "hr_job_candidates_authenticated_update_by_unit"
on public.hr_job_candidates
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_candidate_interviews
drop policy if exists "hr_candidate_interviews_authenticated_select_by_unit" on public.hr_candidate_interviews;
create policy "hr_candidate_interviews_authenticated_select_by_unit"
on public.hr_candidate_interviews
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_candidate_interviews_authenticated_insert_by_unit" on public.hr_candidate_interviews;
create policy "hr_candidate_interviews_authenticated_insert_by_unit"
on public.hr_candidate_interviews
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_candidate_interviews_authenticated_update_by_unit" on public.hr_candidate_interviews;
create policy "hr_candidate_interviews_authenticated_update_by_unit"
on public.hr_candidate_interviews
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_interview_scorecards
drop policy if exists "hr_interview_scorecards_authenticated_select_by_unit" on public.hr_interview_scorecards;
create policy "hr_interview_scorecards_authenticated_select_by_unit"
on public.hr_interview_scorecards
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_interview_scorecards_authenticated_insert_by_unit" on public.hr_interview_scorecards;
create policy "hr_interview_scorecards_authenticated_insert_by_unit"
on public.hr_interview_scorecards
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_interview_scorecards_authenticated_update_by_unit" on public.hr_interview_scorecards;
create policy "hr_interview_scorecards_authenticated_update_by_unit"
on public.hr_interview_scorecards
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_candidate_admission_conversions
drop policy if exists "hr_candidate_admission_conversions_authenticated_select_by_unit" on public.hr_candidate_admission_conversions;
create policy "hr_candidate_admission_conversions_authenticated_select_by_unit"
on public.hr_candidate_admission_conversions
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "hr_candidate_admission_conversions_authenticated_insert_by_unit" on public.hr_candidate_admission_conversions;
create policy "hr_candidate_admission_conversions_authenticated_insert_by_unit"
on public.hr_candidate_admission_conversions
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_candidate_admission_conversions_authenticated_update_by_unit" on public.hr_candidate_admission_conversions;
create policy "hr_candidate_admission_conversions_authenticated_update_by_unit"
on public.hr_candidate_admission_conversions
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- =====================================================================
-- Grupo B - Filha por join limpo (pai com unit_id NOT NULL)
--   hr_interview_scorecard_responses -> hr_interview_scorecards (scorecard_id)
-- =====================================================================

drop policy if exists "hr_interview_scorecard_responses_authenticated_select_by_parent_unit" on public.hr_interview_scorecard_responses;
create policy "hr_interview_scorecard_responses_authenticated_select_by_parent_unit"
on public.hr_interview_scorecard_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_interview_scorecards p
    where p.id = hr_interview_scorecard_responses.scorecard_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_interview_scorecard_responses_authenticated_insert_by_parent_unit" on public.hr_interview_scorecard_responses;
create policy "hr_interview_scorecard_responses_authenticated_insert_by_parent_unit"
on public.hr_interview_scorecard_responses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_interview_scorecards p
    where p.id = hr_interview_scorecard_responses.scorecard_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_interview_scorecard_responses_authenticated_update_by_parent_unit" on public.hr_interview_scorecard_responses;
create policy "hr_interview_scorecard_responses_authenticated_update_by_parent_unit"
on public.hr_interview_scorecard_responses
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_interview_scorecards p
    where p.id = hr_interview_scorecard_responses.scorecard_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_interview_scorecards p
    where p.id = hr_interview_scorecard_responses.scorecard_id
      and public.user_has_unit_access(p.unit_id)
  )
);

-- =====================================================================
-- Grupo C - Template de rede (unit_id NULLABLE) e sua filha
--   Leitura inclui template de rede (unit_id null); escrita so unit-scoped
--   (template de rede e' gerido via service_role).
-- =====================================================================

-- hr_scorecard_templates (unit_id NULLABLE)
drop policy if exists "hr_scorecard_templates_authenticated_select_by_unit" on public.hr_scorecard_templates;
create policy "hr_scorecard_templates_authenticated_select_by_unit"
on public.hr_scorecard_templates
for select
to authenticated
using (unit_id is null or public.user_has_unit_access(unit_id));

drop policy if exists "hr_scorecard_templates_authenticated_insert_by_unit" on public.hr_scorecard_templates;
create policy "hr_scorecard_templates_authenticated_insert_by_unit"
on public.hr_scorecard_templates
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "hr_scorecard_templates_authenticated_update_by_unit" on public.hr_scorecard_templates;
create policy "hr_scorecard_templates_authenticated_update_by_unit"
on public.hr_scorecard_templates
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- hr_scorecard_questions (filha do template via template_id)
drop policy if exists "hr_scorecard_questions_authenticated_select_by_parent_unit" on public.hr_scorecard_questions;
create policy "hr_scorecard_questions_authenticated_select_by_parent_unit"
on public.hr_scorecard_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.hr_scorecard_templates p
    where p.id = hr_scorecard_questions.template_id
      and (p.unit_id is null or public.user_has_unit_access(p.unit_id))
  )
);

drop policy if exists "hr_scorecard_questions_authenticated_insert_by_parent_unit" on public.hr_scorecard_questions;
create policy "hr_scorecard_questions_authenticated_insert_by_parent_unit"
on public.hr_scorecard_questions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.hr_scorecard_templates p
    where p.id = hr_scorecard_questions.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "hr_scorecard_questions_authenticated_update_by_parent_unit" on public.hr_scorecard_questions;
create policy "hr_scorecard_questions_authenticated_update_by_parent_unit"
on public.hr_scorecard_questions
for update
to authenticated
using (
  exists (
    select 1
    from public.hr_scorecard_templates p
    where p.id = hr_scorecard_questions.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.hr_scorecard_templates p
    where p.id = hr_scorecard_questions.template_id
      and p.unit_id is not null
      and public.user_has_unit_access(p.unit_id)
  )
);
