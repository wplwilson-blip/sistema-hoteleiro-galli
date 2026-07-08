import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";

export const HR_BACKGROUND_JOB_SELECT =
  "id, organization_id, unit_id, job_type, status, priority, payload, result, attempts, max_attempts, scheduled_at, started_at, finished_at, failed_at, failure_reason, locked_at, locked_by, correlation_id, created_by, created_at, updated_at";

export type HrBackgroundJobStatus = "pending" | "scheduled" | "running" | "completed" | "failed" | "cancelled" | "retrying";
export type HrBackgroundJobType =
  | "sla_scan"
  | "escalation_scan"
  | "notification_dispatch"
  | "audit_cleanup"
  | "analytics_refresh"
  | "dashboard_refresh"
  | "training_expiration_scan"
  | "occupational_expiration_scan";
export type HrBackgroundJobPriority = "low" | "normal" | "high" | "critical";

export type HrBackgroundJobRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  job_type: HrBackgroundJobType;
  status: HrBackgroundJobStatus;
  priority: HrBackgroundJobPriority;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  attempts: number | string;
  max_attempts: number | string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  locked_at: string | null;
  locked_by: string | null;
  correlation_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrBackgroundJobsScope = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  unitId?: string;
  jobType?: HrBackgroundJobType;
  status?: HrBackgroundJobStatus;
  priority?: HrBackgroundJobPriority;
  from?: string;
  to?: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const blockedKeyPattern =
  /(^|_)(cpf|rg|cid|salary|medical|file_path|storage_path|signed_url|signedurl|download_url|public_url|document_number)($|_)/i;

const safePayloadKeys = new Set([
  "workflow_id",
  "step_id",
  "event_id",
  "notification_id",
  "workflow_type",
  "job_scope",
  "action",
  "status",
  "priority",
  "summary",
  "from",
  "to",
  "reason_code",
  "requested_by",
  "source",
  "training_scope",
  "occupational_scope",
  "expired_count",
  "expiring_count",
  "retraining_count",
  "processed_count",
  "aso_expiring_count",
  "aso_expired_count",
  "nr_expiring_count",
  "nr_expired_count",
  "restriction_count"
]);

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSafeValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isSafeValue);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).every(([key, entryValue]) => {
    return !blockedKeyPattern.test(key) && isSafeValue(entryValue);
  });
}

export function sanitizeBackgroundJobPayload(payload: Record<string, unknown> | null | undefined) {
  const result: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (!safePayloadKeys.has(key) || blockedKeyPattern.test(key) || !isSafeValue(value)) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function redactBackgroundJob(job: HrBackgroundJobRow) {
  return {
    id: job.id,
    organization_id: job.organization_id,
    unit_id: job.unit_id,
    job_type: job.job_type,
    status: job.status,
    priority: job.priority,
    payload: sanitizeBackgroundJobPayload(job.payload),
    result: sanitizeBackgroundJobPayload(job.result),
    attempts: toNumber(job.attempts),
    max_attempts: toNumber(job.max_attempts),
    scheduled_at: job.scheduled_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    failed_at: job.failed_at,
    failure_reason: job.failure_reason,
    locked_at: job.locked_at,
    locked_by: job.locked_by,
    correlation_id: job.correlation_id,
    created_by: job.created_by,
    created_at: job.created_at,
    updated_at: job.updated_at
  };
}

async function getUnitOrganizationId(supabase: SupabaseAdmin, unitId: string) {
  const { data, error } = await supabase
    .from("units")
    .select("organization_id")
    .eq("id", unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("background_jobs.unit_lookup_failed", error);
    throw new Error("Nao foi possivel validar a unidade do job.");
  }

  return data?.[0]?.organization_id as string | undefined;
}

export async function createBackgroundJob(input: {
  context: HrRequestContext;
  unitId: string;
  jobType: HrBackgroundJobType;
  status: Extract<HrBackgroundJobStatus, "pending" | "scheduled">;
  priority: HrBackgroundJobPriority;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
  correlationId?: string;
  maxAttempts: number;
}) {
  const organizationId = await getUnitOrganizationId(input.context.supabase, input.unitId);
  if (!organizationId) throw new Error("Unidade nao encontrada.");

  const { data, error } = await input.context.supabase
    .from("hr_background_jobs")
    .insert({
      organization_id: organizationId,
      unit_id: input.unitId,
      job_type: input.jobType,
      status: input.status,
      priority: input.priority,
      payload: sanitizeBackgroundJobPayload(input.payload),
      scheduled_at: input.scheduledAt ?? null,
      correlation_id: input.correlationId ?? null,
      max_attempts: input.maxAttempts,
      created_by: input.context.session.user.id,
      updated_by: input.context.session.user.id
    })
    .select(HR_BACKGROUND_JOB_SELECT)
    .single();

  if (error) {
    logHrApiError("background_jobs.insert_failed", error);
    throw new Error("Nao foi possivel criar o job background.");
  }

  return data as HrBackgroundJobRow;
}

// CORE Fatia 2: variante SYSTEM (cron/service_role, sem sessao). Grava created_by/updated_by = null;
// resolve organization_id reusando getUnitOrganizationId (que ja recebe SupabaseAdmin). claim/complete/fail
// ja sao session-free e nao precisam de variante.
export async function createBackgroundJobSystem(
  supabase: SupabaseAdmin,
  input: {
    unitId: string;
    jobType: HrBackgroundJobType;
    status: Extract<HrBackgroundJobStatus, "pending" | "scheduled">;
    priority: HrBackgroundJobPriority;
    payload?: Record<string, unknown>;
    scheduledAt?: string;
    correlationId?: string;
    maxAttempts: number;
  }
) {
  const organizationId = await getUnitOrganizationId(supabase, input.unitId);
  if (!organizationId) throw new Error("Unidade nao encontrada.");

  const { data, error } = await supabase
    .from("hr_background_jobs")
    .insert({
      organization_id: organizationId,
      unit_id: input.unitId,
      job_type: input.jobType,
      status: input.status,
      priority: input.priority,
      payload: sanitizeBackgroundJobPayload(input.payload),
      scheduled_at: input.scheduledAt ?? null,
      correlation_id: input.correlationId ?? null,
      max_attempts: input.maxAttempts,
      created_by: null,
      updated_by: null
    })
    .select(HR_BACKGROUND_JOB_SELECT)
    .single();

  if (error) {
    logHrApiError("background_jobs.system_insert_failed", error);
    throw new Error("Nao foi possivel criar o job background (system).");
  }

  return data as HrBackgroundJobRow;
}

/**
 * Pre-check de idempotencia diaria: existe job COMPLETED (nao deletado) com este correlation_id?
 * So conta 'completed' de proposito: jobs 'failed'/'cancelled'/'retrying' ou nunca claimados NAO barram o
 * reprocessamento — assim uma nova chamada ao runner no mesmo dia RECUPERA a unidade que falhou (a rede de
 * seguranca continua ativa). O indice correlation_idx (039) NAO e' unico; a trava e' aplicacional aqui.
 */
export async function completedBackgroundJobExistsByCorrelation(supabase: SupabaseAdmin, correlationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("hr_background_jobs")
    .select("id")
    .eq("correlation_id", correlationId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("background_jobs.correlation_lookup_failed", error);
    throw new Error("Nao foi possivel verificar duplicidade do job background.");
  }

  return (data?.length ?? 0) > 0;
}

export async function loadBackgroundJobs(input: {
  supabase: SupabaseAdmin;
  scope: HrBackgroundJobsScope;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return [];
  }

  let query = input.supabase
    .from("hr_background_jobs")
    .select(HR_BACKGROUND_JOB_SELECT)
    .is("deleted_at", null);

  if (input.scope.unitId) {
    query = query.eq("unit_id", input.scope.unitId);
  } else if (!input.scope.isSuperAdmin) {
    query = query.in("unit_id", input.scope.accessibleUnitIds);
  }

  if (input.scope.jobType) query = query.eq("job_type", input.scope.jobType);
  if (input.scope.status) query = query.eq("status", input.scope.status);
  if (input.scope.priority) query = query.eq("priority", input.scope.priority);
  if (input.scope.from) query = query.gte("created_at", `${input.scope.from}T00:00:00.000Z`);
  if (input.scope.to) query = query.lte("created_at", `${input.scope.to}T23:59:59.999Z`);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logHrApiError("background_jobs.lookup_failed", error);
    throw new Error("Nao foi possivel carregar os jobs background.");
  }

  return (data ?? []) as HrBackgroundJobRow[];
}

