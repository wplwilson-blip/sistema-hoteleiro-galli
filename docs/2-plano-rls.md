# Plano RLS Etapa 1 - Tabelas nao sensiveis

## 1. Objetivo

Criar, em uma etapa posterior, uma migration nova para policies de Row Level Security em tabelas nao sensiveis do sistema, como defesa em profundidade caso chaves `anon` ou `authenticated` sejam usadas diretamente contra o Supabase.

Esta etapa e somente planejamento. Nenhuma migration sera criada agora, nenhuma policy sera aplicada agora e nenhum comportamento do app sera alterado neste commit.

O app atual segue usando `service_role` nas APIs server-side. O `service_role` continua com acesso total porque ignora RLS por natureza no Supabase/Postgres. As policies planejadas valem para os roles `authenticated` e, quando indicado, para negar `anon`.

Helpers existentes que devem ser reutilizados:

- `public.current_auth_user_id()`
- `public.current_app_user_id()`
- `public.user_has_unit_access(target_unit_id uuid)`

Nao criar helpers novos nesta etapa.

## 2. Fora de escopo desta etapa

Nao entram nesta etapa as tabelas de RH sensivel e tabelas de RH que exigem desenho especifico de LGPD, prontuario, dossie, saude, conduta, desligamento ou admissao.

Ficam para etapa 2/LGPD, entre outras:

- `employees`
- `hr_document_types`
- `employee_documents`
- `employee_document_links`
- `employee_functional_events`
- `employee_conduct_records`
- `employee_conduct_reviews`
- `employee_occupational_records`
- `employee_nr_certifications`
- `employee_terminations`
- `employee_termination_checklists`
- `employee_evaluations`
- `employee_evaluation_scores`
- `employee_development_plans`
- `employee_development_plan_items`
- `employee_movements`
- `employee_movement_approvals`
- `hr_workflows`
- `hr_workflow_steps`
- `hr_workflow_events`
- `hr_workflow_notifications`
- `hr_workflow_audit_logs`
- `hr_workflow_templates`
- `hr_workflow_template_steps`
- `hr_workflow_approver_delegations`
- `hr_background_jobs`
- `hr_job_candidates`
- `hr_candidate_interviews`
- `hr_scorecard_templates`
- `hr_scorecard_questions`
- `hr_interview_scorecards`
- `hr_interview_scorecard_responses`
- `hr_candidate_admission_conversions`
- `hr_document_rules`
- `hr_onboarding_plans`
- `hr_onboarding_plan_items`
- `employee_onboardings`
- `employee_onboarding_items`
- `hr_trainings`
- `employee_trainings`
- `hr_admission_processes`
- `hr_admission_checklist_items`
- `hr_workflow_idempotency_keys`

Motivo: mesmo quando algumas dessas tabelas parecem operacionais, elas pertencem ao dominio de RH e podem conter dado pessoal, avaliativo, medico, disciplinar, documental ou historico funcional.

## 3. Migration planejada

Nome proposto para a proxima etapa de codigo:

```txt
supabase/migrations/066_rls_policies_non_sensitive_foundation.sql
```

A migration deve:

1. Nao alterar estrutura de tabelas.
2. Nao editar a migration `009_rls_policies_base.sql`.
3. Dropar policies antigas com `drop policy if exists` apenas para os nomes que a propria migration controla.
4. Criar policies idempotentes por grupo.
5. Conceder somente `select`, `insert` e `update` quando previsto.
6. Nao criar policy de `delete`; sem policy, `delete` fica bloqueado para `anon`/`authenticated`.
7. Manter logs fechados para `anon`/`authenticated`.

## 4. Grupos de tabelas e regras

### 4.1 Escopo direto por unidade

Regra geral:

- `SELECT`: permitido para `authenticated` quando `public.user_has_unit_access(unit_id)` for verdadeiro.
- `INSERT`: permitido para `authenticated` somente quando o `unit_id` do novo registro estiver no escopo do usuario.
- `UPDATE`: permitido para `authenticated` somente quando o registro atual e o novo `unit_id` estiverem no escopo do usuario.
- `DELETE`: sem policy nesta etapa; fica negado para `anon`/`authenticated`.
- `anon`: sem policy; fica negado.

Tabelas:

