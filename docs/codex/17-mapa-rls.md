# Mapa de RLS (para planejar as policies)

> 2026-07-06 · **READ-ONLY**, sem commit, nenhuma policy escrita. Levantado a partir das migrations
> (`supabase/migrations/*`). Onde a certeza exige o catálogo do Postgres (colunas/estado ao vivo),
> proponho SELECTs read-only para você rodar no staging — **não executei**.
>
> Fontes-chave: `009_rls_policies_base.sql` (habilita RLS + helpers), `066_rls_policies_non_sensitive_foundation.sql`
> (policies não-sensíveis), `069_rls_policies_hr_sensitive_core.sql` (policies do núcleo sensível de RH).

---

## 1. Tabelas com RLS habilitado — têm policy ou zero policy?

**RLS é habilitado em ~90 tabelas** (grep `enable row level security`). Policies definidas **apenas** em
`066` (não-sensível) e `069` (RH sensível core). Cruzando os dois grep:

### (A) Têm policy — cobertas por `066`/`069`
- **Base/organização (066):** `organizations`*, `units`, `unit_settings`, `departments`, `job_positions`,
  `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`,
  `cost_centers`, `approval_requests`, `approval_steps`, `approval_actions`, `notifications`.
- **Catálogo global (066, só SELECT):** `permissions`, `access_profiles`, `profile_permissions`,
  `system_statuses`, `request_types`, `attachment_types`, `operational_categories`, `approval_levels`,
  `notification_rules`, `approval_flows` (select "scoped").
- **Self (066, só SELECT do próprio):** `app_users`, `user_unit_links`, `user_permission_overrides`,
  `user_employee_links`.
- **Deny total (066):** `audit_trail` (`audit_trail_no_direct_access`), `system_logs`
  (`system_logs_no_direct_access`).
- **Compartilhadas (066):** `suppliers`, `attachments`, `comments`, `room_status_history`.
- **Orçamento (066):** `budget_periods`, `budget_lines`, `budget_movements`, `budget_reservations`,
  `budget_change_requests`.
- **Compras (066):** `purchase_requests`, `purchase_request_items`, `purchase_quotes`,
  `purchase_quote_items`, `purchase_receipts`, `purchase_receipt_items`, `purchase_request_events`,
  `purchase_approval_decisions`, `purchase_quote_negotiations`, `purchase_approval_snapshots`.
- **RH sensível core (069):** `employee_documents`, `employee_document_links`,
  `employee_occupational_records`, `employee_nr_certifications`, `employee_conduct_records`,
  `employee_conduct_reviews`, `employee_terminations`, `employee_termination_checklists`,
  `employee_evaluations`, `employee_evaluation_scores`.

### (B) RLS ON + **ZERO policy** (deny-all para `authenticated`; só `service_role`/owner acessa)
- **`employees`** ⚠️ — a tabela central de dados pessoais tem RLS ligado desde `009` e **nenhuma policy**.
- **Todo o RH não-coberto por 069** (RLS ligado em 021–062, policy nenhuma):
  `hr_document_types`, `employee_functional_events`, `hr_workflows`, `hr_workflow_steps`,
  `hr_workflow_events`, `hr_workflow_idempotency_keys`, `hr_workflow_notifications`,
  `hr_workflow_audit_logs`, `hr_workflow_templates`, `hr_workflow_template_steps`,
  `hr_workflow_approver_delegations`, `hr_background_jobs`, `hr_job_candidates`, `hr_candidate_interviews`,
  `hr_scorecard_templates`, `hr_scorecard_questions`, `hr_interview_scorecards`,
  `hr_interview_scorecard_responses`, `hr_candidate_admission_conversions`, `hr_document_rules`,
  `hr_onboarding_plans`, `hr_onboarding_plan_items`, `employee_onboardings`, `employee_onboarding_items`,
  `hr_evaluation_templates`, `hr_evaluation_template_sections`, `hr_evaluation_template_criteria`,
  `employee_development_plans`, `employee_development_plan_items`, `employee_movements`,
  `employee_movement_approvals`, `hr_trainings`, `employee_trainings`, `hr_admission_processes`,
  `hr_admission_checklist_items`.

