import { logHrApiError, type HrEmployeeRow, type HrRequestContext } from "@/lib/hr/api-auth";
import { getEmployeeRelations, loadEmployeeRelations } from "@/lib/hr/data";
import { loadActiveHrDocumentRules, resolveRequiredDocumentExpectations } from "@/lib/hr/document-rules";
import type { EmployeeDocumentRow, HrDocumentTypeRow } from "@/lib/hr/redaction";

export const DOCUMENT_PENDING_TYPES = [
  "missing_required",
  "pending",
  "awaiting_review",
  "rejected",
  "expired",
  "expiring_soon"
] as const;

export type HrDocumentPendingType = (typeof DOCUMENT_PENDING_TYPES)[number];

type DepartmentMeta = { id: string; code: string | null; name: string | null } | null;
type UnitMeta = { id: string; code: string | null; name: string | null } | null;

export type HrDocumentPendingItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  unitName: string;
  departmentId: string;
  departmentName: string;
  documentTypeId: string;
  documentTypeName: string;
  pendingType: HrDocumentPendingType;
  pendingLabel: string;
  status: string;
  statusLabel: string;
  validUntil: string;
  daysUntilDue: number | null;
  isRequired: boolean;
  isSensitiveRedacted: boolean;
  actionHref: string;
};

export type HrDocumentPendenciesSummary = {
  total: number;
  missingRequired: number;
  pending: number;
  awaitingReview: number;
  rejected: number;
  expired: number;
  expiringSoon: number;
  byUnit: Array<{ unitId: string; unitName: string; total: number }>;
  byDepartment: Array<{ departmentId: string; departmentName: string; total: number }>;
};

export type HrDocumentPendenciesFilters = {
  unitId?: string;
  departmentId?: string;
  employeeId?: string;
  type?: HrDocumentPendingType;
  status?: string;
  dueFrom?: string;
  dueTo?: string;
};

const EXPIRING_SOON_DAYS = 30;
const terminalNonPendingStatuses = new Set(["waived", "replaced"]);
const reviewStatuses = new Set(["received", "under_review"]);

const pendingTypeLabels: Record<HrDocumentPendingType, string> = {
  missing_required: "Documento obrigatório faltante",
  pending: "Pendente",
  awaiting_review: "Aguardando conferência",
  rejected: "Rejeitado",
  expired: "Vencido",
  expiring_soon: "Vence em breve"
};

const statusLabels: Record<string, string> = {
  missing: "Faltante",
  pending: "Pendente",
  received: "Enviado",
  under_review: "Em análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
  expired: "Vencido",
  replaced: "Substituído",
  waived: "Dispensado"
};

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function diffDays(dateValue: string, today: string) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  const base = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.round((date.getTime() - base.getTime()) / 86_400_000);
}

