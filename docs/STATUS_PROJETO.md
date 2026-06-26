# Status do Projeto

## Estado Geral

O Sistema Administrativo Hotel Galli está funcional em V1 para base administrativa e compras. O projeto já possui Supabase, GitHub, Vercel, login real por username + senha e deploy automático.

## Infraestrutura

- Supabase funcionando.
- GitHub funcionando.
- Vercel funcionando.
- Deploy automático funcionando.
- Login real por username + senha funcionando.
- Setup inicial do Super Admin funcionando.
- Bucket privado Supabase Storage: `attachments`.

## Módulos Existentes

- Cadastros.
- Compras.
- Aprovações de compras.
- RH dashboard placeholder.
- Recepção dashboard placeholder.
- Manutenção dashboard placeholder.
- Governança dashboard placeholder.
- A&B dashboard placeholder.
- Contas a Pagar dashboard placeholder.
- Administrativo dashboard placeholder.
- Relatórios dashboard placeholder.

## Cadastros Existentes

- Unidades.
- Departamentos.
- Cargos.
- Colaboradores.
- Usuários internos.
- Fornecedores.

## Compras Existentes

- Solicitações de compra.
- Itens da solicitação.
- Cotações.
- Itens da cotação.
- Anexos de cotação.
- Origem e evidência estruturada da cotação.
- Classificação documental automática da evidência.
- Blindagem de `has_formal_evidence`, `requires_attachment`, `requires_justification` e `evidence_confidence` como campos derivados da classificação documental.
- Upload de evidência no fluxo de cadastro e negociação de cotação.
- Cadastro rápido de fornecedor dentro da cotação.
- Combobox pesquisável de fornecedor.
- Cotação recomendada.
- Cotação vencedora.
- Aprovação real.
- Devolução para Compras.
- Reenvio para aprovação.
- Histórico de decisão.
- Anexos no dossiê de aprovação.
- Snapshot formal do dossiê enviado para aprovação.
- Aprovações legadas sem snapshot apenas para consulta.
- Bloqueio backend contra mutação direta de cotação que já entrou em dossiê formal.

## Snapshot Formal de Aprovação

- O envio ou reenvio formal para aprovação cria um snapshot do dossiê.
- O snapshot congela solicitação, unidade, departamento, itens, cotação vencedora, fornecedor, anexos, cotações concorrentes, recomendação e alçada.
- O snapshot também congela origem da cotação, tipo de evidência, confiança, contato/canal, referência externa, URL, observações, justificativa de ausência de evidência, flags verbal/emergência, regularização posterior, classificação documental, motivo da classificação, alertas de auditoria e exigência de Diretoria quando aplicável.
- A decisão formal atualiza o snapshot pendente correspondente.
- A tela de Aprovações prioriza dados do snapshot formal quando ele existe.
- Registros legados sem snapshot permanecem visíveis para rastreabilidade, mas não permitem decisão direta.
- O snapshot continua nascendo somente no envio ou reenvio formal; criar cotação, criar negociação ou selecionar vencedora não cria snapshot.

## Origem e Evidência de Cotações

- Implementado no commit `20b60d8 audit-cotacoes-origem-evidencia`.
- A migration `020_purchase_quote_evidence.sql` adicionou campos estruturados de origem/evidência em `purchase_quotes` e já foi aplicada manualmente no Supabase.
- Compras registra os fatos da proposta; o sistema calcula a classificação documental; o aprovador decide com base no dossiê formal.
- A função central de classificação é `classifyPurchaseQuoteEvidence`.
- Classificações: `formal_sufficient`, `acceptable_with_reservation`, `fragile` e `critical`.
- Evidência crítica força `approval_level = general_directorate` no envio/reenvio formal.
- `evidence_confidence`, `requires_attachment`, `requires_justification` e `has_formal_evidence` são derivados da regra do sistema, não julgamento livre do usuário nem fonte absoluta de verdade.
- Listagens e APIs de consulta devem refletir a classificação calculada, considerando anexos reais quando disponíveis, para evitar falso positivo em cotação antiga com default legado.

