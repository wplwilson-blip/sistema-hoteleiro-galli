import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_SELECT,
  loadWorkflowEmployees,
  loadWorkflowSteps,
  type HrWorkflowRow,
  type HrWorkflowStepRow
} from "@/lib/hr/workflow-data";
import {
  HrWorkflowMutationError,
  applyRejectStepRpc,
  buildRejectStepRpcPayload,
  createWorkflowActionRequestHash,
  getRequiredWorkflowIdempotencyKey,
  mapWorkflowRpcError,
  parseRejectStepPayload,
  resolveRejectStepIdempotencyReplay
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

const rejectableWorkflowStatuses = new Set<string>(["in_progress", "waiting_approval"]);
const actionableStepStatuses = new Set<string>(["pending", "in_progress", "waiting_approval"]);

function workflowMutationError(code: string, message: string, status: number): never {
  throw new HrWorkflowMutationError(code, message, status);
}

async function loadWorkflowForRejection(context: HrRequestContext, workflowId: string) {
  const { data, error } = await context.supabase
    .from("hr_workflows")
    .select(HR_WORKFLOW_SELECT)
    .eq("id", workflowId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflows.reject.workflow_lookup_failed", error);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel carregar o workflow de RH.", 500);
  }

  if (!data?.[0]) {
    workflowMutationError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
  }

  const parsed = workflowRowSchema.safeParse(data[0]);

  if (!parsed.success) {
    logHrApiError("workflows.reject.workflow_parse_failed", { message: parsed.error.message });
    workflowMutationError("INTERNAL_ERROR", "Workflow invalido para rejeicao.", 500);
  }

  return parsed.data;
}

async function assertActorCanRejectWorkflowUnit(context: HrRequestContext, unitId: string) {
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
    logHrApiError("workflows.reject.actor_lookup_failed", actorError);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar o aprovador.", 500);
  }

  if (!actorSchema.safeParse(actorData?.[0]).success) {
    workflowMutationError("ACTOR_INVALID", "Aprovador invalido para esta acao.", 403);
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
    logHrApiError("workflows.reject.actor_unit_link_lookup_failed", linkError);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar a unidade do aprovador.", 500);
  }

  if (!linkSchema.safeParse(linkData?.[0]).success) {
    workflowMutationError("ACTOR_INVALID", "Aprovador nao pertence a unidade do workflow.", 403);
  }
}

function assertWorkflowCanReject(workflow: HrWorkflowRow) {
  if (!rejectableWorkflowStatuses.has(workflow.status)) {
    workflowMutationError("WORKFLOW_STATUS_INVALID", "Workflow nao esta ativo para rejeicao de etapa.", 409);
  }
}

function assertStepCanReject(input: {
  step: HrWorkflowStepRow;
  steps: HrWorkflowStepRow[];
  actorUserId: string;
}) {
  if (input.step.status !== "waiting_approval") {
    workflowMutationError("STEP_STATUS_INVALID", "Etapa nao esta aguardando aprovacao.", 409);
  }

  const firstActionableStep = input.steps
    .filter((step) => actionableStepStatuses.has(step.status))
    .sort((left, right) => left.step_order - right.step_order)[0];

  if (!firstActionableStep || firstActionableStep.id !== input.step.id) {
    workflowMutationError("STEP_OUT_OF_ORDER", "Rejeite a etapa pendente anterior antes desta etapa.", 409);
  }

  if (input.step.assigned_to_user_id && input.step.assigned_to_user_id !== input.actorUserId) {
    workflowMutationError("STEP_NOT_ASSIGNED_TO_ACTOR", "Etapa atribuida a outro responsavel.", 403);
  }
}

async function loadWorkflowDetailPayload(context: HrRequestContext, workflowId: string) {
  const workflow = await loadWorkflowForRejection(context, workflowId);
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
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsApprove);

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

    const payload = parseRejectStepPayload(rawPayload);
    const idempotencyKey = getRequiredWorkflowIdempotencyKey(request);
    const workflow = await loadWorkflowForRejection(context, workflowId);

    assertWorkflowUnitScope(context, workflow.unit_id);
    await assertActorCanRejectWorkflowUnit(context, workflow.unit_id);

    const rpcPayload = buildRejectStepRpcPayload(payload);
    const requestHash = createWorkflowActionRequestHash({
      action: "reject_step",
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      workflowId: workflow.id,
      stepId: payload.step_id,
      payload: rpcPayload
    });
    const replay = await resolveRejectStepIdempotencyReplay({
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

    assertWorkflowCanReject(workflow);

    const stepsByWorkflow = await loadWorkflowSteps(context.supabase, [workflow.id]);
    const steps = stepsByWorkflow.get(workflow.id) ?? [];
    const step = steps.find((workflowStep) => workflowStep.id === payload.step_id);

    if (!step) {
      workflowMutationError("WORKFLOW_STEP_NOT_FOUND", "Etapa nao encontrada.", 404);
    }

    assertStepCanReject({
      step,
      steps,
      actorUserId: context.session.user.id
    });

    const result = await applyRejectStepRpc({
      supabase: context.supabase,
      context,
      organizationId: workflow.organization_id,
      unitId: workflow.unit_id,
      workflowId: workflow.id,
      stepId: step.id,
      idempotencyKey,
      requestHash,
      payload: rpcPayload
    });

    if (!result.ok) {
      throw mapWorkflowRpcError(result, "Nao foi possivel rejeitar a etapa.");
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

    return handleHrWorkflowRouteError(error, "Nao foi possivel rejeitar a etapa do workflow de RH.");
  }
}
