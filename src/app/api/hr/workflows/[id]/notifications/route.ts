import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import { HR_WORKFLOW_SELECT, type HrWorkflowRow } from "@/lib/hr/workflow-data";
import {
  loadWorkflowNotifications,
  redactWorkflowNotification,
  type HrWorkflowNotificationChannel,
  type HrWorkflowNotificationStatus
} from "@/lib/hr/workflow-notifications";
import {
  assertWorkflowUnitScope,
  canAccessSensitiveWorkflowUnit,
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrIdParamSchema, hrWorkflowNotificationsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowEventsView);

    if (response || !context) {
      return response;
    }

    const { id } = hrIdParamSchema.parse(params);
    const query = parseSearchParams(request, hrWorkflowNotificationsQuerySchema);
    const { data: workflowData, error: workflowError } = await context.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT)
      .eq("id", id)
      .is("deleted_at", null)
      .limit(1);

    if (workflowError) {
      logHrApiError("workflow_notifications.workflow_lookup_failed", workflowError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar as notificacoes do workflow.", 500);
    }

    const workflow = workflowData?.[0] as HrWorkflowRow | undefined;

    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    assertWorkflowUnitScope(context, workflow.unit_id);

    const [sensitiveAccess, notifications] = await Promise.all([
      getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowEventsSensitiveView),
      loadWorkflowNotifications({
        supabase: context.supabase,
        workflowId: workflow.id,
        status: query.status as HrWorkflowNotificationStatus | undefined,
        channel: query.channel as HrWorkflowNotificationChannel | undefined
      })
    ]);

    return NextResponse.json({
      data: notifications.map((notification) =>
        redactWorkflowNotification({
          notification,
          canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, notification.unit_id)
        })
      )
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar as notificacoes do workflow.");
  }
}
