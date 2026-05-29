import { z } from "zod";

const emptyToUndefined = z.literal("").transform(() => undefined);

export const hrRecordStatusSchema = z.enum(["active", "inactive", "archived"]);

export const hrDocumentCategorySchema = z.enum(["personal", "admission", "contract", "training", "termination", "internal", "other"]);

export const employeeDocumentStatusSchema = z.enum([
  "pending",
  "received",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "replaced",
  "waived"
]);

export const hrDocumentPendingTypeSchema = z.enum([
  "missing_required",
  "pending",
  "awaiting_review",
  "rejected",
  "expired",
  "expiring_soon"
]);

export const employeeFunctionalEventStatusSchema = z.enum(["active", "cancelled", "corrected"]);

export const employeeMovementTypeSchema = z.enum([
  "promotion",
  "transfer",
  "job_position_change",
  "department_change",
  "unit_change",
  "salary_change"
]);

export const employeeMovementStatusSchema = z.enum(["draft", "pending_approval", "approved", "rejected", "implemented"]);

export const employeeMovementVisibilityScopeSchema = z.enum(["restricted", "unit", "organization"]);

export const employeeMovementApprovalActionSchema = z.enum(["submitted", "approved", "rejected", "implemented"]);

export const hrOnboardingQueueTypeSchema = z.enum([
  "blocked",
  "critical",
  "overdue",
  "waiting_rh",
  "waiting_manager",
  "waiting_ti",
  "almost_done"
]);

export const hrOnboardingStatusSchema = z.enum(["not_started", "in_progress", "completed", "cancelled"]);

export const hrOnboardingReleaseStatusSchema = z.enum(["blocked", "partial", "released", "critical_pending"]);

export const hrOnboardingOwnerAreaSchema = z.enum([
  "RH",
  "GESTOR",
  "TI",
  "GOVERNANCA",
  "RECEPCAO",
  "COZINHA",
  "MANUTENCAO",
  "AB",
  "ADMINISTRATIVO"
]);

export const hrWorkflowTypeSchema = z.enum([
  "admission",
  "termination",
  "transfer",
  "promotion",
  "job_position_change",
  "training",
  "vacation",
  "absence",
  "warning",
  "equipment_delivery",
  "general_note",
  "job_opening"
]);

export const hrWorkflowStatusSchema = z.enum([
  "draft",
  "open",
  "in_progress",
  "waiting_approval",
  "returned",
  "completed",
  "cancelled",
  "rejected"
]);

export const hrWorkflowNotificationStatusSchema = z.enum(["pending", "scheduled", "sent", "read", "failed", "cancelled"]);

export const hrWorkflowNotificationChannelSchema = z.enum(["in_app", "email", "whatsapp"]);

export const hrWorkflowAuditActionSchema = z.enum([
  "create_workflow",
  "execute_step",
  "approve_step",
  "reject_step",
  "return_step",
  "cancel_workflow"
]);

export const hrWorkflowAuditRiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const hrWorkflowTemplateTypeSchema = z.enum([
  "admission",
  "termination",
  "transfer",
  "promotion",
  "job_position_change",
  "training",
  "vacation",
  "absence",
  "warning",
  "equipment_delivery",
  "general_note",
  "job_opening",
  "vacation_request",
  "salary_increase",
  "document_request"
]);

export const hrWorkflowDelegationStepTypeSchema = z.enum(["task", "approval", "review", "document", "notification", "escalation"]);

export const hrBackgroundJobTypeSchema = z.enum([
  "sla_scan",
  "escalation_scan",
  "notification_dispatch",
  "audit_cleanup",
  "analytics_refresh",
  "dashboard_refresh"
]);

export const hrBackgroundJobStatusSchema = z.enum(["pending", "scheduled", "running", "completed", "failed", "cancelled", "retrying"]);

export const hrBackgroundJobPrioritySchema = z.enum(["low", "normal", "high", "critical"]);

