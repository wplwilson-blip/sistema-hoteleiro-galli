import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_SELECT,
  escapeIlikePattern,
  loadWorkflowEmployees,
  loadWorkflowSteps,
  toEndOfDay,
  toStartOfDay,
  uniqueIds,
  type HrWorkflowRow
} from "@/lib/hr/workflow-data";
import { redactWorkflowListItem } from "@/lib/hr/workflow-redaction";
import {
  canAccessSensitiveWorkflowUnit,
  canUseWorkflowUnitFilter,
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowListQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

function emptyWorkflowListPayload(page: number, pageSize: number) {
  return NextResponse.json({
    data: [],
    pagination: {
      page,
      page_size: pageSize,
      total: 0
    }
  });
}

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowListQuerySchema);

    if (query.created_from && query.created_to && query.created_from > query.created_to) {
      return hrWorkflowApiError("INVALID_QUERY", "Periodo invalido.", 422);
    }

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return emptyWorkflowListPayload(query.page, query.page_size);
    }

    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return emptyWorkflowListPayload(query.page, query.page_size);
    }

    const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
    let assignedWorkflowIds: string[] | null = null;

    if (query.assigned_to) {
      let assignedStepsQuery = context.supabase
        .from("hr_workflow_steps")
        .select("workflow_id")
        .eq("assigned_to_user_id", query.assigned_to)
        .in("status", ["in_progress", "waiting_approval", "returned"])
        .is("deleted_at", null);

      if (!context.isSuperAdmin) {
        assignedStepsQuery = assignedStepsQuery.in("unit_id", context.accessibleUnitIds);
      }

      if (query.unit_id) {
        assignedStepsQuery = assignedStepsQuery.eq("unit_id", query.unit_id);
      }

      const { data: assignedSteps, error: assignedStepsError } = await assignedStepsQuery;

      if (assignedStepsError) {
        return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel filtrar workflows por responsavel.", 500);
      }

      assignedWorkflowIds = uniqueIds((assignedSteps ?? []).map((step) => step.workflow_id));

      if (!assignedWorkflowIds.length) {
        return emptyWorkflowListPayload(query.page, query.page_size);
      }
    }

    let workflowsQuery = context.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) {
      workflowsQuery = workflowsQuery.in("unit_id", context.accessibleUnitIds);
    }

    if (assignedWorkflowIds) workflowsQuery = workflowsQuery.in("id", assignedWorkflowIds);
    if (query.status) workflowsQuery = workflowsQuery.eq("status", query.status);
    if (query.workflow_type) workflowsQuery = workflowsQuery.eq("workflow_type", query.workflow_type);
    if (query.employee_id) workflowsQuery = workflowsQuery.eq("employee_id", query.employee_id);
    if (query.unit_id) workflowsQuery = workflowsQuery.eq("unit_id", query.unit_id);
    if (query.created_by) workflowsQuery = workflowsQuery.eq("created_by", query.created_by);
    if (query.sensitive !== undefined) workflowsQuery = workflowsQuery.eq("is_sensitive", query.sensitive);
    if (query.created_from) workflowsQuery = workflowsQuery.gte("created_at", toStartOfDay(query.created_from));
    if (query.created_to) workflowsQuery = workflowsQuery.lte("created_at", toEndOfDay(query.created_to));
    if (query.q) workflowsQuery = workflowsQuery.ilike("title", `%${escapeIlikePattern(query.q)}%`);

    const from = (query.page - 1) * query.page_size;
    const to = from + query.page_size - 1;
    const { data, error, count } = await workflowsQuery.order("created_at", { ascending: false }).range(from, to);

    if (error) {
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar os workflows de RH.", 500);
    }

    const workflows = (data ?? []) as HrWorkflowRow[];
    const workflowIds = workflows.map((workflow) => workflow.id);
    const employeeIds = uniqueIds(workflows.map((workflow) => workflow.employee_id));
    const [stepsByWorkflow, employeesById] = await Promise.all([
      loadWorkflowSteps(context.supabase, workflowIds),
      loadWorkflowEmployees(context.supabase, employeeIds)
    ]);

    return NextResponse.json({
      data: workflows.map((workflow) =>
        redactWorkflowListItem({
          workflow,
          employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
          steps: stepsByWorkflow.get(workflow.id) ?? [],
          canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
        })
      ),
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total: count ?? 0
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os workflows de RH.");
  }
}
