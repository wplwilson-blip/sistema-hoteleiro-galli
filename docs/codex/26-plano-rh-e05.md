# Plano — RH-E-05: efetivação de desligamento na effective_date (status=inactive)

> 2026-07-07 · **PLANO, não código.** Read-only; nada aplicado/commitado/pushado. Cita `arquivo:linha` /
> `migration:linha`; o que não confirmei no código está marcado **(não verificado)**.
> Espelha o RH-E-01 (`docs/codex/24-plano-rh-e01.md`, migration `073`,
> `src/lib/hr/apply-due-movements.ts`). Decisões do dono já fixadas — **não reabrir**.

## 0. Confirmações no código (base do plano)

- **Desligamento é NO-OP no cadastro:** `transitionEmployeeTermination` (`src/lib/hr/employee-terminations.ts:222-265`)
  no `implement` só seta `status='implemented' + implemented_at + implemented_by + updated_by`
  (`:239-243`); **nunca** escreve em `employees`. `publishTerminationImplemented` (`:329-347`) publica os
  eventos `termination_completed` e `employee_inactivated`, mas são **só eventos** — o cadastro segue
  `active`.
- **`employee_terminations` (migration 060):** `employee_id` (`060:8`), `status in (draft, pending_review,
  approved, implemented, cancelled)` (`060:9,30`), `effective_date date` **NULLABLE** (`060:13`),
  `cancelled_by/cancelled_at` (`060:19-20`), `notes text` (`060:21`) com **`notes_safe_check` anti-PII**
  (`060:39-41`), `termination_reason` (`060:11`) com `reason_safe_check` (`060:36-38`), `deleted_at`
  (`060:26`). **Não há marcador de "aplicado ao cadastro".**
- **`assertTerminationTransition` (`employee-terminations.ts:215-220`)** hoje: `cancel` + `implemented`
  → **422** (`:219`). Recebe **só** `currentStatus` — **não** conhece `applied_at` (a criar).
- **`employees` (migration 003:30-54):** `status public.record_status not null default 'active'` (`003:44`),
  `termination_date date` (`003:43`), `unit_id` (`003:33`), `updated_by` (`003:48`), `deleted_at` (`003:49`).
  `record_status` enum = `active | inactive | archived` (`001:8-9`).
- **RLS 071 em `employees`** (`071:24-45`): SELECT/INSERT/UPDATE por `public.user_has_unit_access(unit_id)`;
  **não** filtra por `status`; **sem** policy de delete (soft-delete via update). Logo `inactive` **continua
  visível** ao escopo → histórico preservado. service_role ignora RLS (`071:9`).
- **`HrRequestContext.supabase` = `SupabaseAdmin`** (`src/lib/hr/api-auth.ts:71`) → service_role.
- **Evento reutilizável:** `createEmployeeFunctionalEvent(supabase, input)` com `dedupeKey`; `actorUserId`
  opcional (cron sem sessão) — `src/lib/hr/employee-functional-events.ts` (assinatura já usada em
  `apply-due-movements.ts:78`). `employee_inactivated` é `EmployeeFunctionalEventType` válido (usado em
  `employee-terminations.ts:342`).
- **Rota de cancel hoje (`src/app/api/hr/terminations/[id]/cancel/route.ts`):** faz
  `employeeTerminationDecisionPayloadSchema.parse(...)` (`:13`) mas **descarta o resultado** — **não**
  persiste nada; chama `transitionEmployeeTermination({..., action:"cancel"})` (`:16`) **sem** payload.
- **`employeeTerminationDecisionPayloadSchema` (`schemas.ts:846-848`):** `{ comments:
  safeTerminationTextSchema(3000) }`. `safeTerminationTextSchema` (`:805-815`) é `trim + max + refine
  anti-PII + .optional().or(emptyToUndefined)` → **opcional** (aceita vazio/ausente hoje).
- **Efetivador de movimentação (RH-E-04, já implementado):** `hasEffectiveTermination`
  (`apply-due-movements.ts:71-96`) pula a movimentação quando existe `employee_terminations` com
  `status='implemented' AND deleted_at is null AND (effective_date is null OR effective_date <=
  movement.effective_date)`. **Verificado:** esse skip depende da **existência** do desligamento
  `implemented`, **não** de `applied_at` nem de `employees.status`.
