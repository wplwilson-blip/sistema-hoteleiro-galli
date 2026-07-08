# CORE Fatia 2 — notas de implementação (runner + jobs por cron)

> 2026-07-07 · Implementado. **Nada aplicado/commitado/pushado.** Lint + build **verdes**
> (`/api/cron/run-jobs` registrada, type-check ok). Segue o plano `docs/codex/28` com as 4 correções do
> dono. **Item 7 (evento de NR) ADIADO** por decisão do dono — ver `docs/codex/29`.

## O que foi implementado (itens 1–6)

1. **Decouple dos publish helpers → `(supabase, actorUserId, ...)`**
   - `publishEmployeeTrainingEvent` (`trainings.ts`) e `publishAsoExpirationEvent` (`occupational-health.ts`)
     agora recebem `supabase: SupabaseAdmin` + `actorUserId: string | null` (Opção A do plano, threading
     honesto). Repassam `actorUserId` ao `createEmployeeFunctionalEvent`. `dedupeKey` **inalterado**.
   - **Carimbo de origem:** quando `actorUserId === null` (system/cron), o `eventPayload` ganha
     `source: "cron"`. No caminho manual (`actorUserId` setado) **nada muda** → evento byte-a-byte igual.
   - Call sites de sessão atualizados: `employees/[id]/trainings/route.ts:91` e
     `employees/[id]/trainings/[trainingId]/route.ts` (4 chamadas) passam
     `{ supabase: context.supabase, actorUserId: context.session.user.id, ... }`.
2. **Decouple dos 2 handlers → `(supabase, unitId, actorUserId)`**
   - `processTrainingExpirationGovernance` e `processOccupationalExpirationGovernance` deixaram de receber
     `HrRequestContext`. **`assertUnitInHrScope` interno removido** (redundante — a rota manual já filtra
     por 403/404/422). `updated_by` = `actorUserId` (null no cron).
3. **Rotas manuais idênticas:** `trainings/process-expirations` e `occupational-records/process-expirations`
   mantêm `requireHrPermission` + filtro de unidade + create/claim/complete/fail **session-bound**; só a
   chamada do handler virou `(context.supabase, unitId, context.session.user.id)`. Autoria e eventos
   preservados.
4. **`createBackgroundJobSystem(supabase, {...})`** (`background-jobs.ts`): grava
   `created_by = updated_by = null`, reusa `getUnitOrganizationId` (já service_role). `claim/complete/fail`
   **sem variante** (já session-free). Adicionado também `backgroundJobExistsByCorrelation` para o pré-check.
5. **Runner `src/lib/cron/run-due-jobs.ts`** (service_role): registry com **2 entradas**
   (`training_expiration_scan`, `occupational_expiration_scan`); varre `units` ativas
   (`status='active' AND deleted_at is null`); por (tipo × unidade): **pré-check por
   `correlation_id = '{tipo}:{unidade}:{yyyy-mm-dd}'`** → se já existe, pula o enqueue; senão
   `createBackgroundJobSystem(pending)` → `claim` (lockedBy `cron:run-due-jobs:<runId>`) → handler →
   `complete/fail`. Retorna `{ scanned, enqueued, completed, failed, skipped }`.
6. **Rota `POST /api/cron/run-jobs`**: só POST, `force-dynamic`, gated por `requireCronAuth` (Fatia 1) →
   `runDueJobs(createSupabaseAdminClient())`; corpo = resumo.
7. **`hr-cron.yml`:** step **independente** (`if: always()`) chamando `/api/cron/run-jobs` com o mesmo
   `Bearer`. **Barra** em `HTTP != 200` **ou** `failed > 0` (parse do resumo via `jq`).

## Idempotência (por que é segura)

- **Linha de job:** o pré-check por `correlation_id` impede segunda linha do dia (o índice
  `correlation_idx` **não é único**, `039:98-100`; a trava é aplicacional).
- **Domínio:** os handlers só mudam status quando `!= alvo` e os eventos têm `dedupeKey`
  (`trainings.ts` / `occupational-health.ts`) → rodar 2× = mesmo estado, sem evento duplicado.

## Item 7 — evento de vencimento de NR: **ADIADO**

A ramificação NR do handler ocupacional **continua expirando** o registro (status → `expired`) e contando,
mas **não publica evento** — há um `TODO(CORE Fatia 2 / item 7 ADIADO)` no ponto exato
(`occupational-health.ts`, ramo NR). Motivo: **não existe event type de NR** (nem no TS/Zod nem no CHECK do
banco, `migration 051`); criar exigiria enum novo + **migration** → fatia própria (ver `docs/codex/29`).
**Consequência no critério de aceite:** "evento em todos os 3 tipos" fica cumprido para **treinamento e
ASO**; **NR pendente** dessa fatia.

## E2E (`tests/e2e/cron-run-jobs.e2e.spec.ts`, via API, sem service_role)

- **Runner (ator E2E_ADMIN, `test.skip` se sem `CRON_SECRET`):** 401 sem/errado segredo; 200 com Bearer;
  `body.failed === 0`; **idempotência diária** = contagem de jobs do dia por `job_type` **estável** entre
  duas runs consecutivas (via `GET /api/hr/background-jobs?job_type=...`).
- **Manual restrito (ator E2E_MULTI, não-admin):** `POST .../process-expirations` com unidade fora do
  escopo → **403 ou 404** (nunca 200). Existe ator não-admin (`E2E_MULTI`, `helpers/auth.ts:14`), então o
  caso é testável — **não** precisei parar. Assertivo a `[403,404]` para ser robusto ao perfil exato do
  E2E_MULTI no staging (403 se não tem verify; 404 se tem mas a unidade está fora do escopo).

## Critério de aceite — status

- ✅ Manual byte-a-byte igual (autoria/eventos preservados; só a assinatura interna do handler mudou).
- ✅ Cron processa treinamento + ASO com evento; ⏳ **NR sem evento (adiado, item 7)**.
- ✅ Pré-check impede duplicação diária.
- ✅ Workflow falha alto em `HTTP != 200` ou `failed > 0`.
- ✅ Lint + build passam. **Sem migration** (job_types já existem).

## Arquivos tocados

- `src/lib/hr/trainings.ts`, `src/lib/hr/occupational-health.ts` (decouple handlers + publish helpers).
- `src/app/api/hr/employees/[id]/trainings/route.ts`, `.../[trainingId]/route.ts` (call sites de sessão).
- `src/app/api/hr/trainings/process-expirations/route.ts`,
  `src/app/api/hr/occupational-records/process-expirations/route.ts` (rotas manuais).
- `src/lib/hr/background-jobs.ts` (`createBackgroundJobSystem`, `backgroundJobExistsByCorrelation`).
- `src/lib/cron/run-due-jobs.ts` (novo runner), `src/app/api/cron/run-jobs/route.ts` (nova rota).
- `.github/workflows/hr-cron.yml` (step do runner).
- `tests/e2e/cron-run-jobs.e2e.spec.ts` (novo E2E).

## Pendências / decisões abertas

- **Item 7 (evento de NR):** aguardando fatia com migration + novo event type (`nr_expiring`/`nr_expired`).
- **`hr-cron.yml`** nomeado "HR Cron" embora agora seja CORE — renomear é cosmético (fora de escopo).
