# Plano — Leva 2 / Família 3 (RH): sub-fatiamento

> **Documento de planejamento. Sem código.** Área SENSÍVEL (autorização). Núcleo
> `scope: "aggregate" | "active-unit"` (permissions.ts) **já está no main** e é consumido por
> Cadastros (Família 1) e Compras (Família 2). RH usa **wrappers paralelos** que delegam ao
> núcleo: `src/lib/hr/api-auth.ts` (`requireHrPermission`/`getHrAccessibleUnitIds`/
> `assertUnitInHrScope`/`assertCanAccessHrEmployee`) e `src/lib/hr/workflow-auth.ts`
> (`requireHrWorkflowPermission`/`canUseWorkflowUnitFilter`/`canAccessWorkflowUnit`).
> **Princípio B-misto (já decidido, §7.1/§9 do doc 8):** LISTA → active-unit; registro único
> /[id]/ação → aggregate + check per-record; consolidado/dashboard/relatório → aggregate;
> escrita → aggregate; exceção `unit_id IS NULL` (rede) preservada; **redação sensível
> (`*SensitiveView`) permanece aggregate**.

---

## 1. Inventário (relido do código) + 2. Classificação

Sinais observados:
- `.in("unit_id", accessibleUnitIds)` → **lista escopada** (alvo de active-unit).
- `assertCanAccessHrEmployee` → **registro do colaborador** (aggregate + check per-record).
- `accessibleUnitIds.includes(query.unitId)` com `unitId` **opcional** → **consolidado** (aggregate).
- `!row.unit_id || …` / `or(unit_id.is.null,…)` → **exceção rede/global** (preservar).
- 2ª chamada `getHrAccessibleUnitIds(*SensitiveView)` → **só redação** (mantém aggregate).
- Super admin: alguns GET de lista aplicam `.in` **só para não-super** (super burla) → no
  active-unit o filtro vira **incondicional** (igual fizemos em Cadastros), pois o núcleo já
  entrega `[unidade ativa]` ao super admin.

### 2.1 Listas escopadas por unidade (→ migram para **active-unit**)

| Rota (GET lista) | Perm | Wrapper | Escopo hoje | Classe | Notas |
|---|---|---|---|---|---|
| `employees` | employeesView | api-auth | `.in(unit_id)` | **unit-scoped** | + 2ª call sensível (aggregate) |
| `conduct` | conductView | api-auth | `.in(unit_id)` | **unit-scoped** | redação aggregate |
| `occupational-records` | occupationalView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `nr-certifications` | occupationalView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `employee-evaluations` | evaluationsView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `development-plans` | evaluationsView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `movements` | movementsView | api-auth | `.in(unit_id)` | **unit-scoped** | 🚩 destino agregado (§5a) |
| `terminations` | terminationsView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `trainings/assignments` | trainingsView | api-auth | `.in(unit_id)` | **unit-scoped** | |
| `trainings` | trainingsView | api-auth | `or(unit_id.is.null, in)` | **unit-scoped + NULL** | preservar treinos de rede |
| `onboarding-plans` | employeesView | api-auth | `!unit_id || includes` | **unit-scoped + NULL** | |
| `document-rules` | documentsView | api-auth | `!unit_id || includes` | **unit-scoped + NULL** | |
| `evaluation-templates` | evaluationsView | api-auth | `!unit_id || includes` | 🚩 **catálogo + NULL** | global vs por-unidade (§ decisões) |

### 2.2 Catálogos / consolidados / dashboards (→ permanecem **aggregate**)

| Rota | Perm | Wrapper | Escopo hoje | Classe |
|---|---|---|---|---|
| `document-types` | documentsView | api-auth | org/null (catálogo) | **aggregate (catálogo)** |
| `consolidated-reports` | employeesView | api-auth | `unitId?` validado | **aggregate** |
| `executive-dashboard` | employeesView | api-auth | `unitId?` validado | **aggregate** |
| `pending-center` | employeesView | api-auth | `unitId?` validado | **aggregate** |
| `document-pendencies` (+`/summary`) | documentsView | api-auth | `unitId?` validado | **aggregate** |
| `onboarding-dashboard` (+`/summary`) | employeesView | api-auth | `unitId?` validado | **aggregate** |
| `employee-evaluations/reports` | evaluationsView | api-auth | agrega (redação) | **aggregate** |
| `analytics` | workflowsView | workflow-auth | `accessibleUnitIds` | **aggregate** |
| `dashboard` | workflowsView | workflow-auth | `accessibleUnitIds` | **aggregate** |
| `audit` | workflowEventsView | workflow-auth | `accessibleUnitIds` | **aggregate** |
| `background-jobs` (GET) | workflowsView | workflow-auth | rede | **aggregate** |
| `workflow-templates` (+`[id]`) | workflowsView | workflow-auth | catálogo de rede | **aggregate (catálogo)** |
| `workflow-types` | workflowsView | workflow-auth | catálogo de rede | **aggregate (catálogo)** |
| `workflow-delegations` (GET) | workflowsView | workflow-auth | rede | **aggregate** |

