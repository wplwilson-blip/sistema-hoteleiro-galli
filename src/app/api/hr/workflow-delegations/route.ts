import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  createWorkflowDelegation,
  HrWorkflowDelegationValidationError,
  loadWorkflowDelegations,
  redactWorkflowDelegation
} from "@/lib/hr/workflow-delegations";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import {
  hrWorkflowDelegationCreateSchema,
  hrWorkflowDelegationsQuerySchema,
  parseSearchParams
} from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowDelegationsQuerySchema);

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const delegations = await loadWorkflowDelegations({
      supabase: context.supabase,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds,
        unitId: query.unit_id,
        delegatorUserId: query.delegator_user_id,
        delegateUserId: query.delegate_user_id,
        workflowType: query.workflow_type,
        isActive: query.is_active
      }
    });

    return NextResponse.json({
      data: delegations.map(redactWorkflowDelegation)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar as delegacoes de workflows.");
  }
}

export async function POST(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsApprove);

    if (response || !context) {
      return response;
    }

    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return hrWorkflowApiError("INVALID_PAYLOAD", "JSON invalido.", 400);
    }

    const payload = hrWorkflowDelegationCreateSchema.parse(rawPayload);

    if (!canUseWorkflowUnitFilter(context, payload.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const delegation = await createWorkflowDelegation({
      context,
      unitId: payload.unit_id,
      delegatorUserId: payload.delegator_user_id,
      delegateUserId: payload.delegate_user_id,
      workflowType: payload.workflow_type,
      stepType: payload.step_type,
      startsAt: payload.starts_at,
      endsAt: payload.ends_at,
      reason: payload.reason
    });

    return NextResponse.json({ data: redactWorkflowDelegation(delegation) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof HrWorkflowDelegationValidationError) {
      return hrWorkflowApiError(error.code, error.message, error.status);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel criar a delegacao de workflow.");
  }
}
