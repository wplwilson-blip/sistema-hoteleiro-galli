import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_SELECT,
  HR_WORKFLOW_STEP_SELECT,
  type HrWorkflowRow,
  type HrWorkflowStepRow
} from "@/lib/hr/workflow-data";

export const HR_WORKFLOW_AUDIT_SELECT =
  "id, organization_id, unit_id, workflow_id, step_id, event_id, actor_user_id, action, entity_type, entity_id, previous_state, new_state, metadata, risk_level, ip_address, user_agent, request_id, correlation_id, created_at";

export type HrWorkflowAuditAction =
  | "create_workflow"
  | "execute_step"
  | "approve_step"
  | "reject_step"
  | "return_step"
  | "cancel_workflow";

export type HrWorkflowAuditRiskLevel = "low" | "medium" | "high" | "critical";
export type HrWorkflowAuditEntityType = "workflow" | "step" | "event" | "notification";

export type HrWorkflowAuditLogRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string | null;
  step_id: string | null;
  event_id: string | null;
  actor_user_id: string | null;
  action: HrWorkflowAuditAction;
  entity_type: HrWorkflowAuditEntityType;
  entity_id: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  risk_level: HrWorkflowAuditRiskLevel;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  correlation_id: string | null;
  created_at: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const workflowAuditRiskByAction: Record<HrWorkflowAuditAction, HrWorkflowAuditRiskLevel> = {
  create_workflow: "low",
  execute_step: "medium",
  approve_step: "medium",
  reject_step: "high",
  return_step: "medium",
  cancel_workflow: "critical"
};

const safeWorkflowStateKeys = [
  "id",
  "organization_id",
  "unit_id",
  "employee_id",
  "workflow_type",
  "status",
  "priority",
  "visibility_scope",
  "is_sensitive",
  "responsible_user_id",
  "due_at",
  "sla_due_at",
  "sla_status",
  "sla_breached_at",
  "sla_minutes",
  "escalation_enabled",
  "escalation_level",
  "escalation_count",
  "escalation_max_level",
  "started_at",
  "completed_at",
  "completed_by",
  "cancelled_at",
  "cancelled_by",
  "created_at",
  "updated_at"
] as const;

const safeStepStateKeys = [
  "id",
  "organization_id",
  "unit_id",
  "workflow_id",
  "employee_id",
  "step_order",
  "step_code",
  "status",
  "requires_approval",
  "visibility_scope",
  "is_sensitive",
  "assigned_to_user_id",
  "assigned_at",
  "due_at",
  "sla_due_at",
  "sla_status",
  "sla_breached_at",
  "sla_minutes",
  "escalation_enabled",
  "escalation_level",
  "started_at",
  "completed_at",
  "completed_by",
  "approved_at",
  "approved_by",
  "returned_at",
  "returned_by",
  "created_at",
  "updated_at"
] as const;

const safeMetadataKeys = new Set([
  "action",
  "entity_type",
  "idempotency_key",
  "idempotency_replayed",
  "workflow_status",
  "step_status",
  "reason_present",
  "notes_present",
  "delegation_id",
  "delegated_action",
  "delegator_user_id",
  "delegate_user_id",
  "source",
  "request_method",
  "request_path"
]);

const blockedKeyPattern =
  /(^|_)(cpf|rg|cid|salary|medical|file_path|storage_path|signed_url|signedurl|download_url|public_url|document_number)($|_)/i;

function isSafeValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isSafeValue);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).every(
    ([key, entryValue]) => !blockedKeyPattern.test(key) && isSafeValue(entryValue)
  );
}

function pickSafeState<T extends Record<string, unknown>>(source: T | null | undefined, keys: readonly string[]) {
  if (!source) return null;

  const result: Record<string, JsonValue> = {};

  for (const key of keys) {
    if (blockedKeyPattern.test(key)) continue;
    const value = source[key];
    if (value === undefined || !isSafeValue(value)) continue;
    result[key] = value;
  }

  return result;
}

export function buildWorkflowAuditState(workflow: HrWorkflowRow | null | undefined) {
  return pickSafeState(workflow as unknown as Record<string, unknown>, safeWorkflowStateKeys);
}

export function buildWorkflowStepAuditState(step: HrWorkflowStepRow | null | undefined) {
  return pickSafeState(step as unknown as Record<string, unknown>, safeStepStateKeys);
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined) {
  const result: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (!safeMetadataKeys.has(key) || blockedKeyPattern.test(key) || !isSafeValue(value)) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function sanitizeSafeRecord(value: Record<string, unknown> | null | undefined) {
  const result: Record<string, JsonValue> = {};

  for (const [key, entryValue] of Object.entries(value ?? {})) {
    if (blockedKeyPattern.test(key) || !isSafeValue(entryValue)) {
      continue;
    }

    result[key] = entryValue;
  }

  return result;
}

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value.slice(0, 500);
  }

  return null;
}

function extractIpAddress(headers: Headers) {
  const forwarded = firstHeader(headers, ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]);
  if (!forwarded) return null;

  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

