# Plano — RLS Fatia 3a: workflows + admissão, escopo por unidade

**Área SENSÍVEL** (`docs/NAO_ALTERAR.md`: RLS/policies + migrations). Este documento é
**só o plano**. Nenhum SQL é aplicado nesta tarefa. Aguardando revisão. A migration só será
**escrita e aplicada** após sua aprovação — e aplicada **por você (Wilson)** no SQL Editor,
não pelo Codex.

Branch: `rls/fatia3a-workflow-admission`. Push apenas deste documento.

---

## 0. Contexto e premissas (confirmado em varredura)

- 20 tabelas de RH têm **RLS habilitado e ZERO policy** (gap de defesa-em-profundidade).
  Esta fatia **3a** cobre só as **8 operacionais** com `unit_id` e PII (workflows + admissão).
- O app acessa essas tabelas **só via API route com `service_role`** (que **ignora RLS**).
  Nenhum componente consulta direto como `authenticated`. Logo estas policies são
  **defesa-em-profundidade pura** e **não podem quebrar a aplicação**. O risco é policy
  frouxa, não regressão.
- Helper reutilizado (definido na **009**, NÃO recriado aqui):
  `public.user_has_unit_access(target_unit_id uuid)` — `exists` de vínculo **ativo** em
  `user_unit_links` para `current_app_user_id()`.
- Padrão de referência **obrigatório**: `071_rls_policies_hr_employee_scope.sql`. Convenção
  copiada 1:1: por-comando **select/insert/update** (SEM delete), `to authenticated`,
  `using`/`with check` com `user_has_unit_access(unit_id)`, `drop policy if exists` antes de
  cada `create` (re-runnável), nome `<tabela>_authenticated_<comando>_by_unit`. Sem policy
  para `anon`. Sem `delete` (delete fica negado; soft delete via `update`).

### 0.1 Confirmação por tabela (fonte: migrations de origem)

| # | Tabela | `unit_id` | Nulável? | RLS já habilitado |
|---|---|---|---|---|
| 1 | `hr_workflows` | direto | **NOT NULL** | `022:390` |
| 2 | `hr_workflow_steps` | direto | **NOT NULL** | `022:391` |
| 3 | `hr_workflow_events` | direto | **NOT NULL** | `022:392` |
| 4 | `hr_workflow_notifications` | direto | **NOT NULL** | `033:166` |
| 5 | `hr_workflow_audit_logs` | direto | **NOT NULL** | `035:172` |
| 6 | `hr_workflow_approver_delegations` | direto | **NOT NULL** | `038:85` |
| 7 | `hr_admission_processes` | direto | **NULLABLE** | `062:246` |
| 8 | `hr_admission_checklist_items` | direto | **NULLABLE** | `062:247` |

**Todas as 8 têm `unit_id` próprio (direto).** Nenhuma é tabela-filha sem `unit_id`, então
**nenhuma** precisa do padrão de herança por `exists` contra o pai (usado na 071 para
`*_approvals`/`*_plan_items`). Todas usam a forma direta `user_has_unit_access(unit_id)`.

> Correção ao enunciado: além de `hr_admission_processes`, a tabela
> `hr_admission_checklist_items` **também** tem `unit_id` NULLABLE (`062:102`). Ambas caem no
> mesmo comportamento fail-closed (§2).

### 0.2 Decisão — incluir `enable row level security` idempotente? **SIM (defensivo).**

O RLS já está habilitado nas 8 tabelas (tabela acima). A 071 (referência) **omitiu** o
`enable`. Mesmo assim, **incluo** um bloco `alter table ... enable row level security`
idempotente no topo da migration, porque:

- É **no-op** quando o RLS já está ligado (não altera schema nem dados; `pg_class.relrowsecurity` permanece `true`).
- Se em algum ambiente o RLS estivesse desligado, as policies seriam **silenciosamente
  inertes** (gap de segurança invisível). O `enable` garante que as policies tenham efeito.
- Não afeta o app (`service_role` ignora RLS de qualquer forma).

Custo: 8 linhas idempotentes. Benefício: a migration passa a ser **auto-suficiente e
robusta**. Trade-off favorável em área de segurança.