- **Read path expõe `status`:** `redactEmployeeForHrDetail` devolve `status` (`redaction.ts:157`) e `unitId`
  (`:147`) → o GET `/api/hr/employees/[id]` permite assertar `active→inactive`. **`applied_at` não é
  exposto** por rota alguma (igual ao `movement_applied_at`).

---

## 1. Migration (só a coluna) — staging → produção

Aditivo e idempotente, espelhando o `073`:

```sql
alter table public.employee_terminations
  add column if not exists applied_at timestamptz;

comment on column public.employee_terminations.applied_at is
  'RH-E-05: timestamp em que o desligamento foi efetivado no cadastro (employees.status=inactive) pelo efetivador diario. NULL = pendente.';

create index if not exists employee_terminations_pending_apply_idx
  on public.employee_terminations (effective_date)
  where applied_at is null;
```

- **Só a coluna + índice parcial.** Não toca constraint/trigger/status/RLS existentes.
- **Numeração:** próximo número livre. **Atenção à colisão:** a doc 25 *propõe* `074` para o rename da fila
  (ainda **não** criado). Se este RH-E-05 for criado antes, ele fica `074` e o rename vira `075` — ou
  vice-versa. **Confirmar o maior número no repo** e coordenar (hoje o maior aplicado/existente citado é
  `073`, não aplicado). **(confirmar).**

---

## 2. `assertTerminationTransition` revisada (como o `applied_at` chega à checagem)

Hoje a função recebe só `currentStatus` (`employee-terminations.ts:215`). Para distinguir "efetivado" de
"apenas implemented", ela precisa **conhecer `applied_at`**. Caminho:

1. **Expor `applied_at` no carregamento:** adicionar `"applied_at"` a `terminationSelect`
   (`employee-terminations.ts:55-77`) e o campo `applied_at: string | null` ao tipo `EmployeeTerminationRow`
   (`:28-53`). Assim `loadEmployeeTermination` (`:197-213`, usa `terminationListSelect`) já traz `applied_at`.
2. **Passar `applied_at` para a checagem:** mudar a assinatura de `assertTerminationTransition` para receber
   o dado de efetivação — p.ex. `assertTerminationTransition(current: { status, applied_at }, action)` — e o
   chamador `transitionEmployeeTermination` (`:227`) passa `input.termination` (que agora tem `applied_at`).
3. **Regra nova (substitui `:219`):**
   - `cancel` + `implemented` + `applied_at IS NOT NULL` → **422** ("Desligamento já efetivado não pode ser
     cancelado.").
   - `cancel` + `implemented` + `applied_at IS NULL` → **permitido** (janela de cancelamento).
   - `cancel` em `draft`/`approved` → **segue como está** (permitido).
   - Demais transições (`submit`/`approve`/`implement`) inalteradas.

**Nota de consistência:** cancelar na janela **não desfaz cadastro** (o cadastro só muda quando o efetivador
roda; se `applied_at IS NULL`, o `employees.status` ainda é `active`). Logo cancelar na janela é seguro —
não precisa reverter `employees`. **(verificado pela lógica do efetivador na §4.)**

---

## 3. Justificativa obrigatória no cancel tardio (schema + persistência em `notes`)

**O que falta hoje:** a rota de cancel parseia mas **descarta** o payload (`cancel/route.ts:13`) e não passa
`reason` adiante; `transitionEmployeeTermination` no ramo `cancel` (`:244-248`) **não** toca `notes`.

**Proposta (decisão do dono: reason não-vazio, persistido em `employee_terminations.notes`, sem coluna nova):**

1. **Schema do payload de cancel.** Duas opções (recomendo a **A** por menor churn):
   - **A)** Reusar `employeeTerminationDecisionPayloadSchema` (campo `comments`) e **exigir não-vazio no nível
     da rota** apenas quando for cancel tardio (ver item 3). Validar o texto com `safeTerminationTextSchema`
     (anti-PII) — assim o `notes_safe_check` do banco (`060:39-41`) **não** rejeita.
   - **B)** Criar `employeeTerminationCancelPayloadSchema` dedicado com `reason` obrigatório
     (`min(3)` + refine anti-PII). Mais explícito, mais superfície. **(decisão do dono.)**
