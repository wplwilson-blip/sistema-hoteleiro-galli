import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import { loadWorkflowTemplateDetail, redactWorkflowTemplate } from "@/lib/hr/workflow-templates";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const { id } = hrIdParamSchema.parse(params);
    const detail = await loadWorkflowTemplateDetail({
      supabase: context.supabase,
      templateId: id,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds
      }
    });

    if (!detail) {
      return hrWorkflowApiError("TEMPLATE_NOT_FOUND", "Template nao encontrado.", 404);
    }

    return NextResponse.json({
      data: redactWorkflowTemplate(detail)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("TEMPLATE_NOT_FOUND", "Template nao encontrado.", 404);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o template de workflow.");
  }
}
