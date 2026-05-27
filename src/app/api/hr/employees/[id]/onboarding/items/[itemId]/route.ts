import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; itemId: string } };

const itemActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    notes: z.string().trim().max(1000, "Observacao muito longa.").optional()
  }),
  z.object({
    action: z.literal("complete"),
    notes: z.string().trim().max(1000, "Observacao muito longa.").optional()
  }),
  z.object({
    action: z.literal("waive"),
    notes: z.string().trim().min(3, "Informe uma justificativa para dispensar o item.").max(1000, "Justificativa muito longa.")
  }),
  z.object({
    action: z.literal("block"),
    notes: z.string().trim().min(3, "Informe o motivo do bloqueio.").max(1000, "Motivo muito longo.")
  }),
  z.object({
    action: z.literal("update_notes"),
    notes: z.string().trim().max(1000, "Observacao muito longa.")
  })
]);

const onboardingItemSelect =
  "id, onboarding_id, organization_id, unit_id, employee_id, title, status, notes, due_at, completed_at, updated_at";

function updateForAction(action: z.infer<typeof itemActionSchema>, userId: string) {
  const notes = "notes" in action ? action.notes?.trim() || null : null;
  const now = new Date().toISOString();

  if (action.action === "start") {
    return {
      status: "in_progress",
      notes,
      completed_at: null,
      completed_by: null,
      updated_by: userId
    };
  }

  if (action.action === "complete") {
    return {
      status: "completed",
      notes,
      completed_at: now,
      completed_by: userId,
      updated_by: userId
    };
  }

  if (action.action === "waive") {
    return {
      status: "waived",
      notes,
      completed_at: null,
      completed_by: null,
      updated_by: userId
    };
  }

  if (action.action === "block") {
    return {
      status: "blocked",
      notes,
      completed_at: null,
      completed_by: null,
      updated_by: userId
    };
  }

  return {
    notes,
    updated_by: userId
  };
}

function validateItemTransition(currentStatus: string, action: z.infer<typeof itemActionSchema>["action"]) {
  if (action === "complete" && currentStatus !== "in_progress") {
    return "Inicie o item antes de concluir.";
  }

  if (action === "start" && currentStatus !== "pending") {
    return "Somente itens pendentes podem ser iniciados.";
  }

  if (["completed", "waived", "cancelled"].includes(currentStatus) && action !== "update_notes") {
    return "Este item ja foi encerrado.";
  }

  return "";
}

function validateOnboardingTransition(currentStatus: string, action: z.infer<typeof itemActionSchema>["action"]) {
  if (["completed", "cancelled"].includes(currentStatus) && action !== "update_notes") {
    return "Este onboarding ja foi encerrado.";
  }

  if (currentStatus === "not_started" && action !== "start" && action !== "update_notes") {
    return "Inicie o onboarding antes de executar esta acao.";
  }

  return "";
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: itemId } = hrIdParamSchema.parse({ id: params.itemId });
    const payload = itemActionSchema.parse(await request.json());
    const employee = await assertCanAccessHrEmployee(context, id);

    let itemQuery = context.supabase
      .from("employee_onboarding_items")
      .select("id, onboarding_id, unit_id, employee_id, status")
      .eq("id", itemId)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .limit(1);

    if (employee.unit_id) itemQuery = itemQuery.eq("unit_id", employee.unit_id);

    const { data: itemData, error: itemError } = await itemQuery;

    if (itemError) {
      logHrApiError("employee_onboarding.item_lookup_failed", itemError);
      return hrApiError("Nao foi possivel localizar o item do onboarding.", 500);
    }

    const item = itemData?.[0] as { id: string; onboarding_id: string; unit_id: string | null; employee_id: string; status: string } | undefined;

    if (!item) {
      return hrApiError("Item de onboarding nao encontrado para este colaborador.", 404);
    }

    const transitionError = validateItemTransition(item.status, payload.action);
    if (transitionError) {
      return hrApiError(transitionError, 422);
    }

    const { data: onboardingData, error: onboardingError } = await context.supabase
      .from("employee_onboardings")
      .select("id, employee_id, unit_id, status, started_at")
      .eq("id", item.onboarding_id)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .limit(1);

    if (onboardingError) {
      logHrApiError("employee_onboarding.parent_lookup_failed", onboardingError);
      return hrApiError("Nao foi possivel validar o onboarding do colaborador.", 500);
    }

    const onboarding = onboardingData?.[0] as { id: string; employee_id: string; unit_id: string | null; status: string; started_at: string | null } | undefined;

    if (!onboarding) {
      return hrApiError("Onboarding nao encontrado para este colaborador.", 404);
    }

    const onboardingTransitionError = validateOnboardingTransition(onboarding.status, payload.action);
    if (onboardingTransitionError) {
      return hrApiError(onboardingTransitionError, 422);
    }

    if (payload.action === "start" && onboarding.status === "not_started") {
      const { error: onboardingStartError } = await context.supabase
        .from("employee_onboardings")
        .update({
          status: "in_progress",
          started_at: onboarding.started_at ?? new Date().toISOString(),
          updated_by: context.session.user.id
        })
        .eq("id", onboarding.id);

      if (onboardingStartError) {
        logHrApiError("employee_onboarding.parent_start_failed", onboardingStartError);
        return hrApiError("Nao foi possivel iniciar o onboarding do colaborador.", 500);
      }
    }

    const { data, error } = await context.supabase
      .from("employee_onboarding_items")
      .update(updateForAction(payload, context.session.user.id))
      .eq("id", item.id)
      .select(onboardingItemSelect)
      .single();

    if (error) {
      logHrApiError("employee_onboarding.item_update_failed", error);
      return hrApiError("Nao foi possivel atualizar o item do onboarding.", 500);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar o item do onboarding.");
  }
}
