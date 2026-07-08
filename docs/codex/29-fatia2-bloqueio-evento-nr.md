# Fatia 2 — BLOQUEIO no item 7 (evento funcional de vencimento de NR)

> 2026-07-07 · Read-only até decisão do dono. **Nada implementado ainda** (parei antes de escrever código,
> conforme a instrução do item 7). Este doc registra o achado e as opções.

## Achado (verificado)

O item 7 pede publicar um evento funcional quando uma **certificação NR** vence, espelhando
`publishAsoExpirationEvent`. Isso exige um `event_type` válido. **Não existe event type de NR** hoje:

- **DB CHECK:** o constraint de `employee_functional_events.event_type` foi ampliado por último na
  `migration 051` (`051:2` "Amplia somente o check constraint de employee_functional_events.event_type").
  A lista (`051:11-77`) tem `aso_requested/aso_completed/aso_expiring/aso_expired`,
  `occupational_restriction_registered`, `occupational_exam_registered` — **nenhum `nr_*`**. Nenhuma
  migration posterior mexe nesse `event_type` (grep).
- **TS + labels:** `EmployeeFunctionalEventType` e `eventTypeLabels`
  (`employee-functional-events.ts:100-168`) — **sem** tipo de NR.
- **Zod:** `employeeFunctionalEventTypeSchema` (mesma lista). Todos os `nr*expir` do repo são
  **contadores/UI/dashboard** (`occupational-health.ts:434,447`, `executive-dashboard.ts`, componentes) —
  **nunca** um event type.

**Consequência:** inserir um evento com `nr_expiring`/`nr_expired` seria **rejeitado pelo DB CHECK** (e
pela validação de tipo em `createEmployeeFunctionalEvent`). Publicar o evento de NR **requer**:
1. novo valor no union TS + `eventTypeLabels`,
2. novo valor no `employeeFunctionalEventTypeSchema` (Zod),
3. **novo valor no CHECK do banco → MIGRATION**.

O item 7 diz explicitamente: *"Se NÃO existir e for preciso criar event type novo (mudança de
schema/migration), PARE e me reporte — não invente enum nem crie migration."* → **Parado.**

Reusar `aso_expiring`/`aso_expired` para NR **não** é adequado: os labels são "ASO vencendo/vencido"
(`:161-162`) e poluiriam o histórico/filtros de ASO com eventos de NR (NR ≠ ASO). Portanto **não há event
type NR adequado** reaproveitável.

## Impacto no restante da Fatia 2

- **Itens 1–6 (decouple publish helpers, decouple handlers, rotas manuais, `createBackgroundJobSystem`,
  runner + registry, rota `/api/cron/run-jobs`, `hr-cron.yml`) são CODE-ONLY e NÃO dependem do item 7.**
  Podem ser implementados já.
- O **critério de aceite** "evento em todos os 3 tipos (treinamento, ASO, NR)" e a asserção de E2E do
  evento de NR ficam **bloqueados** até a decisão sobre o event type.
- A ramificação NR do handler (`occupational-health.ts:431-448`) **hoje já expira** o registro (status →
  `expired`) e conta; só **não publica evento**. Isso continua funcionando; o que falta é o evento.

## Opções (decisão do dono)

- **A) Criar `nr_expiring`/`nr_expired` via micro-migration** (rompe o "code-only" só nesta parte):
  1 migration aditiva (drop/add do CHECK, padrão `051`) + 3 edições TS/Zod. Correto e limpo. É o que o
  critério de aceite pede. (Recomendado.)
- **B) Adiar o evento de NR** para uma fatia própria com migration; implementar **1–6 agora**; NR continua
  expirando sem evento (marcador claro no handler). Fatia 2 fica code-only como planejado.
- **C) Reusar `aso_*` para NR** (sem migration): rápido, porém **semânticamente errado** (polui ASO).
  Não recomendado.

## Pergunta paralela (E2E do manual restrito)

O caso "manual restrito" (sem permissão → 403; unidade fora do escopo → 404) precisa de um **ator E2E
não-admin com escopo limitado**. Ainda **não verifiquei** se existe (só E2E_ADMIN é usado nos specs
atuais). Se só houver E2E_ADMIN, esse caso do E2E também para e reporto.