---

## 1. SQL exato da migration (padrão 071)

Arquivo proposto: **`supabase/migrations/077_rls_policies_hr_workflow_admission_scope.sql`**
(ver §3). Conteúdo completo abaixo — **8 tabelas × 3 policies (select/insert/update)**, todas
re-runnáveis.

```sql
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
```

Observações:
- Só **policies** (e o `enable` idempotente). **Nenhuma** alteração de schema, coluna,
  índice, trigger ou helper.
- Nomes de policy dentro do limite de 63 chars do Postgres (o mais longo,
  `hr_workflow_approver_delegations_authenticated_update_by_unit` = 61).
- **23 policies no total**: 7 tabelas × 3 (select/insert/update) + `hr_workflow_audit_logs` × 2
  (select/insert — **append-only**, sem update por design: trilha de auditoria imutável).
  Re-runnável: cada `create` é precedido de `drop policy if exists`.

---

## 2. Decisão para `unit_id` NULLABLE (admissão) — **fail-closed, intencional**

`hr_admission_processes` e `hr_admission_checklist_items` têm `unit_id` **NULLABLE**.

O helper (009) faz:
```sql
select exists (
  select 1 from public.user_unit_links uul
  where uul.app_user_id = public.current_app_user_id()
    and uul.unit_id = target_unit_id            -- target_unit_id = NULL  => predicado NULL
    ... );
```
Com `target_unit_id = NULL`, o predicado `uul.unit_id = NULL` é **NULL** (nunca verdadeiro),
então `exists(...)` retorna **false**. Portanto **`user_has_unit_access(NULL) = false`**.

Consequência nas policies:
- **select**: linha com `unit_id IS NULL` → `using` = false → **invisível** para `authenticated`.
- **insert/update**: linha com `unit_id IS NULL` → `with check` = false → **bloqueado** para `authenticated`.

Isto é **fail-closed** e é o **comportamento seguro desejado**: uma linha de admissão sem
unidade nunca vaza para um usuário `authenticated`. Não há “default aberto”.

**Não afeta o app**: as APIs de admissão usam `service_role` (ignora RLS), então continuam
lendo/gravando linhas com `unit_id` nulo normalmente. A restrição fail-closed vale **apenas**
para o role `authenticated` (defesa-em-profundidade). Decisão registrada: **manter
fail-closed; não criar exceção para `unit_id IS NULL`.**

---

## 3. Número e nome da migration — **077 confirmado livre**

- Última migration existente: **`076_hr_functional_event_types_nr_expiration.sql`**.
- Não existe `077*` em `supabase/migrations/` (confirmado: só `074`.. na verdade a sequência
  vai até `076`; `077` está livre).
- Nome proposto (a criar **após aprovação**):
  **`077_rls_policies_hr_workflow_admission_scope.sql`**.

> Nada é escrito em `supabase/migrations/` nesta tarefa. O arquivo só será criado quando você
> aprovar o SQL da §1.

---

## 4. Regra de ouro — checklist de aplicação (por você, Wilson; NÃO pelo Codex)

A migration aprovada é aplicada **manualmente no SQL Editor**, **staging primeiro, depois
produção**. O Codex **não** aplica SQL e **não** tem acesso aos projetos.

| Ordem | Ref do projeto | Ambiente |
|---|---|---|
| 1º | `jascnmgagejlvjlenduv` | **staging** |
| 2º | `chnamldrlwohaudmjrez` | **produção** |

Passo-a-passo:

1. **Confirmar o ref ativo antes de rodar.** No SQL Editor, verificar que o projeto aberto é
   o **staging** (`jascnmgagejlvjlenduv`) — conferir o nome/ref no topo do dashboard. Rodar
   `select current_database();` e, se útil, um marcador conhecido, para ter certeza de que
   **não** é produção.
2. **Aplicar em staging.** Colar o conteúdo de `077_...sql` inteiro e executar. Esperado: sem
   erro; 23 policies criadas (re-runnável — pode rodar 2× sem efeito colateral).