## Aprovação de Compras

- Até R$ 200,00: Gerência Administrativa.
- Acima de R$ 200,00: Diretoria Geral.
- Evidência crítica: Diretoria Geral mesmo quando o valor da compra for baixo.
- Não usar nome de pessoa no status.
- Aprovar confirma a compra.
- Reprovar encerra a compra e exige justificativa.
- Devolver para Compras permite revisão sem encerrar a compra e exige justificativa.
- Reenviar para aprovação volta para pendente e recalcula a alçada.
- A decisão usa o `approval_level` do snapshot formal pendente.
- Para `approval_level = general_directorate`, o backend exige vínculo ativo de `UNIT_DIRECTOR` na unidade da compra.
- `SUPER_ADMIN` não é automaticamente Diretoria.

## Auditoria AUDIT-COTACOES-2-A

- AC-01: aprovação por Diretoria sem validação granular no backend; corrigido no commit `38a28ab sec-audit-cotacoes-hardening-backend`.
- AC-02: bloqueio de dossiê sem cobertura clara para `unselect` e `DELETE/cancel`; corrigido no commit `38a28ab sec-audit-cotacoes-hardening-backend`.
- AC-03: `has_formal_evidence` com default `true`; corrigido na sprint `SEC-AUDIT-COTACOES-3-A` por blindagem de consumo/persistência como campo derivado. O default permanece no banco apenas por compatibilidade.

## Status Visuais de Compras

- Em cotação.
- Aguardando aprovação da Gerência Administrativa.
- Aguardando aprovação da Diretoria Geral.
- Compra aprovada.
- Compra reprovada.
- Devolvida para Compras.

## Observações

- Aprovação por grupos/perfis específicos ainda não foi implementada.
- Diretoria Geral corporativa, se necessária, ainda precisa de perfil/permissão própria ou mapeamento auditável.
- O modelo atual ainda usa `purchase_quotes.is_selected`; seleção de nova vencedora deve evoluir futuramente para evitar mutação em cotação congelada.
- Contas a Pagar ainda é placeholder.
- RH, Recepção, Manutenção, Governança e A&B ainda são entradas de módulo, não fluxos completos.

## Unidade Ativa (multiunidade)

Recurso **concluído e no `main`** (Leva 1 + Parte 3 + Leva 2 completa).

- **Modelo A confirmado:** cada hotel é uma **unidade** (`unit_id`) da mesma organização; a
  operação é isolada pela **unidade ativa**; a **rede** é usada para consolidados/relatórios.
- **Seletor de unidade visível no header** (`ActiveUnitSwitcher`), com estados normal/trocando/
  erro/unidade-única. A escolha é **persistida em cookie `httpOnly`** (`active_unit_id`),
  validada server-side a cada request contra os vínculos reais do usuário.
- **Núcleo de autorização:** `src/lib/auth/permissions.ts` ganhou `scope: "aggregate" |
  "active-unit"` (default `aggregate` = sem regressão) e `hasPermissionInScope`. `hasPermission`
  continua calculado sobre a **UNIÃO** (gateia o 403). Os wrappers de RH
  (`src/lib/hr/api-auth.ts` e `src/lib/hr/workflow-auth.ts`) **encaminham** `scope` ao núcleo.
- **Escopo por unidade ativa aplicado nas LISTAS operacionais de:**
  - **Cadastros:** `departments`, `job-positions`, `employees`, `suppliers`.
  - **Compras:** `requests`, `quotes` (lista), `documentation-dashboard`.
  - **RH:** `employees`, `occupational-records`, `nr-certifications`, `employee-evaluations`*,
    `development-plans`*, `evaluation-templates`, `document-rules`, `conduct`, `terminations`,
    `movements`*, `trainings`, `onboarding-plans`.
  - (\*) **condicional:** quando filtradas por `employeeId` (cards do detalhe do colaborador) e
    `quotes` por `requestId`, a chamada volta a **aggregate + check per-record** — registro de
    qualquer unidade da união abre normalmente.
