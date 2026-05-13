import { logHrApiError, type HrEmployeeRow, type HrRequestContext } from "@/lib/hr/api-auth";
import type { EmployeeDocumentSummary, EmployeeRelations } from "@/lib/hr/redaction";
import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export async function loadEmployeeRelations(supabase: SupabaseAdmin, employees: HrEmployeeRow[]) {
  const unitIds = unique(employees.map((employee) => employee.unit_id));
  const departmentIds = unique(employees.map((employee) => employee.department_id));
  const jobPositionIds = unique(employees.map((employee) => employee.job_position_id));

  const [unitsResult, departmentsResult, jobPositionsResult] = await Promise.all([
    unitIds.length
      ? supabase.from("units").select("id, code, name").in("id", unitIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    departmentIds.length
      ? supabase.from("departments").select("id, code, name").in("id", departmentIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    jobPositionIds.length
      ? supabase.from("job_positions").select("id, code, name").in("id", jobPositionIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (unitsResult.error) {
    logHrApiError("employee_units_lookup_failed", unitsResult.error);
    throw new Error("Nao foi possivel carregar as unidades dos colaboradores.");
  }

  if (departmentsResult.error) {
    logHrApiError("employee_departments_lookup_failed", departmentsResult.error);
    throw new Error("Nao foi possivel carregar os departamentos dos colaboradores.");
  }

  if (jobPositionsResult.error) {
    logHrApiError("employee_job_positions_lookup_failed", jobPositionsResult.error);
    throw new Error("Nao foi possivel carregar os cargos dos colaboradores.");
  }

  return {
    unitsById: new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit])),
    departmentsById: new Map((departmentsResult.data ?? []).map((department) => [department.id, department])),
    jobPositionsById: new Map((jobPositionsResult.data ?? []).map((position) => [position.id, position]))
  };
}

export function getEmployeeRelations(
  employee: HrEmployeeRow,
  relations: Awaited<ReturnType<typeof loadEmployeeRelations>>
): EmployeeRelations {
  return {
    unit: employee.unit_id ? relations.unitsById.get(employee.unit_id) ?? null : null,
    department: employee.department_id ? relations.departmentsById.get(employee.department_id) ?? null : null,
    jobPosition: employee.job_position_id ? relations.jobPositionsById.get(employee.job_position_id) ?? null : null
  };
}

export async function loadEmployeeDocumentSummaries(supabase: SupabaseAdmin, employeeIds: string[]) {
  const summaries = new Map<string, EmployeeDocumentSummary>();

  for (const employeeId of employeeIds) {
    summaries.set(employeeId, { total: 0, pending: 0, expired: 0 });
  }

  if (!employeeIds.length) {
    return summaries;
  }

  const { data, error } = await supabase
    .from("employee_documents")
    .select("employee_id, status, valid_until")
    .in("employee_id", employeeIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_document_summaries_failed", error);
    throw new Error("Nao foi possivel carregar os indicadores documentais dos colaboradores.");
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const document of data ?? []) {
    const current = summaries.get(document.employee_id) ?? { total: 0, pending: 0, expired: 0 };
    current.total += 1;
    if (document.status === "pending") current.pending += 1;
    if (document.status === "expired" || (document.valid_until && document.valid_until < today)) current.expired += 1;
    summaries.set(document.employee_id, current);
  }

  return summaries;
}

export async function getOrganizationIdsForUnits(supabase: SupabaseAdmin, unitIds: string[]) {
  if (!unitIds.length) {
    return [];
  }

  const { data, error } = await supabase.from("units").select("organization_id").in("id", unitIds).is("deleted_at", null);

  if (error) {
    logHrApiError("unit_organizations_lookup_failed", error);
    throw new Error("Nao foi possivel validar as organizacoes das unidades.");
  }

  return unique((data ?? []).map((unit) => unit.organization_id));
}

export function canUseRequestedUnit(context: HrRequestContext, unitId: string | undefined) {
  return !unitId || context.isSuperAdmin || context.accessibleUnitIds.includes(unitId);
}
