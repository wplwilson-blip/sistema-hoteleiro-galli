import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import { HR_WORKFLOW_SELECT, loadWorkflowEmployees, loadWorkflowSteps, type HrWorkflowRow } from "@/lib/hr/workflow-data";
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

export const dynamic = "force-dynamic";

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
    const [stepsByWorkflow, employeesById] = await Promise.all([
      loadWorkflowSteps(context.supabase, [workflow.id]),
      loadWorkflowEmployees(context.supabase, workflow.employee_id ? [workflow.employee_id] : [])
    ]);

    return NextResponse.json({
      data: redactWorkflowDetail({
        workflow,
        employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
        steps: stepsByWorkflow.get(workflow.id) ?? [],
        canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o workflow de RH.");
  }
}
