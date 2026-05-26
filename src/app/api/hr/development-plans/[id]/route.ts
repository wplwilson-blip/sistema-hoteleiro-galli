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
import { loadDevelopmentPlan, prepareDevelopmentPlanWrite } from "@/lib/hr/development-plan-actions";
import { developmentPlanListSelect, redactDevelopmentPlan, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { developmentPlanPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const plan = await loadDevelopmentPlan(context, id, true);
    if (!plan) return hrApiError("PDI nao encontrado.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: redactDevelopmentPlan(plan, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(plan.unit_id), true)
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar PDI.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.developmentManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = developmentPlanPayloadSchema.partial().parse(await request.json());
    const existing = await loadDevelopmentPlan(context, id);
    if (!existing) return hrApiError("PDI nao encontrado.", 404);
    const merged = {
      employeeId: payload.employeeId ?? existing.employee_id,
      evaluationId: pickPayload(payload, "evaluationId", existing.evaluation_id ?? undefined) as string | undefined,
      title: payload.title ?? existing.title,
      reason: pickPayload(payload, "reason", existing.reason ?? undefined) as string | undefined,
      status: payload.status ?? existing.status,
      openedAt: payload.openedAt ?? existing.opened_at,
      dueAt: pickPayload(payload, "dueAt", existing.due_at ?? undefined) as string | undefined,
      reviewAt: pickPayload(payload, "reviewAt", existing.review_at ?? undefined) as string | undefined,
      closedAt: pickPayload(payload, "closedAt", existing.closed_at ?? undefined) as string | undefined,
      responsibleUserId: pickPayload(payload, "responsibleUserId", existing.responsible_user_id ?? undefined) as string | undefined,
      visibilityScope: payload.visibilityScope ?? existing.visibility_scope,
      isSensitive: payload.isSensitive ?? existing.is_sensitive
    };
    const updatePayload = await prepareDevelopmentPlanWrite(context, developmentPlanPayloadSchema.parse(merged), existing);
    const { data, error } = await context.supabase
      .from("employee_development_plans")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(developmentPlanListSelect)
      .single();

    if (error) {
      logHrApiError("development_plans.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o PDI.", 500);
    }

    return NextResponse.json({ ok: true, data: redactDevelopmentPlan(data as unknown as EmployeeDevelopmentPlanRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar PDI.");
  }
}