- `unit_settings`
- `departments`
- `job_positions`
- `blocks`
- `floors`
- `rooms`
- `operational_areas`
- `operational_locations`
- `equipment_assets`
- `cost_centers`
- `approval_requests`
- `notifications`
- `suppliers`
- `attachments`
- `comments`
- `room_status_history`
- `budget_periods`
- `budget_lines`
- `budget_movements`
- `budget_reservations`
- `budget_change_requests`
- `purchase_requests`
- `purchase_request_items`
- `purchase_quotes`
- `purchase_quote_items`
- `purchase_receipts`
- `purchase_receipt_items`
- `purchase_request_events`
- `purchase_approval_decisions`
- `purchase_quote_negotiations`
- `purchase_approval_snapshots`

Observacoes:

- `departments`, `job_positions`, `suppliers`, `attachments` e `comments` possuem `unit_id` nullable em schema. Nesta etapa, linhas com `unit_id is null` nao serao expostas a `anon`/`authenticated` por essa policy. O app server-side nao e afetado porque segue via `service_role`.
- `attachments` entra nesta etapa apenas pela protecao por unidade. Regras finas de `visibility_scope`, `is_sensitive`, dossie e LGPD ficam para etapa especifica. Como defesa inicial, qualquer acesso direto por anon/authenticated fica limitado a unidade.
- `purchase_request_items`, `purchase_quote_items` e `purchase_receipt_items` possuem `unit_id` proprio no schema atual. Mesmo assim, a migration pode acrescentar checagem de consistencia com a tabela pai, conforme a secao 4.4.

SQL padrao planejado:

```sql
drop policy if exists "<table>_authenticated_select_by_unit" on public.<table>;
create policy "<table>_authenticated_select_by_unit"
on public.<table>
for select
to authenticated
using (public.user_has_unit_access(unit_id));

drop policy if exists "<table>_authenticated_insert_by_unit" on public.<table>;
create policy "<table>_authenticated_insert_by_unit"
on public.<table>
for insert
to authenticated
with check (public.user_has_unit_access(unit_id));

drop policy if exists "<table>_authenticated_update_by_unit" on public.<table>;
create policy "<table>_authenticated_update_by_unit"
on public.<table>
for update
to authenticated
using (public.user_has_unit_access(unit_id))
with check (public.user_has_unit_access(unit_id));
```

### 4.2 Tabela `units`

`units` nao possui coluna `unit_id`; a propria coluna `id` representa a unidade alvo.

Regra:

- `SELECT`: usuario autenticado ve apenas unidades em `user_unit_links`.
- `UPDATE`: usuario autenticado atualiza apenas unidades em `user_unit_links`, se alguma API direta vier a usar anon/authenticated.
- `INSERT`: tecnicamente pode usar `with check (public.user_has_unit_access(id))`, mas um usuario comum nao consegue criar unidade nova sem vinculo previo. Na pratica, criacao de unidade continua restrita ao backend/service_role.
- `DELETE`: negado por ausencia de policy.

SQL planejado:

```sql
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
```

### 4.3 Catalogos globais e cadastros de permissao

Regra:

- `SELECT`: permitido para `authenticated`.
- `INSERT`, `UPDATE`, `DELETE`: sem policy nesta etapa; ficam negados para `anon`/`authenticated`.
- `anon`: sem policy; fica negado.

Tabelas:

- `organizations`
- `permissions`
- `access_profiles`
- `profile_permissions`
- `system_statuses`
- `request_types`
- `attachment_types`
- `operational_categories`
- `approval_levels`
- `notification_rules`

SQL padrao planejado:

```sql
drop policy if exists "<table>_authenticated_select_catalog" on public.<table>;
create policy "<table>_authenticated_select_catalog"
on public.<table>
for select
to authenticated
using (true);
```

### 4.4 Catalogo misto: `approval_flows`

`approval_flows` tem escopo misto: pode ser global (`is_global = true`) ou especifico de unidade (`unit_id`).

Regra:

- `SELECT`: permitido para `authenticated` quando o fluxo for global ou quando o usuario tiver acesso a `unit_id`.
- `INSERT`, `UPDATE`, `DELETE`: sem policy nesta etapa; ficam negados para `anon`/`authenticated`.

SQL planejado:

```sql
drop policy if exists "approval_flows_authenticated_select_scoped" on public.approval_flows;
create policy "approval_flows_authenticated_select_scoped"
on public.approval_flows
for select
to authenticated
using (
  is_global = true
  or (unit_id is not null and public.user_has_unit_access(unit_id))
);
```

