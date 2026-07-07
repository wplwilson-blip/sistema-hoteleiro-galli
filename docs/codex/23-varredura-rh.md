# Varredura RH (read-only) — equivalente da AUDIT-COTACOES no módulo inteiro de RH

> 2026-07-06 · **READ-ONLY**, nada alterado. Evidências por `arquivo:linha` / `migration:linha`.
> Onde não foi possível confirmar no código, está marcado **[NÃO VERIFICADO]**.
> Padrão-ouro: `src/lib/hr/api-auth.ts` + `requirePermission` (`src/lib/base-cadastros/api-helpers.ts`).
> Helper RLS: `public.user_has_unit_access(uuid)` (`009:32`).

---

## EIXO 1 — Consistência de autorização

**Inventário:** 96 rotas em `src/app/api/hr/**` (glob). Auth por **dois** stacks granulares:
- **`requireHrPermission` / `requirePermission`** (domínio RH) — 75 rotas (grep files_with_matches).
  Fluxo: `requirePermission` → `getAccessibleUnitIdsForPermission` (escopo por unidade) + 403 se sem
  permissão. Escopo de linha por `assertCanAccessHrEmployee`/`assertUnitInHrScope`
  (`api-auth.ts:176-208`).
- **`requireHrWorkflowPermission`** (motor de workflow) — 24 rotas (`workflows/**`,
  `workflow-templates/**`, `workflow-delegations/**`, `workflow-types`, `background-jobs`, `dashboard`,
  `audit`, `analytics`). Definido em `src/lib/hr/workflow-auth.ts:37-68`: `requireAuthenticatedRequest`
  → `getHrAccessibleUnitIds` (mesmo núcleo de escopo) + 403; escopo de linha por
  `assertWorkflowUnitScope`/`canAccessWorkflowUnit` (`workflow-auth.ts:74-90`).

**União 75 ∪ 24 = 96 rotas.** Não encontrei rota lendo/escrevendo **sem** gate granular nem sem
núcleo de escopo por unidade — **não há** equivalente ao antigo "TODO Sprint 4C" aberto no RH. (Base:
cobertura por grep dos dois helpers + leitura de `api-auth.ts` e `workflow-auth.ts`. **[NÃO VERIFICADO]**
rota-a-rota nas 96 — a conclusão vem da cobertura de grep, não de abrir cada arquivo.)

### Achados
- **RH-A-01 (baixa) — Dois stacks de auth paralelos.** Domínio usa `requireHrPermission`
  (`api-auth.ts`); workflow usa `requireHrWorkflowPermission` (`workflow-auth.ts`) com **formato de erro
  diferente** (`{error:{code,message}}` vs `apiError({message})`). Funcionalmente equivalentes (mesmo
  núcleo de escopo), mas a duplicação é risco de manutenção/consistência (divergir no futuro). Não é
  falha de segurança.

---

## EIXO 2 — Cobertura de RLS

RLS **habilitado** em todas as tabelas `hr_*`/`employee_*` (migrations 021/022/023/033/035/037/038/039/
041/042/043/046/047/048/052/053/054/056/058/059/060/061/062 — ver doc 17). Policies existentes:
`066` (não-sensível), `069` (RH sensível core), `071` (RH↔empregado — **pendente de aplicar**),
`072` (recrutamento — **pendente de aplicar**).

### RH-B-01 (média) — Residual: RLS ON + ZERO policy (após 069/071/072)
Confirmado por cruzamento (doc 17 menos as tabelas de 069/071/072). **20 tabelas** de RH ficam com RLS
ligado e **nenhuma** policy (deny-all a `authenticated`; só service_role acessa):

- **Infra de workflow (10):** `hr_workflows`, `hr_workflow_steps`, `hr_workflow_events`,
  `hr_workflow_idempotency_keys`, `hr_workflow_notifications`, `hr_workflow_audit_logs`,
  `hr_workflow_templates`, `hr_workflow_template_steps`, `hr_workflow_approver_delegations`,
  `hr_background_jobs`.
- **Templates/catálogo/config (8):** `hr_document_types`, `hr_document_rules`, `hr_trainings`
  (catálogo), `hr_evaluation_templates`, `hr_evaluation_template_sections`,
  `hr_evaluation_template_criteria`, `hr_onboarding_plans`, `hr_onboarding_plan_items`.
- **Processo de admissão (2):** `hr_admission_processes`, `hr_admission_checklist_items`.

É seguro hoje (deny-all + app via service_role), mas **sem defesa granular** — bate com a expectativa
("infra de workflow"), **e ainda inclui** admission_processes/checklist e os templates/catálogos, que
NÃO estavam na lista esperada. Recomendação: Fatia 3 (workflow infra por unidade via join ao
`hr_workflows.unit_id`) + Fatia 4 (templates de rede, padrão da 072 Grupo C).

