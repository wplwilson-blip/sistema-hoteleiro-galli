import { NextResponse } from "next/server";
import {
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import { HR_WORKFLOW_TYPE_CONFIGS } from "@/lib/hr/workflow-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const [manageAccess, sensitiveAccess] = await Promise.all([
      getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsManage),
      getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView)
    ]);

    return NextResponse.json({
      data: HR_WORKFLOW_TYPE_CONFIGS.map((workflowType) => ({
        ...workflowType,
        allowed_to_create: manageAccess.hasPermission && (!workflowType.is_sensitive || sensitiveAccess.hasPermission)
      }))
    });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os tipos de workflow de RH.");
  }
}
