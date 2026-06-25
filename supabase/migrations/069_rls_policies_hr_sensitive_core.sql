-- Migration 069 - RLS Etapa 2, Camada 1: nucleo sensivel de RH, escopo por UNIDADE.
--
-- Estas tabelas tem RLS habilitado (migrations 021+/HR) mas ficaram SEM policy
-- (fora da Etapa 1 / 066). Esta migration adiciona policies de unidade, como defesa
-- em profundidade contra acesso cross-unidade a dado sensivel de RH.
--
-- Premissas (ver docs/7-plano-rls-etapa2-camada1.md):
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

-- employee_documents
drop policy if exists "employee_documents_authenticated_select_by_unit" on public.employee_documents;
create policy "employee_documents_authenticated_select_by_unit"
on public.employee_documents
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_documents_authenticated_insert_by_unit" on public.employee_documents;
create policy "employee_documents_authenticated_insert_by_unit"
on public.employee_documents
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_documents_authenticated_update_by_unit" on public.employee_documents;
create policy "employee_documents_authenticated_update_by_unit"
on public.employee_documents
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_document_links
drop policy if exists "employee_document_links_authenticated_select_by_unit" on public.employee_document_links;
create policy "employee_document_links_authenticated_select_by_unit"
on public.employee_document_links
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_document_links_authenticated_insert_by_unit" on public.employee_document_links;
create policy "employee_document_links_authenticated_insert_by_unit"
on public.employee_document_links
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_document_links_authenticated_update_by_unit" on public.employee_document_links;
create policy "employee_document_links_authenticated_update_by_unit"
on public.employee_document_links
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_occupational_records
drop policy if exists "employee_occupational_records_authenticated_select_by_unit" on public.employee_occupational_records;
create policy "employee_occupational_records_authenticated_select_by_unit"
on public.employee_occupational_records
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_occupational_records_authenticated_insert_by_unit" on public.employee_occupational_records;
create policy "employee_occupational_records_authenticated_insert_by_unit"
on public.employee_occupational_records
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_occupational_records_authenticated_update_by_unit" on public.employee_occupational_records;
create policy "employee_occupational_records_authenticated_update_by_unit"
on public.employee_occupational_records
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_nr_certifications
drop policy if exists "employee_nr_certifications_authenticated_select_by_unit" on public.employee_nr_certifications;
create policy "employee_nr_certifications_authenticated_select_by_unit"
on public.employee_nr_certifications
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_nr_certifications_authenticated_insert_by_unit" on public.employee_nr_certifications;
create policy "employee_nr_certifications_authenticated_insert_by_unit"
on public.employee_nr_certifications
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_nr_certifications_authenticated_update_by_unit" on public.employee_nr_certifications;
create policy "employee_nr_certifications_authenticated_update_by_unit"
on public.employee_nr_certifications
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_conduct_records
drop policy if exists "employee_conduct_records_authenticated_select_by_unit" on public.employee_conduct_records;
create policy "employee_conduct_records_authenticated_select_by_unit"
on public.employee_conduct_records
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_conduct_records_authenticated_insert_by_unit" on public.employee_conduct_records;
create policy "employee_conduct_records_authenticated_insert_by_unit"
on public.employee_conduct_records
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_conduct_records_authenticated_update_by_unit" on public.employee_conduct_records;
create policy "employee_conduct_records_authenticated_update_by_unit"
on public.employee_conduct_records
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_terminations
drop policy if exists "employee_terminations_authenticated_select_by_unit" on public.employee_terminations;
create policy "employee_terminations_authenticated_select_by_unit"
on public.employee_terminations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_terminations_authenticated_insert_by_unit" on public.employee_terminations;
create policy "employee_terminations_authenticated_insert_by_unit"
on public.employee_terminations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_terminations_authenticated_update_by_unit" on public.employee_terminations;
create policy "employee_terminations_authenticated_update_by_unit"
on public.employee_terminations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- employee_evaluations
drop policy if exists "employee_evaluations_authenticated_select_by_unit" on public.employee_evaluations;
create policy "employee_evaluations_authenticated_select_by_unit"
on public.employee_evaluations
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "employee_evaluations_authenticated_insert_by_unit" on public.employee_evaluations;
create policy "employee_evaluations_authenticated_insert_by_unit"
on public.employee_evaluations
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "employee_evaluations_authenticated_update_by_unit" on public.employee_evaluations;
create policy "employee_evaluations_authenticated_update_by_unit"
on public.employee_evaluations
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));

