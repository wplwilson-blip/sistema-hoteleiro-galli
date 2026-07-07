# 27 — Mapa de filtros `employees.status='active'` no RH (pré RH-E-05)

- **Data:** 2026-07-07
- **Modo:** READ-ONLY (nenhum código, migração ou config foi alterado). Único artefato de escrita: este relatório.
- **Objetivo:** antes de permitir que o efetivador diário defina `employees.status = 'inactive'` na data efetiva de um desligamento (RH-E-05, sem `deleted_at`), mapear **toda** query/tela/dropdown de RH que filtra colaboradores por `status='active'` (ou equivalente) e que faria o colaborador desligado **desaparecer**. Distinguir onde isso é correto (listas operacionais vivas) de onde seria um **bug** (histórico/dossiê/desligamento).

---

## Resultado-chave (leitura rápida)

> **No caminho de leitura/histórico/dossiê de RH existe EXATAMENTE UM filtro `employees.status='active'`** — em `src/lib/hr/document-pendencies.ts:137`, que alimenta o painel de pendências documentais. Ele é operacional (bucket C, decisão do dono).
>
> **Nenhuma tela de dossiê, histórico funcional, desligamento, movimentação, treinamentos, saúde ocupacional ou conduta filtra por `employees.status`.** Todas passam pelo gate único `assertCanAccessHrEmployee`, que filtra **apenas** `deleted_at IS NULL` (NÃO `status`). Portanto **Bucket B (não pode esconder) = 0 achados**.

### Contagem por bucket

| Bucket | Descrição | Achados |
|---|---|---|
| **A** — Lista operacional viva (correto esconder inativo) | 2 |
| **B** — Histórico/desligamento/dossiê (NÃO pode esconder) — seria bug do RH-E-05 | **0** |
| **C** — Ambíguo / precisa decisão do dono | 1 |

Total de ocorrências analisadas que tocam `employees.status`: **3** (todas as demais ~200 ocorrências de `status='active'` no repo são de **outras tabelas** — `units`, `app_users`, `access_profiles`, `hr_document_types`, `employee_functional_events`, `attachments`, `workflow_delegations`, etc. — fora do escopo de "esconder o colaborador").

---

## Gate central (motivo do Bucket B = 0)

**`src/lib/hr/api-auth.ts:184-207` — `assertCanAccessHrEmployee(context, employeeId)`**

```
.from("employees")
.select("...status...")
.eq("id", employeeId)
.is("deleted_at", null)      // linha 191 — SÓ deleted_at, NÃO status
.limit(1);
```

Esta função é o gate de acesso de **todas** as rotas `/api/hr/employees/[id]/*`: dossiê (`route.ts`), histórico funcional (`history`), documentos, desligamentos (`terminations`), movimentações, treinamentos, ocupacional, NR, conduta, onboarding, avaliações, document-links. Como filtra apenas `deleted_at`, um colaborador com `status='inactive'` continua acessível em todas essas telas após o RH-E-05. É a razão pela qual inativar não quebra o histórico/dossiê.

Verificado: rotas `src/app/api/hr/employees/[id]/terminations/route.ts:13`, `.../history/route.ts:38` e demais sub-recursos chamam `assertCanAccessHrEmployee` e consultam a tabela-filha por `employee_id` (sem `employees.status`).

---

## A) Lista operacional viva (correto esconder inativo)