- **Permanecem AGGREGATE (visão de rede):** aprovações de compras (lista + decisão + reenvio),
  `workflows`/inbox de recrutamento e todos os `workflows/[id]/**`, consolidados/dashboards/
  relatórios de RH (`analytics`, `audit`, `dashboard`, `executive-dashboard`,
  `consolidated-reports`, `pending-center`, `onboarding-dashboard`, `document-pendencies`,
  `employee-evaluations/reports`, `trainings/assignments`) e **toda a escrita**.
- **Exceções de rede preservadas (`unit_id NULL`):** fornecedor corporativo, templates e regras
  de avaliação de rede, treinos de rede e planos de onboarding de rede continuam visíveis em
  qualquer unidade.
- **Transferência de colaborador entre hotéis:** a lista de movimentações é escopada pela
  unidade ativa, mas as opções de **destino** (unidade/departamento/cargo) usam o **opt-out
  explícito `?scope=aggregate`** em `base/departments` e `base/job-positions` (default dessas
  rotas permanece `active-unit`).
- **Redação de campos sensíveis** (`*SensitiveView` via `getHrAccessibleUnitIds`) permanece
  decidida pela **UNIÃO**, não pela unidade ativa — estreitar quebraria a marcação de sensível.
- **Hardening de RLS:** migration `069_rls_policies_hr_sensitive_core.sql` adicionou policies de
  escopo **por unidade** em 10 tabelas sensíveis de RH (defesa em profundidade).
- **Logout** limpa o cookie de unidade ativa (`clearActiveUnitCookie`).

### Marcos (commits de merge no `main`)

- `c5f0a85` — Leva 1 (cookie validado + perfil ativo no servidor + `units[]` do super admin + store sem mock).
- `db24291` — Parte 3 (seletor de unidade no header).
- `d18de37` — Leva 2 / Família 1 (Cadastros) + núcleo `scope`.
- `b1a14e0` — Leva 2 / Família 2 (Compras).
- `8720f57` — Família 3 / 3A (fundação: wrappers RH encaminham `scope`).
- `8b84bfa` — Família 3 / 3B (Colaboradores).
- `9e0b3b4` — Família 3 / 3D (Saúde ocupacional / SST).
- `dc6fa77` — Família 3 / 3E (Avaliações & Desenvolvimento).
- `4deba39` — Família 3 / 3F (Conduta, Desligamentos & Movimentações).
- `8969297` — Família 3 / 3H (Recrutamento/Workflows & consolidados de rede).

## Pendências conhecidas (pós-Leva 2)

- **`admission-processes` — INVESTIGADO, sem lacuna.** `listAdmissionProcesses`
  (`src/lib/hr/admission-processes.ts`) filtra por unidade: `query.in('unit_id', accessibleUnitIds)`
  para não-super + guard de vazio + recheck por registro (`canAccessAdmissionProcess`). É AGGREGATE
  (união das unidades acessíveis), não unidade ativa — coerente com recrutamento/workflows, que
  também é de rede e do qual a admissão é continuação. Decisão: permanece aggregate. Sem ação.
- **RLS Etapa 2 — Camada 2:** levar o gate `HR:*.sensitive.view` ao banco. A `069` cobriu só o
  escopo **por unidade**; a checagem de permissão sensível continua na aplicação (`api-auth.ts`).
- **Roadmap pré-existente ainda aberto:**
  - **Prompt 1b** — `DEPARTMENT_MANAGER` em `approvals.decide` (alçada por departamento).
  - **RH-35C** — menu filtrado por `access_profile` (impacta a regra de múltiplos perfis na mesma
    unidade, hoje resolvida por precedência `SUPER_ADMIN` > demais, empate `created_at asc`).
  - Limpar cookie de unidade ativa no logout — **já concluído** (`clearActiveUnitCookie` em
    `src/app/api/auth/logout/route.ts`); mantido aqui apenas como confirmação.