3. **Smoke test em staging** (ver §5): (a) verificar as policies criadas; (b) prova de escopo
   com sessão `authenticated`; (c) abrir as telas de workflow/admissão no app apontado para
   staging e confirmar que **nada quebrou** (app usa `service_role`).
4. **Só então, produção.** Reabrir o SQL Editor no projeto **produção**
   (`chnamldrlwohaudmjrez`), **reconfirmar o ref**, aplicar o mesmo arquivo, repetir o smoke
   test (b)+(c).
5. **Registrar** data/hora de aplicação em cada ambiente (para rastreio da fatia 3a).

Regras: **não** aplicar em produção antes de staging validar; **não** editar migrations já
aplicadas; se algo divergir em staging, **parar** e revisar antes de tocar produção.

---

## 5. Plano de verificação — provar a policy SEM quebrar nada

Objetivo: provar que a policy restringe `authenticated` ao escopo de unidade, que
`service_role` continua vendo tudo, e que o app não muda em nada.

### 5.1 Sanity — policies existem e RLS ligado
```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('hr_workflows','hr_workflow_steps','hr_workflow_events',
                    'hr_workflow_notifications','hr_workflow_audit_logs',
                    'hr_workflow_approver_delegations','hr_admission_processes',
                    'hr_admission_checklist_items')
order by tablename, cmd;
-- Esperado: 23 linhas (7 tabelas x 3 + hr_workflow_audit_logs x 2, append-only),
--           roles = {authenticated}, sem delete, sem update em hr_workflow_audit_logs.

select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('hr_workflows','hr_workflow_steps','hr_workflow_events',
                  'hr_workflow_notifications','hr_workflow_audit_logs',
                  'hr_workflow_approver_delegations','hr_admission_processes',
                  'hr_admission_checklist_items');
-- Esperado: relrowsecurity = true para todas.
```

### 5.2 Prova de escopo com sessão `authenticated` (não-super-admin)

Sem infra de teste nova: a sessão `authenticated` é **simulada no próprio SQL Editor** com
`set local role authenticated` + `set local request.jwt.claims`, dentro de
`begin; ... rollback;` (sem efeito colateral).

**Cadeia de identidade (confirmada nas migrations):** a policy chama
`user_has_unit_access(unit_id)` → helper (009) usa `current_app_user_id()` →
`current_app_user_id()` (009) resolve `app_users.id where auth_user_id = current_auth_user_id()`
→ `current_auth_user_id()` (**migration 067**) lê `request.jwt.claims ->> 'sub'`. Portanto o
`sub` do claim tem de ser o **`app_users.auth_user_id`** do usuário-alvo — **NÃO** o
`app_users.id`.

**Escolha do usuário-alvo (fora da transação, como service_role):** um `app_users` **ativo,
não super-admin**, com **vínculo ativo** em `user_unit_links`. Anote o `auth_user_id` dele
como `AUTH_USER_ID`.

```sql
begin;

-- Simula a sessao authenticated do usuario-alvo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<AUTH_USER_ID>","role":"authenticated"}';
-- <AUTH_USER_ID> = app_users.auth_user_id (NAO app_users.id) do usuario nao-super-admin.

-- (0) CONTROLE POSITIVO — PRE-CONDICAO OBRIGATORIA.
-- Tem de ver > 0 linhas nas SUAS unidades. Se der 0, o claim/sub esta errado
-- (ou o usuario nao tem workflow nas unidades dele) -> NAO e prova de policy.
-- PARE e corrija o AUTH_USER_ID antes de seguir. Um 0 aqui invalida os testes (1)/(2).
select count(*) as devo_ver_positivo
from public.hr_workflows
where unit_id in (
  select uul.unit_id from public.user_unit_links uul
  join public.app_users au on au.id = uul.app_user_id
  where au.auth_user_id = '<AUTH_USER_ID>'
    and uul.status = 'active' and uul.deleted_at is null
);
-- Esperado: > 0. (controle positivo: a policy DEIXA ver o que e da unidade do usuario)

-- (1) CROSS-UNIDADE: uma linha de unidade NAO vinculada deve ser invisivel.
-- <ID_OUTRA_UNIDADE> = um hr_workflows.id (obtido antes, como service_role) cuja unit_id
-- NAO esta entre as unidades do usuario.
select count(*) as devo_ver_zero_cross
from public.hr_workflows
where id = '<ID_OUTRA_UNIDADE>';
-- Esperado: 0.

-- (2) LINHA SEM UNIDADE (admissao, fail-closed §2): unit_id IS NULL invisivel p/ authenticated.
select count(*) as devo_ver_zero_null
from public.hr_admission_processes
where unit_id is null;
-- Esperado: 0.

rollback;
```

