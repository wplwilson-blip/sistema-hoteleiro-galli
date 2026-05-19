import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  HrWorkflowDelegationValidationError,
  redactWorkflowDelegation,
  revokeWorkflowDelegation
} from "@/lib/hr/workflow-delegations";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";
import { hrIdParamSchema, hrWorkflowDelegationRevokeSchema } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsApprove);

    if (response || !context) {
      return response;
    }

    const { id } = hrIdParamSchema.parse(params);
    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return hrWorkflowApiError("INVALID_PAYLOAD", "JSON invalido.", 400);
    }

    const payload = hrWorkflowDelegationRevokeSchema.parse(rawPayload);
    const delegation = await revokeWorkflowDelegation({
      context,
      delegationId: id,
      reason: payload.reason
    });

    if (!delegation) {
      return hrWorkflowApiError("DELEGATION_NOT_FOUND", "Delegacao nao encontrada.", 404);
    }

    return NextResponse.json({
      data: redactWorkflowDelegation(delegation)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof HrWorkflowDelegationValidationError) {
      return hrWorkflowApiError(error.code, error.message, error.status);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel revogar a delegacao de workflow.");
  }
}