> **Efeito de "RLS ON + zero policy":** para os papéis `authenticated`/`anon`, **todo acesso é negado**
> (sem policy ⇒ nenhuma linha visível, nenhuma escrita). Só `service_role` (bypassa RLS) e o owner
> operam. Ou seja: hoje é um **deny-all seguro**, mas **não** oferece defesa em profundidade *granular* —
> é tudo-ou-nada na fronteira do service_role.

> \* `organizations` tem só policy de SELECT (catálogo). Sem policy de INSERT/UPDATE ⇒ escrita = deny
> (só service_role). Vale confirmar no §5.

### SELECT read-only para você confirmar o estado ao vivo (RLS + nº de policies por tabela)
```sql
select c.relname               as tabela,
       c.relrowsecurity        as rls_habilitado,
       c.relforcerowsecurity   as rls_forcado,
       count(p.polname)        as qtd_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by rls_habilitado desc, qtd_policies asc, tabela;
```
(Tabelas com `rls_habilitado = true` e `qtd_policies = 0` são o grupo (B).)

---

## 2. Helpers da migration 009 (código real)

```sql
-- 009:5-15 — extrai o UUID do JWT (claim sub). Retorna NULL se o claim nao for um UUID valido.
create or replace function public.current_auth_user_id()
returns uuid language sql stable as $$
  select case
    when nullif(current_setting('request.jwt.claim.sub', true), '') ~* '^[0-9a-f]{8}-...-[0-9a-f]{12}$'
      then current_setting('request.jwt.claim.sub', true)::uuid
    else null
  end;
$$;

-- 009:17-30 — mapeia auth.uid() -> app_users.id (ativo, nao-deletado). SECURITY DEFINER.
create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select au.id from public.app_users au
  where au.auth_user_id = public.current_auth_user_id()
    and au.deleted_at is null and au.status = 'active'
  limit 1;
$$;

-- 009:32-49 — o app_user corrente tem VINCULO ATIVO e vigente com a unidade-alvo? SECURITY DEFINER.
create or replace function public.user_has_unit_access(target_unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_unit_links uul
    where uul.app_user_id = public.current_app_user_id()
      and uul.unit_id = target_unit_id
      and uul.status = 'active' and uul.deleted_at is null
      and (uul.starts_at is null or uul.starts_at <= now())
      and (uul.ends_at   is null or uul.ends_at   >= now())
  );
$$;
```

- **`current_auth_user_id()`** → `uuid`. Lê o **claim `sub` do JWT** (`current_setting('request.jwt.claim.sub')`),
  validando o formato UUID; senão `NULL`. **Não lê tabela** — lê o setting da sessão.
- **`current_app_user_id()`** → `uuid`. Lê **`public.app_users`** (linha ativa/não-deletada) casando
  `auth_user_id = current_auth_user_id()`. É a ponte auth→app_user.
- **`user_has_unit_access(target_unit_id)`** → `boolean`. Lê **`public.user_unit_links`** — existe vínculo
  do `current_app_user_id()` com aquela unidade, ativo, não-deletado e dentro de `starts_at/ends_at`.

> ⚠️ Nota de fidelidade: a migration **`067_fix_current_auth_user_id_dual_claim.sql`** revisou
> `current_auth_user_id()` (tratamento de "dual claim"). A definição **ao vivo** pode diferir do texto de
> `009` acima — confirme com `select prosrc from pg_proc where proname='current_auth_user_id';`.

---

## 3. A app usa service_role (bypassa RLS)? Onde?

