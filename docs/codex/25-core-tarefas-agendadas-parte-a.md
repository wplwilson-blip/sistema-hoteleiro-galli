# Core de Tarefas Agendadas — Parte A: padrão técnico + plano de rename

> 2026-07-07 · **DOCUMENTO DE ARQUITETURA, não código.** Read-only; nada aplicado/commitado/pushado.
> Objetivo: desenhar a **camada CORE de tarefas agendadas** (rotinas que rodam sozinhas, sem usuário)
> para o sistema inteiro. Hoje só o RH-E-01 roda de fato por cron. Cita `arquivo:linha` /
> `migration:linha`; o que não foi confirmado no código está marcado **(não verificado)**.
> **Fora do escopo desta Parte A:** o inventário de rotinas por módulo (isso é a **Parte B**, à parte).
> Aqui só o padrão técnico e o plano de rename `hr_background_jobs → background_jobs`.

---

## 1. Estado atual (verificado)

Existem **duas formas divergentes** de "tarefa de máquina" no repo hoje. Elas não compartilham nada:
autenticação, cliente de banco, uso (ou não) da fila e forma de disparo são todos diferentes.

### 1.A — RH-E-01 "direto" (o modelo bom para cron, mas sem fila)

- **Rota:** `src/app/api/hr/movements/apply-due/route.ts` — expõe **só `POST`** (`:15`),
  `export const dynamic = "force-dynamic"` (`:13`).
- **Auth de máquina, sem sessão:** lê `process.env.CRON_SECRET` (`:16`); 500 se ausente (`:19-22`);
  compara `Authorization` com `` `Bearer ${secret}` `` e devolve 401 se não bater (`:24-27`).
  A verificação está **inline na rota** — **não** há helper reutilizável (grep `process.env.CRON_SECRET`
  em `src/` = **só** `apply-due/route.ts:16`).
- **Cliente:** `createSupabaseAdminClient()` (service_role, bypassa RLS) — `apply-due/route.ts:30`.
- **Trabalho:** `applyDueEmployeeMovements(supabase)` em `src/lib/hr/apply-due-movements.ts` — **varre e
  aplica direto** (`select` em `employee_movements` `:132-140`, `update` em `employees` `:210-224`).
- **Idempotência:** coluna dedicada `movement_applied_at` (migration `073`, **ainda não aplicada**) +
  `UPDATE ... where movement_applied_at is null` (`apply-due-movements.ts:56-68`) + dedupe de evento.
  **Não usa a fila `hr_background_jobs`.**
- **Disparo:** GitHub Actions — `.github/workflows/hr-cron.yml`: `schedule: "0 6 * * *"` (`:4-6`, 06:00 UTC
  = 03:00 BRT) + `workflow_dispatch: {}` (`:7`, disparo manual); faz `curl -X POST ... -H "Authorization:
  Bearer ${{ secrets.CRON_SECRET }}"` (`:16-18`) e falha o job se HTTP ≠ 200 (`:23-25`).
- **Resposta:** só contadores (`{ ok: true, ...summary }`, `apply-due/route.ts:32`).

**Prós:** simples, sem sessão, cron-nativo, idempotente por coluna, observável (job vermelho no Actions +
corpo com contadores). **Contras:** não passa pela fila → **sem** histórico persistente por execução,
**sem** retry estruturado (attempts/max_attempts), **sem** lock (a idempotência é ad-hoc, por coluna
específica do domínio); a auth de máquina está **duplicável/inline** (cada nova rota reimplementaria o
check).

### 1.B — `process-expirations` "com sessão + fila" (não automatizável por cron hoje)

Duas rotas, mesmíssimo formato:

- `src/app/api/hr/trainings/process-expirations/route.ts`
- `src/app/api/hr/occupational-records/process-expirations/route.ts`

Características (linhas do arquivo de trainings; o de occupational é idêntico em estrutura):

- **Exigem SESSÃO de usuário:** `requireHrPermission(HR_PERMISSIONS.trainingsVerify)` (`:12`) /
  `occupationalVerify` (occupational `:12`). Sem sessão → não passa. **Logo, não dá pra chamar por cron.**
