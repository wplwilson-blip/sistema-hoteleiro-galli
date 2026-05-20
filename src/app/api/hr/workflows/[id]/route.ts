import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_SELECT,
  getCurrentWorkflowStep,
  loadWorkflowEmployees,
  loadWorkflowSteps,
  type HrWorkflowRow,
  type HrWorkflowStepRow
} from "@/lib/hr/workflow-data";
import { redactWorkflowDetail } from "@/lib/hr/workflow-redaction";
import {
  assertWorkflowUnitScope,
  canAccessWorkflowUnit,
  canAccessSensitiveWorkflowUnit,
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

const executableWorkflowStatuses = new Set(["pending", "in_progress"]);
const executableStepStatuses = new Set(["pending", "in_progress"]);
const approvalWorkflowStatuses = new Set(["in_progress", "waiting_approval"]);
const approvalStepStatuses = new Set(["waiting_approval"]);
const cancellableWorkflowStatuses = new Set(["in_progress", "waiting_approval", "returned"]);
const actionableStepStatuses = new Set(["pending", "in_progress", "waiting_approval"]);

function firstActionableStep(steps: HrWorkflowStepRow[]) {
  return steps
    .filter((step) => actionableStepStatuses.has(step.status))
    .sort((left, right) => left.step_order - right.step_order)[0] ?? null;
}

function actorCanUseStep(step: HrWorkflowStepRow | null, actorUserId: string) {
  return Boolean(step && (!step.assigned_to_user_id || step.assigned_to_user_id === actorUserId));
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadWorkflowReadableContext(input: {
  context: NonNullable<Awaited<ReturnType<typeof requireHrWorkflowPermission>>["context"]>;
  workflow: HrWorkflowRow;
}) {
  const managerUserId = metadataString(input.workflow.metadata, "manager_user_id");
  const [unitResult, managerResult] = await Promise.all([
    input.context.supabase
      .from("units")
      .select("id, code, name")
      .eq("id", input.workflow.unit_id)
      .eq("organization_id", input.workflow.organization_id)
      .is("deleted_at", null)
      .limit(1),
    managerUserId
      ? input.context.supabase
          .from("app_users")
          .select("id, display_name, username")
          .eq("id", managerUserId)
          .is("deleted_at", null)
          .limit(1)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (unitResult.error) {
    logHrApiError("workflows.detail_unit_lookup_failed", unitResult.error);
  }

  if (managerResult.error) {
    logHrApiError("workflows.detail_manager_lookup_failed", managerResult.error);
  }

  const unit = unitResult.data?.[0] ?? null;
  const manager = managerResult.data?.[0] ?? null;

  return {
    unit: unit
      ? {
          id: unit.id,
          code: unit.code,
          name: unit.name
        }
      : null,
    manager_user: manager
      ? {
          id: manager.id,
          name: manager.display_name ?? manager.username ?? null
        }
      : null
  };
}

async function buildDetailAllowedActions(input: {
  workflow: HrWorkflowRow;
  steps: HrWorkflowStepRow[];
  context: NonNullable<Awaited<ReturnType<typeof requireHrWorkflowPermission>>["context"]>;
}) {
  const { workflow, steps, context } = input;
  const currentStep = getCurrentWorkflowStep(steps) ?? null;
  const firstStep = firstActionableStep(steps);
  const actorUserId = context.session.user.id;
  const [completeAccess, approveAccess, cancelAccess] = await Promise.all([
    getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowStepsComplete),
    getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsApprove),
    getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsCancel)
  ]);

  const canCompleteUnit = completeAccess.hasPermission && (completeAccess.isSuperAdmin || canAccessWorkflowUnit({ ...context, accessibleUnitIds: completeAccess.accessibleUnitIds, isSuperAdmin: completeAccess.isSuperAdmin }, workflow.unit_id));
  const canApproveUnit = approveAccess.hasPermission && (approveAccess.isSuperAdmin || canAccessWorkflowUnit({ ...context, accessibleUnitIds: approveAccess.accessibleUnitIds, isSuperAdmin: approveAccess.isSuperAdmin }, workflow.unit_id));
  const canCancelUnit = cancelAccess.hasPermission && (cancelAccess.isSuperAdmin || canAccessWorkflowUnit({ ...context, accessibleUnitIds: cancelAccess.accessibleUnitIds, isSuperAdmin: cancelAccess.isSuperAdmin }, workflow.unit_id));
  const isCurrentFirstActionable = Boolean(currentStep && firstStep && currentStep.id === firstStep.id);
  const actorOwnsCurrentStep = actorCanUseStep(currentStep, actorUserId);
  const canActOnApprovalStep = Boolean(currentStep && approvalStepStatuses.has(currentStep.status) && isCurrentFirstActionable && actorOwnsCurrentStep);

  return {
    view: true,
    execute: Boolean(canCompleteUnit && executableWorkflowStatuses.has(workflow.status) && currentStep && executableStepStatuses.has(currentStep.status) && isCurrentFirstActionable && actorOwnsCurrentStep),
    approve: Boolean(canApproveUnit && approvalWorkflowStatuses.has(workflow.status) && canActOnApprovalStep),
    reject: Boolean(canApproveUnit && approvalWorkflowStatuses.has(workflow.status) && canActOnApprovalStep),
    return: Boolean(canApproveUnit && approvalWorkflowStatuses.has(workflow.status) && canActOnApprovalStep),
    cancel: Boolean(canCancelUnit && cancellableWorkflowStatuses.has(workflow.status))
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const { id } = hrIdParamSchema.parse(params);
    const { data, error } = await context.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      logHrApiError("workflows.detail_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar o workflow de RH.", 500);
    }

    const workflow = data?.[0] as HrWorkflowRow | undefined;

    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    assertWorkflowUnitScope(context, workflow.unit_id);

    const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
    const [stepsByWorkflow, employeesById, readableContext] = await Promise.all([
      loadWorkflowSteps(context.supabase, [workflow.id]),
      loadWorkflowEmployees(context.supabase, workflow.employee_id ? [workflow.employee_id] : []),
      loadWorkflowReadableContext({ context, workflow })
    ]);
    const steps = stepsByWorkflow.get(workflow.id) ?? [];
    const detail = redactWorkflowDetail({
      workflow,
      employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
      steps,
      canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
    });

    return NextResponse.json({
      data: {
        ...detail,
        ...readableContext,
        allowed_actions: {
          ...detail.allowed_actions,
          ...(await buildDetailAllowedActions({ workflow, steps, context }))
        }
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o workflow de RH.");
  }
}
