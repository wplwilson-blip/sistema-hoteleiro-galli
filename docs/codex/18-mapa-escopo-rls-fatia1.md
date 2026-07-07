# Mapa de escopo RLS — Fatia 1 (RH ligado a empregado)

> 2026-07-06 · **READ-ONLY**, sem commit, nenhuma policy escrita. Colunas/linhas verificadas nos
> CREATE TABLE das migrations. Padrão a espelhar: `069_rls_policies_hr_sensitive_core.sql`.

## 1–3. Escopo e sensibilidade por tabela

| Tabela | CREATE (migration:linha) | organization_id | unit_id próprio | employee_id | Caminho até a UNIDADE | Colunas sensíveis |
|---|---|---|---|---|---|---|
| **employees** | `003:30` | sim (`003:32`) | **SIM, direto** (`003:33`) | — (é o próprio empregado) | **direto** por `unit_id` | `document_number` (CPF), `personal_email`, `phone`, `hire_date`, `termination_date`, `full_name` → **dado pessoal** |
| **employee_functional_events** | `021:165` | sim (`021:167`) | **SIM, direto** (`021:168`) | sim (`021:169`) | **direto** por `unit_id` | coluna `is_sensitive` (`021:176`) + `visibility_scope` (`021:175`); `event_type` inclui `employee_sensitive_updated` → **flaggável como sensível** |
| **employee_movements** | `052:5` | sim (`052:7`) | **SIM, direto** (`052:8`, FK `052:41`) | sim (`052:9`, FK `052:42`) | **direto** por `unit_id` | **`old_salary`/`new_salary`** (`052:27-28`) = salário; `is_sensitive` (`052:31`) → **sensível** |
| **employee_movement_approvals** | `053:4` | **não** | **não** | **não** | **indireto**: `movement_id` (`053:6`) → `employee_movements.unit_id` | `comments` (pode conter contexto sensível) |
| **employee_development_plans** | `048:219` | sim (`048:221`) | **SIM, direto** (`048:222`) | sim (`048:223`) | **direto** por `unit_id` | `is_sensitive` **DEFAULT TRUE** (`048:233`) + `visibility_scope` DEFAULT `'restricted'` (`048:234`) → **sensível por padrão** |
| **employee_development_plan_items** | `048:259` | **não** | **não** | **não** | **indireto**: `development_plan_id` (`048:261`) → `employee_development_plans.unit_id` | `completion_notes`, `description` (herdam sensibilidade do plano) |
| **employee_onboardings** | `047:104` | sim (`047:106`) | **SIM, direto** (`047:107`) | sim (`047:108`) | **direto** por `unit_id` | processo de admissão (status/datas) — **não** carrega CPF/saúde/salário; baixa sensibilidade |
| **employee_onboarding_items** | `047:166` | sim (`047:169`) | **SIM, direto** (`047:170`) | sim (`047:171`) | **direto** por `unit_id` (denormalizado; **também** tem `onboarding_id` `047:168`) | itens de checklist; baixa sensibilidade |
| **employee_trainings** | `054:43` | sim (`054:45`) | **SIM, direto** (`054:46`) | sim (`054:47`) | **direto** por `unit_id` | `is_sensitive` (`054:58`, default false) + `visibility_scope`; certificado — **flaggável** |

### Resumo dos caminhos
- **Direto por `unit_id` (7):** `employees`, `employee_functional_events`, `employee_movements`,
  `employee_development_plans`, `employee_onboardings`, `employee_onboarding_items`, `employee_trainings`.
  → policy `for select/insert/update using/with check (public.user_has_unit_access(unit_id))`.
- **Indireto (2 filhas sem `unit_id`):**
  - `employee_movement_approvals` → **join** `employee_movements p on p.id = movement_id` → `p.unit_id`.
  - `employee_development_plan_items` → **join** `employee_development_plans p on p.id = development_plan_id` → `p.unit_id`.
  → padrão "by_parent_unit" (exists contra o pai).

### Sensibilidade (`*.sensitive.view`) — quais exigem tratamento sensível
- **Alta / por padrão sensível:** `employees` (CPF/pessoais), `employee_movements` (**salário**),
  `employee_development_plans` (`is_sensitive` default true, `restricted`) e sua filha
  `employee_development_plan_items`.
