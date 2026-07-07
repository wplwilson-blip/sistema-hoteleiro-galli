# Plano — CORE Fatia 2: runner da fila + jobs de vencimento por cron

> 2026-07-07 · **PLANO, não código.** Read-only; nada aplicado/commitado/pushado. Cita `arquivo:linha`;
> o que não confirmei está marcado **(não verificado)**. Fatia 1 (`requireCronAuth`,
> `src/lib/cron/require-cron-auth.ts`) já em `main`. Objetivo: dar um **runner** à fila
> `hr_background_jobs` (hoje control-plane sem daemon, ver `docs/codex/25`) e rodar os DOIS jobs de
> vencimento por cron **sem perder o disparo manual**. Decisões do dono já fixadas — **não reabrir**.

## 0. Confirmações no código (base do plano)

- **`createBackgroundJob` é SESSION-BOUND** (`background-jobs.ts:162-200`): grava `created_by/updated_by =
  input.context.session.user.id` (`:188-189`) e resolve org via `getUnitOrganizationId(input.context.
  supabase, input.unitId)` (`:173`).
- **`getUnitOrganizationId` já é service_role-compatível** (`background-jobs.ts:145-160`): recebe
  `supabase: SupabaseAdmin` e faz `from("units").select("organization_id").eq("status","active").
  is("deleted_at",null)` (`:147-152`). **Não** depende de sessão.
- **`claimBackgroundJob`/`completeBackgroundJob`/`failBackgroundJob` já são SESSION-FREE**
  (`:237-267`, `:269-294`, `:296-336`): recebem `supabase: SupabaseAdmin`; `claim` recebe `lockedBy: string`
  (a rota manual passa `context.session.user.id`, `process-expirations route:47`). **Verificado:** só o
  **create** precisa de variante system; claim/complete/fail **não**.
- **Handler de treinamentos** `processTrainingExpirationGovernance` (`trainings.ts:369-434`): usa
  `assertUnitInHrScope(input.context, input.unitId)` (`:370`), `input.context.supabase` (queries),
  `input.context.session.user.id` em `updated_by` (`:412`), e chama `publishEmployeeTrainingEvent`
  (`:398,:424,:429`).
- **Handler ocupacional** `processOccupationalExpirationGovernance` (`occupational-health.ts:359-451`):
  `assertUnitInHrScope` (`:360`), `input.context.supabase`, `input.context.session.user.id` em `updated_by`
  (`:400,:439`), e chama `publishAsoExpirationEvent` (`:393,:412`). A ramificação de NR (`:431-448`) só
  atualiza status + conta; **não** publica evento.
- **Os publish helpers TAMBÉM usam `context`** — ponto que a "fact #3" subestima:
  - `publishEmployeeTrainingEvent` (**exportado**, `trainings.ts:311-367`): `input.context.supabase`
    (`:335`) + `actorUserId: input.context.session.user.id` (`:347`) + `dedupeKey:
    'employee-training:{id}:{eventType}'` (`:348`).
  - `publishAsoExpirationEvent` (**privado**, `occupational-health.ts:319-357`): `input.context.supabase`
    (`:331`) + `actorUserId: input.context.session.user.id` (`:343`) + `dedupeKey:
    'occupational:{id}:{expired|expiring}'` (`:344`).
- **Rota manual já garante escopo ANTES do handler** (idêntico nas duas):
  `requireHrPermission(HR_PERMISSIONS.trainingsVerify)` / `occupationalVerify` (`route:12`) → **403** sem
  permissão; `unitIds = payload.unitId ? [payload.unitId] : context.accessibleUnitIds` (`route:17`);
  `if (!unitIds.length) 422` (`route:19-21`); `if (!isSuperAdmin && payload.unitId && !accessibleUnitIds.
  includes(payload.unitId)) 404` (`route:23-25`). Logo o `assertUnitInHrScope` **interno é REDUNDANTE** no
  caminho manual.
- **`job_type`s já existem:** `training_expiration_scan` (`055:34`) e `occupational_expiration_scan`
  (`057:18`) no CHECK de `hr_background_jobs`. **Fatia 2 NÃO precisa de migration.**
- **`correlation_idx` é índice NÃO-único** (`039:98-100`) → `correlation_id` **não** impede, por
  constraint, dois jobs no mesmo dia. Idempotência real vem do **handler** (ver §4).

---

