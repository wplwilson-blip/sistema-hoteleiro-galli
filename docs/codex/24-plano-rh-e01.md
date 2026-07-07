# Plano — RH-E-01: efetivação de movimentação funcional na effective_date

> 2026-07-06 · **PLANO, não código.** Read-only; nada aplicado/commitado/pushado. Corrige o achado
> RH-E-01 (`docs/codex/23-varredura-rh.md`): a movimentação "implementada" **não** propaga a mudança ao
> `employees`. Decisões do dono já fixadas (não reabrir): efetivação na **effective_date** (não no
> implement), propaga `unit_id/department_id/job_position_id` quando o `new_*` **não for nulo**, salário
> **nunca**, gatilho **Vercel Cron diário** com endpoint protegido por segredo, o **implement não muda**.

## 0. Confirmações no código (base do plano)

- **Implement só transiciona status + evento:** `src/app/api/hr/movements/[id]/implement/route.ts:14-39`
  chama `transitionEmployeeMovement` (`approved`→`implemented`) + `publishEmployeeMovementFunctionalEvent`.
- **A lib nunca escreve em `employees`:** `src/lib/hr/employee-movements.ts` — `transitionEmployeeMovement`
  (`:340-393`) só faz `.from("employee_movements").update(...)`; grep `from("employees")` = **0**.
- **`employee_movements`** (`052`): `movement_type in (promotion, transfer, job_position_change,
  department_change, unit_change, salary_change)`; `status draft→pending_approval→approved→
  rejected/implemented`; `effective_date date NOT NULL` (`052:12`); pares `old_*/new_*` para
  `unit_id/department_id/job_position_id/salary` (`052:21-28`). **Sem** marcador de "efetivado".
- **`employees`** (`003:33-35`): `unit_id`, `department_id`, `job_position_id` (todos nullable) + triggers
  `updated_at` e `write_audit_trail` (`008`, arrays incluem `employees` — confirmar array de audit na
  implementação).
- **Client service_role:** `src/lib/supabase/admin.ts:6` `createSupabaseAdminClient()` (bypassa RLS).
- **Evento funcional reutilizável:** `src/lib/hr/employee-functional-events.ts:318`
  `createEmployeeFunctionalEvent(supabase, input)` — recebe client **e** input, tem **dedupe embutido**
  (`dedupeKey`), `actorUserId` opcional (aceita null → cron sem sessão).
- **Sem agendador:** não há `vercel.json` (glob = 0), sem pg_cron; `hr_background_jobs` é fila sem runner.

---

## 1. MIGRATION (staging → produção)

Nova `073_employee_movements_applied_marker.sql`:
- `alter table public.employee_movements add column if not exists movement_applied_at timestamptz;`
  (NULL default). **Só a coluna** — nenhum toque em constraint/trigger/índice existente.
- (Opcional, recomendado) índice parcial para a fila do efetivador:
  `create index if not exists employee_movements_pending_apply_idx on public.employee_movements
   (effective_date) where status = 'implemented' and movement_applied_at is null and deleted_at is null;`
  — acelera o SELECT do §2; é aditivo. (Decisão do dono: se preferir "só a coluna", omitir o índice.)
- **Semântica:** `movement_applied_at` = marcador de **idempotência**. NULL = ainda não efetivado;
  preenchido = já aplicado ao `employees` (nunca reaplica).
- Vai para **staging primeiro**, valida, depois **produção**. Idempotente (`add column if not exists`).

---

## 2. EFETIVADOR (TS, service_role) — `applyDueEmployeeMovements`

Novo módulo `src/lib/hr/apply-due-movements.ts` (nome sugerido). Usa **`createSupabaseAdminClient()`**
(service_role — precisa cruzar unidade; RLS da 071 bloquearia `authenticated`). **Não** usa
`HrRequestContext`/sessão (o cron não tem usuário) — por isso **não** reusa `transitionEmployeeMovement`
(que exige `context.session.user.id`); reusa **`createEmployeeFunctionalEvent(admin, input)`**, que
aceita client puro + `actorUserId: null`.

### Passos
1. **Selecionar a fila:**
   `select ... from employee_movements where status = 'implemented' and effective_date <= current_date
    and movement_applied_at is null and deleted_at is null order by effective_date asc, requested_at asc`
   (tie-break estável; o mais antigo aplica primeiro).