**Sim.** Dois clientes em `src/lib/supabase/`:
- **`admin.ts` → `createSupabaseAdminClient()`** usa **`SUPABASE_SERVICE_ROLE_KEY`**
  (`src/lib/supabase/admin.ts:6-15`, via `getAdminSupabaseEnv()` em `env.ts:20-24`). **service_role
  BYPASSA RLS.** É o cliente usado por **todas as rotas de API** através de
  `requirePermission` (`src/lib/auth/permissions.ts:340` → `createSupabaseAdminClient()`).
- **`server.ts` → `createSupabaseServerClient()`** usa a **anonKey** + cookie de sessão do usuário
  (`src/lib/supabase/server.ts:19-48`) — **sujeito a RLS**. Usado só para **auth** (ex.: `auth.getUser()`
  em `session.ts`), não para ler/escrever dados de negócio.

**Confirmação:** o **gate primário hoje é a APLICAÇÃO** (`requirePermission` + checagens por unidade
`getAccessibleUnitIdsForPermission`), rodando sob **service_role** que ignora RLS. Portanto as policies
RLS são **defesa em profundidade**, não o portão principal. Se um dia a app passar a usar o cliente
de sessão (anonKey) para dados, as policies viram o gate real — e as lacunas do §1(B) precisam ser fechadas.

---

## 4. Agrupamento por tipo de escopo (para a policy)

> Grupos inferidos das migrations e dos predicados de `066`/`069`. **Confirme as colunas** com o SELECT
> ao final desta seção antes de escrever policy.

- **Por UNIDADE (têm `unit_id`) → usariam `user_has_unit_access(unit_id)`** — padrão já usado em `066`
  (`*_authenticated_*_by_unit`) e `069`: `units` (self), `unit_settings`, `departments`, `job_positions`,
  `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`,
  `cost_centers`, `suppliers`, `attachments`, `comments`, `room_status_history`, `budget_*`,
  `purchase_requests`, `purchase_quotes`, `purchase_receipts`, `purchase_request_events`,
  `purchase_approval_decisions`, `purchase_quote_negotiations`, `purchase_approval_snapshots`,
  `approval_requests`, `notifications`, e o núcleo RH de `069`.
  - **Filhas sem `unit_id` próprio → "by_parent_unit"** (join à mãe p/ achar a unidade): já feito em
    `066`/`069` para `purchase_request_items`, `purchase_quote_items`, `purchase_receipt_items`,
    `approval_steps`, `approval_actions`, `employee_conduct_reviews`, `employee_termination_checklists`,
    `employee_evaluation_scores`. **Vários RH do grupo (B)** são filhas assim (ex.:
    `hr_workflow_steps`→`hr_workflows`, `employee_onboarding_items`→`employee_onboardings`,
    `hr_admission_checklist_items`→`hr_admission_processes`).
- **Por ORGANIZAÇÃO (têm `organization_id`, sem `unit_id`)** — candidatas: `employees` (confirmar),
  e possivelmente templates/config de RH (`hr_workflow_templates`, `hr_scorecard_templates`,
  `hr_evaluation_templates`, `hr_document_types`, `hr_document_rules`, `hr_trainings`). Precisariam de um
  helper novo tipo `user_belongs_to_org(org_id)` (não existe hoje).
- **Globais/catálogo (sem `unit_id` nem `organization_id`)** — `permissions`, `access_profiles`,
  `profile_permissions`, `system_statuses`, `request_types`, `attachment_types`,
  `operational_categories`, `approval_levels`, `notification_rules`, `organizations`. Padrão de `066`:
  **SELECT liberado a `authenticated`**, escrita **deny** (só service_role/admin).
- **Self (por usuário)** — `app_users`, `user_unit_links`, `user_permission_overrides`,
  `user_employee_links`: policy "do próprio" (`id/app_user_id = current_app_user_id()`).
