import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { assertCanAccessOnboardingPlan, loadHrOnboardingPlan, prepareHrOnboardingPlanWrite } from "@/lib/hr/onboarding-plan-actions";
import {
  mapHrOnboardingPlan,
  onboardingPlanListSelect,
  type HrOnboardingPlanRow
} from "@/lib/hr/onboarding-plans";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { onboardingPlanPayloadSchema } from "@/lib/hr/onboarding-plan-validation";

type RouteParams = { params: { id: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = onboardingPlanPayloadSchema.partial().parse(await request.json());
    const existing = await loadHrOnboardingPlan(context, id);

    if (!existing) {
      return hrApiError("Plano de onboarding nao encontrado.", 404);
    }

    assertCanAccessOnboardingPlan(context, existing);

    const mergedPayload = {
      organizationId: pickPayload(payload, "organizationId", existing.organization_id) as string | undefined,
      unitId: pickPayload(payload, "unitId", existing.unit_id ?? undefined) as string | undefined,
      departmentId: pickPayload(payload, "departmentId", existing.department_id ?? undefined) as string | undefined,
      jobPositionId: pickPayload(payload, "jobPositionId", existing.job_position_id ?? undefined) as string | undefined,
      admissionType: pickPayload(payload, "admissionType", existing.admission_type ?? undefined) as string | undefined,
      name: payload.name ?? existing.name,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      priority: payload.priority ?? existing.priority,
      status: payload.status ?? existing.status
    };
    const updatePayload = await prepareHrOnboardingPlanWrite(context, mergedPayload);
    const { data, error } = await context.supabase
      .from("hr_onboarding_plans")
      .update({
        ...updatePayload,
        updated_by: context.session.user.id
      })
      .eq("id", id)
      .select(onboardingPlanListSelect)
      .single();

    if (error) {
      logHrApiError("onboarding_plans.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o plano. Verifique se ja existe plano igual.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrOnboardingPlan(data as unknown as HrOnboardingPlanRow) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar o plano de onboarding.");
  }
}
