import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadHrPendingCenter } from "@/lib/hr/executive-dashboard";
import { parseSearchParams } from "@/lib/hr/schemas";

const querySchema = z.object({
  unitId: z.string().uuid("Unidade invalida.").optional(),
  employeeId: z.string().uuid("Colaborador invalido.").optional(),
  type: z.string().trim().max(80).optional()
});

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, querySchema);
    if (query.unitId && !context.isSuperAdmin && !context.accessibleUnitIds.includes(query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }
    const data = await loadHrPendingCenter(context, query.unitId, query.employeeId);
    return NextResponse.json({
      ok: true,
      data: query.type ? data.filter((item) => item.type === query.type) : data,
      summary: {
        total: data.length,
        critical: data.filter((item) => item.priority === "critical").length,
        high: data.filter((item) => item.priority === "high").length,
        medium: data.filter((item) => item.priority === "medium").length,
        low: data.filter((item) => item.priority === "low").length
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar central de pendencias do RH.");
  }
}
