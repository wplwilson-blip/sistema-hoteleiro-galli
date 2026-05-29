import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission, type HrRequestContext } from "@/lib/hr/api-auth";
import { loadDevelopmentPlan, prepareDevelopmentPlanItemWrite } from "@/lib/hr/development-plan-actions";
import { createEmployeeFunctionalEvent, type EmployeeFunctionalEventType } from "@/lib/hr/employee-functional-events";
import { developmentPlanItemSelect, mapDevelopmentPlanItem, type EmployeeDevelopmentPlanItemRow, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { developmentPlanItemPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; itemId: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

function developmentPlanItemEventForStatus(status: string) {
  const events: Record<
    string,
    {
      eventType: EmployeeFunctionalEventType;
      title: string;
      description: string;
      dedupeSuffix: string;
      severity?: "info" | "notice" | "warning" | "critical";
    }
  > = {
    completed: {
      eventType: "development_plan_item_completed",
      title: "Item de PDI concluido",
      description: "Item de PDI concluido.",
      dedupeSuffix: "completed",
      severity: "notice"
    },
    overdue: {
      eventType: "development_plan_item_overdue",
      title: "Item de PDI em atraso",
      description: "Item de PDI marcado como atrasado.",
      dedupeSuffix: "overdue",
      severity: "warning"
    }
  };

  return events[status] ?? null;
}

async function writeDevelopmentPlanItemStatusEvent(input: {
  context: HrRequestContext;
  plan: EmployeeDevelopmentPlanRow;
  previousItem: EmployeeDevelopmentPlanItemRow;
  item: EmployeeDevelopmentPlanItemRow;
}) {
  if (input.previousItem.status === input.item.status) return;
  const event = developmentPlanItemEventForStatus(input.item.status);
  if (!event) return;

  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.plan.employee_id,
    eventType: event.eventType,
    title: event.title,
    description: `${input.item.title}: ${event.description}`,
    severity: event.severity ?? "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_development_plan_item",
    sourceEntityId: input.item.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `development-plan-item:${input.item.id}:${event.dedupeSuffix}`,
    eventPayload: {
      development_plan_id: input.plan.id,
      previous_status: input.previousItem.status,
      new_status: input.item.status,
      plan_title: input.plan.title,
      item_title: input.item.title,
      item_type: input.item.action_type,
      due_date: input.item.due_at,
      responsible_user_id: input.item.responsible_user_id
    }
  });

  if (!result.ok) {
    logHrApiError("development_plan_items.functional_event_status_failed", { message: result.error.message, code: result.error.code });
  }
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
    const item = data as unknown as EmployeeDevelopmentPlanItemRow;
    await writeDevelopmentPlanItemStatusEvent({ context, plan, previousItem: existing, item });

    return NextResponse.json({ ok: true, data: mapDevelopmentPlanItem(item) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar item do PDI.");
  }
}