- **Usam a fila** (contrato completo): por unidade acessível (`context.accessibleUnitIds`, `:17`):
  `createBackgroundJob(...)` (`:36-45`) → `claimBackgroundJob(...)` (`:47`, lock) → executa o trabalho
  (`processTrainingExpirationGovernance` `:54`) → `completeBackgroundJob(...)` (`:55-65`) **ou**
  `failBackgroundJob(...)` (`:73-78`) no catch. `job_type: "training_expiration_scan"` /
  `"occupational_expiration_scan"`.
- **Escopo por sessão:** iteram `context.accessibleUnitIds` (session-scoped) — um cron não teria essa lista.
- **Resposta:** `{ ok: true, data: summary }` com um array `jobs[]` (id/unitId/status por unidade).

**Prós:** histórico por execução na fila, retry estruturado, lock contra dupla execução, escopo/permissão
por unidade. **Contras:** **preso à sessão** de um humano com permissão → **não** roda sozinho de
madrugada; o escopo depende das unidades do usuário que apertou o botão.

### 1.C — O que a fila `hr_background_jobs` já oferece (migration 039) e o que falta

**Tabela `public.hr_background_jobs`** — `supabase/migrations/039_hr_background_jobs_foundation.sql`:

- **Colunas** (`039:5-29`): `id`, `organization_id`, `unit_id`, `job_type`, `status`, `priority`,
  `payload jsonb`, `result jsonb`, `attempts`, `max_attempts`, `scheduled_at`, `started_at`,
  `finished_at`, `failed_at`, `failure_reason`, `locked_at`, `locked_by (text)`, `correlation_id`,
  `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`, `deleted_by`.
- **State machine via CHECK** (`039:40-79`): `status in (pending, scheduled, running, completed, failed,
  cancelled, retrying)`; `running` exige `started_at + locked_at + locked_by` não-vazios (`:55-57`);
  `completed` exige `finished_at` (`:58-60`); `failed` exige `failed_at + failure_reason` (`:61-63`);
  `attempts >= 0 and max_attempts > 0 and max_attempts <= 10 and attempts <= max_attempts` (`:46-51`);
  `scheduled` exige `scheduled_at` (`:52-54`); guardas anti-PII em `payload/result/failure_reason`
  (`:70-79`).
- **`job_type` (CHECK evoluiu por migration):** `039:30-39` (6 tipos base) → `055:22-36`
  (+`training_expiration_scan`) → `057:5-20` (+`occupational_expiration_scan`). Total atual: **8 tipos**
  (`sla_scan`, `escalation_scan`, `notification_dispatch`, `audit_cleanup`, `analytics_refresh`,
  `dashboard_refresh`, `training_expiration_scan`, `occupational_expiration_scan`). **Não** existe tipo
  para efetivação de movimentação (o RH-E-01 não usa a fila).
- **Índices** (`039:82-100`): `unit_idx`, `status_scheduled_idx (status, scheduled_at, priority)`,
  `type_status_idx (job_type, status)`, `locked_idx (locked_at, locked_by) where status='running'`,
  `correlation_idx`.
- **RLS:** `enable row level security` (`039:102`), mas **nenhuma policy é criada** — grep
  `hr_background_jobs` em todos os `.sql` retorna só `039/055/057`, **nenhum** com `create policy`.
  Efeito: **deny-all** para `authenticated`/`anon`; **só service_role** enxerga a tabela.
- **Trigger:** só `set_updated_at_hr_background_jobs` (`039:111-114`, chama
  `public.update_updated_at_column()`). **Nenhum** trigger de auditoria nomeado referencia a tabela
  (grep). **(não verificado)** se há mecanismo global de audit_trail que a alcance por fora do nome.

**Primitivas** — `src/lib/hr/background-jobs.ts`:

- `createBackgroundJob` (`:162-200`) — **session-bound**: usa `input.context.supabase` (que é
  `SupabaseAdmin`, ver abaixo) e grava `created_by/updated_by = input.context.session.user.id`
  (`:188-189`); resolve `organization_id` via `getUnitOrganizationId` (`:145-160`).
- `loadBackgroundJobs` (`:202-235`), `claimBackgroundJob` (`:237-267`), `completeBackgroundJob`
  (`:269-294`), `failBackgroundJob` (`:296-336`) — **session-free**: recebem `supabase: SupabaseAdmin`
  diretamente; `claim` faz o lock atômico (`update ... .in("status",["pending","scheduled","retrying"])
  .is("locked_at", null)` `:255-256`); `fail` decide retry por `attempts < maxAttempts` (`:314-316`)
  virando `retrying` vs `failed`.
