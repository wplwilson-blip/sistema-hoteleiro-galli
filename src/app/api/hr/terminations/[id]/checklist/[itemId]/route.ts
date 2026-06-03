import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadEmployeeTermination } from "@/lib/hr/employee-terminations";
import { employeeTerminationChecklistUpdateSchema } from "@/lib/hr/schemas";

const itemParamSchema = z.object({
  id: z.string().uuid("Identificador invalido."),
  itemId: z.string().uuid("Item invalido.")
});

export async function PATCH(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const { id, itemId } = itemParamSchema.parse(params);
    const payload = employeeTerminationChecklistUpdateSchema.parse(await request.json());
    const termination = await loadEmployeeTermination(context, id);
    if (!termination) return hrApiError("Desligamento nao encontrado.", 404);
    if (termination.status === "implemented" || termination.status === "cancelled") {
      return hrApiError("Checklist nao pode ser alterado apos efetivacao ou cancelamento.", 422);
    }
    const existing = (termination.employee_termination_checklists ?? []).find((item) => item.id === itemId);
    if (!existing) return hrApiError("Item do checklist nao encontrado.", 404);

    const shouldComplete = payload.isCompleted ?? existing.is_completed;
    const { data, error } = await context.supabase
      .from("employee_termination_checklists")
      .update({
        item_name: payload.itemName ?? existing.item_name,
        is_required: payload.isRequired ?? existing.is_required,
        is_completed: shouldComplete,
        completed_at: shouldComplete ? existing.completed_at ?? new Date().toISOString() : null,
        completed_by: shouldComplete ? existing.completed_by ?? context.session.user.id : null,
        notes: payload.notes?.trim() ?? existing.notes
      })
      .eq("id", itemId)
      .eq("termination_id", id)
      .select("id, termination_id, item_name, is_required, is_completed, completed_at, completed_by, notes, created_at, updated_at")
      .single();

    if (error) {
      logHrApiError("terminations.checklist_update_failed", error);
      return hrApiError("Nao foi possivel atualizar item do checklist.", 500);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar item do checklist.");
  }
}
