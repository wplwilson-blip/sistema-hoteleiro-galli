import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadHrOnboardingDashboard, summarizeHrOnboardingDashboard } from "@/lib/hr/onboarding-dashboard";
import { hrOnboardingDashboardQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrOnboardingDashboardQuerySchema);

    if (query.unitId && !context.isSuperAdmin && !context.accessibleUnitIds.includes(query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }

    const items = await loadHrOnboardingDashboard(context, query);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize;
    const pagedItems = items.slice(from, to);

    return NextResponse.json({
      ok: true,
      data: pagedItems,
      summary: summarizeHrOnboardingDashboard(items),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: items.length,
        totalPages: Math.ceil(items.length / query.pageSize)
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar a fila de onboarding.");
  }
}