-- =====================================================================
-- Tabelas filhas sem unit_id proprio (heranca por exists contra o pai)
-- =====================================================================

-- employee_conduct_reviews -> employee_conduct_records (conduct_record_id)
drop policy if exists "employee_conduct_reviews_authenticated_select_by_parent_unit" on public.employee_conduct_reviews;
create policy "employee_conduct_reviews_authenticated_select_by_parent_unit"
on public.employee_conduct_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_conduct_records p
    where p.id = employee_conduct_reviews.conduct_record_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_conduct_reviews_authenticated_insert_by_parent_unit" on public.employee_conduct_reviews;
create policy "employee_conduct_reviews_authenticated_insert_by_parent_unit"
on public.employee_conduct_reviews
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_conduct_records p
    where p.id = employee_conduct_reviews.conduct_record_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_conduct_reviews_authenticated_update_by_parent_unit" on public.employee_conduct_reviews;
create policy "employee_conduct_reviews_authenticated_update_by_parent_unit"
on public.employee_conduct_reviews
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_conduct_records p
    where p.id = employee_conduct_reviews.conduct_record_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.employee_conduct_records p
    where p.id = employee_conduct_reviews.conduct_record_id
      and public.user_has_unit_access(p.unit_id)
  )
);

-- employee_termination_checklists -> employee_terminations (termination_id)
drop policy if exists "employee_termination_checklists_authenticated_select_by_parent_unit" on public.employee_termination_checklists;
create policy "employee_termination_checklists_authenticated_select_by_parent_unit"
on public.employee_termination_checklists
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_terminations p
    where p.id = employee_termination_checklists.termination_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_termination_checklists_authenticated_insert_by_parent_unit" on public.employee_termination_checklists;
create policy "employee_termination_checklists_authenticated_insert_by_parent_unit"
on public.employee_termination_checklists
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_terminations p
    where p.id = employee_termination_checklists.termination_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_termination_checklists_authenticated_update_by_parent_unit" on public.employee_termination_checklists;
create policy "employee_termination_checklists_authenticated_update_by_parent_unit"
on public.employee_termination_checklists
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_terminations p
    where p.id = employee_termination_checklists.termination_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.employee_terminations p
    where p.id = employee_termination_checklists.termination_id
      and public.user_has_unit_access(p.unit_id)
  )
);

-- employee_evaluation_scores -> employee_evaluations (evaluation_id)
-- (reclassificada: NAO tem unit_id proprio; e filha de employee_evaluations.)
drop policy if exists "employee_evaluation_scores_authenticated_select_by_parent_unit" on public.employee_evaluation_scores;
create policy "employee_evaluation_scores_authenticated_select_by_parent_unit"
on public.employee_evaluation_scores
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_evaluations p
    where p.id = employee_evaluation_scores.evaluation_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_evaluation_scores_authenticated_insert_by_parent_unit" on public.employee_evaluation_scores;
create policy "employee_evaluation_scores_authenticated_insert_by_parent_unit"
on public.employee_evaluation_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_evaluations p
    where p.id = employee_evaluation_scores.evaluation_id
      and public.user_has_unit_access(p.unit_id)
  )
);

drop policy if exists "employee_evaluation_scores_authenticated_update_by_parent_unit" on public.employee_evaluation_scores;
create policy "employee_evaluation_scores_authenticated_update_by_parent_unit"
on public.employee_evaluation_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_evaluations p
    where p.id = employee_evaluation_scores.evaluation_id
      and public.user_has_unit_access(p.unit_id)
  )
)
with check (
  exists (
    select 1
    from public.employee_evaluations p
    where p.id = employee_evaluation_scores.evaluation_id
      and public.user_has_unit_access(p.unit_id)
  )
);
