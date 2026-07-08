# CORE Fatia 2.1 — notas de implementação (evento de vencimento de NR)

> 2026-07-08 · Passo 2 implementado. **Nada commitado/pushado** (aguardando revisão do diff). Migration
> `076` já aplicada em staging+produção pelo dono. Lint + build **verdes**. **BLOQUEIO importante no E2E/
> objetivo — ver seção final.**

## O que foi implementado (§9 do plano)

1. **Zod** (`schemas.ts`): `"nr_expiring"`, `"nr_expired"` após `"aso_expired"`.
2. **Labels** (`employee-functional-events.ts`, após `aso_expired`): `nr_expiring: "Certificação NR
   vencendo"`, `nr_expired: "Certificação NR vencida"`. (`EmployeeFunctionalEventType` = `z.infer` do
   schema → o `Record` de labels **força** as entradas no build.)
3. **`eventDomain`** (`:196`): estendido com `|| eventType.startsWith("nr_")` → `occupational_health`.
4. **`publishNrExpirationEvent`** (privado, `occupational-health.ts`), espelhando `publishAsoExpirationEvent`,
   assinatura `(supabase, actorUserId, ...)`:
   - **Sensibilidade DERIVADA do registro** (não hardcode): `isSensitive: certification.is_sensitive ??
     false`, `visibilityScope: (certification.visibility_scope ?? "unit") as EmployeeFunctionalEventVisibilityScope`.
   - `severity`: `nr_expired → warning`, `nr_expiring → notice`.
   - `sourceEntityType: "employee_nr_certification"`, `sourceEntityId: certification.id`,
     `relatedAttachmentId: certification.certificate_attachment_id`.
   - `dedupeKey: occupational-nr:{id}:expired|expiring`; `source: "cron"` no payload quando
     `actorUserId === null`.
5. **Fiação no ramo NR** de `processOccupationalExpirationGovernance`: publica `nr_expiring` ao
   `state.expiresSoon`; o `update` de expiração ganhou `.select(nrCertificationListSelect).single()` (antes
   não retornava a linha) e publica `nr_expired` com a linha atualizada + `previous`. **TODO(...ADIADO)
   removido.** `publishNrCertificationEvent` (criação) **intocado**.
6. **Manual/ASO/treinamento byte-a-byte iguais**; runner **não** mudou (agrega counters, independe do
   evento). Sem migration nova, sem Auth/login/RLS.

## E2E (`tests/e2e/nr-expiration-event.e2e.spec.ts`)

Prova o **verificável hoje** (como E2E_ADMIN, via `GET /api/hr/employees/[id]/history`):
- Varredura publica **1** `nr_expired` (dedupe → idempotente na 2ª run), `severity="warning"`.
- Sensibilidade do evento **espelha o registro** (`isSensitive=true`/`visibilityScope="restricted"` hoje —
  ver bloqueio).
- **ASO intacto** (`aso_expired` continua publicado).

## ⚠️ BLOQUEIO — o objetivo "líder vê o NR" NÃO se realiza hoje (decisão do dono)

O plano §5/§7 assumiu que uma certificação NR **pode** nascer não-sensível (aí o evento nasce visível na
unidade e o líder vê). **Na prática, não pode:** `prepareNrCertificationWrite`
(`occupational-health.ts:222-223`) hardcoda **`is_sensitive: true` / `visibility_scope: "restricted"`** para
**toda** certificação NR, e o `nrCertificationPayloadSchema` (`schemas.ts:724-740`) **não** expõe campo de
sensibilidade. Mesmo padrão do ASO (`:203-204`).

**Consequência:**
- O `publishNrExpirationEvent` está **correto e pronto** (deriva do registro) — quando o NR puder ser
  não-sensível, o evento nasce `unit`/não-sensível **sem mudança de código**.
- Mas **hoje** todo evento NR nasce **restrito/sensível** → o líder (sem `historySensitiveView`) **não** o
  vê. O objetivo central da Fatia 2.1 (NR visível ao líder) **não é alcançado** só com esta fatia.
- Por isso o caso invertido do §7 (usuário sem acesso sensível vê NR / não vê ASO) está em **`test.skip`**
  com justificativa — não há como criar um NR não-sensível via API para exercê-lo.

**Decisão necessária do dono (fora do que foi implementado):** para o líder ver o NR, é preciso o NR
**poder nascer não-sensível** — ex.:
- **(A)** default do NR passar a `is_sensitive: false` / `visibility_scope: "unit"` em
  `prepareNrCertificationWrite` (NR é competência/compliance, não saúde) — muda o cadastro de NR; **ou**
- **(B)** expor um campo de sensibilidade no `nrCertificationPayloadSchema` (quem cadastra decide); **ou**
- **(C)** manter NR sensível e adiar a visibilidade ao líder (o evento fica só como rastro SST-RH restrito).

Isso é uma **mudança no fluxo de cadastro do NR** (não no evento) e uma decisão de produto/segurança — não
a tomei por conta própria. O código do evento não precisa mudar em nenhum dos casos (já deriva do registro).

## Arquivos tocados (Passo 2, ainda não commitados)

- `src/lib/hr/schemas.ts` (Zod)
- `src/lib/hr/employee-functional-events.ts` (labels + eventDomain)
- `src/lib/hr/occupational-health.ts` (import do tipo + `publishNrExpirationEvent` + fiação NR)
- `tests/e2e/nr-expiration-event.e2e.spec.ts` (novo)
- *(migration `076` já commitada/aplicada anteriormente)*
