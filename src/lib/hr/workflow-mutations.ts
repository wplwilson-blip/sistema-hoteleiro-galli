import "server-only";

import { createHash } from "crypto";
import { z } from "zod";
import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import type { HrRequestContext } from "@/lib/hr/api-auth";
import { HR_WORKFLOW_TYPES, isWorkflowTypeSensitive, type HrWorkflowType } from "@/lib/hr/workflow-types";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Chave de idempotencia invalida.")
  .max(160, "Chave de idempotencia muito longa.")
  .regex(/^[A-Za-z0-9._:-]+$/, "Chave de idempotencia contem caracteres invalidos.");

const prioritySchema = z.enum(["low", "normal", "high", "critical"]);
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use datas no formato YYYY-MM-DD.");
const uuidSchema = z.string().trim().uuid("Identificador invalido.");
const stepKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_.-]{2,80}$/, "Chave da etapa invalida.");

const forbiddenPayloadFragments = [
  "file_path",
  "signed_url",
  "signedurl",
  "storage_path",
  "download_url",
  "public_url",
  "document_number",
  "salary",
  "medical",
  "createsignedurl"
];

const forbiddenPayloadTokens = [/(\b|[^a-z0-9_])cpf([^a-z0-9_]|\b)/i, /(\b|[^a-z0-9_])rg([^a-z0-9_]|\b)/i, /(\b|[^a-z0-9_])cid([^a-z0-9_]|\b)/i];

function optionalText(max: number) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().trim().min(1, "Campo obrigatorio invalido.").max(max, "Campo muito longo.").optional()
  );
}

function optionalBoolean() {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), z.boolean().optional());
}

function optionalDate() {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), dateSchema.optional());
}

function optionalUuid() {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), uuidSchema.optional());
}

function stripUndefinedValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function metadataSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict().transform(stripUndefinedValues);
}

const workflowMetadataSchemas = {
  admission: metadataSchema({
    admission_date: optionalDate(),
    job_position: optionalText(160),
    department: optionalText(160),
    contract_type: optionalText(80),
    notes: optionalText(500)
  }),
  termination: metadataSchema({
    effective_date: optionalDate(),
    termination_type: optionalText(80),
    reason_summary: optionalText(500),
    requires_director_approval: optionalBoolean()
  }),
  transfer: metadataSchema({
    from_unit_id: optionalUuid(),
    to_unit_id: optionalUuid(),
    effective_date: optionalDate(),
    new_department: optionalText(160),
    reason_summary: optionalText(500)
  }),
  promotion: metadataSchema({
    current_position: optionalText(160),
    proposed_position: optionalText(160),
    effective_date: optionalDate(),
    justification: optionalText(500),
    requires_director_approval: optionalBoolean()
  }),
  job_position_change: metadataSchema({
    current_position: optionalText(160),
    new_position: optionalText(160),
    effective_date: optionalDate(),
    change_reason: optionalText(500),
    notes: optionalText(500)
  }),
  training: metadataSchema({
    training_name: optionalText(160),
    provider: optionalText(160),
    planned_date: optionalDate(),
    completed_date: optionalDate(),
    certificate_required: optionalBoolean(),
    training_category: optionalText(80)
  }),
  vacation: metadataSchema({
    start_date: optionalDate(),
    end_date: optionalDate(),
    days: z.preprocess((value) => (value === "" || value === null ? undefined : value), z.number().int().min(1).max(365).optional()),
    coverage_notes: optionalText(500),
    manager_approval_required: optionalBoolean()
  }),
  absence: metadataSchema({
    absence_start: optionalDate(),
    absence_end: optionalDate(),
    absence_type: optionalText(100),
    requires_document_review: optionalBoolean(),
    reason_summary: optionalText(500)
  }),
  warning: metadataSchema({
    warning_date: optionalDate(),
    warning_type: optionalText(100),
    reason_summary: optionalText(500),
    policy_reference: optionalText(160),
    formal_acknowledgement_required: optionalBoolean()
  }),
  equipment_delivery: metadataSchema({
    equipment_type: optionalText(120),
    asset_tag: optionalText(120),
    delivery_date: optionalDate(),
    return_required: optionalBoolean(),
    condition: optionalText(120)
  }),
  general_note: metadataSchema({
    note_category: optionalText(120),
    summary: optionalText(500),
    requires_follow_up: optionalBoolean()
  })
} satisfies Record<HrWorkflowType, z.ZodType<Record<string, unknown>>>;

const createWorkflowStepSchema = z
  .object({
    step_key: stepKeySchema,
    title: z.string().trim().min(1, "Titulo da etapa obrigatorio.").max(180, "Titulo da etapa muito longo."),
    step_order: z.number().int().min(1, "Ordem da etapa invalida.").max(999_999_999, "Ordem da etapa invalida."),
    requires_approval: z.boolean().optional().default(false),
    assigned_to_user_id: z.preprocess((value) => (value === "" || value === null ? undefined : value), uuidSchema.optional())
  })
  .strict();

