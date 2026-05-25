import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { loadHrOnboardingDashboard, summarizeHrOnboardingDashboard } from "@/lib/hr/onboarding-dashboard";
import { hrOnboardingDashboardSummaryQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrOnboardingDashboardSummaryQuerySchema);

    if (query.unitId && !context.isSuperAdmin && !context.accessibleUnitIds.includes(query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }

    const items = await loadHrOnboardingDashboard(context, query);

    return NextResponse.json({
      ok: true,
      data: summarizeHrOnboardingDashboard(items)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar o resumo de onboarding.");
  }
}