export const employeeFunctionalEventTypeSchema = z.enum([
  "employee_created",
  "employee_basic_updated",
  "employee_sensitive_updated",
  "unit_changed",
  "department_changed",
  "job_position_changed",
  "document_requested",
  "document_uploaded",
  "document_verified",
  "document_rejected",
  "document_expired",
  "document_replaced",
  "document_waived",
  "admission_started",
  "admission_completed",
  "termination_started",
  "termination_completed",
  "training_registered",
  "warning_registered",
  "vacation_registered",
  "note_added",
  "onboarding_created",
  "onboarding_started",
  "onboarding_item_started",
  "onboarding_item_completed",
  "onboarding_item_blocked",
  "onboarding_item_waived",
  "onboarding_completed",
  "onboarding_cancelled",
  "evaluation_created",
  "evaluation_started",
  "evaluation_submitted",
  "evaluation_reviewed",
  "evaluation_feedback_given",
  "evaluation_acknowledged",
  "evaluation_closed",
  "evaluation_cancelled",
  "development_plan_created",
  "development_plan_item_created",
  "development_plan_item_completed",
  "development_plan_item_overdue",
  "development_plan_reviewed",
  "development_plan_completed",
  "development_plan_cancelled",
  "salary_changed",
  "promotion_registered",
  "transfer_registered",
  "suspension_registered",
  "complaint_registered",
  "compliment_registered",
  "formal_guidance_registered",
  "formal_conversation_registered",
  "training_required",
  "training_completed",
  "training_certificate_uploaded",
  "training_expiring",
  "training_expired",
  "training_retraining_required",
  "aso_requested",
  "aso_completed",
  "aso_expiring",
  "aso_expired",
  "occupational_restriction_registered",
  "occupational_exam_registered",
  "termination_checklist_created",
  "termination_pending_item_registered",
  "employee_inactivated"
]);

const optionalUuidSchema = z.string().uuid("Identificador invalido.").optional().or(emptyToUndefined);

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD.")
  .optional()
  .or(emptyToUndefined);

const optionalDateTimeSchema = z
  .string()
  .trim()
  .datetime({ message: "Use data e hora em formato ISO.", offset: true })
  .optional()
  .or(emptyToUndefined);

const optionalBooleanSchema = z
  .preprocess((value) => (value === "" || value == null ? undefined : value), z.enum(["true", "false", "1", "0"]).optional())
  .transform((value) => (value === undefined ? undefined : value === "true" || value === "1"));

function paginatedNumber(defaultValue: number, maxValue: number) {
  return z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.coerce.number().int().min(1).max(maxValue).default(defaultValue)
  );
}

export const hrIdParamSchema = z.object({
  id: z.string().uuid("Identificador invalido.")
});

export const hrEmployeeListQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  pageSize: paginatedNumber(20, 100),
  search: z
    .string()
    .trim()
    .max(120, "Busca muito longa.")
    .optional()
    .or(emptyToUndefined),
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  jobPositionId: optionalUuidSchema,
  status: hrRecordStatusSchema.optional().or(emptyToUndefined)
});

export const hrDocumentTypesQuerySchema = z.object({
  status: hrRecordStatusSchema.optional().or(emptyToUndefined),
  category: hrDocumentCategorySchema.optional().or(emptyToUndefined),
  unitId: optionalUuidSchema,
  required: optionalBooleanSchema
});

export const hrEmployeeDocumentsQuerySchema = z.object({
  status: employeeDocumentStatusSchema.optional().or(emptyToUndefined),
  documentTypeId: optionalUuidSchema,
  includeSensitive: optionalBooleanSchema
});

export const hrDocumentPendenciesQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  pageSize: paginatedNumber(20, 100),
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  employeeId: optionalUuidSchema,
  type: hrDocumentPendingTypeSchema.optional().or(emptyToUndefined),
  status: employeeDocumentStatusSchema.optional().or(emptyToUndefined),
  dueFrom: optionalDateSchema,
  dueTo: optionalDateSchema
});

