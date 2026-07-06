# Plano — RLS Fatia 2 (recrutamento), escopo por unidade (Camada 1)

> 2026-07-06 · **PLANO + SQL para revisão.** Área sensível (RLS): arquivo criado, **não aplicado, não
> commitado, não pushado**. Molde exato: `071_rls_policies_hr_employee_scope.sql` (que espelha a 069).
> Camada 1 = **só unidade**; o gate sensível `HR:*.sensitive.view` fica na aplicação (`api-auth.ts`),
> vai ao banco na Camada 2. Helper reutilizado (009): `public.user_has_unit_access(unit_id)`.

## Regras (idênticas à 071)
- `to authenticated`; `drop policy if exists` antes de cada `create policy`.
- 3 policies por tabela: SELECT (`using`), INSERT (`with check`), UPDATE (`using` + `with check`).
- **Sem** policy de DELETE (soft-delete é UPDATE). **Sem** policy para `anon`.
- Não altera schema/trigger/helper; não recria helper; não cria bucket; nada de app code.

## As 7 tabelas, grupo, coluna/caminho de escopo e forma

| # | Tabela | Grupo | Coluna/caminho (CREATE) | Forma da policy |
|---|--------|-------|--------------------------|-----------------|
| 1 | `hr_job_candidates` | **A — unit_id próprio** | `unit_id` NOT NULL (`041:8`) | `user_has_unit_access(unit_id)` em select(using)/insert(check)/update(using+check) |
| 2 | `hr_candidate_interviews` | **A** | `unit_id` NOT NULL (`041:68`) | idem A |
| 3 | `hr_interview_scorecards` | **A** | `unit_id` NOT NULL (`042:68`) | idem A |
| 4 | `hr_candidate_admission_conversions` | **A** | `unit_id` NOT NULL (`043:8`) | idem A |
| 5 | `hr_interview_scorecard_responses` | **B — filha por join** | `scorecard_id` → `hr_interview_scorecards` (`042:106`) | `exists(select 1 from hr_interview_scorecards p where p.id = ...scorecard_id and user_has_unit_access(p.unit_id))` em select(using)/insert(check)/update(using+check) |
| 6 | `hr_scorecard_templates` | **C — template de rede (unit_id NULLABLE)** | `unit_id` NULLABLE (`042:8`) | SELECT using: `(unit_id is null or user_has_unit_access(unit_id))`; INSERT check + UPDATE using/check: `user_has_unit_access(unit_id)` |
| 7 | `hr_scorecard_questions` | **C — filha do template** | `template_id` → `hr_scorecard_templates` (`042:40`) | SELECT using: `exists(... p.unit_id is null or user_has_unit_access(p.unit_id))`; INSERT check + UPDATE using/check: `exists(... p.unit_id is not null and user_has_unit_access(p.unit_id))` |

### Semântica dos grupos
- **A:** escopo direto pela unidade da linha (padrão puro da 071).
- **B:** filha sem `unit_id` → herda a unidade do pai `hr_interview_scorecards` (que tem `unit_id` NOT
  NULL — join limpo).
- **C (template de rede):** template com `unit_id NULL` vale para a **rede inteira** →
  **leitura** inclui os de rede (`unit_id is null OR ...`); **escrita** só unit-scoped
  (`user_has_unit_access(unit_id)`) — criar/editar template de rede fica para o service_role.
  A filha `hr_scorecard_questions` espelha: **lê** questões de templates de rede ou da sua unidade;
  **escreve** só em templates com `unit_id` da sua unidade (`p.unit_id is not null and ...`).

## Contagem
**7 tabelas × 3 policies = 21 policies.** Nenhuma de DELETE, nenhuma para anon.

## Ordem de aplicação (quando aprovado)
Staging (`jascnmgagejlvjlenduv`) → validar (service_role vê tudo; authenticated só sua unidade +
templates de rede em leitura; E2E verde) → produção. Migration idempotente (`drop policy if exists`).

**Arquivo gerado:** `supabase/migrations/072_rls_policies_hr_recruitment_scope.sql` — **não aplicado,
não commitado, não pushado.** Aguarda revisão.