export async function claimBackgroundJob(input: {
  supabase: SupabaseAdmin;
  jobId: string;
  lockedBy: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("hr_background_jobs")
    .update({
      status: "running",
      attempts: 1,
      started_at: now,
      locked_at: now,
      locked_by: input.lockedBy,
      failed_at: null,
      failure_reason: null
    })
    .eq("id", input.jobId)
    .in("status", ["pending", "scheduled", "retrying"])
    .is("locked_at", null)
    .is("deleted_at", null)
    .select(HR_BACKGROUND_JOB_SELECT)
    .maybeSingle();

  if (error) {
    logHrApiError("background_jobs.claim_failed", error);
    throw new Error("Nao foi possivel fazer lock do job background.");
  }

  return (data ?? null) as HrBackgroundJobRow | null;
}

export async function completeBackgroundJob(input: {
  supabase: SupabaseAdmin;
  jobId: string;
  result?: Record<string, unknown>;
}) {
  const { data, error } = await input.supabase
    .from("hr_background_jobs")
    .update({
      status: "completed",
      result: sanitizeBackgroundJobPayload(input.result),
      finished_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null
    })
    .eq("id", input.jobId)
    .eq("status", "running")
    .select(HR_BACKGROUND_JOB_SELECT)
    .single();

  if (error) {
    logHrApiError("background_jobs.complete_failed", error);
    throw new Error("Nao foi possivel concluir o job background.");
  }

  return data as HrBackgroundJobRow;
}

export async function failBackgroundJob(input: {
  supabase: SupabaseAdmin;
  jobId: string;
  failureReason: string;
  retry?: boolean;
}) {
  const { data: current, error: lookupError } = await input.supabase
    .from("hr_background_jobs")
    .select(HR_BACKGROUND_JOB_SELECT)
    .eq("id", input.jobId)
    .eq("status", "running")
    .single();

  if (lookupError) {
    logHrApiError("background_jobs.fail_lookup_failed", lookupError);
    throw new Error("Nao foi possivel carregar o job background.");
  }

  const attempts = toNumber(current.attempts);
  const maxAttempts = toNumber(current.max_attempts);
  const canRetry = Boolean(input.retry && attempts < maxAttempts);
  const { data, error } = await input.supabase
    .from("hr_background_jobs")
    .update({
      status: canRetry ? "retrying" : "failed",
      failed_at: new Date().toISOString(),
      failure_reason: input.failureReason,
      locked_at: null,
      locked_by: null
    })
    .eq("id", input.jobId)
    .select(HR_BACKGROUND_JOB_SELECT)
    .single();

  if (error) {
    logHrApiError("background_jobs.fail_failed", error);
    throw new Error("Nao foi possivel marcar falha do job background.");
  }

  return data as HrBackgroundJobRow;
}