### 2.3 Registro único / sub-recursos / ações (→ **aggregate + check per-record**)

- **Colaborador (todas usam `assertCanAccessHrEmployee`):** `employees/[id]`,
  `employees/[id]/{conduct,documents,document-links,history,nr-certifications,occupational,
  terminations,trainings,trainings/[trainingId],onboarding,onboarding/items/[itemId]}`,
  `contextual-documents` (POST).
- **Registro por id (check via `accessibleUnitIds.includes(row.unit_id)` na carga/redação):**
  `conduct/[id]`, `occupational-records/[id]`, `nr-certifications/[id]`, `terminations/[id]`,
  `movements/[id]`, `development-plans/[id]` (+`/items`, `/items/[itemId]`),
  `employee-evaluations/[id]` (+`/scores`), `evaluation-templates/[id]` (+`/sections/**`),
  `onboarding-plans/[id]` (+`/items`, `/items/[itemId]`), `admission-processes/[id]`
  (+`/checklist`, `/checklist/[itemId]`).
- **Workflows/recrutamento (via `workflow-auth`):** `workflows/[id]` e todo `workflows/[id]/**`
  (`approve,reject,return,cancel,execute,notifications,timeline,candidates,
  candidates/[candidateId]{,/interviews,/scorecards,/resume,/admission}`).
  > 🚩 **Verificar na implementação:** vários `[id]` GET usam `accessibleUnitIds.includes` hoje
  > **apenas para redação sensível**. Confirmar que cada `[id]` também **nega acesso**
  > (404/403) quando o `unit_id` do registro não está na união — não só oculta campo. Onde a
  > carga já filtra por unidade (loader), ok; onde não, adicionar o check explícito.

### 2.4 Escrita (POST/PATCH/DELETE/ações) (→ **aggregate**, inalterado)

Todas as ações de máquina de estado e escrita: `conduct/[id]/{submit,approve,reject,cancel}`,
`movements/[id]/{submit,approve,reject,implement}`,
`terminations/[id]/{submit,approve,cancel,implement,checklist,checklist/[itemId]}`,
`occupational-records/process-expirations`, `trainings/process-expirations`,
`employee-evaluations/[id]/scores`, `evaluation-templates` (POST/PATCH em sections/criteria),
`onboarding-plans` (POST/PATCH/items), `development-plans` (POST/PATCH/items),
`document-rules/[id]` PATCH, `document-rules` POST, `contextual-documents` POST,
`workflows/**` ações, `workflow-delegations` POST + `/revoke`, `background-jobs` POST,
`admission-processes/[id]/checklist*` PATCH. **Não recebem scope.**

### 2.5 🚩 Achados que precisam de decisão (não decidi)

1. **`workflows` (GET lista)** usa `canUseWorkflowUnitFilter` (filtro `unit_id` **opcional**) e
   `.in(unit_id)` **só para não-super** (super vê tudo). Tem cara de **inbox de REDE**
   (como `purchases/approvals`), não de lista operacional. **Proposta:** manter **aggregate**
   (rede), com o filtro de unidade opcional já existente — **não** estreitar por unidade ativa.
   Confirmar.
2. **`admission-processes` (GET lista)**: **não há sinal de escopo por unidade** no código
   (sem `.in(unit_id)`, sem `accessibleUnitIds`). Parece **não filtrar por unidade hoje**
   (possível lacuna pré-existente). **Proposta:** tratar como item à parte — decidir se vira
   **unit-scoped** (adicionar filtro) ou fica **aggregate**; não alterar silenciosamente.
3. **`evaluation-templates` / `document-types` / `document-rules`**: catálogos de configuração.
   `document-types` é global (org/null) → **aggregate**. `evaluation-templates`/`document-rules`
   têm `unit_id` opcional (+NULL) → **proposta unit-scoped + NULL**, mas confirmar se a UI
   espera ver todos os modelos da rede ao configurar.

---

## 3. Sub-levas, ordem e dependências

**3A (fundação) é pré-requisito de todas.** As demais são independentes entre si e podem ir
em qualquer ordem após 3A; ordem recomendada por valor/risco abaixo.

