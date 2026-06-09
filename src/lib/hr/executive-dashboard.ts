import "server-only";

import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";

type UnitMeta = { id: string; code: string | null; name: string | null };
type EmployeeMeta = { full_name: string | null; preferred_name: string | null; department_id?: string | null };
type DepartmentMeta = { id: string; code: string | null; name: string | null };
type DocumentTypeMeta = { name: string | null; is_required: boolean | null };
type EmployeeLite = { id: string; unit_id: string | null; full_name: string | null; preferred_name: string | null; status: string | null; hire_date?: string | null; termination_date?: string | null };
type RowLite = { id: string; unit_id: string | null; employee_id?: string | null; status?: string | null; due_at?: string | null; due_date?: string | null; period_end?: string | null; valid_until?: string | null; expires_at?: string | null; requested_at?: string | null; occurrence_date?: string | null; effective_date?: string | null; record_type?: string | null; conduct_type?: string | null; termination_type?: string | null; movement_type?: string | null; title?: string | null; training_id?: string | null; employee?: EmployeeMeta | null; employees?: EmployeeMeta | null; units?: UnitMeta | null; unit?: UnitMeta | null; hr_document_types?: DocumentTypeMeta | null };

export type HrExecutivePendency = {
  id: string;
  type: string;
  typeLabel: string;
  employeeId: string;
  employeeName: string;
  departmentLabel: string;
  unitId: string;
  unitLabel: string;
  priority: "critical" | "high" | "medium" | "low";
  date: string;
  origin: string;
  href: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inScope(context: HrRequestContext, unitId: string | null | undefined) {
  return context.isSuperAdmin || Boolean(unitId && context.accessibleUnitIds.includes(unitId));
}

function scopedUnits(context: HrRequestContext, unitId?: string | null) {
  if (unitId && inScope(context, unitId)) return [unitId];
  if (unitId) return [];
  return context.isSuperAdmin ? [] : context.accessibleUnitIds;
}

function unitLabel(unit?: UnitMeta | null) {
  if (!unit) return "Sem unidade";
  return [unit.code, unit.name].filter(Boolean).join(" - ") || unit.name || unit.code || "Sem unidade";
}

function employeeName(row?: { full_name: string | null; preferred_name: string | null } | null) {
  return row?.preferred_name || row?.full_name || "Colaborador";
}

function departmentLabel(department?: DepartmentMeta | null) {
  if (!department) return "Sem departamento";
  return [department.code, department.name].filter(Boolean).join(" - ") || department.name || department.code || "Sem departamento";
}

function countBy<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.filter(predicate).length;
}

async function selectRows<T>(context: HrRequestContext, table: string, select: string, unitIds: string[], filters?: (query: any) => any) {
  let query = context.supabase.from(table).select(select);
  if (unitIds.length) query = query.in("unit_id", unitIds);
  if (filters) query = filters(query);
  const { data, error } = await query.limit(5000);
  if (error) {
    logHrApiError(`executive.${table}_failed`, error);
    return [] as T[];
  }
  return (data ?? []) as unknown as T[];
}

