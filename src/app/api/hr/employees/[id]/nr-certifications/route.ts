import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessHrEmployee, getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema, nrCertificationsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { mapNrCertification, nrCertificationListSelect, type NrCertificationRow } from "@/lib/hr/occupational-health";

type RouteParams = { params: { id: string } };

export async function GET(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const query = parseSearchParams(request, nrCertificationsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let nrQuery = context.supabase
      .from("employee_nr_certifications")
      .select(nrCertificationListSelect, { count: "exact" })
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (query.nrCode) nrQuery = nrQuery.eq("nr_code", query.nrCode);
    if (query.status) nrQuery = nrQuery.eq("status", query.status);
    if (query.expiresFrom) nrQuery = nrQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) nrQuery = nrQuery.lte("expires_at", query.expiresTo);

    const { data, error, count } = await nrQuery.order("expires_at", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("occupational.employee_nr_failed", error);
      return hrApiError("Nao foi possivel carregar NRs do colaborador.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as NrCertificationRow[]).map((row) => mapNrCertification(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar NRs do colaborador.");
  }
}
