import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import { loadWorkflowAnalyticsFacts, redactWorkflowAnalytics } from "@/lib/hr/workflow-analytics";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowAnalyticsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowAnalyticsQuerySchema);

    if (query.from && query.to && query.from > query.to) {
      return hrWorkflowApiError("INVALID_QUERY", "Periodo invalido.", 422);
    }

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const scope = {
      isSuperAdmin: context.isSuperAdmin,
      accessibleUnitIds: context.accessibleUnitIds,
      unitId: query.unit_id,
      from: query.from,
      to: query.to,
      workflowType: query.workflow_type,
      status: query.status
    };
    const facts = await loadWorkflowAnalyticsFacts({
      supabase: context.supabase,
      scope
    });

    return NextResponse.json({
      data: redactWorkflowAnalytics({
        ...facts,
        scope
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar analytics de workflows.");
  }
}
