import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import { loadWorkflowDashboardMetrics, redactWorkflowDashboard } from "@/lib/hr/workflow-dashboard";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowDashboardQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowDashboardQuerySchema);

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const rows = await loadWorkflowDashboardMetrics({
      supabase: context.supabase,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds,
        unitId: query.unit_id
      }
    });

    return NextResponse.json({
      data: redactWorkflowDashboard(rows)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o dashboard operacional de RH.");
  }
}
