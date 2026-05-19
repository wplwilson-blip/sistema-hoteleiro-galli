import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  loadWorkflowTemplateSteps,
  loadWorkflowTemplates,
  redactWorkflowTemplate
} from "@/lib/hr/workflow-templates";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowTemplatesQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowTemplatesQuerySchema);

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const templates = await loadWorkflowTemplates({
      supabase: context.supabase,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds,
        unitId: query.unit_id,
        workflowType: query.workflow_type,
        isActive: query.is_active,
        includeSystem: query.include_system
      }
    });
    const stepsByTemplate = await loadWorkflowTemplateSteps({
      supabase: context.supabase,
      templateIds: templates.map((template) => template.id)
    });

    return NextResponse.json({
      data: templates.map((template) =>
        redactWorkflowTemplate({
          template,
          steps: stepsByTemplate.get(template.id) ?? []
        })
      )
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os templates de workflows.");
  }
}
