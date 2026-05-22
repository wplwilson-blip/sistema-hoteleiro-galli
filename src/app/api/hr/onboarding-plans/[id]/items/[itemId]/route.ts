import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { prepareHrOnboardingPlanItemWrite } from "@/lib/hr/onboarding-plan-actions";
import {
  mapHrOnboardingPlanItem,
  onboardingPlanItemListSelect,
  type HrOnboardingPlanItemRow
} from "@/lib/hr/onboarding-plans";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { loadHrOnboardingPlan } from "@/lib/hr/onboarding-plan-actions";
import { onboardingPlanItemPayloadSchema } from "@/lib/hr/onboarding-plan-validation";

type RouteParams = { params: { id: string; itemId: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: itemId } = hrIdParamSchema.parse({ id: params.itemId });
    const payload = onboardingPlanItemPayloadSchema.partial().parse(await request.json());
    const plan = await loadHrOnboardingPlan(context, id);
    if (!plan) return hrApiError("Plano de onboarding nao encontrado.", 404);

    const { data: existingData, error: existingError } = await context.supabase
      .from("hr_onboarding_plan_items")
      .select("id, plan_id, title, description, category, owner_area, responsible_profile_code, due_days_after_start, is_required, is_critical, blocks_operational_release, related_document_type_id, sort_order, status")
      .eq("id", itemId)
      .eq("plan_id", plan.id)
      .is("deleted_at", null)
      .limit(1);

    if (existingError) {
      logHrApiError("onboarding_plan_items.lookup_failed", existingError);
      return hrApiError("Nao foi possivel localizar o item do plano.", 500);
    }

    const existing = existingData?.[0] as
      | {
          id: string;
          title: string;
          description: string | null;
          category: string;
          owner_area: string;
          responsible_profile_code: string | null;
          due_days_after_start: number | null;
          is_required: boolean;
          is_critical: boolean;
          blocks_operational_release: boolean;
          related_document_type_id: string | null;
          sort_order: number;
          status: string;
        }
      | undefined;

    if (!existing) return hrApiError("Item do checklist nao encontrado.", 404);

    const mergedPayload = {
      title: payload.title ?? existing.title,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      category: payload.category ?? existing.category,
      ownerArea: payload.ownerArea ?? existing.owner_area,
      responsibleProfileCode: pickPayload(payload, "responsibleProfileCode", existing.responsible_profile_code ?? undefined) as string | undefined,
      dueDaysAfterStart: pickPayload(payload, "dueDaysAfterStart", existing.due_days_after_start ?? undefined) as number | undefined,
      isRequired: payload.isRequired ?? existing.is_required,
      isCritical: payload.isCritical ?? existing.is_critical,
      blocksOperationalRelease: payload.blocksOperationalRelease ?? existing.blocks_operational_release,
      relatedDocumentTypeId: pickPayload(payload, "relatedDocumentTypeId", existing.related_document_type_id ?? undefined) as string | undefined,
      sortOrder: payload.sortOrder ?? existing.sort_order,
      status: payload.status ?? existing.status
    };
    const updatePayload = await prepareHrOnboardingPlanItemWrite(context, plan, mergedPayload);
    const { data, error } = await context.supabase
      .from("hr_onboarding_plan_items")
      .update({
        ...updatePayload,
        updated_by: context.session.user.id
      })
      .eq("id", itemId)
      .select(onboardingPlanItemListSelect)
      .single();

    if (error) {
      logHrApiError("onboarding_plan_items.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o item do checklist.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrOnboardingPlanItem(data as unknown as HrOnboardingPlanItemRow) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar o item do plano.");
  }
}