export const hrDocumentPendenciesSummaryQuerySchema = z.object({
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema
});

export const hrOnboardingDashboardQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  pageSize: paginatedNumber(20, 100),
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  ownerArea: hrOnboardingOwnerAreaSchema.optional().or(emptyToUndefined),
  status: hrOnboardingStatusSchema.optional().or(emptyToUndefined),
  releaseStatus: hrOnboardingReleaseStatusSchema.optional().or(emptyToUndefined),
  queueType: hrOnboardingQueueTypeSchema.optional().or(emptyToUndefined),
  dueFrom: optionalDateSchema,
  dueTo: optionalDateSchema,
  search: z
    .string()
    .trim()
    .max(120, "Busca muito longa.")
    .optional()
    .or(emptyToUndefined)
});

export const hrOnboardingDashboardSummaryQuerySchema = z.object({
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema
});

const optionalIntegerSchema = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional()
  );

const optionalRuleTextSchema = z
  .string()
  .trim()
  .max(1000, "Texto muito longo.")
  .refine(
    (value) => !/(cpf|rg|ctps|pis|salary|salario|medical|cid|file_path|storage_path|signed_url|document_number)/i.test(value),
    "Texto contem dado sensivel nao permitido."
  )
  .optional()
  .or(emptyToUndefined);

export const hrDocumentRulesQuerySchema = z.object({
  status: hrRecordStatusSchema.optional().or(emptyToUndefined),
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  jobPositionId: optionalUuidSchema,
  documentTypeId: optionalUuidSchema,
  admissionType: z.string().trim().max(60, "Tipo de admissao muito longo.").optional().or(emptyToUndefined)
});

export const hrDocumentRulePayloadSchema = z.object({
  organizationId: optionalUuidSchema,
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  jobPositionId: optionalUuidSchema,
  admissionType: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,60}$/, "Use apenas letras, numeros, hifen ou sublinhado.")
    .optional()
    .or(emptyToUndefined),
  documentTypeId: z.string().uuid("Tipo documental invalido."),
  isRequired: z.boolean().optional().default(true),
  dueDaysAfterAdmission: optionalIntegerSchema(0, 3650),
  recurrenceMonths: optionalIntegerSchema(1, 600),
  priority: optionalIntegerSchema(0, 10000).default(100),
  notes: optionalRuleTextSchema,
  status: hrRecordStatusSchema.optional().default("active")
});

export const hrDocumentRuleUpdateSchema = hrDocumentRulePayloadSchema.partial().extend({
  status: hrRecordStatusSchema.optional()
});

export const hrEmployeeHistoryQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  pageSize: paginatedNumber(20, 100),
  eventType: employeeFunctionalEventTypeSchema.optional().or(emptyToUndefined),
  status: employeeFunctionalEventStatusSchema.optional().or(emptyToUndefined),
  from: optionalDateSchema,
  to: optionalDateSchema,
  includeSensitive: optionalBooleanSchema
});

export const hrWorkflowListQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  page_size: paginatedNumber(20, 100),
  status: hrWorkflowStatusSchema.optional().or(emptyToUndefined),
  workflow_type: hrWorkflowTypeSchema.optional().or(emptyToUndefined),
  employee_id: optionalUuidSchema,
  unit_id: optionalUuidSchema,
  assigned_to: optionalUuidSchema,
  created_by: optionalUuidSchema,
  sensitive: optionalBooleanSchema,
  created_from: optionalDateSchema,
  created_to: optionalDateSchema,
  q: z
    .string()
    .trim()
    .max(120, "Busca muito longa.")
    .optional()
    .or(emptyToUndefined)
});

const optionalMoneySchema = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().min(0, "Valor nao pode ser negativo.").max(9999999999.99, "Valor muito alto.").optional()
);

const safeMovementTextSchema = (max = 3000) =>
  z
    .string()
    .trim()
    .max(max, "Texto muito longo.")
    .refine(
      (value) => !/(cpf|rg|ctps|pis|medical|medico|cid|diagnostico|laudo|file_path|storage_path|signed_url|token|senha|password|auth_email)/i.test(value),
      "Texto contem dado sensivel nao permitido."
    )
    .optional()
    .or(emptyToUndefined);

