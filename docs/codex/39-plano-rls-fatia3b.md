# Plano — RLS Fatia 3b: templates + filhos + tabelas de sistema

**Área SENSÍVEL** (`docs/NAO_ALTERAR.md`: RLS/policies + migrations). Este documento é
**só o plano**. Nenhum SQL é aplicado nesta tarefa. A migration só será **escrita e
aplicada** após sua aprovação — e aplicada **por você (Wilson)** no SQL Editor
(staging → produção), nunca pelo Codex.

Branch: `rls/fatia3b-templates-system`. Push apenas deste documento.

---

## 0. Contexto e premissas

- Após a 3a (8 tabelas de workflow/admissão), restam **12 tabelas de RH** com RLS habilitado
  e **ZERO policy**. Esta fatia **3b** cobre as 12 numa migration única, seccionada por
  arquétipo.
- O app acessa tudo via **`service_role`** (ignora RLS). Nenhum componente consulta como
  `authenticated`. Logo estas policies são **defesa-em-profundidade pura** e **não podem
  quebrar o app**. Risco = policy frouxa, não regressão.
- Helper reutilizado (009, **não** recriado): `public.user_has_unit_access(unit_id uuid)`.
- Padrões de referência copiados 1:1:
  - **071** = unit-scope direto (select/insert/update, `to authenticated`, sem delete, `drop if exists`).
  - **072 `hr_scorecard_templates`** = **assimétrico nullable-unit**: lê rede + própria unidade,
    escreve **só** unit-scoped.
  - **072 `hr_scorecard_questions`** = **filho-via-pai** (`EXISTS` no pai).
- Arquivo proposto: **`078_rls_policies_hr_templates_children_system_scope.sql`** (078 confirmado
  livre; última existente é `077`).

### 0.1 Confirmação por tabela (fonte: migration:linha)

**SEÇÃO A — assimétrico nullable-unit** (todas com `unit_id` **NULLABLE** → padrão scorecard_templates):

| Tabela | `unit_id` | Nulável? | RLS já habilitado |
|---|---|---|---|
| `hr_evaluation_templates` | direto | **NULLABLE** (`048:8`) | `048:379` |
| `hr_onboarding_plans` | direto | **NULLABLE** (`047:9`) | `047:321` |
| `hr_trainings` | direto | **NULLABLE** (`054:8`) | `054:98` |
| `hr_document_types` | direto | **NULLABLE** (`021:52`) | `021:263` |
| `hr_document_rules` | direto | **NULLABLE** (`046:8`) | `046:78` |
| `hr_workflow_templates` | direto | **NULLABLE** (`037:8`) | `037:130` |

> Todas as 6 são `unit_id uuid references public.units(id) ...` **sem** `not null` → nullable.
> **Nenhuma** é `NOT NULL`, então **nenhuma** cai no padrão 071 direto; as 6 usam o assimétrico.

**SEÇÃO B — filho-via-pai** (`EXISTS` no pai; pai com `unit_id` nullable):

| Tabela (filha) | FK → pai | Fonte FK | Pai | RLS habilitado (filha) |
|---|---|---|---|---|
| `hr_evaluation_template_sections` | `template_id` → `hr_evaluation_templates(id)` | `048:64` | evaluation_templates | `048:380` |
| `hr_onboarding_plan_items` | `plan_id` → `hr_onboarding_plans(id)` | `047:44` | onboarding_plans | `047:322` |
| `hr_workflow_template_steps` | `template_id` → `hr_workflow_templates(id)` | `037:61` | workflow_templates | `037:131` |
| `hr_evaluation_template_criteria` | **NETO**: `section_id` → `hr_evaluation_template_sections(id)` → `.template_id` → `hr_evaluation_templates(id)` | `048:89` (+`048:64`) | evaluation_templates (via section) | `048:381` |

> `hr_evaluation_template_criteria` é **neto**: `criteria.section_id` → section, `section.template_id`
> → template (unit nullable). `EXISTS` de **2 níveis** (join section + template) para alcançar
> o `unit_id` do template.

**SEÇÃO C — globais/sistema:**

