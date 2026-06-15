import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertConductTransition, conductListSelect, isConductEvidenceRequired, loadEmployeeConduct, publishEmployeeConductEvent, redactEmployeeConduct, registerConductReview, statusForConductAction, type EmployeeConductRow } from "@/lib/hr/employee-conduct";
import { employeeConductDecisionPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductReview);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeConductDecisionPayloadSchema.parse(await request.json().catch(() => ({})));
    const conduct = await loadEmployeeConduct(context, id);
    if (!conduct) return hrApiError("Registro de conduta nao encontrado.", 404);
    assertConductTransition(conduct.status, "approved");
    if (isConductEvidenceRequired(conduct) && !conduct.attachment_id) {
      return hrApiError("Esta ocorrencia exige evidencia anexada antes da aprovacao. Anexe a evidencia no fluxo de Conduta e tente novamente.", 422);
    }

    const { data, error } = await context.supabase
      .from("employee_conduct_records")
      .update({ status: statusForConductAction("approved"), updated_by: context.session.user.id })
      .eq("id", id)
      .select(conductListSelect)
      .single();

    if (error) {
      logHrApiError("conduct.approve_failed", error);
      return hrApiError("Nao foi possivel aprovar conduta.", 500);
    }

    const updated = data as unknown as EmployeeConductRow;
    await registerConductReview({ context, conduct, action: "approved", comments: payload.comments });
    await publishEmployeeConductEvent({ context, conduct: updated, previous: conduct });
    return NextResponse.json({ ok: true, data: redactEmployeeConduct(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel aprovar conduta.");
  }
}