## 1. Refatoração dos 2 handlers → `(supabase, unitId, actorUserId)`

**Nova assinatura (ambos):**
```ts
processTrainingExpirationGovernance(supabase: SupabaseAdmin, unitId: string, actorUserId: string | null)
processOccupationalExpirationGovernance(supabase: SupabaseAdmin, unitId: string, actorUserId: string | null)
```
**O que SAI:**
- `assertUnitInHrScope(context, unitId)` (`trainings.ts:370`, `occupational-health.ts:360`) — **removido**.
  Seguro porque a garantia de escopo do caminho manual está **na rota** (`requireHrPermission` + filtro de
  unidade, §0) e o caminho system varre só unidades ativas resolvidas pelo próprio runner (não vem de
  input do usuário). **Prova de não-regressão do manual em §2.**
- `context.supabase` → `supabase`; `context.session.user.id` (em `updated_by`) → `actorUserId`
  (`null` para system).

**Publish helpers também decoplam** (senão o handler sem `context` não consegue chamá-los):
- **Recomendado (Opção A — threading honesto):** mudar `publishEmployeeTrainingEvent` e
  `publishAsoExpirationEvent` para receber `(supabase, actorUserId, ...)` e repassar `actorUserId` ao
  `createEmployeeFunctionalEvent` (que já aceita `actorUserId?: string | null`,
  `employee-functional-events.ts:27`). Para system, `actorUserId = null` (coerente com os eventos de cron
  do RH-E-01/RH-E-05). `dedupeKey` inalterado → **idempotência preservada**.
  - **Blast radius (call sites externos a atualizar, manual passa `context.session.user.id` — comportamento
    idêntico):** `publishEmployeeTrainingEvent` é chamado por
    `src/app/api/hr/employees/[id]/trainings/[trainingId]/route.ts:43,46,49,52` e
    `src/app/api/hr/employees/[id]/trainings/route.ts` (**confirmar a linha de uso** — grep só achou o
    import `:21`). `publishAsoExpirationEvent` é **privado** (só `occupational-health.ts`) → trivial.
  - **Fora de escopo:** `publishNrCertificationEvent` (`occupational-health.ts:289`) **não** é chamado pelo
    handler ocupacional (só por `nr-certifications/route.ts:68`) → **não** mexer.
- **Alternativa (Opção B — menor superfície, com ressalva):** manter os publish helpers baseados em
  `context` e o handler construir um `context` sintético mínimo `{ supabase, session:{ user:{ id } } }`.
  **Ressalva:** `HrRequestContext.session.user.id` é `string`; para system o ator é `null` → exigiria
  cast/hack de tipo. **Recomendo a Opção A.** (Decisão do dono.)

---

## 2. Ajuste das 2 rotas manuais (comportamento IDÊNTICO)

As rotas `trainings/process-expirations` e `occupational-records/process-expirations` **mantêm tudo**:
`requireHrPermission` (`:12`), filtro de unidade (`:17,:19-21,:23-25`), `createBackgroundJob` +
`claimBackgroundJob` **session-bound** (`:36-45,:47`), `complete/fail` (`:55-78`). **Só muda a chamada do
handler:**
```ts
// antes: processTrainingExpirationGovernance({ context, unitId })
// depois: processTrainingExpirationGovernance(context.supabase, unitId, context.session.user.id)
```

**Prova de não-regressão (o `assertUnitInHrScope` interno era redundante):**
1. Sem a permissão → `requireHrPermission` retorna **403** antes de qualquer handler (`route:12-13`).
2. `payload.unitId` fora do escopo → **404** (`route:23-25`), handler nunca chamado.
3. Sem `payload.unitId` → itera **só** `context.accessibleUnitIds` (`route:17`) — cada `unitId` já é do
   escopo do usuário. O `assertUnitInHrScope` interno só reconferia isso.
Logo, remover o assert **não** afrouxa o caminho manual: nenhuma unidade fora do escopo chega ao handler.
`updated_by`/`actorUserId` seguem = `context.session.user.id` no manual → **eventos e autoria idênticos**.

---

## 3. Variante SYSTEM de `createBackgroundJob` (claim NÃO precisa)

- **`createBackgroundJobSystem`** (ou parâmetro `actor` em `createBackgroundJob`): recebe
  `(supabase: SupabaseAdmin, { unitId, jobType, status, priority, payload, scheduledAt, correlationId,
  maxAttempts })` e grava `created_by = null, updated_by = null`. Resolve `organization_id` reusando
  `getUnitOrganizationId(supabase, unitId)` (**já service_role**, `:145-160`) — nada de sessão.