- `sanitizeBackgroundJobPayload` / `redactBackgroundJob` (`:105-143`) — allowlist de chaves + bloqueio
  anti-PII.

**Rotas que tocam a fila** (inventário verificado): `background-jobs/route.ts` (GET lista via
`loadBackgroundJobs`, POST cria — gated por `requireHrWorkflowPermission(workflowsView/workflowsApprove)`,
`:24/:68`), `trainings/process-expirations`, `occupational-records/process-expirations`.

**Fato-chave de segurança (verificado):** `HrRequestContext.supabase` é **`SupabaseAdmin`**
(`src/lib/hr/api-auth.ts:71`) — cliente service_role. Ou seja, **a fila é sempre acessada por
service_role em ambas as pilhas**; a RLS deny-all nunca é o gate real — **o gate é aplicacional**
(`requireHrPermission` / `requireHrWorkflowPermission` / `CRON_SECRET`).

**O que FALTA (o "motor"/runner):** a fila é um **control plane sem daemon** (o próprio `039:1-3` diz:
"Nao cria daemon, worker distribuido, scheduler externo"). Não há:
1. um **runner** que, disparado por cron, faça `claim → run → complete/fail` varrendo jobs `pending/
   scheduled` **sem sessão**;
2. um **registry job_type → handler** (hoje o "handler" está embutido em cada rota; a fila não sabe
   executar nada sozinha);
3. **auth de máquina reutilizável** (o único check vive inline no `apply-due`);
4. **enfileiramento por cron** (só há enfileiramento por sessão em `createBackgroundJob`).

---

## 2. Padrão único proposto (como TODA tarefa agendada deve rodar)

Meta: uma tarefa agendada = **cron dispara → rota protegida por segredo (sem sessão) → runner faz
claim/run/complete-fail na fila**. RH-E-01 continua válido, mas passa a se encaixar no mesmo contrato.

### 2.1 Autenticação de máquina — `requireCronAuth` (helper único)

Extrair o check hoje inline (`apply-due/route.ts:16-27`) para um helper reutilizável, ex.
`src/lib/cron/require-cron-auth.ts` **(nome/local propostos — não existe hoje)**:

- Assinatura conceitual: `requireCronAuth(request): { ok: true } | { response: NextResponse }`.
- Regras (idênticas às já validadas no RH-E-01): 500 se `process.env.CRON_SECRET` ausente; 401 se
  `Authorization !== "Bearer <secret>"`; nunca cria sessão; comparação **constante** (mitigar timing —
  **melhoria** sobre o `!==` atual). `CRON_SECRET` **só** no ambiente (Vercel env + secret do Actions),
  **nunca** no repo (já é assim: `hr-cron.yml:18` usa `secrets.CRON_SECRET`).
- **Um único segredo** para todas as rotas de cron (unificado). Rotação = trocar a env + o secret do
  Actions.
- Toda rota de cron passa a: `const gate = requireCronAuth(request); if (gate.response) return
  gate.response;` e então usa `createSupabaseAdminClient()`.

### 2.2 Contrato do job (fila como fonte da verdade da execução)

Padrão para toda rotina "pesada"/auditável (o modelo de 1.B, mas **sem sessão**):

1. **Enfileirar** — `pending` (ou `scheduled` com `scheduled_at`). Hoje `createBackgroundJob` é
   session-bound (`created_by/updated_by = session.user.id`, `background-jobs.ts:188-189`) → **falta**
   uma variante **system/cron** que aceite `SupabaseAdmin` + um ator simbólico (ver 2.5) em vez de
   `context`. Tipos novos de `job_type` entram por migration (padrão `055/057`: `drop`+`add constraint`).
2. **Claim (lock)** — `claimBackgroundJob` (já service_role, já atômico) marca `running` + `locked_at/
   locked_by`. `locked_by` é `text` → para cron use um id de runner (ex. `"cron:<workflow>:<run_id>"`)
   em vez de um user id.
3. **Run** — executa o handler do `job_type` (registry `job_type → handler`, **a criar**).
4. **Complete/Fail** — `completeBackgroundJob` (`running → completed` + `result`) ou `failBackgroundJob`
   (`running → failed|retrying` conforme `attempts < max_attempts`). Já prontos e session-free.
