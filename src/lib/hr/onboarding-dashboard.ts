import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";

export type HrOnboardingQueueType =
  | "blocked"
  | "critical"
  | "overdue"
  | "waiting_rh"
  | "waiting_manager"
  | "waiting_ti"
  | "almost_done";

export type HrOnboardingDashboardFilters = {
  unitId?: string;
  departmentId?: string;
  ownerArea?: string;
  status?: string;
  releaseStatus?: string;
  queueType?: HrOnboardingQueueType;
  dueFrom?: string;
  dueTo?: string;
  search?: string;
};

export type HrOnboardingDashboardItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  unitName: string;
  departmentId: string;
  departmentName: string;
  status: string;
  statusLabel: string;
  operationalReleaseStatus: string;
  operationalReleaseLabel: string;
  progressPercent: number;
  totalItems: number;
  resolvedItems: number;
  openItems: number;
  criticalOpenItems: number;
  blockingOpenItems: number;
  overdueItems: number;
  ownerAreas: string[];
  primaryOwnerArea: string;
  primaryOwnerAreaLabel: string;
  nextAction: string;
  nextActionDueAt: string;
  startedAt: string;
  expectedReleaseAt: string;
  updatedAt: string;
  queueTypes: HrOnboardingQueueType[];
  actionHref: string;
};

export type HrOnboardingDashboardSummary = {
  totalInProgress: number;
  blocked: number;
  critical: number;
  overdue: number;
  waitingRh: number;
  waitingManager: number;
  waitingTi: number;
  almostDone: number;
  byOwnerArea: Array<{ ownerArea: string; ownerAreaLabel: string; total: number }>;
  byUnit: Array<{ unitId: string; unitName: string; total: number }>;
};

type EmployeeOnboardingRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  plan_id: string | null;
  status: string;
  operational_release_status: string;
  started_at: string | null;
  expected_release_at: string | null;
  released_at: string | null;
  completed_at: string | null;
  blocked_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type EmployeeOnboardingItemRow = {
  id: string;
  onboarding_id: string;
  employee_id: string;
  unit_id: string;
  title: string;
  category: string;
  owner_area: string;
  due_at: string | null;
  status: string;
  is_required: boolean;
  is_critical: boolean;
  blocks_operational_release: boolean;
  updated_at: string;
};

type EmployeeLite = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  unit_id: string | null;
  department_id: string | null;
  status: string;
};

type UnitLite = { id: string; code: string | null; name: string | null };
type DepartmentLite = { id: string; code: string | null; name: string | null };

const onboardingSelect =
  "id, organization_id, unit_id, employee_id, plan_id, status, operational_release_status, started_at, expected_release_at, released_at, completed_at, blocked_reason, notes, created_at, updated_at";

const onboardingItemSelect =
  "id, onboarding_id, employee_id, unit_id, title, category, owner_area, due_at, status, is_required, is_critical, blocks_operational_release, updated_at";

const resolvedItemStatuses = new Set(["completed", "waived", "cancelled"]);
const openOnboardingStatuses = new Set(["not_started", "in_progress"]);
const openItemStatuses = new Set(["pending", "in_progress", "blocked"]);

const onboardingStatusLabels: Record<string, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado"
};

const releaseStatusLabels: Record<string, string> = {
  blocked: "Bloqueado",
  partial: "Parcialmente liberado",
  released: "Liberado",
  critical_pending: "Pendência crítica"
};

