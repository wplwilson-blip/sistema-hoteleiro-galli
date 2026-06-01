import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { nrCertificationPayloadSchema, nrCertificationsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { mapNrCertification, nrCertificationListSelect, prepareNrCertificationWrite, publishNrCertificationEvent, type NrCertificationRow } from "@/lib/hr/occupational-health";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, nrCertificationsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let nrQuery = context.supabase.from("employee_nr_certifications").select(nrCertificationListSelect, { count: "exact" }).is("deleted_at", null);

    if (!context.isSuperAdmin) nrQuery = nrQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) nrQuery = nrQuery.eq("employee_id", query.employeeId);
    if (query.unitId) nrQuery = nrQuery.eq("unit_id", query.unitId);
    if (query.nrCode) nrQuery = nrQuery.eq("nr_code", query.nrCode);
    if (query.status) nrQuery = nrQuery.eq("status", query.status);
    if (query.expiresFrom) nrQuery = nrQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) nrQuery = nrQuery.lte("expires_at", query.expiresTo);
    if (query.search) nrQuery = nrQuery.ilike("training_name", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await nrQuery.order("expires_at", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("occupational.nr_list_failed", error);
      return hrApiError("Nao foi possivel carregar certificacoes NR.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as NrCertificationRow[]).map((row) => mapNrCertification(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar certificacoes NR.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalManage);
  if (response || !context) return response;

  try {
    const payload = nrCertificationPayloadSchema.parse(await request.json());
    const insertPayload = await prepareNrCertificationWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_nr_certifications")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(nrCertificationListSelect)
      .single();

    if (error) {
      logHrApiError("occupational.nr_create_failed", error);
      return hrApiError("Nao foi possivel criar certificacao NR.", 500);
    }

    const certification = data as unknown as NrCertificationRow;
    await publishNrCertificationEvent({ context, certification, created: true });

    return NextResponse.json({ ok: true, data: mapNrCertification(certification, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar certificacao NR.");
  }
}