- **Retry:** nativo via `attempts/max_attempts` + status `retrying` (`background-jobs.ts:314-320`); o
  runner re-claima `retrying` numa próxima passada (o `claim` já inclui `retrying` em `:255`).
- **Idempotência:** dois níveis — (a) o **lock** do claim impede dupla execução concorrente; (b)
  idempotência **de domínio** continua responsabilidade do handler (ex. `movement_applied_at` do RH-E-01,
  ou `correlation_id` único por dia — padrão já usado: `training-expiration:<unit>:<yyyy-mm-dd>`,
  `trainings/process-expirations:43`).

### 2.3 RH-E-01 dentro do contrato (opcional, sem regressão)

O RH-E-01 pode **permanecer direto** (é idempotente por coluna) ou ser **envelopado** num `job_type`
tipo `movement_effectuation_scan` para ganhar histórico/retry na fila. **Decisão do dono (Parte B / a
definir)** — este doc só registra que ambas as opções encaixam no padrão. Se envelopar: adicionar o
`job_type` por migration e mover a varredura para um handler.

### 2.4 Observabilidade (dois planos, redundantes)

- **Plano de disparo (Actions):** cada workflow falha o job se HTTP ≠ 200 (padrão `hr-cron.yml:23-25`)
  → **job vermelho no GitHub Actions** = alarme externo, independente do banco.
- **Plano de fila (banco):** cada execução vira uma linha com `status`
  (`completed/failed/retrying`), `failure_reason`, `finished_at/failed_at`, `result` (contadores),
  `correlation_id`. Consultável pela rota existente `GET /api/hr/background-jobs` (`background-jobs/
  route.ts:22-64`) — hoje só via `hr_background_jobs`; após o rename (§3) vira genérica.
- **Corpo da resposta HTTP:** só contadores/summary (padrão RH-E-01 e process-expirations), nunca PII
  (reforçado pelos CHECKs anti-PII de `payload/result` e por `sanitizeBackgroundJobPayload`).

### 2.5 As duas `process-expirations` disparáveis por cron **sem perder o disparo manual**

Problema: hoje elas exigem sessão (`requireHrPermission`, §1.B) e escopo por `accessibleUnitIds`.
Proposta de **compatibilidade** (mesma lógica de negócio, dois gatilhos):

- **Extrair o núcleo** de cada rota para uma função reutilizável (o loop
  enfileira→claim→run→complete/fail) parametrizada por **lista de unidades** + **cliente
  service_role** + **ator** (user id **ou** "system"). O trabalho de domínio já é reutilizável:
  `processTrainingExpirationGovernance` / `processOccupationalExpirationGovernance`.
- **Dois adaptadores finos** sobre esse núcleo:
  - **Manual (mantém):** rota atual com `requireHrPermission`, unidades = `context.accessibleUnitIds`,
    ator = `session.user.id`. **Nada muda para o usuário.**
  - **Cron (novo):** rota (ou branch) com `requireCronAuth`, cliente `createSupabaseAdminClient()`,
    unidades = **todas as ativas** (varredura global — o cron não tem sessão), ator = "system".
- **Bloqueio atual a resolver:** `createBackgroundJob` é session-bound → precisa da variante system
  (2.2 item 1). Sem isso, o caminho cron não consegue enfileirar. **(decisão de design, não código
  ainda.)**
- Resultado: **um só núcleo de negócio**, dois gatilhos; o manual continua existindo (compatibilidade),
  o cron passa a existir.

---

## 3. Rename `hr_background_jobs → background_jobs` (só DESENHAR — não executar)

Racional: a camada deixa de ser "de RH" e passa a ser **core do sistema**. Área sensível (migration em
tabela com state machine + constraints + índices + código). **Inventário completo de dependências:**

### 3.1 Banco (migration de rename — objetos a tratar)

