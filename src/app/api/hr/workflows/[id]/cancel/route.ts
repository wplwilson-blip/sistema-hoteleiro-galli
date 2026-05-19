import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_SELECT,
  loadWorkflowEmployees,
  loadWorkflowSteps,
  type HrWorkflowRow
} from "@/lib/hr/workflow-data";
import {
  HrWorkflowMutationError,
  applyCancelWorkflowRpc,
  buildCancelWorkflowRpcPayload,
  createWorkflowActionRequestHash,
  getRequiredWorkflowIdempotencyKey,
  mapWorkflowRpcError,
  parseCancelWorkflowPayload,
  resolveCancelWorkflowIdempotencyReplay
} from "@/lib/hr/workflow-mutations";
import { redactWorkflowDetail } from "@/lib/hr/workflow-redaction";
import {
  assertWorkflowUnitScope,
  canAccessSensitiveWorkflowUnit,
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { HR_WORKFLOW_TYPES } from "@/lib/hr/workflow-types";

export const dynamic = "force-dynamic";

const workflowStatusSchema = z.enum(["draft", "open", "in_progress", "waiting_approval", "returned", "completed", "cancelled", "rejected"]);

const workflowRowSchema: z.ZodType<HrWorkflowRow> = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  workflow_number: z.string().nullable(),
  workflow_type: z.enum(HR_WORKFLOW_TYPES),
  title: z.string(),
  description: z.string().nullable(),
  status: workflowStatusSchema,
  priority: z.string(),
  visibility_scope: z.string(),
  is_sensitive: z.boolean(),
  initiated_by: z.string().uuid().nullable(),
  responsible_user_id: z.string().uuid().nullable(),
  due_at: z.string().nullable(),
  sla_due_at: z.string().nullable(),
  sla_status: z.string().nullable(),
  sla_breached_at: z.string().nullable(),
  sla_minutes: z.number().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  completed_by: z.string().uuid().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_by: z.string().uuid().nullable(),
  cancellation_reason: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().uuid().nullable(),
  updated_by: z.string().uuid().nullable()
});

const cancellableWorkflowStatuses = new Set<string>(["in_progress", "waiting_approval", "returned"]);

function workflowMutationError(code: string, message: string, status: number): never {
  throw new HrWorkflowMutationError(code, message, status);
}
async function loadWorkflowForCancellation(context: HrRequestContext, workflowId: string) {
  const { data, error } = await context.supabase
    .from("hr_workflows")
    .select(HR_WORKFLOW_SELECT)
    .eq("id", workflowId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflows.cancel.workflow_lookup_failed", error);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel carregar o workflow de RH.", 500);
  }

  if (!data?.[0]) {
    workflowMutationError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
  }

  const parsed = workflowRowSchema.safeParse(data[0]);

  if (!parsed.success) {
    logHrApiError("workflows.cancel.workflow_parse_failed", { message: parsed.error.message });
    workflowMutationError("INTERNAL_ERROR", "Workflow invalido para cancelamento.", 500);
  }

  return parsed.data;
}

async function assertActorCanCancelWorkflowUnit(context: HrRequestContext, unitId: string) {
  const actorSchema = z.object({
    id: z.string().uuid(),
    status: z.literal("active")
  });
  const { data: actorData, error: actorError } = await context.supabase
    .from("app_users")
    .select("id, status")
    .eq("id", context.session.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (actorError) {
    logHrApiError("workflows.cancel.actor_lookup_failed", actorError);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar o cancelador.", 500);
  }

  if (!actorSchema.safeParse(actorData?.[0]).success) {
    workflowMutationError("ACTOR_INVALID", "Cancelador invalido para esta acao.", 403);
  }

  if (context.isSuperAdmin) {
    return;
  }

  const linkSchema = z.object({
    id: z.string().uuid()
  });
  const { data: linkData, error: linkError } = await context.supabase
    .from("user_unit_links")
    .select("id")
    .eq("app_user_id", context.session.user.id)
    .eq("unit_id", unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (linkError) {
    logHrApiError("workflows.cancel.actor_unit_link_lookup_failed", linkError);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar a unidade do cancelador.", 500);
  }

  if (!linkSchema.safeParse(linkData?.[0]).success) {
    workflowMutationError("ACTOR_INVALID", "Cancelador nao pertence a unidade do workflow.", 403);
  }
}
function assertWorkflowCanCancel(workflow: HrWorkflowRow) {
  if (!cancellableWorkflowStatuses.has(workflow.status)) {
    workflowMutationError("WORKFLOW_STATUS_INVALID", "Workflow nao esta ativo para cancelamento.", 409);
  }
}

async function loadWorkflowDetailPayload(context: HrRequestContext, workflowId: string) {
  const workflow = await loadWorkflowForCancellation(context, workflowId);
  const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
  const [stepsByWorkflow, employeesById] = await Promise.all([
    loadWorkflowSteps(context.supabase, [workflow.id]),
    loadWorkflowEmployees(context.supabase, workflow.employee_id ? [workflow.employee_id] : [])
  ]);

  return redactWorkflowDetail({
    workflow,
    employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
    steps: stepsByWorkflow.get(workflow.id) ?? [],
    canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsCancel);

    if (response || !context) {
      return response;
    }

    const { id: workflowId } = hrIdParamSchema.parse(params);
    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return hrWorkflowApiError("INVALID_PAYLOAD", "JSON invalido.", 400);
    }

    const payload = parseCancelWorkflowPayload(rawPayload);
    const idempotencyKey = getRequiredWorkflowIdempotencyKey(request);
    const workflow = await loadWorkflowForCancellation(context, workflowId);

    assertWorkflowUnitScope(context, workflow.unit_id);
    await assertActorCanCancelWorkflowUnit(context, workflow.unit_id);

    const rpcPayload = buildCancelWorkflowRpcPayload(payload);
    const requestHash = createWorkflowActionRequestHash({
      action: "cancel_workflow",
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      workflowId: workflow.id,
      payload: rpcPayload
    });
    const replay = await resolveCancelWorkflowIdempotencyReplay({
      supabase: context.supabase,
      organizationId: workflow.organization_id,
      actorUserId: context.session.user.id,
      idempotencyKey,
      requestHash
    });

    if (replay.replayed) {
      return NextResponse.json({
        data: await loadWorkflowDetailPayload(context, replay.workflowId ?? workflow.id),
        idempotency: {
          status: replay.status,
          replayed: true
        }
      });
    }

    assertWorkflowCanCancel(workflow);

    const result = await applyCancelWorkflowRpc({
      supabase: context.supabase,
      context,
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      workflowId: workflow.id,
      idempotencyKey,
      requestHash,
      payload: rpcPayload
    });

    if (!result.ok) {
      throw mapWorkflowRpcError(result, "Nao foi possivel cancelar o workflow.");
    }

    return NextResponse.json({
      data: await loadWorkflowDetailPayload(context, result.workflow_id ?? workflow.id),
      idempotency: {
        status: result.idempotency?.status ?? "completed",
        replayed: result.idempotency?.replayed === true
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof HrWorkflowMutationError) {
      return hrWorkflowApiError(error.code, error.message, error.status);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel cancelar o workflow de RH.");
  }
}