| Tabela | `unit_id` | Decisão | RLS habilitado |
|---|---|---|---|
| `hr_background_jobs` | **NOT NULL** (`039:8`) | **READ-ONLY**: só `select` `to authenticated` (escrita = service_role/cron), análogo ao append-only do audit_logs da 3a | `039:102` |
| `hr_workflow_idempotency_keys` | NOT NULL (`023:7`) | **SEM policy** (service-role-only): RLS habilitado sem policy já **nega** authenticated. `enable` idempotente defensivo, sem `create policy` | `023:166` |

### 0.2 Contagem de policies esperada

| Seção | Tabelas | Policies/tabela | Subtotal |
|---|---|---|---|
| A (assimétrico) | 6 | 3 (select/insert/update) | **18** |
| B (filho-via-pai) | 4 | 3 (select/insert/update) | **12** |
| C (globais) | `hr_background_jobs` | 1 (só select) | **1** |
| C (globais) | `hr_workflow_idempotency_keys` | 0 (sem policy) | **0** |
| **Total** | | | **31 policies** |

`enable row level security` idempotente para **12 tabelas** (11 que recebem policy + a
`hr_workflow_idempotency_keys` defensiva).

### 0.3 ⚠️ Nomes de policy vs. limite de 63 chars do Postgres — **decisão**

Medição dos nomes no padrão convencional:

| Nome candidato | Chars | OK? |
|---|---|---|
| `hr_evaluation_templates_authenticated_update_by_unit` (Seção A, maior) | 52 | ✓ |
| `hr_evaluation_template_sections_authenticated_update_by_parent` | 62 | ✓ |
| `hr_evaluation_template_criteria_authenticated_update_by_parent` | 62 | ✓ |
| `hr_workflow_template_steps_authenticated_update_by_parent` | 57 | ✓ |
| `hr_onboarding_plan_items_authenticated_update_by_parent` | 55 | ✓ |
| `hr_background_jobs_authenticated_select_by_unit` | 47 | ✓ |

**Contexto:** com o sufixo `_by_parent_unit`, as duas tabelas
`hr_evaluation_template_{sections,criteria}` passavam de 63 (67 chars → Postgres truncaria
silenciosamente, gerando `NOTICE` e nomes frágeis).

**Decisão (fechada, normalizada):** **sufixo `_by_parent` uniforme nas 4 tabelas-filhas**
(Seção B), preservando a semântica “derivado do pai/ancestral” e mantendo todos os nomes
≤ 62 chars. Convenção resultante:

- Seção A: `<tabela>_authenticated_<comando>_by_unit`.
- Seção B (todas as 4 filhas): `<tabela>_authenticated_<comando>_by_parent`.
- Seção C: `hr_background_jobs_authenticated_select_by_unit`.

---

## 1. SQL completo da migration (seccionado A/B/C)

Arquivo proposto: **`supabase/migrations/078_rls_policies_hr_templates_children_system_scope.sql`**.
**Não** será escrito nesta tarefa — só após sua aprovação.

```sql
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
-- =====================================================================

-- hr_evaluation_template_sections -> hr_evaluation_templates (template_id)   [nome _by_parent: 62 chars]
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
--   EXISTS de 2 niveis para alcancar o unit_id (nullable) do template.  [nome _by_parent: 62 chars]
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
```

Observações:
- **31 policies** no total (18 + 12 + 1) + 12 `enable` idempotentes. Só policies; **nenhuma**
  alteração de schema/coluna/trigger/helper.
- `hr_workflow_idempotency_keys` **não** recebe policy — a ausência é intencional e comentada.
- Re-runnável: cada `create` é precedido de `drop policy if exists` com o **mesmo nome**.

### 1.1 Nota sobre subquery + RLS (Seção B/neto)

As expressões `EXISTS` referenciam tabelas que também têm RLS (templates/plans/sections).
Em Postgres, subconsultas dentro de policies são filtradas pela RLS das tabelas referenciadas
para o mesmo role. Isso é **consistente** aqui: a condição explícita no `EXISTS`
(`unit_id null`/`user_has_unit_access`) coincide com a `select` policy do pai, de modo que
uma linha-filha é visível **sse e somente se** o pai é visível/acessível — sem falso-negativo.
Mesma filosofia do padrão 072 (`hr_scorecard_questions`).

---

