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

export const employeeFunctionalEventStatusSchema = z.enum(["active", "cancelled", "corrected"]);

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
  "general_note"
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
  "note_added"
]);

const optionalUuidSchema = z.string().uuid("Identificador invalido.").optional().or(emptyToUndefined);

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD.")
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

export const hrWorkflowNotificationsQuerySchema = z.object({
  status: hrWorkflowNotificationStatusSchema.optional().or(emptyToUndefined),
  channel: hrWorkflowNotificationChannelSchema.optional().or(emptyToUndefined)
});

export const hrWorkflowDashboardQuerySchema = z.object({
  unit_id: optionalUuidSchema
});

export function parseSearchParams<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}
