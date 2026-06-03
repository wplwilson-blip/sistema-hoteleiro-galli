import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertConductTransition, conductListSelect, loadEmployeeConduct, redactEmployeeConduct, registerConductReview, statusForConductAction, type EmployeeConductRow } from "@/lib/hr/employee-conduct";
import { employeeConductRejectPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductReview);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeConductRejectPayloadSchema.parse(await request.json());
    const conduct = await loadEmployeeConduct(context, id);
    if (!conduct) return hrApiError("Registro de conduta nao encontrado.", 404);
    assertConductTransition(conduct.status, "rejected");

    const { data, error } = await context.supabase
      .from("employee_conduct_records")
      .update({ status: statusForConductAction("rejected"), updated_by: context.session.user.id })
      .eq("id", id)
      .select(conductListSelect)
      .single();

    if (error) {
      logHrApiError("conduct.reject_failed", error);
      return hrApiError("Nao foi possivel rejeitar conduta.", 500);
    }

    await registerConductReview({ context, conduct, action: "rejected", comments: payload.comments });
    return NextResponse.json({ ok: true, data: redactEmployeeConduct(data as unknown as EmployeeConductRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel rejeitar conduta.");
  }
}
