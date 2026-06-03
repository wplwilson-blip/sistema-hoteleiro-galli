import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { createTerminationChecklistItem, loadEmployeeTermination } from "@/lib/hr/employee-terminations";
import { employeeTerminationChecklistPayloadSchema, hrIdParamSchema } from "@/lib/hr/schemas";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeTerminationChecklistPayloadSchema.parse(await request.json());
    const termination = await loadEmployeeTermination(context, id);
    if (!termination) return hrApiError("Desligamento nao encontrado.", 404);
    if (termination.status === "implemented" || termination.status === "cancelled") {
      return hrApiError("Checklist nao pode ser alterado apos efetivacao ou cancelamento.", 422);
    }
    const item = await createTerminationChecklistItem(context, termination, payload);
    return NextResponse.json({ ok: true, data: item }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar item do checklist.");
  }
}