export const createWorkflowPayloadSchema = z
  .object({
    workflow_type: z.enum(HR_WORKFLOW_TYPES),
    title: z.string().trim().min(1, "Titulo do workflow obrigatorio.").max(180, "Titulo do workflow muito longo."),
    description: optionalText(2000),
    employee_id: z.preprocess((value) => (value === "" || value === null ? undefined : value), uuidSchema.optional()),
    unit_id: z.preprocess((value) => (value === "" || value === null ? undefined : value), uuidSchema.optional()),
    priority: prioritySchema.optional().default("normal"),
    metadata: z.record(z.unknown()).optional().default({}),
    steps: z.array(createWorkflowStepSchema).min(1, "Informe ao menos uma etapa.").max(20, "O workflow aceita no maximo 20 etapas."),
    idempotency_key: idempotencyKeySchema.optional()
  })
  .strict();

export type CreateWorkflowInput = Omit<z.infer<typeof createWorkflowPayloadSchema>, "metadata" | "steps"> & {
  metadata: Record<string, unknown>;
  steps: Array<z.infer<typeof createWorkflowStepSchema>>;
};

export type CreateWorkflowRpcResult = {
  ok: boolean;
  action?: string;
  workflow_id?: string;
  workflow_status?: string;
  current_step_id?: string;
  error_code?: string;
  message?: string;
  retryable?: boolean;
  idempotency?: {
    status?: string;
    replayed?: boolean;
  };
};

export class HrWorkflowMutationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "HrWorkflowMutationError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNoForbiddenPayload(value: unknown) {
  const serialized = JSON.stringify(value ?? {});
  const lowered = serialized.toLowerCase();

  if (forbiddenPayloadFragments.some((fragment) => lowered.includes(fragment))) {
    throw new HrWorkflowMutationError("LGPD_PAYLOAD_DENIED", "Payload contem campos proibidos para workflows de RH.", 422);
  }

  if (forbiddenPayloadTokens.some((pattern) => pattern.test(serialized))) {
    throw new HrWorkflowMutationError("LGPD_PAYLOAD_DENIED", "Payload contem campos proibidos para workflows de RH.", 422);
  }
}

function assertWorkflowTypeAllowed(raw: unknown) {
  if (!isRecord(raw) || typeof raw.workflow_type !== "string") {
    return;
  }

  if (!HR_WORKFLOW_TYPES.includes(raw.workflow_type as HrWorkflowType)) {
    throw new HrWorkflowMutationError("WORKFLOW_TYPE_NOT_ALLOWED", "Tipo de workflow nao permitido.", 422);
  }
}

function parseWorkflowMetadata(workflowType: HrWorkflowType, metadata: Record<string, unknown>) {
  try {
    return workflowMetadataSchemas[workflowType].parse(metadata);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HrWorkflowMutationError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Metadata invalida.", 422);
    }

    throw error;
  }
}

function assertUniqueSteps(steps: CreateWorkflowInput["steps"]) {
  const orders = new Set<number>();
  const keys = new Set<string>();

  for (const step of steps) {
    if (orders.has(step.step_order) || keys.has(step.step_key)) {
      throw new HrWorkflowMutationError("INVALID_PAYLOAD", "Steps contem ordem ou chave duplicada.", 422);
    }

    orders.add(step.step_order);
    keys.add(step.step_key);
  }

  if (!orders.has(1)) {
    throw new HrWorkflowMutationError("INVALID_PAYLOAD", "A primeira etapa deve ter step_order 1.", 422);
  }
}

function normalizeWorkflowPayload(payload: z.infer<typeof createWorkflowPayloadSchema>): CreateWorkflowInput {
  const metadata = parseWorkflowMetadata(payload.workflow_type, payload.metadata);
  const steps = payload.steps
    .map((step) => ({
      step_key: step.step_key,
      title: step.title,
      step_order: step.step_order,
      requires_approval: step.requires_approval,
      assigned_to_user_id: step.assigned_to_user_id
    }))
    .sort((left, right) => left.step_order - right.step_order);

  assertUniqueSteps(steps);

  return {
    ...payload,
    description: payload.description,
    employee_id: payload.employee_id,
    unit_id: payload.unit_id,
    metadata,
    steps
  };
}

