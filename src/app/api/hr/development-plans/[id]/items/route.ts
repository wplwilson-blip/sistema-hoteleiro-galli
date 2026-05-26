import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadDevelopmentPlan, prepareDevelopmentPlanItemWrite } from "@/lib/hr/development-plan-actions";
import { developmentPlanItemSelect, mapDevelopmentPlanItem, type EmployeeDevelopmentPlanItemRow } from "@/lib/hr/development-plans";
import { developmentPlanItemPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.developmentManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = developmentPlanItemPayloadSchema.parse(await request.json());
    const plan = await loadDevelopmentPlan(context, id);
    if (!plan) return hrApiError("PDI nao encontrado.", 404);
    const { data, error } = await context.supabase
      .from("employee_development_plan_items")
      .insert({ ...prepareDevelopmentPlanItemWrite(plan, payload), created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(developmentPlanItemSelect)
      .single();

    if (error) {
      logHrApiError("development_plan_items.create_failed", error);
      return hrApiError("Nao foi possivel criar o item do PDI.", 500);
    }
    return NextResponse.json({ ok: true, data: mapDevelopmentPlanItem(data as unknown as EmployeeDevelopmentPlanItemRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar item do PDI.");
  }
}