function metaLabel(meta: UnitMeta | DepartmentMeta, fallback: string) {
  if (!meta) return fallback;
  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function classifyDocument(document: EmployeeDocumentRow, today: string, soonLimit: string): HrDocumentPendingType | null {
  if (document.status === "expired" || (document.valid_until && document.valid_until < today)) return "expired";
  if (document.status === "pending") return "pending";
  if (reviewStatuses.has(document.status)) return "awaiting_review";
  if (document.status === "rejected") return "rejected";
  if (
    document.valid_until &&
    document.valid_until >= today &&
    document.valid_until <= soonLimit &&
    !terminalNonPendingStatuses.has(document.status) &&
    document.status !== "rejected"
  ) {
    return "expiring_soon";
  }
  return null;
}

function itemId(input: { type: HrDocumentPendingType; employeeId: string; documentTypeId: string; documentId?: string }) {
  return [input.type, input.employeeId, input.documentTypeId, input.documentId ?? "missing"].join(":");
}

async function loadEmployees(context: HrRequestContext, filters: HrDocumentPendenciesFilters) {
  let query = context.supabase
    .from("employees")
    .select(
      "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at, updated_at"
    )
    .eq("status", "active")
    .is("deleted_at", null);

  if (!context.isSuperAdmin) query = query.in("unit_id", context.accessibleUnitIds);
  if (filters.unitId) query = query.eq("unit_id", filters.unitId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.employeeId) query = query.eq("id", filters.employeeId);

  const { data, error } = await query.order("full_name", { ascending: true });

  if (error) {
    logHrApiError("document_pendencies.employees_failed", error);
    throw new Error("Não foi possível carregar colaboradores para as pendências documentais.");
  }

  return (data ?? []) as HrEmployeeRow[];
}

async function loadDocumentTypes(context: HrRequestContext) {
  const { data, error } = await context.supabase
    .from("hr_document_types")
    .select(
      "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at"
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    logHrApiError("document_pendencies.types_failed", error);
    throw new Error("Não foi possível carregar tipos documentais para as pendências.");
  }

  return (data ?? []) as HrDocumentTypeRow[];
}

async function loadDocuments(context: HrRequestContext, employeeIds: string[]) {
  if (!employeeIds.length) return [];

  const { data, error } = await context.supabase
    .from("employee_documents")
    .select(
      "id, organization_id, unit_id, employee_id, document_type_id, current_attachment_id, status, issue_date, received_at, valid_until, verified_at, rejected_at, rejection_reason, waived_at, waiver_reason, replaced_by_document_id, is_sensitive, visibility_scope, notes, metadata, created_at, updated_at"
    )
    .in("employee_id", employeeIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("document_pendencies.documents_failed", error);
    throw new Error("Não foi possível carregar documentos para as pendências.");
  }

  return (data ?? []) as EmployeeDocumentRow[];
}

function passesFilters(item: HrDocumentPendingItem, filters: HrDocumentPendenciesFilters) {
  if (filters.type && item.pendingType !== filters.type) return false;
  if (filters.status && item.status !== filters.status) return false;
  if (filters.dueFrom && (!item.validUntil || item.validUntil < filters.dueFrom)) return false;
  if (filters.dueTo && (!item.validUntil || item.validUntil > filters.dueTo)) return false;
  return true;
}

function sortPendencies(left: HrDocumentPendingItem, right: HrDocumentPendingItem) {
  const rank: Record<HrDocumentPendingType, number> = {
    expired: 1,
    rejected: 2,
    awaiting_review: 3,
    missing_required: 4,
    pending: 5,
    expiring_soon: 6
  };
  const rankDiff = rank[left.pendingType] - rank[right.pendingType];
  if (rankDiff) return rankDiff;
  if (left.validUntil && right.validUntil) return left.validUntil.localeCompare(right.validUntil);
  if (left.validUntil) return -1;
  if (right.validUntil) return 1;
  return left.employeeName.localeCompare(right.employeeName);
}

export async function loadHrDocumentPendencies(context: HrRequestContext, filters: HrDocumentPendenciesFilters = {}) {
  const employees = await loadEmployees(context, filters);
  const [relations, documentTypes, documents, documentRules] = await Promise.all([
    loadEmployeeRelations(context.supabase, employees),
    loadDocumentTypes(context),
    loadDocuments(
      context,
      employees.map((employee) => employee.id)
    ),
    loadActiveHrDocumentRules(context, employees)
  ]);

  const today = toDateOnly(new Date());
  const soonLimit = toDateOnly(addDays(new Date(`${today}T00:00:00.000Z`), EXPIRING_SOON_DAYS));
  const documentsByEmployee = new Map<string, EmployeeDocumentRow[]>();
  for (const document of documents) {
    documentsByEmployee.set(document.employee_id, [...(documentsByEmployee.get(document.employee_id) ?? []), document]);
  }

  const items: HrDocumentPendingItem[] = [];

  for (const employee of employees) {
    if (!employee.unit_id) continue;
    const employeeDocuments = documentsByEmployee.get(employee.id) ?? [];
    const employeeRelations = getEmployeeRelations(employee, relations);
    const unitName = metaLabel(employeeRelations.unit ?? null, "Unidade não informada");
    const departmentName = metaLabel(employeeRelations.department ?? null, "Departamento não informado");

    for (const document of employeeDocuments) {
      const documentType = documentTypes.find((type) => type.id === document.document_type_id);
      const pendingType = classifyDocument(document, today, soonLimit);
      if (!pendingType || !documentType) continue;

      const item: HrDocumentPendingItem = {
        id: itemId({ type: pendingType, employeeId: employee.id, documentTypeId: document.document_type_id, documentId: document.id }),
        employeeId: employee.id,
        employeeName: employee.full_name,
        unitId: employee.unit_id,
        unitName,
        departmentId: employee.department_id ?? "",
        departmentName,
        documentTypeId: document.document_type_id,
        documentTypeName: documentType.name,
        pendingType,
        pendingLabel: pendingTypeLabels[pendingType],
        status: document.status,
        statusLabel: statusLabels[document.status] ?? document.status,
        validUntil: document.valid_until ?? "",
        daysUntilDue: document.valid_until ? diffDays(document.valid_until, today) : null,
        isRequired: documentType.is_required,
        isSensitiveRedacted: document.is_sensitive,
        actionHref: `/rh/employees/${employee.id}`
      };

      if (passesFilters(item, filters)) items.push(item);
    }

    const requiredExpectations = resolveRequiredDocumentExpectations({
      employee,
      documentTypes,
      rules: documentRules
    });
    const activeTypeIds = new Set(
      employeeDocuments
        .filter((document) => !["replaced", "waived"].includes(document.status))
        .map((document) => document.document_type_id)
    );

    for (const expectation of requiredExpectations) {
      const documentType = expectation.documentType;
      if (activeTypeIds.has(documentType.id)) continue;

      const pendingType: HrDocumentPendingType = "missing_required";
      const item: HrDocumentPendingItem = {
        id: itemId({ type: pendingType, employeeId: employee.id, documentTypeId: documentType.id }),
        employeeId: employee.id,
        employeeName: employee.full_name,
        unitId: employee.unit_id,
        unitName,
        departmentId: employee.department_id ?? "",
        departmentName,
        documentTypeId: documentType.id,
        documentTypeName: documentType.name,
        pendingType,
        pendingLabel: pendingTypeLabels[pendingType],
        status: "missing",
        statusLabel: statusLabels.missing,
        validUntil: expectation.validUntil,
        daysUntilDue: expectation.validUntil ? diffDays(expectation.validUntil, today) : null,
        isRequired: true,
        isSensitiveRedacted: documentType.is_sensitive_default,
        actionHref: `/rh/employees/${employee.id}`
      };

      if (passesFilters(item, filters)) items.push(item);
    }
  }

  return items.sort(sortPendencies);
}

export function summarizeHrDocumentPendencies(items: HrDocumentPendingItem[]): HrDocumentPendenciesSummary {
  const summary: HrDocumentPendenciesSummary = {
    total: items.length,
    missingRequired: 0,
    pending: 0,
    awaitingReview: 0,
    rejected: 0,
    expired: 0,
    expiringSoon: 0,
    byUnit: [],
    byDepartment: []
  };

  const byUnit = new Map<string, { unitId: string; unitName: string; total: number }>();
  const byDepartment = new Map<string, { departmentId: string; departmentName: string; total: number }>();

  for (const item of items) {
    if (item.pendingType === "missing_required") summary.missingRequired += 1;
    if (item.pendingType === "pending") summary.pending += 1;
    if (item.pendingType === "awaiting_review") summary.awaitingReview += 1;
    if (item.pendingType === "rejected") summary.rejected += 1;
    if (item.pendingType === "expired") summary.expired += 1;
    if (item.pendingType === "expiring_soon") summary.expiringSoon += 1;

    const unit = byUnit.get(item.unitId) ?? { unitId: item.unitId, unitName: item.unitName, total: 0 };
    unit.total += 1;
    byUnit.set(item.unitId, unit);

    const departmentKey = item.departmentId || "none";
    const department = byDepartment.get(departmentKey) ?? {
      departmentId: item.departmentId,
      departmentName: item.departmentName,
      total: 0
    };
    department.total += 1;
    byDepartment.set(departmentKey, department);
  }

  summary.byUnit = Array.from(byUnit.values()).sort((left, right) => right.total - left.total);
  summary.byDepartment = Array.from(byDepartment.values()).sort((left, right) => right.total - left.total);

  return summary;
}
