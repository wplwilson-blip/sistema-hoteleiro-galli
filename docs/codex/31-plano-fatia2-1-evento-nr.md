# Plano — CORE Fatia 2.1: evento funcional de vencimento de NR

> 2026-07-08 · **PLANO, não código.** Read-only; nada de app code / migration ainda (área sensível =
> migration antes do código). Cita `arquivo:linha`; o que não confirmei está marcado **(não verificado)**.
> Fecha o débito da Fatia 2 (item 7 adiado, `docs/codex/29`): dar ao NR o mesmo tratamento do ASO,
> espelhando `publishAsoExpirationEvent`. Decisões do dono já fixadas — **não reabrir**.

## 0. Confirmações no código (base do plano)

- **Ramo NR hoje não publica evento:** `processOccupationalExpirationGovernance`
  (`occupational-health.ts:436-456`) expira o registro (`update ... status='expired'`, `:442-445`) e conta
  (`nrExpiringCount` `:439`, `nrExpiredCount` `:455`), mas **não** publica — há um `TODO(...ADIADO)` no ponto
  exato (`:452-454`). O ASO, no mesmo handler, publica via `publishAsoExpirationEvent` (`:398,:417`).
- **Não existe event type de NR** (verificado na Fatia 2): CHECK do banco (`051:11-77`), união TS +
  `eventTypeLabels` (`employee-functional-events.ts:100-168`) e Zod
  (`employeeFunctionalEventTypeSchema`, `schemas.ts:242-310`) — só `aso_*`. `051` é a **última** expansão
  de `event_type` (nenhuma migration posterior o altera; grep).
- **Entidade/tabela NR (confirmado, não é chute):** tabela `public.employee_nr_certifications`
  (`occupational-health.ts:443`); `sourceEntityType` canônico = **`"employee_nr_certification"`** — já usado
  pelo evento de **criação** de NR existente `publishNrCertificationEvent` (`:303`). Anexo do NR =
  `certificate_attachment_id` (`:45`, usado em `:305`), **não** `attachment_id` (esse é do ASO).
- **`NrCertificationRow`** (`occupational-health.ts:36-49`): tem `id`, `employee_id` (`:40`), `nr_code`
  (`:41`), `expires_at` (`:44`), `certificate_attachment_id` (`:45`), `status` (`:46`), **`is_sensitive`
  (`:47`)** e **`visibility_scope` (`:48`)** — confirmados; são a base da derivação de sensibilidade (§5).
  *(O dono citou `:44-46`; o real é `:47-48` — `:44-46` é `expires_at`/`certificate_attachment_id`/`status`.)*
- **Classificação de domínio:** a função é **`eventDomain`** (`employee-functional-events.ts:175-199`) — o
  dono citou `defaultDomainFromEventType:196`, que **não existe** com esse nome; o mapeamento
  `aso_`/`occupational_` → `occupational_health` está em `:196` dentro de `eventDomain`. `defaultSeverity`
  (`:201-204`) deriva de `eventDomain` (occupational_health → `warning`).
- **Runner agrega NR:** `run-due-jobs.ts` soma `nr_expired_count`/`nr_expiring_count` do `result` do handler
  (correção da Fatia 2). Isso é **independente** de publicar evento.

## 1. Migration nova — número **076** (só o CHECK)

**Numeração:** o maior existente é `075`; `074` é um **gap reservado** para o rename da fila
(`hr_background_jobs → background_jobs`, `docs/codex/25` §3 / `docs/codex/28`). **Verificado:** não há `074`
rastreado nem pendente/não-commitado (`git status`/`git ls-files` = nenhum 074). **Regra:** numeração
**monotônica** — nunca faça *backfill* de gap. Um `074` criado depois do `075` pode ser **pulado** em
ambientes que já rodaram `075` (o tracker aplica em ordem de versão). **Portanto: `076`**, deixando o `074`
reservado. *(Nota: `075` pode ainda não estar aplicada — RH-E-05 não aplicado — mas a regra monotônica +
reserva do 074 fecham em 076 de qualquer forma.)*

