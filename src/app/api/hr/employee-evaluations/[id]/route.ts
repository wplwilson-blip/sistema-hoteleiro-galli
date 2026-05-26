import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { assertEmployeeEvaluationReadyForStatus, loadEmployeeEvaluation, prepareEmployeeEvaluationUpdate } from "@/lib/hr/evaluation-actions";
import { employeeEvaluationDetailSelect, employeeEvaluationListSelect, redactEmployeeEvaluation, type EmployeeEvaluationRow } from "@/lib/hr/evaluations";
import { employeeEvaluationUpdateSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function requiresReviewPermission(payload: z.infer<typeof employeeEvaluationUpdateSchema>) {
  return Boolean(
    payload.status && ["reviewed", "feedback_given", "acknowledged", "closed"].includes(payload.status)
  );
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const evaluation = await loadEmployeeEvaluation(context, id, employeeEvaluationDetailSelect);
    if (!evaluation) return hrApiError("Avaliacao nao encontrada.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: redactEmployeeEvaluation(evaluation, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(evaluation.unit_id), true)
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar avaliacao.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const payload = employeeEvaluationUpdateSchema.parse(body);
    const permission = requiresReviewPermission(payload) ? HR_PERMISSIONS.evaluationsReview : HR_PERMISSIONS.evaluationsManage;
    const { context, response } = await requireHrPermission(permission);
    if (response || !context) return response;

    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadEmployeeEvaluation(context, id, employeeEvaluationListSelect);
    if (!existing) return hrApiError("Avaliacao nao encontrada.", 404);
    await assertEmployeeEvaluationReadyForStatus(context, existing, payload);
    const updatePayload = prepareEmployeeEvaluationUpdate(existing, payload);
    const { data, error } = await context.supabase
      .from("employee_evaluations")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(employeeEvaluationListSelect)
      .single();

    if (error) {
      logHrApiError("employee_evaluations.update_failed", error);
      return hrApiError("Nao foi possivel atualizar a avaliacao.", 500);
    }

    return NextResponse.json({ ok: true, data: redactEmployeeEvaluation(data as unknown as EmployeeEvaluationRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar avaliacao.");
  }
}