### 4.5 Identidade e vinculos do proprio usuario

Regra:

- `SELECT`: usuario autenticado ve apenas registros ligados a `public.current_app_user_id()`.
- `INSERT`, `UPDATE`, `DELETE`: sem policy nesta etapa; ficam negados para `anon`/`authenticated`.
- `anon`: sem policy; fica negado.

Tabelas:

- `app_users`
- `user_unit_links`
- `user_permission_overrides`
- `user_employee_links`

SQL planejado:

```sql
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
```

### 4.6 Tabelas filhas sem `unit_id` proprio

Regra:

- Acesso herdado da tabela pai por `exists`.
- `SELECT`, `INSERT`, `UPDATE`: permitido quando o pai pertence a unidade acessivel.
- `DELETE`: sem policy nesta etapa.

Tabelas identificadas:

| Tabela filha | Pai | Regra de heranca |
| --- | --- | --- |
| `approval_steps` | `approval_requests` | `approval_steps.approval_request_id = approval_requests.id` e `user_has_unit_access(approval_requests.unit_id)` |
| `approval_actions` | `approval_requests` | `approval_actions.approval_request_id = approval_requests.id` e `user_has_unit_access(approval_requests.unit_id)` |

SQL planejado:

```sql
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
```

Mesmo padrao para `approval_actions`, trocando o nome da tabela e a coluna de referencia.

### 4.7 Filhas de compras com `unit_id` proprio e pai obrigatorio

As tabelas abaixo possuem `unit_id` proprio no schema atual, mas tambem possuem pai obrigatorio:

- `purchase_request_items` -> `purchase_requests`
- `purchase_quote_items` -> `purchase_quotes`
- `purchase_receipt_items` -> `purchase_receipts`

Regra recomendada:

- Manter policy direta por `unit_id`.
- Acrescentar, no `with check` e no `using`, a consistencia com o pai para evitar linha com `unit_id` divergente do registro pai.

Exemplo planejado para `purchase_request_items`:

```sql
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
```

O mesmo desenho vale para:

- `purchase_quote_items`, validando contra `purchase_quotes`.
- `purchase_receipt_items`, validando contra `purchase_receipts`.

### 4.8 Logs

Regra:

- `audit_trail` e `system_logs` nao devem ser lidos nem escritos diretamente por `anon` ou `authenticated`.
- O backend com `service_role` continua registrando e lendo quando necessario.

Tabelas:

- `audit_trail`
- `system_logs`

SQL planejado:

```sql
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
```

Sem policy para `anon`, portanto `anon` tambem fica bloqueado.

## 5. Tabelas da etapa 1 por grupo

| Grupo | Tabelas |
| --- | --- |
| Unidade direta | `unit_settings`, `departments`, `job_positions`, `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`, `cost_centers`, `approval_requests`, `notifications`, `suppliers`, `attachments`, `comments`, `room_status_history`, `budget_periods`, `budget_lines`, `budget_movements`, `budget_reservations`, `budget_change_requests`, `purchase_requests`, `purchase_request_items`, `purchase_quotes`, `purchase_quote_items`, `purchase_receipts`, `purchase_receipt_items`, `purchase_request_events`, `purchase_approval_decisions`, `purchase_quote_negotiations`, `purchase_approval_snapshots` |
| Unidade especial | `units` usando `id` como unidade alvo |
| Catalogos globais | `organizations`, `permissions`, `access_profiles`, `profile_permissions`, `system_statuses`, `request_types`, `attachment_types`, `operational_categories`, `approval_levels`, `notification_rules` |
| Catalogo misto | `approval_flows` |
| Identidade/proprio usuario | `app_users`, `user_unit_links`, `user_permission_overrides`, `user_employee_links` |
| Filhas por pai | `approval_steps`, `approval_actions` |
| Logs fechados | `audit_trail`, `system_logs` |

## 6. Teste planejado em staging

Aplicar a migration somente depois da revisao e em ambiente de staging/Supabase controlado.

### 6.1 Preparacao

1. Escolher dois usuarios reais ou de teste com `app_users.auth_user_id` preenchido.
2. Garantir que o usuario A tenha `user_unit_links` ativo apenas para a unidade A.
3. Garantir que o usuario B tenha `user_unit_links` ativo apenas para a unidade B.
4. Confirmar que existem registros operacionais/compras em pelo menos duas unidades.
5. Obter uma sessao Supabase Auth valida para cada usuario, usando o fluxo normal do sistema, sem expor senha em logs.