### RH-B-02 (média/ALTA) — 071 e 072 NÃO estão aplicadas
As migrations 071 (9 tabelas) e 072 (7 tabelas) **existem como arquivo mas não foram aplicadas/
commitadas** (tarefas anteriores as deixaram para revisão). Logo, **no banco vivo**, essas **16 tabelas
continuam RLS-ON + zero policy**. A cobertura de RLS "já adicionada" do enunciado ainda **não** está no
banco. Sem impacto de segurança (deny-all), mas o mapa de cobertura real ≠ mapa dos arquivos.

---

## EIXO 3 — Dependências de template/seed de workflow

`workflow_type` do motor (constraint em `040:10-22`): `admission`, `termination`, `transfer`,
`promotion`, `training`, `general_note`, `job_opening` (e correlatos).

Seeds de template+steps encontrados (grep `insert into public.hr_workflow_templates/_steps`):
- **`job_opening`** — `040:3120-3170+`: template **org-level** (`unit_id null`, `040:3137`),
  `is_active=true` (`040:3142`), **com** `hr_workflow_template_steps` (`040:3170`). Idempotente
  (`not exists`).
- **`admission`** — `044:6-70`: template **org-level** (`unit_id null`, `044:23`), `is_active=true`
  (`044:28`), **com** steps (`044:57`). Idempotente.
- **`termination`, `transfer`, `promotion`, `training`, `general_note`** — **nenhum seed de template**
  encontrado.

### RH-C-01 (média) — job_opening: seed EXISTE, mas a tela reclama
O achado semente ("roteiro ativo com etapas não encontrado" na abertura de vaga) **não é seed ausente**:
o template `JOB_OPENING_MVP` está seedado, ativo e com steps (`040`). A causa provável é **mismatch de
escopo/consulta** — o seed é **org-level** (`unit_id null`) e a tela/serviço pode buscar template
**por unidade ativa** (ou por `organization_id` que não casa). **[NÃO VERIFICADO]** a query exata da
tela `hr-job-opening-create-client.tsx`/serviço de criação — recomendo abrir o SELECT de template para
confirmar se filtra `unit_id = <ativa>` sem incluir `unit_id is null`.

### RH-C-02 (baixa/média) — Fluxos sem template seedado
`termination`, `transfer`, `promotion`, `training`, `general_note` não têm template seedado. **Porém**
esses fluxos têm **módulos dedicados** (tabelas `employee_terminations`, `employee_movements`, etc. e
rotas próprias `terminations/**`, `movements/**`) que **não** dependem do motor de template. Ou seja: o
trap "tela trava sem seed" só se aplica a fluxos **engine-driven** (job_opening, admission). **[NÃO
VERIFICADO]** se alguma tela de termination/movement instancia `hr_workflows` exigindo template — se
sim, travaria como job_opening.

---

## EIXO 4 — Dado sensível (PII) e gate `*.sensitive.view`

Existe uma família de permissões sensíveis (`api-auth.ts:21-64`): `HR:employees.sensitive.view`,
`documents.sensitive.view`, `evaluations…`, `movements…`, `trainings…`, `occupational…`, `conduct…`,
`terminations…`, `history…`, `workflows…`, `workflow_events…`. O gate é aplicado (grep `.sensitive.`)
em **36 rotas**, cobrindo employees, documents, document-links, evaluations, development-plans,
movements, trainings, occupational, nr-certifications, conduct, terminations, history e o motor de
workflow (redação via `workflow-redaction`).

### RH-D-01 (média/ALTA — alimenta LGPD/Camada 2) — Domínios com PII sem gate sensível
Rotas que carregam PII mas **não** referenciam `.sensitive.` (grep):
- **`admission-processes/**`** (`admission-processes`, `[id]`, `[id]/checklist`, `[id]/checklist/[itemId]`)
  — processo admissional (dados pessoais/documentos do admitido). Usa só `requireHrPermission` genérico,
  **sem** `HR:*.sensitive.view`. **[VERIFICAR]** quais colunas PII expõe.
- **`employees/[id]/onboarding*`, `onboarding-plans/**`, `onboarding-dashboard/**`** — onboarding pode
  referenciar documentos/pendências; sem gate sensível.
- **`contextual-documents`** — aparece na lista sensível? Não. **[VERIFICAR]** se lista documentos
  sensíveis sem gate.

Isso é exatamente a **dívida da Camada 2**: o gate sensível é **só de aplicação** (não está no banco — o
069/071/072 fazem só unidade), e há domínios de aplicação (admission/onboarding) onde o gate sensível
**não** aparece. Prioridade para (a) fechar o gate na app e (b) levar `*.sensitive.view` ao RLS na
Camada 2.

### PII por tabela (referência para Camada 2)
- `employees.document_number` (CPF), emails/telefone (`003:38-41`).
- `employee_occupational_records` / `employee_nr_certifications` (ASO/saúde ocupacional).
- `employee_conduct_records` / `employee_conduct_reviews` (conduta).
- `employee_terminations` / `employee_termination_checklists` (rescisão).
- `employee_movements.old_salary/new_salary` (salário, `052:27-28`).
- `employee_documents` / `employee_document_links` + `hr_admission_*` (documentos admissionais).

---

