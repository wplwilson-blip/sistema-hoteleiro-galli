import { z } from "zod";

const emptyToUndefined = z.literal("").transform(() => undefined);

export const optionalEvaluationUuidSchema = z.string().uuid("Identificador invalido.").optional().or(emptyToUndefined);

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

const optionalIntegerSchema = (min: number, max: number) =>
  z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().int().min(min).max(max).optional());

const optionalNumberSchema = (min: number, max: number) =>
  z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().min(min).max(max).optional());

const pageNumber = (defaultValue: number, maxValue: number) =>
  z.preprocess((value) => (value === "" || value == null ? undefined : value), z.coerce.number().int().min(1).max(maxValue).default(defaultValue));

const safeText = (max = 3000) =>
  z
    .string()
    .trim()
    .max(max, "Texto muito longo.")
    .refine(
      (value) => !/(cpf|rg|ctps|pis|salary|salario|medical|cid|file_path|storage_path|signed_url|document_number)/i.test(value),
      "Texto contem dado sensivel nao permitido."
    )
    .optional()
    .or(emptyToUndefined);

export const hrEvaluationTypeSchema = z.enum(["experience", "periodic", "promotion", "corrective", "specific"]);
export const hrEvaluationTemplateStatusSchema = z.enum(["draft", "active", "inactive", "archived"]);
export const hrEvaluationDefaultFrequencySchema = z.enum(["experience_45_days", "experience_90_days", "semiannual", "annual", "on_demand"]);
export const employeeEvaluationStatusSchema = z.enum([
  "draft",
  "in_progress",
  "submitted",
  "reviewed",
  "feedback_given",
  "acknowledged",
  "closed",
  "cancelled"
]);
export const employeeEvaluationResultLevelSchema = z.enum(["critical", "below_expected", "expected", "above_expected", "excellent"]);
export const employeeDevelopmentPlanStatusSchema = z.enum(["open", "in_progress", "under_review", "completed", "cancelled"]);
export const employeeDevelopmentPlanItemStatusSchema = z.enum(["pending", "in_progress", "completed", "waived", "overdue", "cancelled"]);
export const employeeDevelopmentPlanActionTypeSchema = z.enum([
  "training",
  "coaching",
  "observation",
  "procedure_review",
  "operational_practice",
  "other"
]);
export const hrEvaluationVisibilityScopeSchema = z.enum(["restricted", "unit", "organization"]);

export const evaluationTemplatesQuerySchema = z.object({
  unitId: optionalEvaluationUuidSchema,
  departmentId: optionalEvaluationUuidSchema,
  jobPositionId: optionalEvaluationUuidSchema,
  evaluationType: hrEvaluationTypeSchema.optional().or(emptyToUndefined),
  status: hrEvaluationTemplateStatusSchema.optional().or(emptyToUndefined),
  search: z.string().trim().max(120, "Busca muito longa.").optional().or(emptyToUndefined)
});

export const evaluationTemplatePayloadSchema = z.object({
  organizationId: optionalEvaluationUuidSchema,
  unitId: optionalEvaluationUuidSchema,
  departmentId: optionalEvaluationUuidSchema,
  jobPositionId: optionalEvaluationUuidSchema,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/, "Codigo invalido."),
  name: z.string().trim().min(3, "Informe o nome do modelo.").max(160, "Nome muito longo."),
  description: safeText(2000),
  evaluationType: hrEvaluationTypeSchema.default("periodic"),
  status: hrEvaluationTemplateStatusSchema.default("draft"),
  scaleMin: optionalIntegerSchema(0, 100).default(1),
  scaleMax: optionalIntegerSchema(1, 100).default(5),
  passingScore: optionalNumberSchema(0, 100),
  requiresFeedback: z.boolean().default(true),
  requiresEmployeeAcknowledgement: z.boolean().default(true),
  defaultFrequency: hrEvaluationDefaultFrequencySchema.optional().or(emptyToUndefined),
  isSystemDefault: z.boolean().default(false)
});

export const evaluationTemplateSectionPayloadSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/, "Codigo invalido."),
  title: z.string().trim().min(3, "Informe o titulo da secao.").max(160, "Titulo muito longo."),
  description: safeText(2000),
  weight: optionalNumberSchema(0, 1000).default(1),
  sortOrder: optionalIntegerSchema(0, 10000).default(0),
  appliesToAll: z.boolean().default(true),
  isRequired: z.boolean().default(true),
  status: z.enum(["active", "inactive", "archived"]).default("active")
});

export const evaluationTemplateCriterionPayloadSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,80}$/, "Codigo invalido."),
  title: z.string().trim().min(3, "Informe o titulo do criterio.").max(160, "Titulo muito longo."),
  description: safeText(2000),
  expectedBehavior: safeText(3000),
  weight: optionalNumberSchema(0, 1000).default(1),
  sortOrder: optionalIntegerSchema(0, 10000).default(0),
  isRequired: z.boolean().default(true),
  isCritical: z.boolean().default(false),
  requiresCommentBelowScore: z.boolean().default(false),
  commentRequiredScoreThreshold: optionalNumberSchema(0, 100),
  appliesToJobPositionId: optionalEvaluationUuidSchema,
  appliesToDepartmentId: optionalEvaluationUuidSchema,
  status: z.enum(["active", "inactive", "archived"]).default("active")
});