## 2. Regra de ouro — checklist de aplicação (por Wilson; NÃO pelo Codex)

Aplicação manual no SQL Editor, **staging primeiro, depois produção**. O Codex não aplica SQL.

| Ordem | Ref do projeto | Ambiente |
|---|---|---|
| 1º | `jascnmgagejlvjlenduv` | **staging** |
| 2º | `chnamldrlwohaudmjrez` | **produção** |

1. **Confirmar o ref ativo antes de rodar.** Conferir no topo do dashboard que o projeto
   aberto é **staging** (`jascnmgagejlvjlenduv`). `select current_database();` como sanity.
2. **Aplicar em staging.** Colar `078_...sql` inteiro e executar. Esperado: sem erro; 31
   policies criadas + 12 `enable` (re-runnável — rodar 2× sem efeito colateral).
3. **Smoke test em staging** (§3): sanity das policies, prova de escopo com sessão
   `authenticated`, e telas de RH (avaliações, onboarding, treinamentos, documentos,
   templates de workflow, jobs) carregando normalmente (app usa `service_role`).
4. **Só então, produção.** Reabrir no projeto **produção** (`chnamldrlwohaudmjrez`),
   **reconfirmar o ref**, aplicar o mesmo arquivo, repetir o smoke test.
5. **Registrar** data/hora de aplicação em cada ambiente.

Regras: não aplicar em produção antes de staging validar; não editar migrations aplicadas;
se algo divergir em staging, **parar** e revisar antes de tocar produção.

---

## 3. Verificação (§5) — CONTROLE POSITIVO obrigatório, sem quebrar nada

Mesma técnica da 3a: simular `authenticated` no SQL Editor com `set local role` +
`set local request.jwt.claims`, dentro de `begin; ... rollback;`.

**Cadeia de identidade:** a policy chama `user_has_unit_access` → `current_app_user_id()`
(009) → `app_users.id where auth_user_id = current_auth_user_id()` → `current_auth_user_id()`
(**migration 067**) lê `request.jwt.claims ->> 'sub'`. Portanto o `sub` do claim é o
**`app_users.auth_user_id`** do usuário-alvo — **NÃO** o `app_users.id`.

**Usuário-alvo (escolher como service_role, fora da transação):** `app_users` **ativo, não
super-admin**, com **vínculo ativo** em `user_unit_links`. Anotar `auth_user_id` = `AUTH_USER_ID`.

```sql
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"<AUTH_USER_ID>","role":"authenticated"}';
-- <AUTH_USER_ID> = app_users.auth_user_id (NAO app_users.id).

-- (a) CONTROLE POSITIVO — PRE-CONDICAO. current_app_user_id() tem de ser NAO-NULO.
--     Se vier NULL, o claim/sub esta errado -> NAO e' prova de policy. PARE e corrija.
select public.current_app_user_id() as deve_ser_nao_nulo;   -- esperado: um uuid (nao null)

-- (b) TABELA ASSIMETRICA (hr_evaluation_templates): ve REDE (unit null) + SUA unidade,
--     NAO ve unidade alheia.
--   b1) rede: pelo menos as linhas de rede aparecem (se existirem)
select count(*) as ve_rede
from public.hr_evaluation_templates
where unit_id is null;                 -- esperado: == total de templates de rede (visiveis)
--   b2) sua unidade: > 0 nas SUAS unidades (controle positivo do unit-scope)
select count(*) as ve_minha_unidade
from public.hr_evaluation_templates
where unit_id in (
  select uul.unit_id from public.user_unit_links uul
  join public.app_users au on au.id = uul.app_user_id
  where au.auth_user_id = '<AUTH_USER_ID>' and uul.status = 'active' and uul.deleted_at is null
);                                     -- esperado: > 0
--   b3) unidade alheia: uma linha de unidade NAO vinculada e' invisivel
select count(*) as nao_ve_alheia
from public.hr_evaluation_templates
where id = '<ID_TEMPLATE_UNIDADE_ALHEIA>';   -- esperado: 0

-- (c) ESCRITA unit-scoped: authenticated NAO consegue inserir template de REDE (unit_id null).
--     with check user_has_unit_access(NULL) = false -> deve FALHAR.
--     (rodar isolado; espera-se erro de RLS / 0 linhas)
insert into public.hr_evaluation_templates (organization_id, unit_id, code, name /* + obrigatorios */)
values ('<ORG_ID>', null, 'RLS_TEST', 'RLS_TEST');   -- esperado: ERRO "new row violates row-level security policy"

-- (d) FILHA (hr_evaluation_template_sections): ve/edita conforme o pai.
--   d1) secao de template da SUA unidade: visivel
select count(*) as ve_secao_minha
from public.hr_evaluation_template_sections s
where exists (
  select 1 from public.hr_evaluation_templates t
  where t.id = s.template_id
    and t.unit_id in (
      select uul.unit_id from public.user_unit_links uul
      join public.app_users au on au.id = uul.app_user_id
      where au.auth_user_id = '<AUTH_USER_ID>' and uul.status='active' and uul.deleted_at is null
    )
);                                     -- esperado: > 0 (se houver secoes na sua unidade)
--   d2) secao de template de unidade ALHEIA: invisivel
select count(*) as nao_ve_secao_alheia
from public.hr_evaluation_template_sections
where template_id = '<ID_TEMPLATE_UNIDADE_ALHEIA>';   -- esperado: 0

-- (e) IDEMPOTENCY KEYS: sem policy -> authenticated ve 0.
select count(*) as idempotency_deve_ser_zero
from public.hr_workflow_idempotency_keys;              -- esperado: 0

rollback;
```