- **Tabela:** `public.hr_background_jobs` → `public.background_jobs` (`alter table ... rename to ...`).
- **Constraints nomeadas** (o `rename table` **não** renomeia constraints; ficam com prefixo antigo).
  Todas de `039` (+ a `type_check` recriada em `057`): `hr_background_jobs_type_check`,
  `_status_check`, `_priority_check`, `_payload_object_check`, `_result_object_check`, `_attempts_check`,
  `_scheduled_status_check`, `_running_lock_check`, `_completed_check`, `_failed_check`,
  `_correlation_format`, `_locked_by_format`, `_failure_reason_safe_check`, `_payload_safe_check`,
  `_result_safe_check` (`039:30-79`, `057:8-20`). **Opção A (recomendada):** deixar os nomes antigos
  (cosmético; funcionam igual) para minimizar risco. **Opção B:** `alter table ... rename constraint`
  um a um (mais limpo, mais superfície de erro). Decidir explicitamente.
- **Índices** (`039:82-100`): `hr_background_jobs_unit_idx`, `_status_scheduled_idx`, `_type_status_idx`,
  `_locked_idx`, `_correlation_idx`. `rename table` mantém os índices funcionando com o **nome antigo** →
  mesma escolha A/B das constraints.
- **Trigger:** `set_updated_at_hr_background_jobs` (`039:111-114`) — segue funcionando após rename da
  tabela; renomear o **trigger** é opcional (cosmético). Recriar com `drop trigger if exists ... ; create
  trigger ...` no novo nome se quiser consistência.
- **RLS:** **nada a migrar** — não há policy (§1.C). Só o flag `enable row level security` acompanha a
  tabela. **Confirmar** que a migration de rename **não** re-desabilita RLS.
- **Comentários** (`039:117-124`, `055:41-42`, `057:22-23`): recriar `comment on table/column/constraint`
  apontando o novo nome (cosmético).
- **Numeração:** migration de rename = próximo número livre — hoje **074** (após o `073` do RH-E-01, que
  está **não aplicado**). **(confirmar** que 073 é o maior no repo antes de fixar 074.)

### 3.2 Código (referências a atualizar — grep exaustivo)

- **`src/lib/hr/background-jobs.ts`** — 6 ocorrências de `.from("hr_background_jobs")`
  (`:177, :211, :244, :275, :303, :318`). **Único** arquivo TS com a string literal (grep confirmado).
  Além do literal, decidir se o **arquivo/símbolos** migram de "hr" para core: `HR_BACKGROUND_JOB_SELECT`,
  `HrBackgroundJob*` (types), `sanitizeBackgroundJobPayload`, `redactBackgroundJob`, e o **path** do
  módulo (`@/lib/hr/background-jobs` → ex. `@/lib/core/background-jobs`). Isso é rename de **código**
  (mais amplo que o literal SQL) — ver importadores abaixo.
- **Importadores da lib** (grep `@/lib/hr/background-jobs`): `trainings/process-expirations/route.ts:3`,
  `occupational-records/process-expirations/route.ts:3`, `background-jobs/route.ts:4-11`. Se mover o path
  do módulo, atualizar esses imports.
- **Schemas:** `hrBackgroundJobCreateSchema`, `hrBackgroundJobsQuerySchema` (usados em
  `background-jobs/route.ts:18,82`) — vivem em `src/lib/hr/schemas.ts` **(não verificado o range de
  linhas)**. Decidir se renomeiam junto.
- **Rota da fila:** `src/app/api/hr/background-jobs/route.ts` — se a fila vira core, avaliar mover para
  `src/app/api/background-jobs/` (muda a URL pública → **breaking** para qualquer consumidor da UI;
  **confirmar** quem chama `GET /api/hr/background-jobs`). **Opção conservadora:** manter a URL e o path do
  módulo, renomear **só a tabela** no banco + os 6 literais. Menor blast radius.
- **Migrations que citam o nome antigo:** `055:22-26`, `057:5-9` (recriam `type_check`). Migrations
  **já aplicadas não se editam** — o rename é uma migration **nova** que assume o estado pós-057.

### 3.3 Migração segura (ordem sugerida) e riscos

**Ordem:** (1) migration nova de rename só-tabela (074) em **staging** → validar app inteiro apontando
para a tabela renomeada (os 6 literais precisam ser deployados **junto** — senão o código quebra ao
buscar `hr_background_jobs` inexistente); (2) por isso, **rename de tabela + troca dos 6 literais TS
são atômicos no mesmo deploy** (não dá pra separar em duas entregas sem downtime da fila); (3) rename de
símbolos/path do módulo e da URL da rota são **opcionais e independentes**, fazer depois se desejado.

