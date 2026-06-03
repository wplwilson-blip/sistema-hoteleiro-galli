import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessHrEmployee, getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { redactEmployeeTermination, terminationListSelect, type EmployeeTerminationRow } from "@/lib/hr/employee-terminations";
import { employeeTerminationsQuerySchema, hrIdParamSchema, parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.terminationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const query = parseSearchParams(request, employeeTerminationsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.terminationsSensitiveView);

    let terminationsQuery = context.supabase
      .from("employee_terminations")
      .select(terminationListSelect)
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (query.terminationType) terminationsQuery = terminationsQuery.eq("termination_type", query.terminationType);
    if (query.status) terminationsQuery = terminationsQuery.eq("status", query.status);
    if (query.from) terminationsQuery = terminationsQuery.gte("effective_date", query.from);
    if (query.to) terminationsQuery = terminationsQuery.lte("effective_date", query.to);

    const { data, error } = await terminationsQuery.order("requested_at", { ascending: false }).limit(query.pageSize);
    if (error) return hrApiError("Nao foi possivel carregar desligamentos do colaborador.", 500);

    const rows = (data ?? []) as unknown as EmployeeTerminationRow[];
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => redactEmployeeTermination(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id)))
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar desligamentos do colaborador.");
  }
}