2. **Persistir em `notes`.** No ramo `cancel` de `transitionEmployeeTermination`, quando houver `reason`,
   gravar em `notes`. Como `notes` pode já ter conteúdo, **não sobrescrever cego** — proposta: **append**
   com marcador, p.ex. `notes = coalesce(notes || E'\n', '') || '[cancelamento] ' || reason`, respeitando o
   `max` e o anti-PII. **(formato exato = decisão do dono.)** Alternativa mínima: setar `notes = reason` se
   vazio. Isso exige `transitionEmployeeTermination` **receber** o `reason` (novo parâmetro opcional) e a rota
   passá-lo.
3. **Onde exigir (condicional, no nível da rota `cancel`):** após `loadEmployeeTermination`, se
   `status==='implemented' && applied_at===null` (janela tardia) e `reason` vazio → **422**
   ("Informe a justificativa para cancelar um desligamento já efetivado administrativamente."). Cancel em
   `draft`/`approved` **não** exige reason (segue como está).

**Anti-PII:** o texto passa por `safeTerminationTextSchema` (app) **e** `notes_safe_check` (banco) — listas de
tokens equivalentes (`schemas.ts:811` vs `060:39-41`), então um `reason` válido no schema passa no CHECK.

---

## 4. Efetivador `applyDueTerminations` (service_role) — nova lib `src/lib/hr/apply-due-terminations.ts`

Espelha `applyDueEmployeeMovements` (`apply-due-movements.ts`). Recebe `supabase: SupabaseClient` (service_role).

**Seleção (a fila do efetivador):**
```
status = 'implemented'
AND applied_at is null
AND deleted_at is null
AND (effective_date <= current_date OR effective_date is null)   -- null = imediato
order by effective_date asc (nulls first) , requested_at asc
```
> `effective_date` UTC vs `current_date` do Postgres — mesma observação do RH-E-01 (`apply-due-movements.ts:128-130`).

**Por registro:**
1. Carrega `employees` (`id, status, deleted_at`) por `employee_id`.
2. **Guardas (marca aplicado sem reescrever):**
   - Colaborador inexistente → `applied_at=now()`, evento, `skipped++`.
   - `employee.deleted_at` não-nulo **ou** `employee.status` já `inactive`/`archived` → **não reescreve**
     `status`, só `applied_at=now()` + evento; `skipped++`. (Idempotência/integridade.)
3. **Caso normal:** `update employees set status='inactive', updated_by=null where id=? and deleted_at is null`.
   - **NUNCA** `deleted_at` (decisão do dono). `updated_by=null` = efetivação de sistema (padrão RH-E-01,
     `apply-due-movements.ts:213-215`); triggers de `updated_at`/audit cuidam do resto.
   - **`termination_date`:** a coluna existe (`003:43`) e seria natural setá-la = `effective_date`. **Fora da
     decisão explícita (que citou só `status`)** → deixo como **pergunta aberta ao dono**, não invento.
4. **Marca efetivado:** `update employee_terminations set applied_at=now() where id=? and applied_at is null`
   (guard de idempotência no próprio UPDATE).
5. **Evento:** `createEmployeeFunctionalEvent` com `eventType:'employee_inactivated'`,
   `dedupeKey:'termination:{id}:applied'` (**distinto** do `:employee-inactivated` publicado no implement,
   `employee-terminations.ts:345`), `eventPayload:{ applied_by:'system_cron', source:
   'hr.apply_due_terminations', effective_date }`, `actorUserId` omitido. `isSensitive/visibilityScope`
   herdados do desligamento (restricted).

**Idempotência tripla:** (a) filtro `applied_at is null` na seleção; (b) `UPDATE ... where applied_at is null`;
(c) guard no `employees` (status já inactive → não reescreve) + **dedupe** do evento. Rodar 2× = no-op.