2. **Para cada movimentação** (idealmente 1 UPDATE em `employees` por movimentação):
   - Montar `patch` só com os `new_*` **não nulos**, mapeando **coluna→coluna** (não por
     `movement_type` — decisão do dono é dirigida pelo `new_*`):

     | Campo em `employees` | Fonte em `employee_movements` | Regra |
     |---|---|---|
     | `unit_id` | `new_unit_id` | incluir no patch **se** `new_unit_id is not null` |
     | `department_id` | `new_department_id` | incluir **se** `new_department_id is not null` |
     | `job_position_id` | `new_job_position_id` | incluir **se** `new_job_position_id is not null` |
     | `salary` | `new_salary` | **NUNCA** (folha fora do escopo) |

     `movement_type` é **informativo** (define só o tipo de evento, §abaixo), não seleciona campos.
   - Se `patch` ficar **vazio** (todos os `new_*` de cadastro nulos — ex.: `salary_change` puro): **não**
     atualiza `employees`, mas **ainda** marca `movement_applied_at` (para não reprocessar) e registra o
     evento. Assim `salary_change` é "efetivado" como no-op de cadastro.
   - `update employees set {patch}, updated_by = null where id = employee_id and deleted_at is null`
     (via admin client). Os triggers de `008` cuidam de `updated_at` + `audit_trail` (auditoria já
     existente — não recriar).
   - `update employee_movements set movement_applied_at = now() where id = <id> and movement_applied_at
     is null` (guarda de idempotência no próprio UPDATE — condição `is null` evita corrida/duplo run).
   - **Evento funcional:** `createEmployeeFunctionalEvent(admin, { employeeId, eventType:
     movementFunctionalEventType(type) (reusar `employee-movements.ts:395-406`), eventDate:
     effective_date, sourceEntityType: "employee_movement", sourceEntityId: id, actorUserId: null,
     dedupeKey: \`movement:${id}:applied\`, ... })`. **dedupeKey distinto** do publicado no implement
     (`movement:${id}:${eventType}`) para não colidir — este marca a **efetivação**, aquele marcou o
     "registrado".
3. **Retorno:** contagem `{ scanned, applied, skippedEmptyPatch, errors }` para o endpoint logar.

### Idempotência (rodar 2×  = no-op)
- O SELECT filtra `movement_applied_at is null`; após o 1º run a linha some da fila.
- O UPDATE do marcador tem `where movement_applied_at is null` (proteção extra contra concorrência).
- O evento funcional tem **dedupe** por `dedupeKey` (`createEmployeeFunctionalEvent` §0) → não duplica.
- Erro numa movimentação: **não** marca `movement_applied_at` → reentra no próximo run (log do erro).
  Recomendo processar por movimentação com try/catch individual (uma falha não derruba as demais).

---

## 3. ENDPOINT — `POST /api/hr/movements/apply-due` (protegido por segredo)

Novo `src/app/api/hr/movements/apply-due/route.ts`:
- **Sem sessão de usuário.** Lê `Authorization: Bearer <token>` e compara com `process.env.CRON_SECRET`.
  - Header ausente/diferente → **401** (`{ error: "unauthorized" }`), sem tocar no banco.
  - Igual → executa `applyDueEmployeeMovements(createSupabaseAdminClient())` e retorna `{ ok: true,
    ...counts }`.
- **`CRON_SECRET`** vem do **ambiente** (Vercel Project Env + `.env.local` local). **NUNCA** no repo
  (nem `.env.example` com valor). Padrão Vercel Cron: a plataforma injeta automaticamente
  `Authorization: Bearer $CRON_SECRET` nas chamadas de cron quando a env existe — o endpoint só precisa
  validar o header contra `process.env.CRON_SECRET`.
- Método **POST** apenas (cron dispara GET por padrão na Vercel; **confirmar** — se a Vercel só fizer
  GET, expor GET com a mesma checagem, ou configurar. Nota de implementação: alinhar método ao que o
  Vercel Cron envia).
- Não usa `requireHrPermission`/`requireHrWorkflowPermission` (não é rota de usuário); o gate é o segredo.

---

## 4. VERCEL CRON — `vercel.json`