export const hrMovementsQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  pageSize: paginatedNumber(20, 100),
  employeeId: optionalUuidSchema,
  unitId: optionalUuidSchema,
  departmentId: optionalUuidSchema,
  movementType: employeeMovementTypeSchema.optional().or(emptyToUndefined),
  status: employeeMovementStatusSchema.optional().or(emptyToUndefined),
  from: optionalDateSchema,
  to: optionalDateSchema,
  search: z.string().trim().max(120, "Busca muito longa.").optional().or(emptyToUndefined)
});

export const hrMovementPayloadSchema = z.object({
  employeeId: z.string().uuid("Colaborador invalido."),
  movementType: employeeMovementTypeSchema,
  status: employeeMovementStatusSchema.default("draft"),
  effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD."),
  oldUnitId: optionalUuidSchema,
  newUnitId: optionalUuidSchema,
  oldDepartmentId: optionalUuidSchema,
  newDepartmentId: optionalUuidSchema,
  oldJobPositionId: optionalUuidSchema,
  newJobPositionId: optionalUuidSchema,
  oldSalary: optionalMoneySchema,
  newSalary: optionalMoneySchema,
  reason: z
    .string()
    .trim()
    .min(3, "Informe o motivo da movimentacao.")
    .max(3000, "Motivo muito longo.")
    .refine(
      (value) => !/(cpf|rg|ctps|pis|medical|medico|cid|diagnostico|laudo|file_path|storage_path|signed_url|token|senha|password|auth_email)/i.test(value),
      "Motivo contem dado sensivel nao permitido."
    ),
  notes: safeMovementTextSchema(3000),
  isSensitive: z.boolean().optional(),
  visibilityScope: employeeMovementVisibilityScopeSchema.optional()
});

export const hrMovementDecisionPayloadSchema = z.object({
  comments: z
    .string()
    .trim()
    .max(3000, "Comentario muito longo.")
    .refine(
      (value) => !/(cpf|rg|ctps|pis|medical|medico|cid|diagnostico|laudo|file_path|storage_path|signed_url|token|senha|password|auth_email)/i.test(value),
      "Comentario contem dado sensivel nao permitido."
    )
    .optional()
    .or(emptyToUndefined)
});

export const hrMovementRejectPayloadSchema = hrMovementDecisionPayloadSchema.extend({
  comments: z
    .string()
    .trim()
    .min(3, "Informe o motivo da rejeicao.")
    .max(3000, "Comentario muito longo.")
    .refine(
      (value) => !/(cpf|rg|ctps|pis|medical|medico|cid|diagnostico|laudo|file_path|storage_path|signed_url|token|senha|password|auth_email)/i.test(value),
      "Comentario contem dado sensivel nao permitido."
    )
});

export const hrWorkflowNotificationsQuerySchema = z.object({
  status: hrWorkflowNotificationStatusSchema.optional().or(emptyToUndefined),
  channel: hrWorkflowNotificationChannelSchema.optional().or(emptyToUndefined)
});

export const hrWorkflowDashboardQuerySchema = z.object({
  unit_id: optionalUuidSchema
});

export const hrWorkflowAuditQuerySchema = z.object({
  page: paginatedNumber(1, 100000),
  page_size: paginatedNumber(20, 100),
  workflow_id: optionalUuidSchema,
  action: hrWorkflowAuditActionSchema.optional().or(emptyToUndefined),
  risk_level: hrWorkflowAuditRiskLevelSchema.optional().or(emptyToUndefined),
  actor_user_id: optionalUuidSchema,
  unit_id: optionalUuidSchema,
  from: optionalDateSchema,
  to: optionalDateSchema
});

