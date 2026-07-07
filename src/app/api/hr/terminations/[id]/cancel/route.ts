import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadEmployeeTermination, redactEmployeeTermination, transitionEmployeeTermination } from "@/lib/hr/employee-terminations";
import { employeeTerminationDecisionPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeTerminationDecisionPayloadSchema.parse(await request.json().catch(() => ({})));
    const termination = await loadEmployeeTermination(context, id);
    if (!termination) return hrApiError("Desligamento nao encontrado.", 404);

    // RH-E-05: cancelar um desligamento ja 'implemented' (mas ainda NAO efetivado no cadastro) exige
    // justificativa. Fora dessa janela (draft/approved), o comportamento segue como antes.
    const isLateCancel = termination.status === "implemented" && termination.applied_at === null;
    let reason: string | undefined;
    if (isLateCancel) {
      reason = payload.comments?.trim();
      if (!reason) {
        return hrApiError("Informe a justificativa para cancelar um desligamento ja efetivado administrativamente.", 422);
      }
    }

    const updated = await transitionEmployeeTermination({ context, termination, action: "cancel", reason });
    return NextResponse.json({ ok: true, data: redactEmployeeTermination(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel cancelar desligamento.");
  }
}