- **`claimBackgroundJob`: sem variante.** Já é session-free (`:237-267`); o runner passa
  `lockedBy = "cron:run-due-jobs:<runId>"` (o `<runId>` pode ser o `correlation_id` do dia ou um id do run
  do Actions — **decisão do dono**; `locked_by` é `text`, `039:22`).
- **`complete/fail`: sem variante** (já session-free).
- **Nota de tipo:** `createBackgroundJob` hoje tipa `context: HrRequestContext`. A variante system deve
  aceitar `SupabaseAdmin` puro. Preferir **duas funções** (`...System`) a um union confuso, para não
  arriscar o caminho manual. (Decisão do dono.)

---

## 4. Runner `src/lib/cron/run-due-jobs.ts` (service_role)

**Registry (nasce com 2 entradas):**
```ts
const REGISTRY = {
  training_expiration_scan:     (supabase, unitId) => processTrainingExpirationGovernance(supabase, unitId, null),
  occupational_expiration_scan: (supabase, unitId) => processOccupationalExpirationGovernance(supabase, unitId, null)
} as const;
```
**Fluxo (`runDueJobs(supabase: SupabaseAdmin)`):**
1. **Unidades ativas:** `from("units").select("id").eq("status","active").is("deleted_at",null)`
   (mesma forma de `getUnitOrganizationId`; `units.status/deleted_at` confirmados em uso ali). **(confirmar
   nome/coluna `units.status` na migration 002 — não reconferido linha a linha.)**
2. Para cada `job_type` do registry × cada unidade ativa:
   a. **Idempotência de linha (opcional, recomendado):** `correlationId = '{tipo}:{unitId}:{yyyy-mm-dd}'`
      (padrão já usado nas rotas, `process-expirations:43,45`). Como o índice é **não-único** (`039:98-100`),
      um pré-check `select id from hr_background_jobs where correlation_id = ? and deleted_at is null limit 1`
      evita enfileirar 2× no mesmo dia. Sem o pré-check, o handler ainda é idempotente (abaixo), mas cria
      linha duplicada.
   b. **Enfileira (system)** → `createBackgroundJobSystem(...)` (`status:'pending'`, `priority:'normal'`,
      `maxAttempts:1` como as rotas).
   c. **Claim (system)** → `claimBackgroundJob({ supabase, jobId, lockedBy:'cron:run-due-jobs:<runId>' })`.
      Se `null` (já claimado) → registra `not_claimed`, segue.
   d. **Handler** → `REGISTRY[jobType](supabase, unitId)`; em sucesso `completeBackgroundJob({result})`,
      em erro `failBackgroundJob({failureReason})` (mesmo try/catch das rotas, `:53-79`).
3. **Retorno:** resumo somado `{ scanned, enqueued, completed, failed, skipped }` + por-tipo/unidade
   (só contadores, sem PII).

**Idempotência (verificada):** os handlers **só** mudam status quando `status !== alvo` (`trainings.ts:409`,
`occupational-health.ts:396,435`) e os eventos têm **`dedupeKey`** (`:348`, `:344`). Logo rodar 2× no mesmo
dia = **mesmo estado final, sem eventos duplicados**. O `correlation_id` serve para **agrupar/rastrear**
(índice não-único), não como trava.

---

## 5. Endpoint `POST /api/cron/run-jobs` + agendamento

- **Rota** `src/app/api/cron/run-jobs/route.ts` — **só POST**, `export const dynamic = "force-dynamic"`,
  gated por **`requireCronAuth(request)`** (Fatia 1): `const gate = requireCronAuth(request); if ("response"
  in gate) return gate.response;` → depois `runDueJobs(createSupabaseAdminClient())`; corpo = resumo.
- **1 endpoint que roda TUDO** (recomendado), espelhando o `/api/hr/apply-due` unificado: o registry é o
  ponto de extensão; adicionar um `job_type` = 1 entrada, sem nova rota. Alternativa "por tipo"
  (`/api/cron/run-jobs?type=...`) adiciona superfície sem ganho hoje. (Decisão do dono.)
