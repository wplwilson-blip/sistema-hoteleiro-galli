import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import {
  createDefaultTerminationChecklist,
  prepareEmployeeTerminationWrite,
  publishTerminationStarted,
  redactEmployeeTermination,
  terminationListSelect,
  type EmployeeTerminationRow
} from "@/lib/hr/employee-terminations";
import { employeeTerminationPayloadSchema, employeeTerminationsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsView, { scope: "active-unit" });
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, employeeTerminationsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.terminationsSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let terminationsQuery = context.supabase.from("employee_terminations").select(terminationListSelect, { count: "exact" }).is("deleted_at", null);
    terminationsQuery = terminationsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) terminationsQuery = terminationsQuery.eq("employee_id", query.employeeId);
    if (query.unitId) terminationsQuery = terminationsQuery.eq("unit_id", query.unitId);
    if (query.terminationType) terminationsQuery = terminationsQuery.eq("termination_type", query.terminationType);
    if (query.status) terminationsQuery = terminationsQuery.eq("status", query.status);
    if (query.from) terminationsQuery = terminationsQuery.gte("effective_date", query.from);
    if (query.to) terminationsQuery = terminationsQuery.lte("effective_date", query.to);
    if (query.search) terminationsQuery = terminationsQuery.ilike("termination_reason", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await terminationsQuery.order("requested_at", { ascending: false }).range(from, to);
    if (error) {
      logHrApiError("terminations.list_failed", error);
      return hrApiError("Nao foi possivel carregar desligamentos.", 500);
    }

    const rows = (data ?? []) as unknown as EmployeeTerminationRow[];
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => redactEmployeeTermination(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar desligamentos.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsManage);
  if (response || !context) return response;

  try {
    const payload = employeeTerminationPayloadSchema.parse(await request.json());
    if (payload.status !== "draft") return hrApiError("Desligamento deve nascer como rascunho.", 422);
    const insertPayload = await prepareEmployeeTerminationWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_terminations")
      .insert({ ...insertPayload, requested_by: context.session.user.id, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(terminationListSelect)
      .single();

    if (error) {
      logHrApiError("terminations.create_failed", error);
      return hrApiError("Nao foi possivel criar desligamento.", 500);
    }

    const termination = data as unknown as EmployeeTerminationRow;
    await publishTerminationStarted({ context, termination });
    await createDefaultTerminationChecklist(context, termination);
    const reloaded = await context.supabase.from("employee_terminations").select(terminationListSelect).eq("id", termination.id).single();
    return NextResponse.json({ ok: true, data: redactEmployeeTermination((reloaded.data ?? termination) as unknown as EmployeeTerminationRow, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar desligamento.");
  }
}
