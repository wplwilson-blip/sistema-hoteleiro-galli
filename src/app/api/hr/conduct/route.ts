import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { conductListSelect, prepareEmployeeConductWrite, redactEmployeeConduct, type EmployeeConductRow } from "@/lib/hr/employee-conduct";
import { employeeConductRecordPayloadSchema, employeeConductRecordsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductView, { scope: "active-unit" });
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, employeeConductRecordsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.conductSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let conductQuery = context.supabase.from("employee_conduct_records").select(conductListSelect, { count: "exact" }).is("deleted_at", null);

    conductQuery = conductQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) conductQuery = conductQuery.eq("employee_id", query.employeeId);
    if (query.unitId) conductQuery = conductQuery.eq("unit_id", query.unitId);
    if (query.conductType) conductQuery = conductQuery.eq("conduct_type", query.conductType);
    if (query.status) conductQuery = conductQuery.eq("status", query.status);
    if (query.severity) conductQuery = conductQuery.eq("severity", query.severity);
    if (query.from) conductQuery = conductQuery.gte("occurrence_date", query.from);
    if (query.to) conductQuery = conductQuery.lte("occurrence_date", query.to);
    if (query.search) conductQuery = conductQuery.ilike("title", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await conductQuery.order("occurrence_date", { ascending: false }).range(from, to);
    if (error) {
      logHrApiError("conduct.list_failed", error);
      return hrApiError("Nao foi possivel carregar conduta e ocorrencias.", 500);
    }

    const rows = (data ?? []) as unknown as EmployeeConductRow[];
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => redactEmployeeConduct(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar conduta e ocorrencias.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductManage);
  if (response || !context) return response;

  try {
    const payload = employeeConductRecordPayloadSchema.parse(await request.json());
    if (payload.status !== "draft") return hrApiError("Registro de conduta deve nascer como rascunho.", 422);
    const insertPayload = await prepareEmployeeConductWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_conduct_records")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(conductListSelect)
      .single();

    if (error) {
      logHrApiError("conduct.create_failed", error);
      return hrApiError("Nao foi possivel criar registro de conduta.", 500);
    }

    const conduct = data as unknown as EmployeeConductRow;
    return NextResponse.json({ ok: true, data: redactEmployeeConduct(conduct, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar registro de conduta.");
  }
}