| Sub-leva | Subdomínio | Depende de |
|---|---|---|
| **3A** | Fundação: wrappers encaminham `scope` + tipo required | — |
| **3B** | Colaboradores & Documentos | 3A |
| **3C** | Admissões & Onboarding | 3A (+ decisão 🚩 admission) |
| **3D** | Saúde ocupacional / SST | 3A |
| **3E** | Avaliações & Desenvolvimento | 3A (+ decisão 🚩 templates) |
| **3F** | Conduta, Desligamentos & Movimentações | 3A (+ §5a destino agregado) |
| **3G** | Treinamentos | 3A |
| **3H** | Recrutamento/Workflows & Consolidados de rede | 3A (+ decisão 🚩 workflows) |

Ordem recomendada: **3A → 3B → 3D → 3E → 3G → 3F → 3C → 3H** (deixa por último os dois mais
sensíveis/ambíguos: movimentações com destino agregado e workflows/recrutamento de rede).

---

## 4. SUB-LEVA 3A — Fundação (primeiro; zero mudança visível)

**Objetivo:** habilitar o mecanismo de `scope` no RH sem nenhuma rota passar a estreitar.

- `src/lib/hr/api-auth.ts`: `requireHrPermission(code, opts?)` e
  `getHrAccessibleUnitIds(supabase, session, code, opts?)` passam a aceitar e **mesclar**
  `{ scope }` em `hrPermissionOptions` (encaminham ao núcleo; sem duplicar lógica). Default
  ausente = aggregate.
- `src/lib/hr/workflow-auth.ts`: `requireHrWorkflowPermission(code, opts?)` idem.
- `HrRequestContext` passa a declarar `hasPermissionInScope: boolean`; com isso o campo volta a
  **required** em `PermissionRequestContext` (hoje opcional só por causa do HR).
- **Nenhuma rota muda** (ninguém passa `scope` ainda). 
- **Critério de aceite:** `tsc`/`eslint`/`build` passam; comportamento **idêntico** (tudo
  aggregate); diff restrito aos 2 wrappers + tipos.

---

## 5. Três pontos conhecidos (tratados)

### 5a) `hr-movements` — destino entre unidades não pode sumir
A **lista** de movimentações vira unit-scoped (3F). Mas o formulário escolhe **unidade/
departamento de DESTINO**, que pode ser **outra** unidade. Hoje o cliente busca opções de
`/api/base/departments` e `/api/base/job-positions` — que a **Família 1 já estreitou** por
unidade ativa → o destino ficaria limitado à unidade ativa (regressão).
**Proposta:** as opções de **destino** vêm de fonte **AGREGADA**:
- unidade de destino: usar `session.units` (já agregado no cliente) — sem fetch novo;
- departamentos/cargos de destino: buscar de forma **agregada**, via um **opt-out explícito**
  de scope nos GET de `base/departments`/`base/job-positions` (ex.: `?scope=aggregate`, que o
  handler honra voltando à união) **OU** filtrando client-side por unidade de destino sobre uma
  busca agregada. 🚩 **Decisão:** adicionar o parâmetro `scope=aggregate` (mínimo, mantém
  validação server-side na união) **vs** endpoint de opções dedicado. Recomendo o parâmetro.
- Implementar junto da 3F; **não** incluir `activeUnit.id` nas queryKeys de **destino** (elas
  são agregadas); a **lista** de movimentações, sim, recebe `activeUnit.id`.

### 5b) Consumidores RH de `base/departments` e `base/job-positions` (staleness)
Hoje com `queryKey` sem `activeUnit.id` → não refazem fetch ao trocar a unidade. Atribuição:

| Cliente | Endpoint(s) base | Sub-leva | Tratamento |
|---|---|---|---|
| `hr-admission-create-client` | departments, job-positions | **3C** | + `activeUnit.id` na queryKey (opções da unidade ativa) |
| `hr-evaluation-reports-client` | departments | **3E** | + `activeUnit.id` |
| `hr-evaluation-templates-client` | departments, job-positions | **3E** | + `activeUnit.id` |
| `hr-job-opening-create-client` | departments, job-positions | **3H** | + `activeUnit.id` |
| `hr-movements-client` | departments, job-positions | **3F** | **destino agregado** (§5a); lista com `activeUnit.id` |

### 5c) Redação sensível permanece aggregate
Em **todas** as rotas que redigem campos sensíveis, a 2ª chamada
`getHrAccessibleUnitIds(*SensitiveView)` decide mostrar/ocultar por unidade do registro. Essa
chamada **NÃO recebe `scope`** em nenhuma sub-leva — permanece **aggregate**. Só a chamada
**primária** da LISTA (`requireHrPermission` da coleção) recebe `{ scope: "active-unit" }`.
Estreitar a chamada sensível ocultaria campos indevidamente — proibido.

---

## 6. Detalhe por sub-leva (o que migra / aceite)

> Em todas: **só GET de LISTA** recebe `{ scope: "active-unit" }`; `[id]`/ações/escrita e
> consolidados permanecem aggregate; exceções `unit_id NULL` preservadas; redação sensível
> aggregate; cliente inclui `activeUnit.id` na queryKey das listas (refetch na troca).