## EIXO 5 — Cenários operacionais (ciclo de vida do colaborador)

### RH-E-01 (ALTA) — Transferência/mudança de unidade NÃO é aplicada ao `employees`
`POST /movements/[id]/implement` (`movements/[id]/implement/route.ts:14-39`) chama
`transitionEmployeeMovement` (status `approved`→`implemented`) + `publishEmployeeMovementFunctionalEvent`.
**Não** atualiza `employees`. Confirmado: `src/lib/hr/employee-movements.ts` **nunca** referencia a
tabela `employees` para escrita (grep `from("employees")` → **0 matches**); guarda `old_unit_id`/
`new_unit_id` no registro de movimentação (`employee-movements.ts:29-30,262-298`) mas não propaga.
**Consequências:**
1. **Operacional:** uma transferência aprovada+"implementada" **não muda** a unidade/depto/cargo do
   colaborador — o `employees.unit_id` permanece o antigo. A movimentação vira só histórico.
2. **RLS/visibilidade:** como 071 escopa `employees` (e filhas) por `employees.unit_id`, o colaborador
   transferido **continua visível só na unidade antiga** e some da nova — o escopo **não acompanha** a
   transferência, porque o dado-fonte não muda.
**[NÃO VERIFICADO]** se existe **trigger** de banco que aplica `new_unit_id` ao `employees` no status
`implemented` (não encontrei trigger assim nas migrations 052/053; o app não faz). Se não houver, a
transferência é um no-op sobre o cadastro.

### RH-E-02 (média) — ASO/saúde barrando admissão: [NÃO VERIFICADO como guardrail]
Há `employee_occupational_records` (ASO) e `hr_admission_processes`/checklist, e onboarding com
`operational_release_status` (`047:111`, valores `blocked/partial/released/critical_pending`) e itens
`blocks_operational_release` (`047:185`). Existe **estrutura** para bloquear liberação operacional por
pendência crítica (onboarding), mas **[NÃO VERIFICADO]** se há regra que **impede admissão/efetivação**
quando o ASO está pendente (vínculo ASO→admissão não localizado no código lido). Aparenta ser
"checklist informativo" mais do que guardrail rígido — confirmar.

### RH-E-03 (média) — Handoff de onboarding ao líder da área
`employee_onboarding_items` tem `responsible_user_id`/`responsible_profile_code`/`owner_area`
(`047:177-178,176`) e `blocks_operational_release` — há **estrutura** de responsabilização por item.
**[NÃO VERIFICADO]** se há notificação/handoff automático ao líder da área (depende do motor de
notificações `hr_workflow_notifications`, que está no residual RLS). Estrutura existe; automação não
confirmada.

### RH-E-04 (baixa) — Desligamento + checklists: cobertura presente
`employee_terminations` + `employee_termination_checklists` com rotas dedicadas
(`terminations/[id]/submit|approve|implement|cancel|checklist`) e policies de unidade na 069. Fluxo
parece completo; sem buraco evidente além do gate sensível (coberto — `terminations` está na lista
sensível).

---

## RESUMO EXECUTIVO

**Contagem por eixo:** E1 = 1 (RH-A-01) · E2 = 2 (RH-B-01, RH-B-02) · E3 = 2 (RH-C-01, RH-C-02) ·
E4 = 1 (RH-D-01) · E5 = 4 (RH-E-01..04). **Total: 10 achados.**

**Top 5 mais graves:**
1. **RH-E-01 (ALTA)** — Transferência/mudança de unidade não atualiza `employees.unit_id`; a
   movimentação "implementada" é no-op sobre o cadastro e o escopo de RLS não acompanha o colaborador.
2. **RH-D-01 (média/ALTA)** — `admission-processes/**` e onboarding lidam com PII sem aplicar
   `HR:*.sensitive.view`; alimenta dívida LGPD/Camada 2 (gate sensível só existe na app e falta nesses
   domínios).
3. **RH-B-02 (média/ALTA)** — 071/072 **não aplicadas**: 16 tabelas RH que deveriam ter escopo de
   unidade seguem RLS-ON + zero policy no banco vivo.
4. **RH-C-01 (média)** — job_opening: template seedado e ativo (040), mas a tela reclama "roteiro ativo
   com etapas não encontrado" → provável mismatch de escopo (seed org-level `unit_id null` vs consulta
   por unidade). Quebra uma tela real.
5. **RH-B-01 (média)** — 20 tabelas RH com RLS-ON + zero policy (workflow infra + templates/catálogo +
   admission_processes); seguro por deny-all, mas sem defesa granular.

**Positivo:** autorização granular consistente nas 96 rotas (dois helpers, ambos com escopo por
unidade) — **nenhuma** rota ungated encontrada; gate sensível aplicado em 36 rotas dos domínios
centrais.

**[NÃO VERIFICADO] a acompanhar:** query da tela de job_opening; trigger de transferência→employees;
vínculo ASO→bloqueio de admissão; automação de handoff de onboarding; leitura rota-a-rota das 96
(conclusão de E1 é por cobertura de grep).