export const employeeEvaluationsQuerySchema = z.object({
  page: pageNumber(1, 100000),
  pageSize: pageNumber(20, 100),
  unitId: optionalEvaluationUuidSchema,
  employeeId: optionalEvaluationUuidSchema,
  evaluatorUserId: optionalEvaluationUuidSchema,
  evaluationType: hrEvaluationTypeSchema.optional().or(emptyToUndefined),
  status: employeeEvaluationStatusSchema.optional().or(emptyToUndefined),
  resultLevel: employeeEvaluationResultLevelSchema.optional().or(emptyToUndefined),
  periodFrom: optionalDateSchema,
  periodTo: optionalDateSchema,
  search: z.string().trim().max(120, "Busca muito longa.").optional().or(emptyToUndefined)
});

export const employeeEvaluationCreateSchema = z.object({
  employeeId: z.string().uuid("Colaborador invalido."),
  templateId: z.string().uuid("Modelo invalido."),
  evaluatorUserId: optionalEvaluationUuidSchema,
  reviewerUserId: optionalEvaluationUuidSchema,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD."),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD."),
  evaluationDate: optionalDateSchema,
  status: z.enum(["draft", "in_progress"]).default("draft"),
  summary: safeText(5000),
  strengths: safeText(5000),
  developmentPoints: safeText(5000)
});

export const employeeEvaluationUpdateSchema = z.object({
  reviewerUserId: optionalEvaluationUuidSchema,
  evaluationDate: optionalDateSchema,
  feedbackDate: optionalDateSchema,
  status: employeeEvaluationStatusSchema.optional(),
  resultLabel: z.string().trim().max(120, "Resultado muito longo.").optional().or(emptyToUndefined),
  resultLevel: employeeEvaluationResultLevelSchema.optional().or(emptyToUndefined),
  summary: safeText(5000),
  strengths: safeText(5000),
  developmentPoints: safeText(5000),
  employeeComments: safeText(5000),
  employeeAcknowledgedAt: optionalDateTimeSchema,
  reviewedAt: optionalDateTimeSchema,
  closedAt: optionalDateTimeSchema,
  visibilityScope: hrEvaluationVisibilityScopeSchema.optional(),
  isSensitive: z.boolean().optional()
});

export const employeeEvaluationScoresPayloadSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.string().uuid("Criterio invalido."),
        sectionId: z.string().uuid("Secao invalida."),
        score: optionalNumberSchema(0, 100),
        isNotApplicable: z.boolean().default(false),
        comment: safeText(3000),
        evidenceNote: safeText(3000)
      })
    )
    .min(1, "Informe ao menos uma nota.")
    .max(200, "Quantidade de criterios muito alta.")
});

export const developmentPlansQuerySchema = z.object({
  page: pageNumber(1, 100000),
  pageSize: pageNumber(20, 100),
  unitId: optionalEvaluationUuidSchema,
  employeeId: optionalEvaluationUuidSchema,
  evaluationId: optionalEvaluationUuidSchema,
  status: employeeDevelopmentPlanStatusSchema.optional().or(emptyToUndefined),
  dueFrom: optionalDateSchema,
  dueTo: optionalDateSchema,
  search: z.string().trim().max(120, "Busca muito longa.").optional().or(emptyToUndefined)
});

export const developmentPlanPayloadSchema = z.object({
  employeeId: z.string().uuid("Colaborador invalido."),
  evaluationId: optionalEvaluationUuidSchema,
  title: z.string().trim().min(3, "Informe o titulo do PDI.").max(160, "Titulo muito longo."),
  reason: safeText(3000),
  status: employeeDevelopmentPlanStatusSchema.default("open"),
  openedAt: optionalDateTimeSchema,
  dueAt: optionalDateTimeSchema,
  reviewAt: optionalDateTimeSchema,
  closedAt: optionalDateTimeSchema,
  responsibleUserId: optionalEvaluationUuidSchema,
  visibilityScope: hrEvaluationVisibilityScopeSchema.default("restricted"),
  isSensitive: z.boolean().default(true)
});

export const developmentPlanItemPayloadSchema = z.object({
  title: z.string().trim().min(3, "Informe o titulo da acao.").max(160, "Titulo muito longo."),
  description: safeText(3000),
  actionType: employeeDevelopmentPlanActionTypeSchema.default("other"),
  dueAt: optionalDateTimeSchema,
  responsibleUserId: optionalEvaluationUuidSchema,
  status: employeeDevelopmentPlanItemStatusSchema.default("pending"),
  completionNotes: safeText(3000),
  completedAt: optionalDateTimeSchema
});
