import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { assertCanAccessOnboardingPlan, loadHrOnboardingPlan, prepareHrOnboardingPlanItemWrite } from "@/lib/hr/onboarding-plan-actions";
import {
  mapHrOnboardingPlanItem,
  onboardingPlanItemListSelect,
  type HrOnboardingPlanItemRow,
} from "@/lib/hr/onboarding-plans";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { onboardingPlanItemPayloadSchema } from "@/lib/hr/onboarding-plan-validation";

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const plan = await loadHrOnboardingPlan(context, id);
    if (!plan) return hrApiError("Plano de onboarding nao encontrado.", 404);
    assertCanAccessOnboardingPlan(context, plan);

    const { data, error } = await context.supabase
      .from("hr_onboarding_plan_items")
      .select(onboardingPlanItemListSelect)
      .eq("plan_id", plan.id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      logHrApiError("onboarding_plan_items.list_failed", error);
      return hrApiError("Nao foi possivel carregar os itens do plano.", 500);
    }

    return NextResponse.json({ ok: true, data: ((data ?? []) as unknown as HrOnboardingPlanItemRow[]).map(mapHrOnboardingPlanItem) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar itens do plano.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = onboardingPlanItemPayloadSchema.parse(await request.json());
    const plan = await loadHrOnboardingPlan(context, id);
    if (!plan) return hrApiError("Plano de onboarding nao encontrado.", 404);

    const insertPayload = await prepareHrOnboardingPlanItemWrite(context, plan, payload);
    const { data, error } = await context.supabase
      .from("hr_onboarding_plan_items")
      .insert({
        ...insertPayload,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(onboardingPlanItemListSelect)
      .single();

    if (error) {
      logHrApiError("onboarding_plan_items.create_failed", error);
      return hrApiError("Nao foi possivel criar o item do checklist.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrOnboardingPlanItem(data as unknown as HrOnboardingPlanItemRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel criar o item do plano.");
  }
}