**Arquivo:** `supabase/migrations/076_hr_functional_event_types_nr_expiration.sql`. **Espelha `051`**
(`051:1-79`): comentário de escopo ("amplia SOMENTE o CHECK de `event_type`; não altera dados, colunas,
RLS, policies, severidade, visibilidade ou status") + `drop constraint if exists
employee_functional_events_type_check` (`051:5-6`) + `add constraint ... check (event_type in ( ... ))`
(`051:8-9`).

- A lista do `in (...)` deve ser a **lista integral vigente** (idêntica a `051:11-77`, que é o estado
  atual) **+** `'nr_expiring'` **+** `'nr_expired'`. Inserir os dois **logo após `'aso_expired'`** (para
  ficar junto do bloco ocupacional). **Não** remover nenhum tipo existente.
- **Só o CHECK.** Nada de dados, coluna, RLS, trigger, severidade ou visibilidade.
- **Regra de ouro:** a migration aprovada vai para **STAGING e depois PRODUÇÃO** (validar em staging antes).

## 2. Zod — `employeeFunctionalEventTypeSchema` (`schemas.ts:242-310`)

Adicionar `"nr_expiring"` e `"nr_expired"` **logo após `"aso_expired"`** (`:304`). Sem isso, a validação de
tipo em `createEmployeeFunctionalEvent` rejeitaria o evento antes do banco.

## 3. Labels — `eventTypeLabels` (`employee-functional-events.ts:100-168`)

Adicionar **após `aso_expired` (`:162`)**:
```ts
nr_expiring: "Certificação NR vencendo",
nr_expired: "Certificação NR vencida",
```
`eventTypeLabels` é `Record<EmployeeFunctionalEventType, string>` → ao ampliar a união (item 4/2 fecham a
união via schema/type), o TS **exige** essas entradas (build quebra se faltarem — é o catch desejado).

## 4. Classificação de domínio — `eventDomain` (`employee-functional-events.ts:196`)

Estender a linha `:196`:
```ts
// antes:
if (eventType.startsWith("aso_") || eventType.startsWith("occupational_")) return "occupational_health";
// depois:
if (eventType.startsWith("aso_") || eventType.startsWith("occupational_") || eventType.startsWith("nr_")) return "occupational_health";
```
**Inalterado nesta atualização.** `domínio ≠ sensibilidade`: `nr_` continua em `occupational_health` (é
SST/compliance), mas isso **não** o torna restrito — a **sensibilidade/visibilidade são derivadas do
registro** no publish (§5), com default `unit`/não-sensível para o líder ver.
Sem esta extensão, `nr_expiring/nr_expired` cairiam em `"other"` → `defaultSeverity` erraria (info em vez de
warning) e qualquer consumidor que agrupe por domínio classificaria NR fora de SST. O **publish helper**
(§5) seta `severity` (fixa) e `visibilityScope`/`isSensitive` (derivados do registro) **explicitamente**,
então o evento fica correto mesmo sem isto; ainda assim a extensão é **obrigatória** (catch) para não vazar
domínio errado a outros consumidores. **(não verificado)** se `defaultVisibilityScope` também deriva de
`eventDomain` — irrelevante para correção, pois o publish define visibilidade explícita.

## 5. Publish helper NR + fiação no ramo NR

**Novo `publishNrExpirationEvent`** (privado, em `occupational-health.ts`), **espelhando**
`publishAsoExpirationEvent` (`:319-357`), com assinatura já vigente da Fatia 2
`(supabase, actorUserId, ...)`:
```ts
async function publishNrExpirationEvent(input: {
  supabase: SupabaseAdmin;
  actorUserId: string | null;
  eventType: "nr_expiring" | "nr_expired";
  certification: NrCertificationRow;
  previous?: NrCertificationRow | null;
}) { ... }
```
Campos (sensibilidade/visibilidade **derivadas do registro** — ver bullet abaixo):
- `employeeId: input.certification.employee_id`
- `eventType: input.eventType`
- `title`: do `eventTypeLabels` (item 3)
- `description`: ex. `` `Certificacao NR ${input.certification.nr_code} ${eventType === "nr_expired" ? "vencida" : "em janela de vencimento"}.` ``
- `severity: input.eventType === "nr_expired" ? "warning" : "notice"` (igual ao ASO — **severidade é
  independente de sensibilidade**)
- **Sensibilidade/visibilidade DERIVADAS do registro (decisão do dono — NÃO espelha o ASO):** o NR é
  **competência/compliance**, e o líder do setor **precisa ver** ("colaborador com NR vencida não pode
  exercer atividade"). Portanto **não** hardcodar `restricted/true` (isso é do ASO, que é saúde e o líder
  não vê). Derivar do cadastro, com **default não-sensível**:
  - `isSensitive: input.certification.is_sensitive ?? false`
  - `visibilityScope: input.certification.visibility_scope ?? "unit"`
  - **Regra:** se a `NrCertificationRow` estiver marcada sensível no cadastro (`is_sensitive` /
    `visibility_scope` — **campos reais** em `occupational-health.ts:47-48`; o dono citou `:44-46`, mas
    `:44-46` é `expires_at`/`certificate_attachment_id`/`status`), o evento **respeita o registro**
    (restrito). Caso contrário, nasce **visível na unidade (`unit`) e não-sensível**, para o roteamento
    futuro ao líder (CORE de demandas) funcionar **sem uma terceira fatia**.
- `sourceModule: "hr"`, `sourceEntityType: "employee_nr_certification"` (**confirmado `:303`**),
  `sourceEntityId: input.certification.id`
- `relatedAttachmentId: input.certification.certificate_attachment_id` (**NR usa este**, `:45`)
- `actorUserId: input.actorUserId` (null no cron; carimbar `source: "cron"` no `eventPayload` quando
  `actorUserId === null`, **igual ao padrão da Fatia 2** em `publishAsoExpirationEvent`)
- `dedupeKey: \`occupational-nr:${input.certification.id}:${input.eventType === "nr_expired" ? "expired" : "expiring"}\``
- `eventPayload`: `{ nr_code, expires_at, previous_status, new_status, ...(actorUserId===null?{source:"cron"}:{}) }`

**Fiação no ramo NR (`:436-456`), espelhando o ASO (`:393-418`):**
1. Ao `state.expiresSoon` (`:439`): além de `nrExpiringCount += 1`, **publicar `nr_expiring`** (usando o
   `nr` corrente).
2. Após o `update` de expiração (`:442-445`): para publicar `nr_expired` com a linha **atualizada**
   (espelhando o ASO, que faz `.select(occupationalRecordListSelect).single()` e passa `updatedRecord`),
   **adicionar `.select(nrCertificationListSelect).single()`** ao update do NR — hoje o update do NR **não**
   retorna a linha (`:442-445`). Então publicar `nr_expired` com `certification: updatedRow, previous: nr`.
3. **Remover** o `TODO(...ADIADO)` (`:452-454`).

> Observação: **não** mexer no `publishNrCertificationEvent` existente (`:290-309`) — é o evento de
> **criação** de NR, com shape próprio. O novo helper é só para expiração.

## 6. Runner — confirmação (sem mudança)

`run-due-jobs.ts` agrega `nr_expired_count`/`nr_expiring_count` a partir do **counter** do `result` do
handler, **não** do evento. Publicar o evento **não** altera esses counters nem o resumo. **Confirmado: o
runner não precisa mudar** nesta fatia.

## 7. E2E — verificar publicação NR sem duplicar e sem quebrar ASO

Via API, sem service_role (padrão da suíte). Como o efeito é publicação de evento funcional **sensível**, a
verificação usa o caminho de leitura real do histórico funcional do colaborador **(não verificado:** a rota
exata de leitura de eventos funcionais — provavelmente `GET /api/hr/employees/[id]` (dossiê) ou uma rota de
histórico; confirmar no momento da implementação da fatia**)**.
- **Setup:** criar colaborador; criar uma certificação NR com `expires_at` no passado (vencida) e/ou dentro
  da janela (a vencer). **(não verificado:** rota de criação de NR e se aceita `expires_at` arbitrário —
  confirmar; se exigir fluxo, usar a cadeia real.)**
- **Ação:** rodar a varredura — pelo runner (`POST /api/cron/run-jobs` com `CRON_SECRET`) **ou** pela rota
  manual `POST /api/hr/occupational-records/process-expirations` (ator com permissão).
- **Asserções (sensibilidade INVERTIDA vs ASO — o líder precisa ver o NR):**
  1. **NR não-sensível é VISÍVEL a quem não tem `occupational.sensitive.view`:** com uma certificação NR
     **não** marcada sensível no cadastro (`is_sensitive=false`/`visibility_scope='unit'`), um usuário
     **sem** `occupational.sensitive.view` **DEVE** conseguir ver o evento `nr_expired`/`nr_expiring`
     (senão o líder nunca veria). Aparece **1** evento por certificação/tipo.
  2. **ASO segue restrito (não-regressão da separação):** no **mesmo run**, esse mesmo usuário (sem
     `occupational.sensitive.view`) **continua NÃO vendo** o evento `aso_expired` (redigido/oculto). Prova
     de que NR-visível e ASO-restrito coexistem.
  3. **Registro sensível é respeitado:** uma certificação NR **marcada** sensível no cadastro gera evento
     restrito (esse usuário **não** vê) — o evento deriva do registro, não hardcoda. *(opcional, se houver
     como marcar um NR sensível no setup.)*
  4. **Idempotência:** rodar 2× → **não** duplica (dedupe por `occupational-nr:{id}:expired|expiring`).
  5. **ASO intacto:** um registro ASO vencido no mesmo run continua gerando `aso_expired` normalmente
     (nenhuma regressão funcional).
  6. **Domínio:** o evento NR classifica como `occupational_health` (§4) — domínio ≠ sensibilidade.

## 8. Follow-up explícito (NÃO nesta fatia)

**Aviso ao líder do setor** ("colaborador com NR vencida — não pode exercer atividade") é **operacional** e
depende da **CORE de demandas globais**, que **não existe** hoje. Fica registrado como follow-up; **não**
implementar aqui. Esta fatia entrega só o **evento funcional** (rastro/SST-RH), não a notificação/demanda.

**Por que a decisão de sensibilidade (§5) já destrava isso:** como o evento NR **nasce visível na unidade**
(`unit`/não-sensível por padrão), quando a CORE de demandas existir o roteamento ao líder **lê o evento
diretamente** — sem precisar de uma terceira fatia para "abrir" a visibilidade. O ASO, restrito, permanece
fora do alcance do líder (correto: é saúde).

## Ordem de implementação (quando aprovado)

Migration `076` (staging → validar → produção) → Zod (`schemas.ts:304`) → labels
(`employee-functional-events.ts:162`) → `eventDomain` (`:196`) → `publishNrExpirationEvent` + fiação no ramo
NR (`+ .select()` no update; remover TODO) → E2E. Lint + build. **Nada aplicado/commitado/pushado sem OK.**

### Itens marcados (não verificado)
- Rota exata de leitura de eventos funcionais para a asserção do E2E.
- Rota/《fluxo》 de criação de certificação NR com `expires_at` arbitrário para o setup do E2E.
- Se `defaultVisibilityScope` deriva de `eventDomain` (o publish seta `visibilityScope` explícito de todo
  modo).
