Li os arquivos solicitados em modo somente leitura. Não alterei nenhum arquivo.

**1. API Routes E Autorização**

| Grupo/rota | Helper de autorização |
|---|---|
| `/api/auth/login` | `getSessionContextByAuthUserId` + Supabase Auth server/admin. Rota pública de login. |
| `/api/auth/logout` | Supabase server client. Sem `requireAuthenticatedRequest`. |
| `/api/setup/initial-admin` | `createSupabaseAdminClient`; controlada por lógica de setup inicial, não por sessão comum. |
| `/api/attachments`, `/api/attachments/[id]` | `requireAuthenticatedRequest` apenas. Usa service role/admin depois. |
| `/api/base/departments`, `/api/base/departments/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/base/employees`, `/api/base/employees/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/base/job-positions`, `/api/base/job-positions/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/base/suppliers`, `/api/base/suppliers/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/base/units`, `/api/base/units/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/base/users`, `/api/base/users/[id]` | `requireSuperAdminRequest`. |
| `/api/purchases/approvals` | `requireSuperAdminRequest`. |
| `/api/purchases/approvals/[requestId]/decision` | `requireAuthenticatedRequest` + `assertCanDecidePurchaseApprovalLevel`. |
| `/api/purchases/approvals/[requestId]/resubmit` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/documentation-dashboard` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/quotes` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/requests`, `/api/purchases/requests/[id]` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/requests/[id]/quotes` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/requests/[id]/quotes/[quoteId]` | `requireAuthenticatedRequest` apenas. |
| `/api/purchases/requests/[id]/quotes/[quoteId]/negotiations` | `requireAuthenticatedRequest` apenas. |

**RH granular por `requireHrPermission`**

| Rotas | Permissões |
|---|---|
| `/api/hr/admission-processes*` | `workflowsView`; PATCH checklist usa `workflowsManage`. |
| `/api/hr/conduct*` | `conductView`, `conductManage`, `conductReview`. |
| `/api/hr/contextual-documents` | Dinâmica por origem: conduta, saúde, NR, treinamento, desligamento, onboarding, movimentação ou avaliação. Também exige `documentsManage` por unidade do colaborador. |
| `/api/hr/document-pendencies*`, `/api/hr/document-rules*`, `/api/hr/document-types` | `documentsView` / `documentsManage`. |
| `/api/hr/employees*` | `employeesView` / `employeesManage`; subrotas usam permissões específicas de documentos, histórico, treinamentos, saúde, conduta e desligamentos. |
| `/api/hr/employee-evaluations*`, `/api/hr/evaluation-templates*`, `/api/hr/development-plans*` | `evaluationsView`, `evaluationsManage`, `developmentManage`. |
| `/api/hr/movements*` | `movementsView`, `movementsManage`, `movementsApprove`. |
| `/api/hr/trainings*` | `trainingsView`, `trainingsManage`, `trainingsAssign`, `trainingsVerify`. |
| `/api/hr/occupational-records*`, `/api/hr/nr-certifications*` | `occupationalView`, `occupationalManage`, `occupationalVerify`. |
| `/api/hr/terminations*` | `terminationsView`, `terminationsManage`, `terminationsReview`. |
| `/api/hr/onboarding*`, `/api/hr/pending-center`, `/api/hr/consolidated-reports`, `/api/hr/executive-dashboard` | Predominantemente `employeesView` / `employeesManage`. |

**RH workflow por `requireHrWorkflowPermission`**

| Rotas | Permissões |
|---|---|
| `/api/hr/workflows`, `/api/hr/workflows/[id]` | `workflowsView` / `workflowsManage`. |
| `/api/hr/workflows/[id]/approve`, `reject`, `return` | `workflowsApprove`. |
| `/api/hr/workflows/[id]/cancel` | `workflowsCancel`. |
| `/api/hr/workflows/[id]/execute` | `workflowStepsComplete`. |
| `/api/hr/workflows/[id]/timeline`, `notifications`, `/api/hr/audit` | `workflowEventsView`. |
| `/api/hr/workflows/[id]/candidates*` | `workflowsView` / `workflowsManage`; currículo usa permissão variável conforme método. |
| `/api/hr/workflow-delegations*` | `workflowsView` / `workflowsApprove`. |
| `/api/hr/workflow-templates*`, `/api/hr/workflow-types` | `workflowsView`. |
| `/api/hr/dashboard`, `/api/hr/analytics`, `/api/hr/background-jobs` | `workflowsView`; jobs também usam `workflowsApprove` para POST. |

**2. RLS E Policies**

RLS está habilitado nas migrations para:

- Base/core: `organizations`, `units`, `unit_settings`, `departments`, `job_positions`, `app_users`, `employees`, `user_employee_links`, `access_profiles`, `permissions`, `profile_permissions`, `user_unit_links`, `user_permission_overrides`, `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`, `cost_centers`, `operational_categories`, `request_types`, `attachment_types`, `system_statuses`, `approval_flows`, `approval_levels`, `approval_requests`, `approval_steps`, `approval_actions`, `notification_rules`, `notifications`, `system_logs`, `audit_trail`.
- Compartilhadas: `suppliers`, `attachments`, `comments`, `room_status_history`.
- Orçamento: `budget_periods`, `budget_lines`, `budget_movements`, `budget_reservations`, `budget_change_requests`.
- Compras: `purchase_requests`, `purchase_request_items`, `purchase_quotes`, `purchase_quote_items`, `purchase_receipts`, `purchase_receipt_items`, `purchase_request_events`, `purchase_approval_decisions`, `purchase_quote_negotiations`, `purchase_approval_snapshots`.
- RH: `hr_document_types`, `employee_documents`, `employee_functional_events`, `hr_workflows`, `hr_workflow_steps`, `hr_workflow_events`, `hr_workflow_idempotency_keys`, `hr_workflow_notifications`, `hr_workflow_audit_logs`, `hr_workflow_templates`, `hr_workflow_template_steps`, `hr_workflow_approver_delegations`, `hr_background_jobs`, `hr_job_candidates`, `hr_candidate_interviews`, `hr_scorecard_templates`, `hr_scorecard_questions`, `hr_interview_scorecards`, `hr_interview_scorecard_responses`, `hr_candidate_admission_conversions`, `hr_document_rules`, `hr_onboarding_plans`, `hr_onboarding_plan_items`, `employee_onboardings`, `employee_onboarding_items`, `hr_evaluation_templates`, `hr_evaluation_template_sections`, `hr_evaluation_template_criteria`, `employee_evaluations`, `employee_evaluation_scores`, `employee_development_plans`, `employee_development_plan_items`, `employee_movements`, `employee_movement_approvals`, `hr_trainings`, `employee_trainings`, `employee_occupational_records`, `employee_nr_certifications`, `employee_conduct_records`, `employee_conduct_reviews`, `employee_terminations`, `employee_termination_checklists`, `employee_document_links`, `hr_admission_processes`, `hr_admission_checklist_items`.

Não encontrei `CREATE POLICY`, `DROP POLICY` ou `ALTER POLICY` nas migrations. Portanto, pelo repositório, as tabelas têm RLS habilitado, mas não há policies SQL definidas. A proteção efetiva das APIs depende dos helpers server-side e do uso de service role/admin client.

**3. Riscos De Autorização**

1. **Crítico: APIs com service role + autorização só por sessão.**  
   `/api/base/*`, `/api/attachments`, boa parte de `/api/purchases/*` usam `requireAuthenticatedRequest`, que só confirma sessão válida. Como depois usam `createSupabaseAdminClient`, RLS não protege essas operações.

2. **Alto: RLS habilitado sem policies cria dependência total das APIs.**  
   Isso evita acesso direto via anon/authenticated quando não há policy, mas qualquer rota server-side com service role vira o ponto único de autorização.

3. **Alto: Compras ainda não tem matriz granular consistente.**  
   A decisão de aprovação tem regra especial boa, inclusive Diretoria por unidade, mas solicitações, cotações, negociações, dashboard documental e reenvio usam autenticação genérica.

4. **Alto: Cadastros base operacionais amplos.**  
   Unidades, departamentos, cargos, colaboradores e fornecedores podem ser lidos/criados/alterados por qualquer sessão válida, exceto usuários internos, que exigem `SUPER_ADMIN`.

5. **Médio: RH está mais maduro, mas o escopo é majoritariamente por unidade.**  
   `requireHrPermission` valida permissão e unidades acessíveis; não vi enforcement departamental fino, apesar de existir vínculo com departamento em alguns modelos.

6. **Médio: Menu e `allowed_actions` não devem ser tratados como segurança.**  
   O documento RH-35B está correto ao dizer que menu é experiência; a segurança real precisa continuar server-side.

7. **Médio: setup inicial é rota pública sensível por natureza.**  
   Ela depende da checagem de existência de super admin. É aceitável para bootstrap, mas deve permanecer muito protegida contra reuso indevido.

8. **Baixo/Médio: mensagens e helpers ainda têm sinais de dívida técnica.**  
   `requireAuthenticatedRequest` tem TODO explícito para matriz granular; isso confirma que a camada base ainda é transitória.