Criar `vercel.json` (não existe hoje):
```json
{ "crons": [ { "path": "/api/hr/movements/apply-due", "schedule": "0 3 * * *" } ] }
```
- **Diário às 03:00 UTC.** Justificativa: `effective_date` é `date` (granularidade de dia), então uma
  janela de 24h é aceitável — não há requisito de efetivar em hora específica. Rodar de madrugada UTC
  reduz concorrência com uso operacional. Retroativos são cobertos (§5).

---

## 5. CASOS DE BORDA

- **Retroativo (`effective_date` no passado):** o filtro `effective_date <= current_date` já pega; aplica
  no **próximo run** (até 24h de atraso). Aceitável por decisão do dono.
- **Duas movimentações para o mesmo colaborador:** `order by effective_date asc, requested_at asc` → a
  mais antiga primeiro; cada uma seta seu `movement_applied_at`; a mais recente sobrescreve o campo
  correspondente por último (estado final = última efetiva). Sem reaplicar (marcador).
- **Mover para unidade nula (corporativo):** a regra "aplica `new_*` **se não nulo**" **exclui**
  naturalmente `new_unit_id is null` → fica **fora por ora** (consistente com a decisão). Não há como o
  efetivador "zerar" `unit_id`.
- **`salary_change` puro:** patch de cadastro vazio → marca `movement_applied_at` + evento, sem tocar
  `employees` (salário nunca aplicado).
- **Colaborador soft-deletado entre implement e efetivação:** UPDATE tem `where deleted_at is null` →
  não aplica; **decidir** se marca `movement_applied_at` mesmo assim (recomendo marcar + log, para não
  reprocessar eternamente) — ponto para a revisão.

---

## 6. IMPACTO NO RLS (registrar explicitamente)

Ao efetivar `employees.unit_id = new_unit_id`, as policies da **071** (`employees_authenticated_*_by_unit`
via `user_has_unit_access(unit_id)`) passam a **incluir** o colaborador na visão da **unidade nova** e a
**excluí-lo** da antiga — **comportamento desejado** (a visibilidade acompanha a lotação). O **histórico**
permanece intacto em `employee_movements` (imutável) e em `employee_functional_events` (evento de
efetivação), que têm escopo próprio. Filhas de RH que guardam `unit_id` denormalizado (ex.:
`employee_trainings`, `employee_onboarding_items`) **não** são reescopadas retroativamente — elas mantêm
a unidade em que foram criadas (decisão consciente: histórico operacional fica na unidade de origem).
**[Registrar]** que só o `employees` (e o que consultá-lo por join) migra de visão.

---

## 7. TESTE E2E (rito `next build` + `next start` com guarda de staging — `test:e2e:prod`)

Novo spec `tests/e2e/movements-apply-due.e2e.spec.ts` (API-level), dependente de um helper de fixtures
service_role (o `admin-db` proposto no doc 10 — **pré-requisito**; hoje não existe cliente de banco nos
testes). Fluxo:
1. **Fixture (service_role):** cria `employee` na unidade A; cria `employee_movements` `unit_change`
   com `new_unit_id = <unidade B acessível>`, `status='implemented'`, `effective_date = ontem`,
   `movement_applied_at = null`. Guardar ids. Teardown deleta tudo (zero resíduo).
2. **Run 1:** `POST /api/hr/movements/apply-due` com `Authorization: Bearer <CRON_SECRET>` →
   assert 200; assert `employees.unit_id == B` (via service_role SELECT); assert `movement_applied_at`
   preenchido.
3. **Run 2 (idempotência):** `POST` de novo → assert 200; `employees.unit_id` **inalterado**,
   `movement_applied_at` **inalterado** (no-op).
4. **Segurança:** `POST` **sem** header / com segredo errado → assert **401**, e `employees.unit_id`
   inalterado.
5. **Futuro não aplica:** cria 2ª movimentação `effective_date = amanhã`, `status='implemented'` →
   `POST` → assert `employees` **não** mudou por ela e `movement_applied_at` dela **continua null**.

> Nota: o spec exige `CRON_SECRET` no `.env.e2e.local` e o helper service_role. Ambos ficam para a
> etapa de implementação, após aprovação.

---

## Restrições respeitadas
Não altera fluxo de aprovação/alçada, o `implement`, login/Auth, nem migrations aplicadas. Só **adiciona**
a camada de efetivação: 1 coluna (073), 1 módulo TS, 1 endpoint, `vercel.json`, 1 spec. Salário nunca é
tocado.

**Aguardando sua revisão. Commit/push só em etapa separada, após aprovação.**