export function buildAuditRequestContext(request: Request) {
  return {
    ipAddress: extractIpAddress(request.headers),
    userAgent: firstHeader(request.headers, ["user-agent"]),
    requestId: firstHeader(request.headers, ["x-request-id", "request-id"]),
    correlationId: firstHeader(request.headers, ["x-correlation-id", "correlation-id"])
  };
}

export async function loadWorkflowAuditSnapshot(input: {
  supabase: SupabaseAdmin;
  workflowId: string;
  stepId?: string | null;
}) {
  const [workflowResult, stepResult] = await Promise.all([
    input.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT)
      .eq("id", input.workflowId)
      .is("deleted_at", null)
      .limit(1),
    input.stepId
      ? input.supabase
          .from("hr_workflow_steps")
          .select(HR_WORKFLOW_STEP_SELECT)
          .eq("id", input.stepId)
          .is("deleted_at", null)
          .limit(1)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (workflowResult.error) {
    logHrApiError("workflow_audit.workflow_snapshot_failed", workflowResult.error);
    throw new Error("Nao foi possivel carregar snapshot de auditoria do workflow.");
  }

  if (stepResult.error) {
    logHrApiError("workflow_audit.step_snapshot_failed", stepResult.error);
    throw new Error("Nao foi possivel carregar snapshot de auditoria da etapa.");
  }

  return {
    workflow: (workflowResult.data?.[0] ?? null) as HrWorkflowRow | null,
    step: (stepResult.data?.[0] ?? null) as HrWorkflowStepRow | null
  };
}

export async function recordWorkflowAuditLog(input: {
  context: HrRequestContext;
  request: Request;
  action: HrWorkflowAuditAction;
  workflow: HrWorkflowRow;
  step?: HrWorkflowStepRow | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  const requestContext = buildAuditRequestContext(input.request);
  const entityType: HrWorkflowAuditEntityType = input.step ? "step" : "workflow";
  const entityId = input.step?.id ?? input.workflow.id;

  const { error } = await input.context.supabase.from("hr_workflow_audit_logs").insert({
    organization_id: input.workflow.organization_id,
    unit_id: input.workflow.unit_id,
    workflow_id: input.workflow.id,
    step_id: input.step?.id ?? null,
    actor_user_id: input.context.session.user.id,
    action: input.action,
    entity_type: entityType,
    entity_id: entityId,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    metadata: sanitizeMetadata({
      ...(input.metadata ?? {}),
      action: input.action,
      entity_type: entityType
    }),
    risk_level: workflowAuditRiskByAction[input.action],
    ip_address: requestContext.ipAddress,
    user_agent: requestContext.userAgent,
    request_id: requestContext.requestId,
    correlation_id: requestContext.correlationId
  });

  if (error) {
    logHrApiError("workflow_audit.insert_failed", error);
    throw new Error("Nao foi possivel registrar a auditoria do workflow.");
  }
}

export function redactWorkflowAuditLog(log: HrWorkflowAuditLogRow) {
  return {
    id: log.id,
    organization_id: log.organization_id,
    unit_id: log.unit_id,
    workflow_id: log.workflow_id,
    step_id: log.step_id,
    event_id: log.event_id,
    actor_user_id: log.actor_user_id,
    action: log.action,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    previous_state: sanitizeSafeRecord(log.previous_state),
    new_state: sanitizeSafeRecord(log.new_state),
    metadata: sanitizeMetadata(log.metadata),
    risk_level: log.risk_level,
    ip_address: log.ip_address,
    user_agent: log.user_agent,
    request_id: log.request_id,
    correlation_id: log.correlation_id,
    created_at: log.created_at
  };
}

export async function loadWorkflowAuditLogs(input: {
  supabase: SupabaseAdmin;
  unitIds: string[];
  isSuperAdmin: boolean;
  workflowId?: string;
  action?: HrWorkflowAuditAction;
  riskLevel?: HrWorkflowAuditRiskLevel;
  actorUserId?: string;
  unitId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}) {
  if (!input.isSuperAdmin && !input.unitIds.length) {
    return { rows: [], total: 0 };
  }

  let query = input.supabase
    .from("hr_workflow_audit_logs")
    .select(HR_WORKFLOW_AUDIT_SELECT, { count: "exact" });

  if (input.unitId) {
    query = query.eq("unit_id", input.unitId);
  } else if (!input.isSuperAdmin) {
    query = query.in("unit_id", input.unitIds);
  }

  if (input.workflowId) query = query.eq("workflow_id", input.workflowId);
  if (input.action) query = query.eq("action", input.action);
  if (input.riskLevel) query = query.eq("risk_level", input.riskLevel);
  if (input.actorUserId) query = query.eq("actor_user_id", input.actorUserId);
  if (input.from) query = query.gte("created_at", `${input.from}T00:00:00.000Z`);
  if (input.to) query = query.lte("created_at", `${input.to}T23:59:59.999Z`);

  const fromIndex = (input.page - 1) * input.pageSize;
  const toIndex = fromIndex + input.pageSize - 1;
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(fromIndex, toIndex);

  if (error) {
    logHrApiError("workflow_audit.lookup_failed", error);
    throw new Error("Nao foi possivel carregar a auditoria de workflows.");
  }

  return {
    rows: (data ?? []) as HrWorkflowAuditLogRow[],
    total: count ?? 0
  };
}