- **`hr-cron.yml`:** hoje tem 1 job chamando `/api/hr/apply-due`. Duas opções:
  (a) **adicionar um segundo step** no mesmo job (curl POST para `/api/cron/run-jobs` com o mesmo
  `Bearer ${{ secrets.CRON_SECRET }}` e o mesmo `if [ "$code" != "200" ]`), ou (b) um **job/workflow
  separado**. Recomendo **(a)** — um disparo diário 06:00 UTC cobre efetivadores + varreduras.
  **Nota:** a localização (`hr-cron.yml`) vira imprópria quando a camada é CORE; renomear o workflow é
  cosmético (**opcional**, fora de escopo).

---

## 6. Teste E2E (via API, **sem service_role**)

**Manual continua restrito (prova observável):**
- Usuário **sem** `trainingsVerify/occupationalVerify` → `POST .../process-expirations` = **403**.
- Usuário **com** permissão mas `unitId` fora do escopo → **404** (`route:23-25`).
(Reusar um ator E2E de escopo limitado se existir; **se só houver E2E_ADMIN**, este caso exige um usuário
não-admin — **PARAR e reportar** se não houver ator adequado, em vez de inventar/usar service_role.)

**Runner processa via segredo:**
- `POST /api/cron/run-jobs` com `Authorization: Bearer <CRON_SECRET>` (senão `test.skip`) → **200**.
- Asserção via caminho de leitura real: `GET /api/hr/background-jobs?job_type=training_expiration_scan`
  (rota existente, `background-jobs/route.ts:22`, gated por `workflowsView`) → jobs do dia em
  `completed`/`failed`. **(confirmar que o GET expõe os campos necessários — `redactBackgroundJob` inclui
  status/job_type/correlation_id.)**
- **Idempotência diária:** rodar 2× → estado de domínio inalterado; se adotado o pré-check de
  `correlation_id`, contagem de linhas do dia não cresce na 2ª run (senão, documentar que cresce mas o
  efeito de domínio é idêntico).
- Sem service_role no teste; residual `[E2E]` conforme disciplina de purchases.

---

## 7. Riscos e NAO_ALTERAR

**Área sensível — plano+revisão antes de qualquer código:**
1. **Refatorar handler de domínio (§1):** os handlers são o núcleo de vencimento de treinamentos e ASO/NR.
   Manual **deve** ficar byte-a-byte igual (`updated_by`/`actorUserId = session.user.id`; eventos e
   `dedupeKey` idênticos). A remoção do `assertUnitInHrScope` interno **exige** a prova da §2 (a rota já
   filtra). Erro aqui = escopo cross-unidade ou autoria errada.
2. **Autoria "system" (§3):** `created_by/updated_by/actorUserId = null` em jobs e eventos de cron. Coerente
   com RH-E-01/RH-E-05, mas é mudança de rastreabilidade — revisar. `locked_by` textual identifica o runner.
3. **Publish helpers com blast externo (§1):** mudar `publishEmployeeTrainingEvent` toca 2 rotas de sessão
   de treinamento — validar que o manual segue com `actorUserId = session.user.id`.
4. **Idempotência por `correlation_id` NÃO é trava de banco** (índice não-único, `039:98-100`): a garantia é
   do handler. Documentar; se linha duplicada for inaceitável, adotar o pré-check da §4.2a.
5. **NÃO ALTERAR:** fluxo de aprovação/alçada, Auth/login, migrations **já aplicadas**. Fatia 2 é
   **code-only** (job_types já existem, §0) — **sem migration**.

### Itens marcados (não verificado)
- Linha exata de uso de `publishEmployeeTrainingEvent` em `employees/[id]/trainings/route.ts` (só o import
  `:21` foi confirmado).
- Nome/coluna `units.status`/`deleted_at` na migration 002 (confirmado só pelo uso em
  `getUnitOrganizationId:147-152`).
- Campos expostos por `GET /api/hr/background-jobs` (`redactBackgroundJob`) suficientes para as asserções do E2E.
- Existência de um ator E2E não-admin com escopo limitado (para o caso 403/404 do manual).

---

> Próximo passo (após aprovação): implementar em ordem — decouple publish helpers → decouple 2 handlers →
> ajustar 2 rotas manuais → `createBackgroundJobSystem` → `run-due-jobs.ts` + registry → rota
> `/api/cron/run-jobs` → `hr-cron.yml` → E2E. Lint+build; **não** aplicar/commitar/pushar sem OK.
