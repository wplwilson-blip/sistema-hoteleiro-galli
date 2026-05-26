import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadDevelopmentPlan, prepareDevelopmentPlanItemWrite } from "@/lib/hr/development-plan-actions";
import { developmentPlanItemSelect, mapDevelopmentPlanItem, type EmployeeDevelopmentPlanItemRow } from "@/lib/hr/development-plans";
import { developmentPlanItemPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; itemId: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.developmentManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: itemId } = hrIdParamSchema.parse({ id: params.itemId });
    const payload = developmentPlanItemPayloadSchema.partial().parse(await request.json());
    const plan = await loadDevelopmentPlan(context, id);
    if (!plan) return hrApiError("PDI nao encontrado.", 404);

    const { data: existingData, error: existingError } = await context.supabase
      .from("employee_development_plan_items")
      .select(developmentPlanItemSelect)
      .eq("id", itemId)
      .eq("development_plan_id", id)
      .is("deleted_at", null)
      .limit(1);
    if (existingError) throw existingError;
    const existing = existingData?.[0] as unknown as EmployeeDevelopmentPlanItemRow | undefined;
    if (!existing) return hrApiError("Item do PDI nao encontrado.", 404);

    const merged = {
      title: payload.title ?? existing.title,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      actionType: payload.actionType ?? existing.action_type,
      dueAt: pickPayload(payload, "dueAt", existing.due_at ?? undefined) as string | undefined,
      responsibleUserId: pickPayload(payload, "responsibleUserId", existing.responsible_user_id ?? undefined) as string | undefined,
      status: payload.status ?? existing.status,
      completionNotes: pickPayload(payload, "completionNotes", existing.completion_notes ?? undefined) as string | undefined,
      completedAt: payload.status && payload.status !== "completed" ? undefined : (pickPayload(payload, "completedAt", existing.completed_at ?? undefined) as string | undefined)
    };
    const { data, error } = await context.supabase
      .from("employee_development_plan_items")
      .update({
        ...prepareDevelopmentPlanItemWrite(plan, developmentPlanItemPayloadSchema.parse(merged)),
        updated_by: context.session.user.id
      })
      .eq("id", itemId)
      .select(developmentPlanItemSelect)
      .single();
    if (error) {
      logHrApiError("development_plan_items.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o item do PDI.", 500);
    }
    return NextResponse.json({ ok: true, data: mapDevelopmentPlanItem(data as unknown as EmployeeDevelopmentPlanItemRow) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar item do PDI.");
  }
}