const ownerAreaLabels: Record<string, string> = {
  RH: "RH",
  GESTOR: "Gestor",
  TI: "TI",
  GOVERNANCA: "Governanca",
  RECEPCAO: "Recepcao",
  COZINHA: "Cozinha",
  MANUTENCAO: "Manutencao",
  AB: "A&B",
  ADMINISTRATIVO: "Administrativo"
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function relationLabel(meta: UnitLite | DepartmentLite | undefined, fallback: string) {
  if (!meta) return fallback;
  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function ownerAreaLabel(ownerArea: string) {
  return ownerAreaLabels[ownerArea] ?? ownerArea;
}

function isResolved(status: string) {
  return resolvedItemStatuses.has(status);
}

function isOpenItem(item: EmployeeOnboardingItemRow) {
  return openItemStatuses.has(item.status) && !isResolved(item.status);
}

function isActionableOpenItem(item: EmployeeOnboardingItemRow) {
  return isOpenItem(item) && (item.is_required || item.is_critical || item.blocks_operational_release);
}

function isOverdue(item: EmployeeOnboardingItemRow, today: Date) {
  if (!isOpenItem(item) || !item.due_at) return false;
  const dueAt = new Date(item.due_at);
  if (Number.isNaN(dueAt.getTime())) return false;
  dueAt.setHours(0, 0, 0, 0);
  return dueAt < today;
}

function dueInFilter(item: EmployeeOnboardingItemRow, filters: HrOnboardingDashboardFilters) {
  const dueDate = toDateOnly(item.due_at);
  if (filters.dueFrom && (!dueDate || dueDate < filters.dueFrom)) return false;
  if (filters.dueTo && (!dueDate || dueDate > filters.dueTo)) return false;
  return true;
}

function sortQueue(left: HrOnboardingDashboardItem, right: HrOnboardingDashboardItem) {
  const score = (item: HrOnboardingDashboardItem) =>
    item.blockingOpenItems * 100 +
    item.criticalOpenItems * 80 +
    item.overdueItems * 60 +
    (item.operationalReleaseStatus === "blocked" ? 50 : 0) +
    (item.operationalReleaseStatus === "critical_pending" ? 40 : 0);

  const scoreDiff = score(right) - score(left);
  if (scoreDiff) return scoreDiff;
  if (left.nextActionDueAt && right.nextActionDueAt) return left.nextActionDueAt.localeCompare(right.nextActionDueAt);
  if (left.nextActionDueAt) return -1;
  if (right.nextActionDueAt) return 1;
  return left.employeeName.localeCompare(right.employeeName);
}

async function loadOnboardings(context: HrRequestContext, filters: HrOnboardingDashboardFilters) {
  let query = context.supabase.from("employee_onboardings").select(onboardingSelect).is("deleted_at", null);

  if (!context.isSuperAdmin) query = query.in("unit_id", context.accessibleUnitIds);
  if (filters.unitId) query = query.eq("unit_id", filters.unitId);
  if (filters.status) {
    query = query.eq("status", filters.status);
  } else {
    query = query.in("status", Array.from(openOnboardingStatuses));
  }
  if (filters.releaseStatus) query = query.eq("operational_release_status", filters.releaseStatus);

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    logHrApiError("onboarding_dashboard.onboardings_failed", error);
    throw new Error("Nao foi possivel carregar a fila de onboarding.");
  }

  return (data ?? []) as EmployeeOnboardingRow[];
}

async function loadItems(context: HrRequestContext, onboardingIds: string[]) {
  if (!onboardingIds.length) return [];

  const { data, error } = await context.supabase
    .from("employee_onboarding_items")
    .select(onboardingItemSelect)
    .in("onboarding_id", onboardingIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("onboarding_dashboard.items_failed", error);
    throw new Error("Nao foi possivel carregar os itens do onboarding.");
  }

  return (data ?? []) as EmployeeOnboardingItemRow[];
}

async function loadEmployees(context: HrRequestContext, employeeIds: string[]) {
  if (!employeeIds.length) return new Map<string, EmployeeLite>();

  const { data, error } = await context.supabase
    .from("employees")
    .select("id, full_name, preferred_name, unit_id, department_id, status")
    .in("id", employeeIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("onboarding_dashboard.employees_failed", error);
    throw new Error("Nao foi possivel carregar colaboradores da fila.");
  }

  return new Map(((data ?? []) as EmployeeLite[]).map((employee) => [employee.id, employee]));
}

async function loadRelations(context: HrRequestContext, employees: EmployeeLite[]) {
  const unitIds = unique(employees.map((employee) => employee.unit_id));
  const departmentIds = unique(employees.map((employee) => employee.department_id));

  const [unitsResult, departmentsResult] = await Promise.all([
    unitIds.length
      ? context.supabase.from("units").select("id, code, name").in("id", unitIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
    departmentIds.length
      ? context.supabase.from("departments").select("id, code, name").in("id", departmentIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (unitsResult.error) {
    logHrApiError("onboarding_dashboard.units_failed", unitsResult.error);
    throw new Error("Nao foi possivel carregar unidades da fila.");
  }

  if (departmentsResult.error) {
    logHrApiError("onboarding_dashboard.departments_failed", departmentsResult.error);
    throw new Error("Nao foi possivel carregar departamentos da fila.");
  }

  return {
    unitsById: new Map(((unitsResult.data ?? []) as UnitLite[]).map((unit) => [unit.id, unit])),
    departmentsById: new Map(((departmentsResult.data ?? []) as DepartmentLite[]).map((department) => [department.id, department]))
  };
}

function mapQueueItem(input: {
  onboarding: EmployeeOnboardingRow;
  employee: EmployeeLite;
  unit?: UnitLite;
  department?: DepartmentLite;
  items: EmployeeOnboardingItemRow[];
  today: Date;
}) {
  const openItems = input.items.filter(isOpenItem);
  const actionableOpenItems = openItems.filter(isActionableOpenItem);
  const resolvedItems = input.items.filter((item) => isResolved(item.status));
  const totalItems = input.items.length;
  const progressPercent = totalItems ? Math.round((resolvedItems.length / totalItems) * 100) : 0;
  const criticalOpenItems = openItems.filter((item) => item.is_critical).length;
  const blockingOpenItems = openItems.filter(
    (item) => item.status === "blocked" || item.blocks_operational_release || item.is_critical
  ).length;
  const overdueItems = openItems.filter((item) => isOverdue(item, input.today)).length;
  const ownerAreas = unique(actionableOpenItems.map((item) => item.owner_area));
  const nextItem = [...actionableOpenItems].sort((left, right) => {
    if (left.due_at && right.due_at) return left.due_at.localeCompare(right.due_at);
    if (left.due_at) return -1;
    if (right.due_at) return 1;
    return left.updated_at.localeCompare(right.updated_at);
  })[0];

  const queueTypes: HrOnboardingQueueType[] = [];
  if (blockingOpenItems > 0 || openItems.some((item) => item.status === "blocked")) {
    queueTypes.push("blocked");
  }
  if (criticalOpenItems > 0) queueTypes.push("critical");
  if (overdueItems > 0) queueTypes.push("overdue");
  if (actionableOpenItems.some((item) => item.owner_area === "RH")) queueTypes.push("waiting_rh");
  if (actionableOpenItems.some((item) => item.owner_area === "GESTOR")) queueTypes.push("waiting_manager");
  if (actionableOpenItems.some((item) => item.owner_area === "TI")) queueTypes.push("waiting_ti");
  if (actionableOpenItems.length > 0 && progressPercent >= 80 && input.onboarding.status !== "completed") queueTypes.push("almost_done");

  const primaryOwnerArea = nextItem?.owner_area ?? ownerAreas[0] ?? "";

  return {
    id: input.onboarding.id,
    employeeId: input.employee.id,
    employeeName: input.employee.full_name,
    unitId: input.employee.unit_id ?? input.onboarding.unit_id,
    unitName: relationLabel(input.unit, "Unidade nao informada"),
    departmentId: input.employee.department_id ?? "",
    departmentName: relationLabel(input.department, "Departamento nao informado"),
    status: input.onboarding.status,
    statusLabel: onboardingStatusLabels[input.onboarding.status] ?? input.onboarding.status,
    operationalReleaseStatus: input.onboarding.operational_release_status,
    operationalReleaseLabel: releaseStatusLabels[input.onboarding.operational_release_status] ?? input.onboarding.operational_release_status,
    progressPercent,
    totalItems,
    resolvedItems: resolvedItems.length,
    openItems: actionableOpenItems.length,
    criticalOpenItems,
    blockingOpenItems,
    overdueItems,
    ownerAreas,
    primaryOwnerArea,
    primaryOwnerAreaLabel: primaryOwnerArea ? ownerAreaLabel(primaryOwnerArea) : "Sem area definida",
    nextAction: nextItem?.title ?? "Sem pendência aberta",
    nextActionDueAt: nextItem?.due_at ?? "",
    startedAt: input.onboarding.started_at ?? "",
    expectedReleaseAt: input.onboarding.expected_release_at ?? "",
    updatedAt: input.onboarding.updated_at,
    queueTypes,
    actionHref: `/rh/employees/${input.employee.id}`
  } satisfies HrOnboardingDashboardItem;
}

function passesFilters(item: HrOnboardingDashboardItem, rawItems: EmployeeOnboardingItemRow[], filters: HrOnboardingDashboardFilters) {
  if (filters.departmentId && item.departmentId !== filters.departmentId) return false;
  if (filters.ownerArea && !item.ownerAreas.includes(filters.ownerArea)) return false;
  if (filters.queueType && !item.queueTypes.includes(filters.queueType)) return false;
  if ((filters.dueFrom || filters.dueTo) && !rawItems.some((rawItem) => dueInFilter(rawItem, filters))) return false;

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [item.employeeName, item.unitName, item.departmentName, item.primaryOwnerAreaLabel, item.nextAction]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

export async function loadHrOnboardingDashboard(context: HrRequestContext, filters: HrOnboardingDashboardFilters = {}) {
  const onboardings = await loadOnboardings(context, filters);
  const items = await loadItems(
    context,
    onboardings.map((onboarding) => onboarding.id)
  );
  const employeesById = await loadEmployees(
    context,
    unique(onboardings.map((onboarding) => onboarding.employee_id))
  );
  const relations = await loadRelations(context, Array.from(employeesById.values()));
  const itemsByOnboarding = new Map<string, EmployeeOnboardingItemRow[]>();

  for (const item of items) {
    itemsByOnboarding.set(item.onboarding_id, [...(itemsByOnboarding.get(item.onboarding_id) ?? []), item]);
  }

  const today = todayStart();
  const queueItems: HrOnboardingDashboardItem[] = [];

  for (const onboarding of onboardings) {
    const employee = employeesById.get(onboarding.employee_id);
    if (!employee) continue;

    const rawItems = itemsByOnboarding.get(onboarding.id) ?? [];
    const item = mapQueueItem({
      onboarding,
      employee,
      unit: employee.unit_id ? relations.unitsById.get(employee.unit_id) : undefined,
      department: employee.department_id ? relations.departmentsById.get(employee.department_id) : undefined,
      items: rawItems,
      today
    });

    if (item.openItems > 0 && passesFilters(item, rawItems, filters)) queueItems.push(item);
  }

  return queueItems.sort(sortQueue);
}

export function summarizeHrOnboardingDashboard(items: HrOnboardingDashboardItem[]): HrOnboardingDashboardSummary {
  const summary: HrOnboardingDashboardSummary = {
    totalInProgress: 0,
    blocked: 0,
    critical: 0,
    overdue: 0,
    waitingRh: 0,
    waitingManager: 0,
    waitingTi: 0,
    almostDone: 0,
    byOwnerArea: [],
    byUnit: []
  };

  const byOwnerArea = new Map<string, { ownerArea: string; ownerAreaLabel: string; total: number }>();
  const byUnit = new Map<string, { unitId: string; unitName: string; total: number }>();

  for (const item of items) {
    if (item.openItems > 0 && (item.status === "in_progress" || item.status === "not_started")) summary.totalInProgress += 1;
    if (item.queueTypes.includes("blocked")) summary.blocked += 1;
    if (item.queueTypes.includes("critical")) summary.critical += 1;
    if (item.queueTypes.includes("overdue")) summary.overdue += 1;
    if (item.queueTypes.includes("waiting_rh")) summary.waitingRh += 1;
    if (item.queueTypes.includes("waiting_manager")) summary.waitingManager += 1;
    if (item.queueTypes.includes("waiting_ti")) summary.waitingTi += 1;
    if (item.queueTypes.includes("almost_done")) summary.almostDone += 1;

    for (const ownerArea of item.ownerAreas.length ? item.ownerAreas : [""]) {
      const key = ownerArea || "none";
      const current = byOwnerArea.get(key) ?? {
        ownerArea,
        ownerAreaLabel: ownerArea ? ownerAreaLabel(ownerArea) : "Sem area definida",
        total: 0
      };
      current.total += 1;
      byOwnerArea.set(key, current);
    }

    const unit = byUnit.get(item.unitId) ?? { unitId: item.unitId, unitName: item.unitName, total: 0 };
    unit.total += 1;
    byUnit.set(item.unitId, unit);
  }

  summary.byOwnerArea = Array.from(byOwnerArea.values()).sort((left, right) => right.total - left.total);
  summary.byUnit = Array.from(byUnit.values()).sort((left, right) => right.total - left.total);

  return summary;
}
