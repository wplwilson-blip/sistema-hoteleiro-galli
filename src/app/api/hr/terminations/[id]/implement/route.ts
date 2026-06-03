import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import {
  loadEmployeeTermination,
  publishTerminationImplemented,
  redactEmployeeTermination,
  transitionEmployeeTermination
} from "@/lib/hr/employee-terminations";
import { employeeTerminationDecisionPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    employeeTerminationDecisionPayloadSchema.parse(await request.json().catch(() => ({})));
    const termination = await loadEmployeeTermination(context, id);
    if (!termination) return hrApiError("Desligamento nao encontrado.", 404);
    if ((termination.employee_termination_checklists ?? []).some((item) => item.is_required && !item.is_completed)) {
      return hrApiError("Conclua as pendencias obrigatorias antes de efetivar o desligamento.", 422);
    }
    const updated = await transitionEmployeeTermination({ context, termination, action: "implement" });
    await publishTerminationImplemented({ context, previous: termination, termination: updated });
    return NextResponse.json({ ok: true, data: redactEmployeeTermination(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel efetivar desligamento.");
  }
}
