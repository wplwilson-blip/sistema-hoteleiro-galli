import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { loadHrOnboardingPlanOptions, prepareHrOnboardingPlanWrite } from "@/lib/hr/onboarding-plan-actions";
import { mapHrOnboardingPlan, onboardingPlanListSelect, type HrOnboardingPlanRow } from "@/lib/hr/onboarding-plans";
import { parseSearchParams } from "@/lib/hr/schemas";
import { onboardingPlanPayloadSchema, onboardingPlansQuerySchema } from "@/lib/hr/onboarding-plan-validation";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, onboardingPlansQuerySchema);
    let plansQuery = context.supabase.from("hr_onboarding_plans").select(onboardingPlanListSelect).is("deleted_at", null);

    if (query.status) plansQuery = plansQuery.eq("status", query.status);
    if (query.unitId) plansQuery = plansQuery.eq("unit_id", query.unitId);
    if (query.departmentId) plansQuery = plansQuery.eq("department_id", query.departmentId);
    if (query.jobPositionId) plansQuery = plansQuery.eq("job_position_id", query.jobPositionId);
    if (query.search) plansQuery = plansQuery.ilike("name", `%${query.search}%`);

    const { data, error } = await plansQuery
      .order("status", { ascending: true })
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) {
      logHrApiError("onboarding_plans.list_failed", error);
      return hrApiError("Nao foi possivel carregar os planos de onboarding.", 500);
    }

    // active-unit: accessibleUnitIds ja vem estreitado (super admin = [unidade ativa]).
    // Planos de rede (unit_id NULL) permanecem visiveis em qualquer unidade.
    const rows = ((data ?? []) as unknown as HrOnboardingPlanRow[]).filter(
      (row) => !row.unit_id || context.accessibleUnitIds.includes(row.unit_id)
    );

    return NextResponse.json({
      ok: true,
      data: rows.map(mapHrOnboardingPlan),
      options: await loadHrOnboardingPlanOptions(context)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar os planos de onboarding.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const payload = onboardingPlanPayloadSchema.parse(await request.json());
    const insertPayload = await prepareHrOnboardingPlanWrite(context, payload);
    const { data, error } = await context.supabase
      .from("hr_onboarding_plans")
      .insert({
        ...insertPayload,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(onboardingPlanListSelect)
      .single();

    if (error) {
      logHrApiError("onboarding_plans.create_failed", error);
      return hrApiError("Nao foi possivel criar o plano. Verifique se ja existe plano igual para o mesmo contexto.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrOnboardingPlan(data as unknown as HrOnboardingPlanRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel criar o plano de onboarding.");
  }
}