export async function loadHrExecutiveDashboard(context: HrRequestContext, unitId?: string | null) {
  const unitIds = scopedUnits(context, unitId);
  const now = today();
  const soon = addDays(30);

  const [employees, evaluations, developmentPlans, movements, trainings, occupationalRecords, nrCertifications, conduct, terminations, units] = await Promise.all([
    selectRows<EmployeeLite>(context, "employees", "id, unit_id, full_name, preferred_name, status, hire_date, termination_date", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_evaluations", "id, unit_id, employee_id, status", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_development_plans", "id, unit_id, employee_id, status, due_at", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_movements", "id, unit_id, employee_id, status, movement_type", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_trainings", "id, unit_id, employee_id, status, due_date, expires_at", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_occupational_records", "id, unit_id, employee_id, status, record_type, expires_at", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_nr_certifications", "id, unit_id, employee_id, status, expires_at", unitIds),
    selectRows<RowLite>(context, "employee_conduct_records", "id, unit_id, employee_id, status, conduct_type, occurrence_date", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_terminations", "id, unit_id, employee_id, status, termination_type, requested_at, effective_date", unitIds, (query) => query.is("deleted_at", null)),
    selectRows<UnitMeta>(context, "units", "id, code, name", unitIds, (query) => query.eq("status", "active").is("deleted_at", null))
  ]);

  const headcountTotal = employees.length;
  const activeEmployees = countBy(employees, (employee) => employee.status === "active");
  const inactiveEmployees = countBy(employees, (employee) => employee.status === "inactive");
  const admissions = countBy(employees, (employee) => Boolean(employee.hire_date && employee.hire_date >= addDays(-30)));
  const implementedTerminations = countBy(terminations, (termination) => termination.status === "implemented");
  const turnoverSimple = activeEmployees ? Number(((implementedTerminations / activeEmployees) * 100).toFixed(1)) : 0;

  const byUnit = units.map((unit) => {
    const rowsForUnit = <T extends { unit_id: string | null }>(rows: T[]) => rows.filter((row) => row.unit_id === unit.id);
    const unitEmployees = rowsForUnit(employees);
    const unitTrainings = rowsForUnit(trainings);
    const unitOccupational = rowsForUnit(occupationalRecords);
    const unitNrs = rowsForUnit(nrCertifications);
    const unitEvaluations = rowsForUnit(evaluations);
    const unitTerminations = rowsForUnit(terminations);
    const unitConduct = rowsForUnit(conduct);
    const unitMovements = rowsForUnit(movements);
    return {
      unitId: unit.id,
      unitLabel: unitLabel(unit),
      employees: unitEmployees.length,
      trainingsExpired: countBy(unitTrainings, (row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at.slice(0, 10) < now)),
      asoExpired: countBy(unitOccupational, (row) => (row.record_type ?? "").startsWith("aso_") && (row.status === "expired" || Boolean(row.expires_at && row.expires_at < now))),
      nrExpired: countBy(unitNrs, (row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at < now)),
      evaluationsPending: countBy(unitEvaluations, (row) => !["closed", "cancelled"].includes(row.status ?? "")),
      terminations: unitTerminations.length,
      warnings: countBy(unitConduct, (row) => row.conduct_type === "warning"),
      movements: unitMovements.length
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scope: { unitIds: unitIds.length ? unitIds : units.map((unit) => unit.id) },
    indicators: {
      headcountTotal,
      activeEmployees,
      inactiveEmployees,
      admissions,
      terminations: implementedTerminations,
      turnoverSimple,
      evaluationsPending: countBy(evaluations, (row) => !["closed", "cancelled"].includes(row.status ?? "")),
      developmentPlansPending: countBy(developmentPlans, (row) => !["completed", "cancelled"].includes(row.status ?? "")),
      trainingsExpired: countBy(trainings, (row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at.slice(0, 10) < now)),
      trainingsExpiring: countBy(trainings, (row) => Boolean(row.expires_at && row.expires_at.slice(0, 10) >= now && row.expires_at.slice(0, 10) <= soon)),
      asoExpired: countBy(occupationalRecords, (row) => (row.record_type ?? "").startsWith("aso_") && (row.status === "expired" || Boolean(row.expires_at && row.expires_at < now))),
      asoExpiring: countBy(occupationalRecords, (row) => (row.record_type ?? "").startsWith("aso_") && Boolean(row.expires_at && row.expires_at >= now && row.expires_at <= soon)),
      nrExpired: countBy(nrCertifications, (row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at < now)),
      nrExpiring: countBy(nrCertifications, (row) => Boolean(row.expires_at && row.expires_at >= now && row.expires_at <= soon)),
      movementsInProgress: countBy(movements, (row) => ["draft", "pending_approval", "approved"].includes(row.status ?? "")),
      conductOpen: countBy(conduct, (row) => ["draft", "pending_review"].includes(row.status ?? "") && ["warning", "suspension", "complaint"].includes(row.conduct_type ?? "")),
      terminationsInProgress: countBy(terminations, (row) => ["draft", "pending_review", "approved"].includes(row.status ?? ""))
    },
    byUnit
  };
}

function makePendency(input: {
  id: string;
  type: string;
  typeLabel: string;
  employeeId?: string | null;
  employee?: EmployeeMeta | null;
  departmentsById?: Map<string, DepartmentMeta>;
  unitId?: string | null;
  unit?: UnitMeta | null;
  priority: HrExecutivePendency["priority"];
  date?: string | null;
  origin: string;
  href: string;
}): HrExecutivePendency {
  return {
    id: input.id,
    type: input.type,
    typeLabel: input.typeLabel,
    employeeId: input.employeeId ?? "",
    employeeName: employeeName(input.employee),
    departmentLabel: departmentLabel(input.employee?.department_id ? input.departmentsById?.get(input.employee.department_id) : null),
    unitId: input.unitId ?? "",
    unitLabel: unitLabel(input.unit),
    priority: input.priority,
    date: input.date?.slice(0, 10) ?? "",
    origin: input.origin,
    href: input.href
  };
}

export async function loadHrPendingCenter(context: HrRequestContext, unitId?: string | null, employeeId?: string | null) {
  const unitIds = scopedUnits(context, unitId);
  const now = today();
  const soon = addDays(30);
  const employeeFilter = (query: any) => (employeeId ? query.eq("employee_id", employeeId) : query);

  const [documents, onboarding, evaluations, developmentPlans, trainings, occupationalRecords, nrCertifications, movements, conduct, terminations, departments] = await Promise.all([
    selectRows<RowLite>(context, "employee_documents", "id, unit_id, employee_id, status, valid_until, employees(full_name, preferred_name, department_id), units(id, code, name), hr_document_types(name, is_required)", unitIds, (query) => employeeFilter(query).in("status", ["pending", "under_review", "rejected", "expired"]).is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_onboardings", "id, unit_id, employee_id, status, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).in("status", ["not_started", "in_progress"]).is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_evaluations", "id, unit_id, employee_id, status, period_end, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).not("status", "in", "(closed,cancelled)").is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_development_plans", "id, unit_id, employee_id, status, due_at, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).not("status", "in", "(completed,cancelled)").is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_trainings", "id, unit_id, employee_id, status, due_date, expires_at, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).in("status", ["assigned", "scheduled", "in_progress", "expired", "retraining_required"]).is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_occupational_records", "id, unit_id, employee_id, status, record_type, expires_at, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).neq("status", "cancelled").is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_nr_certifications", "id, unit_id, employee_id, status, expires_at, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).neq("status", "cancelled").is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_movements", "id, unit_id, employee_id, status, effective_date, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).in("status", ["draft", "pending_approval", "approved"]).is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_conduct_records", "id, unit_id, employee_id, status, conduct_type, occurrence_date, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).in("status", ["draft", "pending_review"]).is("deleted_at", null)),
    selectRows<RowLite>(context, "employee_terminations", "id, unit_id, employee_id, status, requested_at, effective_date, employees(full_name, preferred_name, department_id), units(id, code, name)", unitIds, (query) => employeeFilter(query).in("status", ["draft", "pending_review", "approved"]).is("deleted_at", null)),
    selectRows<DepartmentMeta>(context, "departments", "id, code, name", unitIds, (query) => query.is("deleted_at", null))
  ]);
  const departmentsById = new Map(departments.map((department) => [department.id, department]));

  const pendencies: HrExecutivePendency[] = [
    ...documents.map((row) => {
      const isRequired = row.hr_document_types?.is_required ?? false;
      const isCritical = isRequired || row.status === "expired" || row.status === "rejected";
      return makePendency({ id: row.id, type: "documents", typeLabel: isRequired ? "Documento obrigatorio pendente" : "Documento pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: isCritical ? "critical" : "high", date: row.valid_until, origin: "Documentos", href: `/rh/employees/${row.employee_id}?tab=documents` });
    }),
    ...onboarding.map((row) => makePendency({ id: row.id, type: "onboarding", typeLabel: "Onboarding pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: "medium", date: "", origin: "Onboarding", href: `/rh/employees/${row.employee_id}?tab=onboarding` })),
    ...evaluations.map((row) => makePendency({ id: row.id, type: "evaluations", typeLabel: row.period_end && row.period_end.slice(0, 10) < now ? "Avaliacao atrasada" : "Avaliacao pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.period_end && row.period_end.slice(0, 10) < now ? "high" : "medium", date: row.period_end, origin: "Avaliacoes", href: `/rh/employees/${row.employee_id}?tab=evaluations` })),
    ...developmentPlans.map((row) => makePendency({ id: row.id, type: "development", typeLabel: row.due_at && row.due_at.slice(0, 10) < now ? "PDI atrasado" : "PDI pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.due_at && row.due_at.slice(0, 10) < now ? "high" : "medium", date: row.due_at, origin: "PDI", href: `/rh/employees/${row.employee_id}?tab=development` })),
    ...trainings.map((row) => makePendency({ id: row.id, type: "trainings", typeLabel: row.status === "retraining_required" ? "Reciclagem necessaria" : row.status === "expired" || (row.expires_at && row.expires_at.slice(0, 10) < now) ? "Treinamento vencido" : "Treinamento obrigatorio pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.status === "expired" || row.status === "retraining_required" || (row.expires_at && row.expires_at.slice(0, 10) < now) ? "critical" : "medium", date: row.expires_at ?? row.due_date, origin: "Treinamentos", href: `/rh/employees/${row.employee_id}?tab=trainings` })),
    ...occupationalRecords.filter((row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at <= soon)).map((row) => makePendency({ id: row.id, type: "occupational", typeLabel: row.record_type?.startsWith("aso_") ? (row.status === "expired" || Boolean(row.expires_at && row.expires_at < now) ? "ASO vencido" : "ASO a vencer") : "Saude ocupacional pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.status === "expired" || Boolean(row.expires_at && row.expires_at < now) ? "critical" : "high", date: row.expires_at, origin: "Saude Ocupacional", href: `/rh/employees/${row.employee_id}?tab=occupational` })),
    ...nrCertifications.filter((row) => row.status === "expired" || Boolean(row.expires_at && row.expires_at <= soon)).map((row) => makePendency({ id: row.id, type: "occupational", typeLabel: row.status === "expired" || Boolean(row.expires_at && row.expires_at < now) ? "NR vencida" : "NR a vencer", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.status === "expired" || Boolean(row.expires_at && row.expires_at < now) ? "critical" : "high", date: row.expires_at, origin: "Saude Ocupacional", href: `/rh/employees/${row.employee_id}?tab=occupational` })),
    ...movements.map((row) => makePendency({ id: row.id, type: "movements", typeLabel: row.status === "approved" ? "Movimentacao aguardando efetivacao" : "Movimentacao aguardando aprovacao", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: "high", date: row.effective_date, origin: "Movimentacoes", href: `/rh/employees/${row.employee_id}?tab=career` })),
    ...conduct.map((row) => makePendency({ id: row.id, type: "conduct", typeLabel: row.conduct_type === "suspension" || row.status === "pending_review" ? "Ocorrencia critica" : "Conduta aguardando revisao", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.conduct_type === "suspension" ? "critical" : "high", date: row.occurrence_date, origin: "Conduta", href: `/rh/employees/${row.employee_id}?tab=conduct` })),
    ...terminations.map((row) => makePendency({ id: row.id, type: "terminations", typeLabel: row.status === "approved" ? "Desligamento aguardando efetivacao" : "Desligamento pendente", employeeId: row.employee_id, employee: row.employees, departmentsById, unitId: row.unit_id, unit: row.units, priority: row.status === "approved" ? "critical" : "high", date: row.effective_date ?? row.requested_at, origin: "Desligamentos", href: `/rh/employees/${row.employee_id}?tab=termination` }))
  ];

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return pendencies.sort((a, b) => order[a.priority] - order[b.priority] || (a.date || "9999").localeCompare(b.date || "9999")).slice(0, 200);
}
