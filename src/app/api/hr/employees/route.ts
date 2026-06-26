import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  type HrEmployeeRow
} from "@/lib/hr/api-auth";
import { canUseRequestedUnit, getEmployeeRelations, loadEmployeeDocumentSummaries, loadEmployeeRelations } from "@/lib/hr/data";
import { hrEmployeeListQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { redactEmployeeForHrList } from "@/lib/hr/redaction";

function emptyEmployeesPayload(page: number, pageSize: number, canViewSensitive = false) {
  return NextResponse.json({
    ok: true,
    data: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
    permissions: { canViewSensitive }
  });
}

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrEmployeeListQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.employeesSensitiveView);
    const canViewSensitive = sensitiveAccess.hasPermission;

    if (!canUseRequestedUnit(context, query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }

    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return emptyEmployeesPayload(query.page, query.pageSize, canViewSensitive);
    }

    let employeesQuery = context.supabase
      .from("employees")
      .select(
        "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at, updated_at",
        { count: "exact" }
      )
      .is("deleted_at", null);

    // active-unit: accessibleUnitIds ja vem estreitado (inclui super admin = [unidade ativa]).
    employeesQuery = employeesQuery.in("unit_id", context.accessibleUnitIds);

    if (query.unitId) employeesQuery = employeesQuery.eq("unit_id", query.unitId);
    if (query.departmentId) employeesQuery = employeesQuery.eq("department_id", query.departmentId);
    if (query.jobPositionId) employeesQuery = employeesQuery.eq("job_position_id", query.jobPositionId);
    if (query.status) employeesQuery = employeesQuery.eq("status", query.status);
    if (query.search) employeesQuery = employeesQuery.ilike("full_name", `%${escapeIlikePattern(query.search)}%`);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await employeesQuery.order("full_name", { ascending: true }).range(from, to);

    if (error) {
      logHrApiError("employees.list_failed", error);
      return hrApiError("Nao foi possivel carregar os colaboradores de RH.", 500);
    }

    const employees = (data ?? []) as HrEmployeeRow[];
    const [relations, documentSummaries] = await Promise.all([
      loadEmployeeRelations(context.supabase, employees),
      loadEmployeeDocumentSummaries(
        context.supabase,
        employees.map((employee) => employee.id)
      )
    ]);
    const total = count ?? 0;

    return NextResponse.json({
      ok: true,
      data: employees.map((employee) =>
        redactEmployeeForHrList(
          employee,
          getEmployeeRelations(employee, relations),
          documentSummaries.get(employee.id) ?? { total: 0, pending: 0, expired: 0 }
        )
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize)
      },
      permissions: { canViewSensitive }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar os colaboradores de RH.");
  }
}
