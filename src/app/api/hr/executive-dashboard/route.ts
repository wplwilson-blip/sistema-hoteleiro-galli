import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadHrExecutiveDashboard } from "@/lib/hr/executive-dashboard";
import { parseSearchParams } from "@/lib/hr/schemas";

const querySchema = z.object({
  unitId: z.string().uuid("Unidade invalida.").optional()
});

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, querySchema);
    if (query.unitId && !context.isSuperAdmin && !context.accessibleUnitIds.includes(query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }
    const data = await loadHrExecutiveDashboard(context, query.unitId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar dashboard executivo do RH.");
  }
}