- **Condicional (têm coluna `is_sensitive`, decidido por linha):** `employee_functional_events`,
  `employee_trainings`.
- **Baixa (processo, sem PII forte):** `employee_onboardings`, `employee_onboarding_items`,
  `employee_movement_approvals` (só `comments`).

> ⚠️ **Como a 069 trata "sensível" hoje:** ela **NÃO** separa no banco. Ver §4 — a Camada 1 aplica
> **só** escopo de unidade; a permissão `HR:*.sensitive.view` continua checada **na aplicação**
> (`api-auth.ts`) e seria levada ao banco só na "Camada 2". Ou seja, o padrão a espelhar na Fatia 1
> (se seguir a 069) é **unit-scope apenas**; a divisão sensível fica app-level por enquanto.

## 4. Padrão real da migration 069 (a espelhar)

**Premissas declaradas** (`069:1-17`): RLS já habilitado; **service_role ignora RLS** (as APIs de RH
seguem via service_role); reutiliza o helper `public.user_has_unit_access(unit_id)` da `009`; **sem
policy de DELETE** (delete negado p/ anon/authenticated → soft-delete via update); **sem policy p/
anon** (anon negado); **Camada 1 = só unidade**, a permissão sensível fica na app.

### (a) Padrão "por unit_id próprio" — SELECT/INSERT/UPDATE (`069:24-45`, ex. `employee_documents`)
```sql
create policy "employee_documents_authenticated_select_by_unit"
on public.employee_documents
for select
to authenticated
using (public.user_has_unit_access(unit_id));

create policy "employee_documents_authenticated_insert_by_unit"
on public.employee_documents
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

create policy "employee_documents_authenticated_update_by_unit"
on public.employee_documents
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));
```
- SELECT/UPDATE usam `using`; INSERT/UPDATE usam `with check`. Sempre precedidas de
  `drop policy if exists ...` (idempotente).

### (b) Padrão "filha sem unit_id → herança por exists contra o pai" (`069:189-238`, ex. `employee_conduct_reviews` → `employee_conduct_records`)
```sql
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
-- insert: with check (exists (... same ...));
-- update: using (exists ...) with check (exists ...);
```
(Idêntico para `employee_termination_checklists`→`employee_terminations.termination_id` e
`employee_evaluation_scores`→`employee_evaluations.evaluation_id`, `069:240-334`.)

**Como separa "vê RH da unidade" de "vê sensível" / quais permissões usa / o join de escopo:**
- **Não separa sensível no banco (Camada 1).** Toda policy é `to authenticated` + predicado de **unidade**
  (`user_has_unit_access`). **Nenhuma permissão de aplicação** (`HR:*.view`/`HR:*.sensitive.view`) é
  referenciada no SQL — o gate de permissão continua na app; o banco só barra **cross-unidade**.
- **Join de escopo (filhas):** `exists (select 1 from <pai> p where p.id = <fk_da_filha> and
  public.user_has_unit_access(p.unit_id))`.

## 5. `employees` é o pivô?

**Sim, `employees` tem `unit_id` direto (`003:33`) — é o pivô do escopo.** Porém, nesta Fatia 1, a
maioria das filhas **carrega o próprio `unit_id` denormalizado** (`functional_events`, `movements`,
`development_plans`, `onboardings`, `onboarding_items`, `trainings`) → escopam **por `unit_id` próprio**
(padrão §4a), **sem** precisar join a `employees`. Só as **2 filhas sem `unit_id`**
(`employee_movement_approvals`, `employee_development_plan_items`) escapam via join — e **ao pai imediato**
(`employee_movements` / `employee_development_plans`, que por sua vez têm `unit_id`), **não** diretamente a
`employees`. Ou seja: `employees` é o pivô conceitual (âncora do empregado→unidade), mas o escopo prático
das filhas usa o `unit_id` denormalizado de cada uma ou o do pai imediato.

**Nada foi alterado. Sem policy escrita — só o mapa + o padrão da 069.**