- **3B Colaboradores & Documentos** — migra: `employees` (GET). Aggregate: todo
  `employees/[id]/**`, `contextual-documents`, `document-pendencies(+summary)` (consolidado),
  `document-types` (catálogo). `document-rules` (lista +NULL) → **3B** ou **3E** (config) 🚩.
  Cliente: lista de colaboradores com `activeUnit.id`.
  **Aceite:** lista de colaboradores reflete a unidade ativa; `[id]` abre colaborador da união
  (check); pendências/consolidados inalterados; redação sensível inalterada.

- **3C Admissões & Onboarding** — migra: `onboarding-plans` (GET, +NULL); `admission-processes`
  (GET) **só se decidido unit-scoped** (🚩 §2.5.2). Aggregate: `onboarding-dashboard(+summary)`,
  `onboarding-plans/[id]/items`, `employees/[id]/onboarding`, `admission-processes/[id]/**`.
  Cliente: `hr-admission-create` ganha `activeUnit.id` (§5b). **Aceite:** planos/admissões da
  unidade ativa; dashboards consolidados; criação usa opções da unidade ativa.

- **3D Saúde/SST** — migra: `occupational-records` (GET), `nr-certifications` (GET). Aggregate:
  `[id]` de ambos, `process-expirations` (ação). **Aceite:** listas por unidade ativa; ASO/NR
  por id abrem da união; expirações inalteradas.

- **3E Avaliações & Desenvolvimento** — migra: `employee-evaluations` (GET),
  `development-plans` (GET), `evaluation-templates` (GET, +NULL) **se unit-scoped** (🚩).
  Aggregate: `employee-evaluations/reports`, `[id]`/`scores`, `development-plans/[id]/items`,
  `evaluation-templates/[id]/**`. Cliente: `hr-evaluation-reports`/`hr-evaluation-templates`
  ganham `activeUnit.id` (§5b). **Aceite:** listas por unidade ativa; relatórios consolidados.

- **3F Conduta, Desligamentos & Movimentações** — migra: `conduct` (GET), `terminations` (GET),
  `movements` (GET). Aggregate: todos os `[id]`/ações/checklists. **§5a:** destino de
  movimentação agregado. Cliente: listas com `activeUnit.id`; `hr-movements` destino agregado.
  **Aceite:** listas por unidade ativa; ações/aprovações inalteradas; **movimentação consegue
  destino em outra unidade**.

- **3G Treinamentos** — migra: `trainings` (GET, +NULL), `trainings/assignments` (GET).
  Aggregate: `trainings/[id]`, `process-expirations`. **Aceite:** treinos da unidade ativa +
  treinos de rede (NULL) visíveis; atribuições por unidade ativa.

- **3H Recrutamento/Workflows & Consolidados de rede** — **provável NÃO-migração** das listas:
  `workflows` (GET) proposto **aggregate** (inbox de rede, 🚩 §2.5.1) — mantém filtro de unidade
  opcional existente. Aggregate: todo `workflows/[id]/**`, candidates, `workflow-templates/
  types/delegations`, `analytics/dashboard/audit/background-jobs`. Cliente:
  `hr-job-opening-create` ganha `activeUnit.id` (§5b) para opções; inbox de workflow **mantém**
  seu filtro de unidade próprio (rede). **Aceite:** diretor de rede mantém visão consolidada;
  nada estreita indevidamente.

---

## 7. Restrições (reafirmadas)
- NÃO tocar: login, `auth.getUser`, `auth_email`, Supabase Auth, migrations, RLS, triggers,
  `session.ts`, endpoint `active-unit`. **Não** mexer no núcleo `permissions.ts` (só consumir).
- Aprovações/consolidados de rede e **workflows inbox** permanecem **aggregate**.
- Escrita permanece **aggregate** (validação ampla, sem afrouxar).
- Redação sensível (`*SensitiveView`) permanece **aggregate**.
- Sem libs novas.

## 8. Decisões pendentes (para você)
1. `workflows` (GET lista): **aggregate (inbox de rede)** [recomendado] vs unit-scoped?
2. `admission-processes` (GET lista): hoje **sem filtro de unidade** — unit-scoped (adicionar
   filtro) vs aggregate? (E é lacuna a corrigir à parte?)
3. `evaluation-templates`/`document-rules` (catálogos com `unit_id`+NULL): unit-scoped+NULL
   [recomendado] vs aggregate (ver todos os modelos da rede)?
4. §5a destino de movimentação: `?scope=aggregate` nos GET base [recomendado] vs endpoint de
   opções dedicado?
5. 3A: reverter `hasPermissionInScope` para **required** agora (HR declara no `HrRequestContext`)
   — confirmar que pode.
