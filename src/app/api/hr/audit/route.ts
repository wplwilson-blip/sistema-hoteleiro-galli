import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  loadWorkflowAuditLogs,
  redactWorkflowAuditLog,
  type HrWorkflowAuditAction,
  type HrWorkflowAuditRiskLevel
} from "@/lib/hr/workflow-audit";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowAuditQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowEventsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowAuditQuerySchema);

    if (query.from && query.to && query.from > query.to) {
      return hrWorkflowApiError("INVALID_QUERY", "Periodo invalido.", 422);
    }

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return NextResponse.json({
        data: [],
        pagination: {
          page: query.page,
          page_size: query.page_size,
          total: 0
        }
      });
    }

    const { rows, total } = await loadWorkflowAuditLogs({
      supabase: context.supabase,
      unitIds: context.accessibleUnitIds,
      isSuperAdmin: context.isSuperAdmin,
      workflowId: query.workflow_id,
      action: query.action as HrWorkflowAuditAction | undefined,
      riskLevel: query.risk_level as HrWorkflowAuditRiskLevel | undefined,
      actorUserId: query.actor_user_id,
      unitId: query.unit_id,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.page_size
    });

    return NextResponse.json({
      data: rows.map(redactWorkflowAuditLog),
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar a auditoria de workflows.");
  }
}