### 6.2 Teste com chave `anon` + JWT authenticated

Usar chamadas REST/Supabase com:

- header `apikey: <anon key>`
- header `Authorization: Bearer <access_token_do_usuario>`

Validacoes:

```sql
select id from public.units;
```

Resultado esperado: usuario A ve apenas a unidade A; usuario B ve apenas a unidade B.

```sql
select distinct unit_id from public.departments;
select distinct unit_id from public.purchase_requests;
select distinct unit_id from public.purchase_quotes;
select distinct unit_id from public.attachments;
```

Resultado esperado: todos os `unit_id` retornados pertencem ao escopo do usuario autenticado.

```sql
select pri.id, pri.unit_id
from public.purchase_request_items pri;
```

Resultado esperado: usuario ve apenas itens da sua unidade e coerentes com `purchase_requests`.

```sql
select id from public.approval_steps;
select id from public.approval_actions;
```

Resultado esperado: usuario ve apenas etapas/acoes cujos `approval_requests` pertencem a unidades acessiveis.

```sql
select code from public.permissions limit 5;
select code from public.system_statuses limit 5;
```

Resultado esperado: usuario autenticado consegue ler catalogos globais.

```sql
select id from public.audit_trail limit 1;
select id from public.system_logs limit 1;
```

Resultado esperado: nenhum acesso direto permitido para `authenticated`; pode retornar zero linhas ou erro de permissao conforme cliente, mas nao deve expor dados.

### 6.3 Testes de escrita por unidade

1. Tentar inserir `comments` ou outro registro operacional permitido com `unit_id` da propria unidade.
   - Esperado: permitido pela policy.
2. Tentar inserir o mesmo tipo de registro com `unit_id` de outra unidade.
   - Esperado: bloqueado por RLS.
3. Tentar atualizar registro de outra unidade.
   - Esperado: bloqueado por RLS.
4. Tentar `DELETE` em qualquer tabela da etapa.
   - Esperado: bloqueado por ausencia de policy de delete.

### 6.4 Teste com chave `anon` sem JWT

Executar consultas simples sem `Authorization: Bearer`.

Resultado esperado:

- Sem acesso a tabelas unitarias.
- Sem acesso a catalogos globais, porque as policies sao para `authenticated`.
- Sem acesso a logs.

### 6.5 Teste com `service_role`

Executar as mesmas consultas com `service_role`.

Resultado esperado:

- `service_role` continua vendo e escrevendo em todas as tabelas conforme comportamento atual.
- As APIs server-side do app nao quebram, pois seguem usando cliente admin/service role e validacao server-side.

## 7. Riscos e mitigacoes

| Risco | Mitigacao |
| --- | --- |
| Policy expor tabela de RH por engano | Manter lista de exclusao explicita e nao incluir migrations `021+` de RH nesta etapa |
| Linha com `unit_id null` aparecer indevidamente | Policies unitarias exigem `user_has_unit_access(unit_id)`, que nao libera `null` |
| Filha operacional vazar por falta de `unit_id` | Usar `exists` contra tabela pai nas filhas sem `unit_id` |
| Divergencia entre `unit_id` da filha de compras e pai | Para filhas de compras com pai obrigatorio, validar tambem a consistencia com o pai |
| Bloquear app atual | App usa `service_role`, que ignora RLS; mesmo assim validar rotas principais apos aplicar em staging |
| Dar falsa sensacao de autorizacao completa | Registrar que esta etapa e defesa em profundidade de RLS, nao substitui autorizacao server-side por permissao |

## 8. Checks depois da futura migration

Depois da etapa de codigo, validar:

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

E conferir RLS ativo:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'units',
    'departments',
    'job_positions',
    'purchase_requests',
    'purchase_quotes',
    'attachments',
    'approval_steps',
    'audit_trail',
    'system_logs'
  )
order by relname;
```

## 9. Decisao aguardada

Este plano precisa ser revisado antes da criacao da migration `066`. Apos aprovacao, a proxima etapa sera escrever somente a migration de policies, sem alterar helpers de sessao, Auth, login, Supabase Auth, estrutura de tabelas ou APIs.