### A1 — Lista de colaboradores de RH (filtro opcional por status)
- **`src/app/api/hr/employees/route.ts:63`**
- Expressão: `if (query.status) employeesQuery = employeesQuery.eq("status", query.status);`
- Base (linha 55): `.is("deleted_at", null)` — **sem default de status**. O filtro só é aplicado se o cliente enviar `?status=...`.
- **Alimenta:** grade principal `/rh/employees` (`hr-employees-client.tsx:90`) e os pickers de colaborador dos fluxos de criação (movimentações, desligamentos, treinamentos, conduta, ocupacional) que chamam `/api/hr/employees?pageSize=100` **sem** `status` (`hr-movements-client.tsx:220`, `hr-terminations-client.tsx:257`, `hr-trainings-client.tsx:320`, `hr-conduct-client.tsx:283`, `hr-occupational-health-client.tsx:426`).
- **Classificação:** A. É um chip de filtro dirigido pelo usuário; não força esconder. Observação relevante: como os pickers **não** enviam `status`, hoje eles **incluem** colaboradores inativos (comportamento atual, não um bug do RH-E-05; ver "Não verificado / decisão futura").

### A2 — KPI de headcount ativo (dashboard executivo)
- **`src/lib/hr/executive-dashboard.ts:127`**
- Expressão: `const activeEmployees = countBy(employees, (employee) => employee.status === "active");`
- Contexto: os colaboradores são carregados em `:114` com `query.is("deleted_at", null)` (sem filtro de status). A linha `:128` também conta `inactiveEmployees` (`status === "inactive"`) e `:129` admissões. Ou seja, o dashboard **espera** que existam inativos e os contabiliza à parte.
- **Alimenta:** cartões de KPI do dashboard executivo de RH (headcount ativo, inativos, turnover em `:131`).
- **Classificação:** A. Contagem de quadro ativo — correto contar só `active`. Não esconde ninguém de nenhuma lista/histórico.

---

## B) Histórico / desligamento / dossiê (NÃO pode esconder)

**Nenhum achado.** (Resultado importante e intencional.)

Caminhos de histórico/dossiê verificados que **NÃO** filtram `employees.status`:
- Dossiê/detalhe: `src/app/api/hr/employees/[id]/route.ts` → gate `assertCanAccessHrEmployee` (só `deleted_at`).
- Histórico funcional: `src/app/api/hr/employees/[id]/history/route.ts:56` filtra `employee_functional_events.status` (`active|cancelled|corrected` — ciclo de vida do **evento**, não do colaborador). Não toca `employees.status`.
- Desligamentos (por colaborador): `src/app/api/hr/employees/[id]/terminations/route.ts:17-21` — consulta `employee_terminations` por `employee_id`, `deleted_at IS NULL`.
- Desligamentos (lista global): `src/app/api/hr/terminations/route.ts:28-33` — consulta `employee_terminations` por `unit_id` denormalizado + status **do desligamento**; sem `employees.status`.
- Movimentações (lista global): `src/app/api/hr/movements/route.ts:40-50` — idem, `employee_movements` por `unit_id`/status próprio.
- Timeline/eventos do dashboard executivo: embeds `employees(...)` nas tabelas-filhas (`executive-dashboard.ts:220-229`) filtram a **filha** por `unit_id`/status próprio, não `employees.status`.

Consequência: após RH-E-05 inativar o colaborador X, **nenhuma** dessas telas o esconde.

---

## C) Ambíguo / precisa decisão do dono

### C1 — Painel de pendências documentais
- **`src/lib/hr/document-pendencies.ts:137`**
- Expressão: `.eq("status", "active")` sobre `.from("employees")` (base em `:133-138`, com `.is("deleted_at", null)` na linha `:138`).
- **Alimenta:**
  - `/api/hr/document-pendencies` (lista) e `/api/hr/document-pendencies/summary` (cartão-resumo).
  - Telas: `hr-document-pendencies-client.tsx:300` ("Pendências documentais") e o cartão do dashboard operacional `hr-operational-dashboard-client.tsx:659,683`.