export function parseCreateWorkflowPayload(raw: unknown) {
  assertNoForbiddenPayload(raw);
  assertWorkflowTypeAllowed(raw);

  try {
    return normalizeWorkflowPayload(createWorkflowPayloadSchema.parse(raw));
  } catch (error) {
    if (error instanceof HrWorkflowMutationError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new HrWorkflowMutationError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    throw error;
  }
}

export function getCreateWorkflowIdempotencyKey(request: Request, payload: Pick<CreateWorkflowInput, "idempotency_key">) {
  const headerKey = request.headers.get("Idempotency-Key") ?? request.headers.get("X-Idempotency-Key");
  const bodyKey = payload.idempotency_key;

  if (headerKey && bodyKey && headerKey.trim() !== bodyKey.trim()) {
    throw new HrWorkflowMutationError("INVALID_PAYLOAD", "Chaves de idempotencia divergentes.", 400);
  }

  const idempotencyKey = (headerKey ?? bodyKey ?? "").trim();

  if (!idempotencyKey) {
    throw new HrWorkflowMutationError("INVALID_PAYLOAD", "Informe o header Idempotency-Key para criar workflow.", 400);
  }

  try {
    return idempotencyKeySchema.parse(idempotencyKey);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HrWorkflowMutationError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Chave de idempotencia invalida.", 400);
    }

    throw error;
  }
}

export function assertCreateWorkflowEmployeeRequirement(input: Pick<CreateWorkflowInput, "workflow_type" | "employee_id">) {
  if (!input.employee_id && !["admission", "training", "general_note"].includes(input.workflow_type)) {
    throw new HrWorkflowMutationError("WORKFLOW_EMPLOYEE_REQUIRED", "Colaborador obrigatorio para este tipo de workflow.", 422);
  }
}

export function assertSensitiveWorkflowCreateAllowed(input: {
  workflowType: HrWorkflowType;
  unitId: string;
  sensitiveUnitIds: string[];
  isSuperAdmin: boolean;
}) {
  if (!isWorkflowTypeSensitive(input.workflowType)) {
    return;
  }

  if (input.isSuperAdmin || input.sensitiveUnitIds.includes(input.unitId)) {
    return;
  }

  throw new HrWorkflowMutationError("FORBIDDEN", "Voce nao tem permissao para criar workflows sensiveis nesta unidade.", 403);
}

export function buildCreateWorkflowRpcPayload(payload: CreateWorkflowInput): Record<string, JsonValue> {
  return {
    workflow_type: payload.workflow_type,
    title: payload.title,
    description: payload.description ?? null,
    employee_id: payload.employee_id ?? null,
    priority: payload.priority,
    metadata: payload.metadata as Record<string, JsonValue>,
    steps: payload.steps.map((step) => ({
      step_key: step.step_key,
      title: step.title,
      step_order: step.step_order,
      requires_approval: step.requires_approval,
      assigned_to_user_id: step.assigned_to_user_id ?? null
    }))
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      const entryValue = value[key];
      if (entryValue !== undefined) {
        accumulator[key] = canonicalize(entryValue);
      }
      return accumulator;
    }, {});
}

export function createWorkflowRequestHash(input: {
  organizationId: string;
  unitId: string;
  payload: Record<string, JsonValue>;
}) {
  const canonicalPayload = JSON.stringify(
    canonicalize({
      action: "create_workflow",
      organization_id: input.organizationId,
      unit_id: input.unitId,
      payload: input.payload
    })
  );

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export async function applyCreateWorkflowRpc(input: {
  supabase: SupabaseAdmin;
  context: HrRequestContext;
  organizationId: string;
  unitId: string;
  idempotencyKey: string;
  requestHash: string;
  payload: Record<string, JsonValue>;
}) {
  const { data, error } = await input.supabase.rpc("hr_workflow_apply_action", {
    p_action: "create_workflow",
    p_organization_id: input.organizationId,
    p_unit_id: input.unitId,
    p_actor_user_id: input.context.session.user.id,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_payload: input.payload,
    p_workflow_id: null,
    p_step_id: null
  });

  if (error) {
    throw new HrWorkflowMutationError("INTERNAL_ERROR", "Nao foi possivel executar a engine de workflow.", 500);
  }

  return data as CreateWorkflowRpcResult;
}

export function mapWorkflowRpcError(result: CreateWorkflowRpcResult) {
  const code = result.error_code ?? "INTERNAL_ERROR";
  const message = result.message ?? "Nao foi possivel criar workflow.";
  const statusByCode: Record<string, number> = {
    INVALID_ACTION: 400,
    INVALID_PAYLOAD: 422,
    LGPD_PAYLOAD_DENIED: 422,
    IDEMPOTENCY_CONFLICT: 409,
    REQUEST_ALREADY_PROCESSING: 409,
    WORKFLOW_TYPE_NOT_ALLOWED: 422,
    WORKFLOW_EMPLOYEE_REQUIRED: 422,
    INTERNAL_ERROR: 500
  };

  return new HrWorkflowMutationError(code, message, statusByCode[code] ?? 500);
}