**Riscos:**
- **Acoplamento deploy↔migration:** se a migration roda antes do código novo (ou vice-versa), toda
  chamada à fila falha (tabela some do nome antigo). Mitigar: **opção compat** — criar uma `view`
  `hr_background_jobs` apontando para `background_jobs` durante a transição **(não verificado se a fila
  aceita writes via view com esses CHECKs — precisa teste)**; ou coordenar migration+deploy na mesma
  janela.
- **Constraints/índices com nome antigo** após rename: cosmético, mas confunde auditoria futura.
- **URL pública** `GET /api/hr/background-jobs`: mover quebra consumidores → tratar como decisão à parte.
- **Produção:** staging primeiro, sempre (trava de staging do projeto).

**NÃO executar nada aqui.** Este documento só desenha; a migration de rename exige plano+revisão próprios.

---

## 4. Riscos e NAO_ALTERAR (o que exige plano+revisão antes de qualquer código)

Tudo abaixo é **área sensível** — nenhum toca sem plano aprovado:

1. **Auth de máquina (`CRON_SECRET`) e `requireCronAuth`:** é o **único** portão das rotas de cron (sem
   sessão). Erro aqui = endpoint aberto ou cron quebrado. Segredo **nunca** no repo; comparação constante;
   500-sem-segredo/401-sem-Bearer são invariantes (padrão RH-E-01, `apply-due/route.ts:16-27`).
2. **Migration de rename (§3):** tabela com state machine, 15 constraints nomeadas, 5 índices, 1 trigger.
   Acoplada ao deploy do código (os 6 literais). Staging→produção, migration nova (não editar aplicadas).
3. **RLS deny-all da fila:** hoje **só** service_role acessa (`api-auth.ts:71` = `SupabaseAdmin`). Qualquer
   mudança que exponha a fila a `authenticated` **muda o modelo de segurança** — não fazer sem decisão
   explícita. O gate é **aplicacional**, não RLS.
4. **Trigger `set_updated_at`** e **(não verificado)** auditoria: recriar/renomear triggers é migration
   sensível; confirmar antes se algum mecanismo de audit global alcança a tabela.
5. **Variante "system" de `createBackgroundJob`:** hoje grava `created_by = session.user.id`
   (`background-jobs.ts:188`). Um caminho cron precisa de ator simbólico sem sessão — mexe em como a
   autoria é registrada (rastreabilidade). Desenhar antes.
6. **Fluxos NÃO tocados por esta camada:** implement/aprovação/alçada de movimentação e de desligamento,
   Auth/login, e as migrations **já aplicadas**. A camada core só **adiciona** runner + auth de máquina +
   (opcional) rename; **não** altera regra de negócio existente.

### Confirmações verificadas (base deste doc)

- RH-E-01: `apply-due/route.ts` (POST-only, CRON_SECRET inline, service_role) + `apply-due-movements.ts`
  (varre/aplica direto) + `hr-cron.yml` (Actions, `0 6 * * *`, POST com Bearer). **Sem** fila.
- `process-expirations` (trainings/occupational): `requireHrPermission` (sessão) + fila completa
  (create→claim→run→complete/fail), escopo `accessibleUnitIds`. **Não** cron-avel hoje.
- Fila `039`: colunas/CHECKs/índices/trigger acima; `job_type` evoluiu `039→055→057` (8 tipos); RLS
  enabled **sem policy** (deny-all); primitivas em `background-jobs.ts` (create session-bound;
  load/claim/complete/fail session-free/service_role).
- `HrRequestContext.supabase` = `SupabaseAdmin` (`api-auth.ts:71`) → a fila é sempre service_role.

### Itens marcados (não verificado)

- Mecanismo global de audit_trail alcançando `hr_background_jobs` por fora do nome do trigger.
- Range exato de `hrBackgroundJob*Schema` em `src/lib/hr/schemas.ts` e quem consome a URL
  `GET /api/hr/background-jobs` na UI.
- Que `073` é o maior número de migration no repo (para fixar `074` no rename).
- Se a fila aceita writes através de uma `view` de compatibilidade sob os CHECKs atuais.

---

> **Parte B (à parte):** inventário de rotinas agendadas por módulo (quais varreduras/rotinas cada
> módulo precisa, periodicidade, `job_type`, handler). Não incluído aqui por decisão de escopo.