**Contraprova `service_role`** (fora da transação, role service_role — ignora RLS):
- `select count(*) from public.hr_workflow_idempotency_keys;` → **> 0** se houver linhas
  (service_role vê o que authenticated não vê).
- `select count(*) from public.hr_evaluation_templates;` → **total geral** (todas as unidades
  + rede), confirmando que só `authenticated` é restringido.

Interpretação: **(a) não-nulo é pré-condição** (prova que a identidade foi resolvida); só com
(a) ok é que (b)/(c)/(d)/(e) provam, respectivamente, leitura rede+unidade, bloqueio de
unidade alheia, escrita unit-scoped (rede negada), herança pelo pai e negação total da
idempotency_keys. `service_role` continua vendo tudo → **app inalterado**.

### 3.1 Smoke test do app (zero regressão)
Apontar o app para **staging**, como **não-super-admin**, e abrir: RH → Avaliações (templates,
seções, critérios), Onboarding (planos/itens), Treinamentos, Documentos (tipos/regras),
Templates de workflow, e a tela de Background Jobs. Tudo deve carregar normalmente (backend via
`service_role`). Opcional: `npm run screenshots:rh` contra staging — sem diff visual.

---

## 4. Fora de escopo (registrar)

- **Gating sensível (`HR:*.sensitive`) NÃO entra na 3b.** Continua **na aplicação**
  (`api-auth.ts`); pode ir ao banco numa CAMADA 2 futura. A 3b é unit-scope como linha de base.
- `hr_workflow_idempotency_keys` permanece **service-role-only** (sem policy) por design.
- `hr_background_jobs` fica **read-only** para authenticated (escrita = service_role/cron).
- Sem `delete`, sem `anon` (design).

---

## 5. Critério de aceite deste plano

- [x] 12 tabelas confirmadas (unit_id nullable nas 6 da Seção A; FKs dos filhos; cadeia do neto) com fonte migration:linha.
- [x] SQL completo seccionado A (assimétrico) / B (filho-via-pai + neto) / C (globais), padrões 071/072.
- [x] Contagem por seção (18 + 12 + 1 = **31 policies**) + 12 `enable` idempotentes.
- [x] `hr_workflow_idempotency_keys` sem policy (service-role-only) documentado; `hr_background_jobs` read-only.
- [x] Flag e decisão do limite de 63 chars (evaluation filhas → `_by_parent`).
- [x] Checklist staging→produção por Wilson, confirmando ref.
- [x] Verificação com controle positivo obrigatório (sub = auth_user_id; cita 067).
- [x] Nota de escopo do gating sensível.

Nada aplicado. Nenhuma migration escrita nesta tarefa. Aguardando sua revisão para então criar
`078_rls_policies_hr_templates_children_system_scope.sql` com o SQL da §1.
