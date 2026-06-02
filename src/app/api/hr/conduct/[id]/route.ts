import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { conductListSelect, loadEmployeeConduct, prepareEmployeeConductWrite, redactEmployeeConduct, type EmployeeConductRow } from "@/lib/hr/employee-conduct";
import { employeeConductRecordPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const conduct = await loadEmployeeConduct(context, id);
    if (!conduct) return hrApiError("Registro de conduta nao encontrado.", 404);

    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.conductSensitiveView);
    return NextResponse.json({ ok: true, data: redactEmployeeConduct(conduct, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(conduct.unit_id)) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Registro de conduta nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar registro de conduta.");
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadEmployeeConduct(context, id);
    if (!existing) return hrApiError("Registro de conduta nao encontrado.", 404);

    const partial = employeeConductRecordPayloadSchema.partial().parse(await request.json());
    const merged = employeeConductRecordPayloadSchema.parse({
      employeeId: partial.employeeId ?? existing.employee_id,
      conductType: partial.conductType ?? existing.conduct_type,
      occurrenceDate: partial.occurrenceDate ?? existing.occurrence_date,
      title: partial.title ?? existing.title,
      description: partial.description ?? existing.description ?? undefined,
      actionTaken: partial.actionTaken ?? existing.action_taken ?? undefined,
      status: partial.status ?? existing.status,
      severity: partial.severity ?? existing.severity,
      attachmentId: partial.attachmentId ?? existing.attachment_id ?? undefined,
      isSensitive: partial.isSensitive ?? existing.is_sensitive
    });
    const updatePayload = await prepareEmployeeConductWrite(context, merged, existing);

    const { data, error } = await context.supabase
      .from("employee_conduct_records")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(conductListSelect)
      .single();

    if (error) {
      logHrApiError("conduct.update_failed", error);
      return hrApiError("Nao foi possivel atualizar registro de conduta.", 500);
    }

    return NextResponse.json({ ok: true, data: redactEmployeeConduct(data as unknown as EmployeeConductRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar registro de conduta.");
  }
}
