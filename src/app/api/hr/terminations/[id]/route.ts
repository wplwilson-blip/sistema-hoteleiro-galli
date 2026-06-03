import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import {
  loadEmployeeTermination,
  prepareEmployeeTerminationWrite,
  redactEmployeeTermination,
  terminationListSelect,
  type EmployeeTerminationRow
} from "@/lib/hr/employee-terminations";
import { employeeTerminationPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const termination = await loadEmployeeTermination(context, id);
    if (!termination) return hrApiError("Desligamento nao encontrado.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.terminationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: redactEmployeeTermination(termination, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(termination.unit_id))
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar desligamento.");
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadEmployeeTermination(context, id);
    if (!existing) return hrApiError("Desligamento nao encontrado.", 404);
    if (existing.status !== "draft") return hrApiError("Somente desligamentos em rascunho podem ser editados.", 422);

    const payload = employeeTerminationPayloadSchema.parse(await request.json());
    if (payload.status !== "draft") return hrApiError("Use as acoes do fluxo para alterar status do desligamento.", 422);
    const updatePayload = await prepareEmployeeTerminationWrite(context, payload, existing);
    const { data, error } = await context.supabase
      .from("employee_terminations")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .eq("status", "draft")
      .is("deleted_at", null)
      .select(terminationListSelect)
      .single();

    if (error) {
      logHrApiError("terminations.update_failed", error);
      return hrApiError("Nao foi possivel atualizar desligamento.", 500);
    }

    return NextResponse.json({ ok: true, data: redactEmployeeTermination(data as unknown as EmployeeTerminationRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar desligamento.");
  }
}