**Retorno:** `{ applied, skipped, errors }` (some `skipped` = guardas + já-inativos).

---

## 5. Endpoint unificado `POST /api/hr/apply-due` (CRON_SECRET, sem sessão)

Nova rota `src/app/api/hr/apply-due/route.ts` — **Nível 1 (orquestração), sem registry genérico**:

- **Só POST** + `export const dynamic = "force-dynamic"` (padrão `movements/apply-due/route.ts:13,15`).
- **Auth de máquina:** reusar o check do RH-E-01 (`movements/apply-due/route.ts:16-27`) — 500 se
  `CRON_SECRET` ausente; 401 se `Authorization !== Bearer <secret>`. **Idealmente** já via o helper
  `requireCronAuth` proposto na doc 25 (§2.1) — se ainda não existir, replicar o check e extrair depois.
- **Cliente:** `createSupabaseAdminClient()` (service_role).
- **Ordem (decisão do dono #3): desligamento PRIMEIRO, movimentação DEPOIS**, no mesmo run:
  ```
  const terminations = await applyDueTerminations(admin);
  const movements    = await applyDueEmployeeMovements(admin);
  return NextResponse.json({ ok: true, terminations, movements });
  ```
  **Racional (verificado):** o skip de movimentação (`hasEffectiveTermination`,
  `apply-due-movements.ts:71-96`) enxerga o desligamento pela **existência** de `status='implemented'`, que já
  é verdade **antes** do run (veio da cadeia de aprovação). Então o skip funciona independentemente da ordem;
  rodar desligamento antes é **belt-and-suspenders** correto e mais robusto (se um dia o skip passar a olhar
  `employees.status`). Mantido conforme a decisão.
- **Resposta:** resumo somado/estruturado, **só contadores** (sem PII).
- **`POST /api/hr/movements/apply-due` permanece** (compat/retrocompat) — não remover.

---

## 6. Teste E2E (via API, **sem service_role**) — `tests/e2e/apply-due-terminations.e2e.spec.ts`

Ator **E2E_ADMIN** (super admin), HTTP puro, storageState — padrão do
`tests/e2e/apply-due-movements.e2e.spec.ts`. `test.skip` se `CRON_SECRET` ausente. `POST /api/hr/apply-due`
com `Authorization: Bearer <CRON_SECRET>`.

**Setup reusável (cadeia real, já mapeada no RH-E-04):** criar colaborador (`/api/base/employees`, ativar
unidade) → criar desligamento draft (`POST /api/hr/terminations`) → **concluir checklist obrigatório**
(`PATCH .../checklist/{itemId} {isCompleted:true}` para cada item; o implement exige checklist completo,
`terminations/[id]/implement/route.ts:21-23`) → submit → approve → implement.

**Casos:**
1. **Efetiva (hoje):** desligamento `effective_date=hoje` → `POST /api/hr/apply-due` → `GET /api/hr/employees/[id]`
   ⇒ `status==='inactive'`. (`applied_at` não é exposto → assert **via status**.)
2. **Idempotente:** run2 → `status` continua `inactive` (no-op).
3. **Futura não aplica:** `effective_date=amanhã` → após run, `status` continua `active`.
4. **Cancel na janela COM justificativa:** antes de rodar o efetivador, `POST /api/hr/terminations/[id]/cancel`
   com `comments/reason` não-vazio → **200**; depois `apply-due` → `status` continua `active` (não efetiva,
   pois status virou `cancelled`).
5. **Cancel na janela SEM justificativa:** `POST .../cancel` com corpo vazio → **422**.
6. **Cancel depois de efetivado:** rodar `apply-due` (efetiva) → `POST .../cancel` → **422**
   (`applied_at` preenchido).
7. **Ordem desligamento + transferência no mesmo colaborador:** criar transferência `implemented`
   (`effective_date=hoje`) **e** desligamento `implemented` (`effective_date=hoje`) → `POST /api/hr/apply-due`
   ⇒ `status==='inactive'` **e** `unitId` **não** mudou (a movimentação foi pulada pelo desligamento vigente).
   (Reforça o caso (e) do RH-E-04 agora pelo endpoint unificado.)

**Limitações (reportar):** `applied_at` não tem read API → idempotência/efetivação assertadas por `status`
(caminho de leitura real). Sem DELETE de colaborador na API → residual `[E2E]`+sufixo (disciplina de purchases).
**Se alguma rota exigir permissão que E2E_ADMIN não tenha → PARAR e reportar** (não usar service_role).

---

## 7. Agendador — `hr-cron.yml` passa a chamar `/api/hr/apply-due`

- Trocar o `path` do curl (`.github/workflows/hr-cron.yml:16-18`) de
  `/api/hr/movements/apply-due` → `/api/hr/apply-due` (mantendo `-X POST` + `Authorization: Bearer
  ${{ secrets.CRON_SECRET }}` e o `if [ "$code" != "200" ]` → `exit 1`, `:23-25`).
- Manter `schedule: "0 6 * * *"` (`:4-6`) e `workflow_dispatch` (`:7`). Atualizar `name`/comentário do
  workflow (hoje "Efetivador de Movimentacoes") para refletir que agora orquestra **desligamento + movimentação**.
- **Um único disparo diário** cobre as duas rotinas (o endpoint unificado orquestra).

---

## 8. Riscos e NAO_ALTERAR

**Área sensível — exige plano+revisão antes de qualquer código:**

1. **(§2) Regra de cancel muda o fluxo de desligamento:** hoje `implemented` nunca cancela
   (`employee-terminations.ts:219`); passa a cancelar na janela `applied_at IS NULL`. Erro aqui =
   desligamento efetivado sendo revertido, ou janela nunca abrindo. Precisa expor `applied_at` no
   `terminationSelect`/tipo e propagar à checagem sem quebrar `submit/approve/implement`.
2. **(§3) Persistir justificativa em `notes`:** campo protegido por `notes_safe_check` (`060:39-41`);
   append mal-feito pode estourar `max` ou o CHECK. Validar com `safeTerminationTextSchema` antes de gravar.
   Alterar `transitionEmployeeTermination` para receber/gravar `reason` toca o **fluxo de cancel** (sensível).
3. **(§4) Escrever `employees.status='inactive'` por cron (service_role, `updated_by=null`):** muda cadastro
   sem sessão. Guardas obrigatórias (não reescrever já-inativos/soft-deletados) e **NUNCA `deleted_at`**.
   RLS 071 mantém `inactive` visível (bom — histórico preservado); confirmar que nenhuma listagem
   pressupõe `status='active'` e some com o colaborador. **(não verificado: filtros `status='active'` em
   telas/queries de RH — checar antes de efetivar em produção.)**
4. **(§5) Auth de máquina unificada:** `/api/hr/apply-due` é endpoint aberto se o `CRON_SECRET` falhar.
   500-sem-segredo / 401-sem-Bearer são invariantes. Segredo **só** no ambiente, nunca no repo.
5. **Migration (§1):** aditiva, mas em tabela de fluxo aprovado. Staging→produção; migration **nova** (não
   editar aplicadas). Resolver a **colisão de numeração** com a doc 25.
6. **NÃO ALTERAR:** o `implement` de desligamento e de movimentação, o fluxo de aprovação/alçada, Auth/login,
   e as migrations **já aplicadas**. A camada só **adiciona** efetivador + endpoint + coluna + regra de
   cancel; **não** muda como um desligamento é criado/aprovado/implementado.

### Itens marcados (não verificado)

- Se `termination_date` deve ser setado junto com `status='inactive'` (fora da decisão explícita).
- Existência de filtros `status='active'` em listagens de RH que esconderiam o colaborador inativado.
- Maior número de migration no repo (para fixar 074 vs 075 ante a doc 25).
- Formato exato do append em `notes` (marcador/《sobrescreve vs concatena》) — decisão do dono.

---

> Próximo passo (após aprovação do dono): implementar em ordem — migration → `applied_at` no
> select/tipo → `assertTerminationTransition` + rota de cancel (reason) → `applyDueTerminations` →
> endpoint unificado → hr-cron.yml → E2E. Rodar lint+build; **não** aplicar/commitar/pushar sem OK.
