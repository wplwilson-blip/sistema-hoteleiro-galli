import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission, type HrRequestContext } from "@/lib/hr/api-auth";
import { loadDevelopmentPlan, prepareDevelopmentPlanItemWrite } from "@/lib/hr/development-plan-actions";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import { developmentPlanItemSelect, mapDevelopmentPlanItem, type EmployeeDevelopmentPlanItemRow, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { developmentPlanItemPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

async function writeDevelopmentPlanItemCreatedEvent(input: {
  context: HrRequestContext;
  plan: EmployeeDevelopmentPlanRow;
  item: EmployeeDevelopmentPlanItemRow;
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.plan.employee_id,
    eventType: "development_plan_item_created",
    title: "Item de PDI criado",
    description: `${input.item.title}: Item de PDI criado para acompanhamento.`,
    severity: "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_development_plan_item",
    sourceEntityId: input.item.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `development-plan-item:${input.item.id}:created`,
    eventPayload: {
      development_plan_id: input.plan.id,
      plan_title: input.plan.title,
      item_title: input.item.title,
      item_type: input.item.action_type,
      due_date: input.item.due_at,
      responsible_user_id: input.item.responsible_user_id
    }
  });

  if (!result.ok) {
    logHrApiError("development_plan_items.functional_event_create_failed", { message: result.error.message, code: result.error.code });
  }
}

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
    const item = data as unknown as EmployeeDevelopmentPlanItemRow;
    await writeDevelopmentPlanItemCreatedEvent({ context, plan, item });

    return NextResponse.json({ ok: true, data: mapDevelopmentPlanItem(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar item do PDI.");
  }
}