- **Falha concreta pós RH-E-05:** quando o colaborador X passar a `status='inactive'` na efetivação do desligamento, ele **desaparece imediatamente** da lista e do resumo de pendências documentais — mesmo que ainda tenha documentos de offboarding/rescisão obrigatórios ou pendentes. A pendência some silenciosamente do painel de compliance (e da contagem do dashboard operacional).
- **Por que ambíguo:** é defensável esconder (não faz sentido cobrar documentos de quem saiu — lista "viva"); mas o **momento** do desligamento é justamente quando há documentos de rescisão a fechar, e a sumidura é silenciosa.
- **Direção sugerida (uma linha):** decidir com o dono — ou aceitar o hide como operacional (manter), ou relaxar o filtro (ex.: incluir inativos por uma janela/grace de offboarding, ou parametrizar `includeInactive`) para não perder pendências de rescisão. **Não implementar sem decisão.**

---

## Demais ocorrências `status='active'` inspecionadas e descartadas (não são `employees.status`)

Todas verificadas como pertencentes a **outras** tabelas (não escondem o colaborador):
- `src/lib/hr/document-pendencies.ts:161`, `hr-document-types`/document-rules, `contextual-documents.ts:191,229`, `document-rule-actions.ts:*`, `evaluation-actions.ts:76,370,384`, `onboarding-plan-actions.ts:*`, `workflow-templates.ts:158`, `workflow-delegations.ts:165,188,190`, `background-jobs.ts:150`, `trainings.ts:213` → tabelas `hr_document_types`, `hr_document_rules`, `hr_evaluation_templates`, `hr_onboarding_plans`, `hr_workflow_*`, `units`, `organizations`, `app_users`.
- `executive-dashboard.ts:220-229` → filtros de `.in("status",[...])`/`.neq("status","cancelled")` sobre `employee_documents/onboardings/trainings/occupational/movements/conduct/terminations` (status da **filha**, não do colaborador).
- `employee-functional-events.ts:300`, `history/route.ts:56` → `employee_functional_events.status` (evento).
- Lookups de colaborador que filtram só `deleted_at` (sem status): `api-auth.ts:184`, `employee-onboarding-auto.ts:276`, `employee-document-dossier-auto.ts:161`, `employee-functional-events.ts:268`, `onboarding-dashboard.ts:260`, `workflow-data.ts:168`, `app/api/hr/workflows/route.ts:97`, `app/api/base/employees/route.ts:74`, `app/api/base/employees/[id]/route.ts`, `app/api/base/users/route.ts:116`, `app/api/base/users/[id]/route.ts:13`.

---

## Verificado vs. Não verificado

**Verificado (por leitura de código, `file:line` citado):**
- Único filtro `employees.status='active'` em leitura de RH = `document-pendencies.ts:137` (C1).
- Gate `assertCanAccessHrEmployee` filtra só `deleted_at` → dossiê/histórico/desligamento não escondem inativos (Bucket B = 0).
- Listas globais de desligamentos e movimentações filtram a tabela-filha por `unit_id`, não `employees.status`.
- Dashboard executivo carrega colaboradores só por `deleted_at` e conta `active`/`inactive` separadamente.
- Pickers de criação chamam `/api/hr/employees?pageSize=100` sem `status`.

**Não verificado / fora do escopo desta análise (marcar para acompanhamento):**
- Não abri o conteúdo exato dos selects `terminationListSelect` / `movementListSelect` (`src/lib/hr/employee-terminations.ts`, `.../employee-movements.ts`); a filtragem, porém, é comprovadamente pela `unit_id` denormalizada da própria filha, então o embed `employees(...)` não é usado como filtro. Risco baixo.
- **Decisão futura (não é bug do RH-E-05):** como os pickers de criação (movimentação/desligamento/treinamento/conduta/ocupacional) hoje **não** filtram `status`, eles passarão a listar também colaboradores inativos. Se o desejado for oferecer apenas ativos para **novos** movimentos, será preciso adicionar `?status=active` nesses pickers — decisão de produto, fora do escopo de "não esconder histórico".
- Não foram inspecionadas eventuais views/RPCs SQL server-side além das citadas; a RLS 071 (unit_id, sem status) foi tomada como fato dado no enunciado.
