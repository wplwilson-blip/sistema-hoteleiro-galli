import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  HR_WORKFLOW_EVENT_SELECT,
  HR_WORKFLOW_SELECT,
  loadWorkflowActors,
  uniqueIds,
  type HrWorkflowEventRow,
  type HrWorkflowRow
} from "@/lib/hr/workflow-data";
import { redactWorkflowEvent } from "@/lib/hr/workflow-redaction";
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
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowEventsView);

    if (response || !context) {
      return response;
    }

    const { id } = hrIdParamSchema.parse(params);
    const { data: workflowData, error: workflowError } = await context.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .limit(1);

    if (workflowError) {
      logHrApiError("workflows.timeline.workflow_lookup_failed", workflowError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar a timeline do workflow.", 500);
    }

    const workflow = workflowData?.[0] as HrWorkflowRow | undefined;

    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    assertWorkflowUnitScope(context, workflow.unit_id);

    const { data, error } = await context.supabase
      .from("hr_workflow_events")
      .select(HR_WORKFLOW_EVENT_SELECT)
      .eq("workflow_id", workflow.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logHrApiError("workflows.timeline_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar a timeline do workflow.", 500);
    }

    const events = (data ?? []) as HrWorkflowEventRow[];
    const [sensitiveAccess, actorsById] = await Promise.all([
      getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowEventsSensitiveView),
      loadWorkflowActors(context.supabase, uniqueIds(events.map((event) => event.actor_user_id)))
    ]);

    return NextResponse.json({
      data: events.map((event) =>
        redactWorkflowEvent({
          event,
          actor: event.actor_user_id ? actorsById.get(event.actor_user_id) ?? null : null,
          canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, event.unit_id)
        })
      )
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar a timeline do workflow.");
  }
}