- **Sensíveis (RH: pessoais/saúde/conduta) → policy mais restrita** — núcleo já em `069` (by_unit /
  by_parent_unit). **Ainda descobertas (grupo B):** `employees` (deny-all hoje),
  `employee_functional_events`, `employee_movements`+`employee_movement_approvals`, `employee_trainings`,
  `employee_development_plans(_items)`, `employee_onboardings(_items)`, e todo o pipeline de
  recrutamento (`hr_job_candidates`, `hr_candidate_interviews`, `hr_interview_scorecards`,
  `hr_interview_scorecard_responses`, `hr_candidate_admission_conversions`).

### SELECT read-only para confirmar as colunas de escopo por tabela
```sql
select c.relname as tabela,
       bool_or(a.attname = 'unit_id')          as tem_unit_id,
       bool_or(a.attname = 'organization_id')  as tem_organization_id
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
group by c.relname
order by tem_unit_id, tem_organization_id, tabela;
```

---

## 5. Tabelas problemáticas — RLS ON sem `unit_id` nem `organization_id`

Como escopá-las (a decidir no plano de policy — **não** escrevendo agora):

- **Catálogos globais** (`permissions`, `access_profiles`, `profile_permissions`, `system_statuses`,
  `request_types`, `attachment_types`, `operational_categories`, `approval_levels`, `notification_rules`,
  `organizations`): não há o que "escopar" por unidade. Estratégia: **SELECT p/ todo `authenticated`**
  (como `066` já faz) + **escrita restrita** (deny direto; só service_role, com o gate `ADMIN:*` na app).
- **Trilhas/infra** (`audit_trail`, `system_logs`): já são **deny-all** (`*_no_direct_access`). Escrita só
  por trigger `security definer`/service_role. Manter deny; nunca expor a `authenticated`.
  - *Obs.:* `audit_trail` **tem** `unit_id` (nullable) — poderia ganhar SELECT por unidade no futuro, mas
    hoje a decisão é deny total.
- **Self/infra de usuário** (`app_users`, `user_unit_links`, `user_permission_overrides`,
  `user_employee_links`): sem escopo de unidade — escopar **pelo próprio** (`= current_app_user_id()`),
  já feito em `066`. Listagem administrativa continua via service_role.
- **RH global sem unit_id** (a confirmar no §4-SQL): `hr_document_types`, `hr_document_rules`,
  `hr_trainings`, `hr_workflow_templates`+`_steps`, `hr_scorecard_templates`+`_questions`,
  `hr_evaluation_templates`+`_sections`+`_criteria`, `hr_background_jobs`, `hr_workflow_idempotency_keys`,
  `hr_workflow_notifications`, `hr_workflow_audit_logs`, `hr_workflow_approver_delegations`. Se tiverem
  só `organization_id` → precisam de um helper `user_belongs_to_org()`. Se não tiverem **nem** org nem
  unit (ex.: `hr_workflow_idempotency_keys`, `hr_background_jobs`) → tratar como **infra**:
  deny-all a `authenticated`, acesso só service_role (é o caso hoje, por serem grupo B).
- **`employees`** — o caso mais crítico: dado pessoal, **RLS ON + zero policy** (deny-all). Precisa de
  policy própria (provável por unidade via vínculo `user_employee_links`/`employees.unit_id` — confirmar
  colunas) e tratamento **sensível** como o núcleo de `069`.

---

## Síntese

- **Cobertas:** toda a base não-sensível, orçamento e compras (`066`) + 10 tabelas do núcleo sensível de
  RH (`069`).
- **Lacuna principal:** **`employees`** e **~33 tabelas de RH** estão com **RLS ON e zero policy**
  (deny-all; hoje só o service_role da app as acessa). Seguro por ora, mas sem defesa granular.
- **Gate real hoje = aplicação** (`requirePermission` sob service_role). RLS é defesa em profundidade.
- **Antes de escrever policy:** rodar os 2 SELECTs (estado RLS/contagem de policy §1 e colunas de escopo
  §4) para confirmar o inventário ao vivo e decidir por-unidade vs por-org vs global/self.

**Nada foi alterado. Próximo passo (quando você aprovar): planejar as policies do grupo (B), priorizando
`employees` e o RH sensível ainda descoberto.**