**Contraprova com `service_role`** (fora da transação / role service_role — ignora RLS):
- `select count(*) from public.hr_admission_processes where unit_id is null;` → **> 0** se
  existir linha sem unidade (service_role **vê** o que authenticated não vê).
- `select count(*) from public.hr_workflows;` como service_role = **total geral** (todas as
  unidades), confirmando que só o `authenticated` é restringido.

Interpretação: **(0) > 0 é pré-condição** (prova que a simulação de identidade funciona e que
a policy não é falso-negativo trivial); só com (0) positivo é que **(1)=0 e (2)=0** provam o
corte por unidade e o fail-closed. `service_role` continua vendo tudo.

### 5.3 Smoke test do app — confirma zero regressão
O app usa **`service_role`** para estas tabelas, então RLS não deveria alterar nada. Provar:

- Apontar o app para **staging** e, como **não-super-admin**, abrir as telas gateadas:
  - RH → Workflows (lista e detalhe `/rh/workflows/[id]`), Inbox, timeline;
  - RH → Admissões (lista e detalhe).
- Confirmar que **carregam normalmente** (dados aparecem, ações funcionam) — porque o backend
  segue via `service_role`. Se algo sumisse, seria sinal de que algum caminho usa
  `authenticated` (não esperado) e exigiria revisão antes de produção.
- Opcional: rodar os specs de screenshot de RH já existentes (`npm run screenshots:rh`) contra
  staging e comparar — sem diff visual esperado.

Interpretação: se 5.2 prova o corte por unidade em `authenticated` **e** 5.3 mostra o app
intacto, a policy é **defesa-em-profundidade efetiva sem regressão**.

---

## 6. Fora de escopo (registrar, não esquecer)

- **Hardening de coluna sensível (PII de candidato / `HR:*.sensitive`) NÃO entra na 3a.** A
  fatia 3a é **unit-scope como linha de base** de defesa-em-profundidade (CAMADA 1). O gating
  sensível (ex.: mascarar/negar colunas de PII a quem não tem `HR:*.sensitive.view`) continua
  **na aplicação** (`api-auth.ts`) e pode ser levado ao banco num **passo futuro** (CAMADA 2 /
  fatia posterior), possivelmente via policies por-coluna ou views. Registrado como pendência
  futura.
- **As outras 12 tabelas** do gap de 20 (não operacionais / sem `unit_id` direto / recrutamento
  já coberto pela 072) ficam para fatias seguintes.
- **Sem `delete` policy** por design (delete negado a authenticated; soft delete via `update`).
- **Sem policy `anon`** por design (anon negado).

---

## 7. Critério de aceite deste plano

- [x] 8 tabelas com SQL completo no padrão 071 (23 policies: 7×3 + audit_logs×2 append-only, sem delete).
- [x] Decisão fail-closed do `unit_id` NULLABLE documentada (admissão: processes **e** checklist_items).
- [x] Número de migration confirmado (**077** livre; nome definido).
- [x] Checklist staging (`jascnmgagejlvjlenduv`) → produção (`chnamldrlwohaudmjrez`), aplicado por Wilson.
- [x] Plano de verificação que prova a policy sem depender de quebrar o app (5.2 escopo authenticated + 5.3 smoke service_role).
- [x] Nota de escopo do gating sensível como fora da 3a.

Nada aplicado. Nenhuma migration escrita. Aguardando sua revisão para então criar
`077_rls_policies_hr_workflow_admission_scope.sql` com o SQL da §1.
