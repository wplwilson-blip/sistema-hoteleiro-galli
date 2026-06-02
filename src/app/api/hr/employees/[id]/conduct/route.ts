import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessHrEmployee, getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { conductListSelect, redactEmployeeConduct, type EmployeeConductRow } from "@/lib/hr/employee-conduct";
import { employeeConductRecordsQuerySchema, hrIdParamSchema, parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.conductView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const query = parseSearchParams(request, employeeConductRecordsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.conductSensitiveView);

    let conductQuery = context.supabase
      .from("employee_conduct_records")
      .select(conductListSelect)
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (query.conductType) conductQuery = conductQuery.eq("conduct_type", query.conductType);
    if (query.status) conductQuery = conductQuery.eq("status", query.status);
    if (query.severity) conductQuery = conductQuery.eq("severity", query.severity);
    if (query.from) conductQuery = conductQuery.gte("occurrence_date", query.from);
    if (query.to) conductQuery = conductQuery.lte("occurrence_date", query.to);

    const { data, error } = await conductQuery.order("occurrence_date", { ascending: false }).limit(query.pageSize);
    if (error) return hrApiError("Nao foi possivel carregar conduta do colaborador.", 500);

    const rows = (data ?? []) as unknown as EmployeeConductRow[];
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => redactEmployeeConduct(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id)))
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar conduta do colaborador.");
  }
}
