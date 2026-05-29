import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadEmployeeMovement, redactEmployeeMovement, transitionEmployeeMovement } from "@/lib/hr/employee-movements";
import { hrIdParamSchema, hrMovementDecisionPayloadSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.movementsApprove);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = hrMovementDecisionPayloadSchema.parse(await request.json().catch(() => ({})));
    const movement = await loadEmployeeMovement(context, id);
    if (!movement) return hrApiError("Movimentacao funcional nao encontrada.", 404);

    const updated = await transitionEmployeeMovement({
      context,
      movement,
      expectedStatus: "pending_approval",
      nextStatus: "approved",
      action: "approved",
      comments: payload.comments
    });

    return NextResponse.json({ ok: true, data: redactEmployeeMovement(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel aprovar movimentacao funcional.");
  }
}