export const hrWorkflowAnalyticsQuerySchema = z.object({
  unit_id: optionalUuidSchema,
  from: optionalDateSchema,
  to: optionalDateSchema,
  workflow_type: hrWorkflowTypeSchema.optional().or(emptyToUndefined),
  status: hrWorkflowStatusSchema.optional().or(emptyToUndefined)
});

export const hrWorkflowTemplatesQuerySchema = z.object({
  unit_id: optionalUuidSchema,
  workflow_type: hrWorkflowTemplateTypeSchema.optional().or(emptyToUndefined),
  is_active: optionalBooleanSchema,
  include_system: optionalBooleanSchema
});

export const hrWorkflowDelegationsQuerySchema = z.object({
  unit_id: optionalUuidSchema,
  delegator_user_id: optionalUuidSchema,
  delegate_user_id: optionalUuidSchema,
  workflow_type: hrWorkflowTypeSchema.optional().or(emptyToUndefined),
  is_active: optionalBooleanSchema
});

const safeDelegationTextSchema = z
  .string()
  .trim()
  .min(3, "Informe uma justificativa.")
  .max(500, "Texto muito longo.")
  .refine(
    (value) => !/(cpf|rg|salary|medical|cid|file_path|storage_path|signed_url|document_number)/i.test(value),
    "Texto contem campo sensivel nao permitido."
  );

export const hrWorkflowDelegationCreateSchema = z
  .object({
    unit_id: z.string().uuid("Unidade invalida."),
    delegator_user_id: z.string().uuid("Delegador invalido."),
    delegate_user_id: z.string().uuid("Delegado invalido."),
    workflow_type: hrWorkflowTypeSchema.optional().or(emptyToUndefined),
    step_type: hrWorkflowDelegationStepTypeSchema.optional().or(emptyToUndefined),
    starts_at: z.string().trim().datetime({ message: "Use data e hora em formato ISO.", offset: true }),
    ends_at: optionalDateTimeSchema,
    reason: safeDelegationTextSchema
  })
  .refine((value) => value.delegator_user_id !== value.delegate_user_id, {
    message: "Delegado nao pode ser o proprio delegador.",
    path: ["delegate_user_id"]
  })
  .refine((value) => !value.ends_at || value.ends_at >= value.starts_at, {
    message: "Fim da vigencia deve ser maior ou igual ao inicio.",
    path: ["ends_at"]
  });

export const hrWorkflowDelegationRevokeSchema = z.object({
  reason: safeDelegationTextSchema
});

const safeBackgroundJobTextSchema = z
  .string()
  .trim()
  .max(500, "Texto muito longo.")
  .refine(
    (value) => !/(cpf|rg|salary|medical|cid|storage_path|signed_url|document_number)/i.test(value),
    "Texto contem campo sensivel nao permitido."
  );

export const hrBackgroundJobsQuerySchema = z.object({
  unit_id: optionalUuidSchema,
  job_type: hrBackgroundJobTypeSchema.optional().or(emptyToUndefined),
  status: hrBackgroundJobStatusSchema.optional().or(emptyToUndefined),
  priority: hrBackgroundJobPrioritySchema.optional().or(emptyToUndefined),
  from: optionalDateSchema,
  to: optionalDateSchema
});

export const hrBackgroundJobCreateSchema = z
  .object({
    unit_id: z.string().uuid("Unidade invalida."),
    job_type: hrBackgroundJobTypeSchema,
    priority: hrBackgroundJobPrioritySchema.optional().default("normal"),
    status: z.enum(["pending", "scheduled"]).optional().default("pending"),
    payload: z.record(z.unknown()).optional(),
    scheduled_at: optionalDateTimeSchema,
    correlation_id: safeBackgroundJobTextSchema.optional().or(emptyToUndefined),
    max_attempts: z.coerce.number().int().min(1).max(10).optional().default(3)
  })
  .refine((value) => value.status !== "scheduled" || Boolean(value.scheduled_at), {
    message: "scheduled_at e obrigatorio para jobs agendados.",
    path: ["scheduled_at"]
  });

export function parseSearchParams<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
