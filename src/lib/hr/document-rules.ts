import "server-only";

import { logHrApiError, type HrEmployeeRow, type HrRequestContext } from "@/lib/hr/api-auth";
import type { HrDocumentTypeRow } from "@/lib/hr/redaction";

export type HrDocumentRuleRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  admission_type: string | null;
  document_type_id: string;
  is_required: boolean;
  due_days_after_admission: number | null;
  recurrence_months: number | null;
  priority: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type HrDocumentRuleListRow = HrDocumentRuleRow & {
  hr_document_types?: { id: string; code: string | null; name: string | null; category: string | null } | null;
  units?: { id: string; code: string | null; name: string | null } | null;
  departments?: { id: string; code: string | null; name: string | null } | null;
  job_positions?: { id: string; code: string | null; name: string | null } | null;
};

export type HrDocumentRuleOption = {
  id: string;
  code: string;
  name: string;
  organizationId?: string | null;
  unitId?: string | null;
  departmentId?: string | null;
};

export type RequiredDocumentExpectation = {
  documentType: HrDocumentTypeRow;
  rule: HrDocumentRuleRow | null;
  validUntil: string;
  isRequired: boolean;
};

export const documentRuleSelect =
  "id, organization_id, unit_id, department_id, job_position_id, admission_type, document_type_id, is_required, due_days_after_admission, recurrence_months, priority, notes, status, created_at, updated_at";

export const documentRuleListSelect = `${documentRuleSelect}, hr_document_types(id, code, name, category), units(id, code, name), departments(id, code, name), job_positions(id, code, name)`;

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function dateOnlyFromAdmission(hireDate: string | null, dueDays: number | null) {
  if (!hireDate || dueDays == null) return "";
  const date = new Date(`${hireDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + dueDays);
  return date.toISOString().slice(0, 10);
}

export function canUseHrDocumentType(documentType: HrDocumentTypeRow, employee: HrEmployeeRow) {
  if (documentType.status !== "active") return false;
  if (documentType.is_system_default && !documentType.organization_id && !documentType.unit_id) return true;
  if (documentType.unit_id) return documentType.unit_id === employee.unit_id;
  if (documentType.organization_id) return documentType.organization_id === employee.organization_id;
  return false;
}

function ruleAppliesToEmployee(rule: HrDocumentRuleRow, employee: HrEmployeeRow) {
  if (rule.status !== "active") return false;
  if (rule.admission_type) return false;
  if (rule.organization_id && rule.organization_id !== employee.organization_id) return false;
  if (rule.unit_id && rule.unit_id !== employee.unit_id) return false;
  if (rule.department_id && rule.department_id !== employee.department_id) return false;
  if (rule.job_position_id && rule.job_position_id !== employee.job_position_id) return false;
  return true;
}

function specificity(rule: HrDocumentRuleRow) {
  if (rule.job_position_id && rule.unit_id) return 600;
  if (rule.job_position_id) return 500;
  if (rule.department_id && rule.unit_id) return 400;
  if (rule.department_id) return 300;
  if (rule.unit_id) return 200;
  if (rule.organization_id) return 150;
  return 100;
}

function compareRules(left: HrDocumentRuleRow, right: HrDocumentRuleRow) {
  const specificityDiff = specificity(right) - specificity(left);
  if (specificityDiff) return specificityDiff;
  const priorityDiff = right.priority - left.priority;
  if (priorityDiff) return priorityDiff;
  return right.updated_at.localeCompare(left.updated_at);
}

export async function loadActiveHrDocumentRules(context: HrRequestContext, employees: HrEmployeeRow[]) {
  const organizationIds = unique(employees.map((employee) => employee.organization_id));
  const unitIds = unique(employees.map((employee) => employee.unit_id));
  const departmentIds = unique(employees.map((employee) => employee.department_id));
  const jobPositionIds = unique(employees.map((employee) => employee.job_position_id));

  let query = context.supabase
    .from("hr_document_rules")
    .select(documentRuleSelect)
    .eq("status", "active")
    .is("deleted_at", null);

  if (organizationIds.length) query = query.or(`organization_id.is.null,organization_id.in.(${organizationIds.join(",")})`);
  if (unitIds.length) query = query.or(`unit_id.is.null,unit_id.in.(${unitIds.join(",")})`);
  if (departmentIds.length) query = query.or(`department_id.is.null,department_id.in.(${departmentIds.join(",")})`);
  if (jobPositionIds.length) query = query.or(`job_position_id.is.null,job_position_id.in.(${jobPositionIds.join(",")})`);

  const { data, error } = await query.order("priority", { ascending: false });

  if (error) {
    logHrApiError("document_rules.active_lookup_failed", error);
    throw new Error("Nao foi possivel carregar as regras documentais de RH.");
  }

  return (data ?? []) as HrDocumentRuleRow[];
}

export function resolveRequiredDocumentExpectations(input: {
  employee: HrEmployeeRow;
  documentTypes: HrDocumentTypeRow[];
  rules: HrDocumentRuleRow[];
}) {
  const expectations: RequiredDocumentExpectation[] = [];

  for (const documentType of input.documentTypes) {
    if (!canUseHrDocumentType(documentType, input.employee)) continue;

    const matchingRules = input.rules
      .filter((rule) => rule.document_type_id === documentType.id && ruleAppliesToEmployee(rule, input.employee))
      .sort(compareRules);
    const rule = matchingRules[0] ?? null;
    const isRequired = rule ? rule.is_required : documentType.is_required;

    if (!isRequired) continue;

    expectations.push({
      documentType,
      rule,
      validUntil: dateOnlyFromAdmission(input.employee.hire_date, rule?.due_days_after_admission ?? null),
      isRequired: true
    });
  }

  return expectations;
}

function compactLabel(input?: { code: string | null; name: string | null } | null) {
  if (!input) return "";
  return [input.code, input.name].filter(Boolean).join(" - ");
}

export function mapHrDocumentRule(row: HrDocumentRuleListRow) {
  const scopeParts = [
    compactLabel(row.units),
    compactLabel(row.departments),
    compactLabel(row.job_positions),
    row.admission_type ? `Admissao: ${row.admission_type}` : ""
  ].filter(Boolean);

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    departmentId: row.department_id,
    jobPositionId: row.job_position_id,
    admissionType: row.admission_type ?? "",
    documentTypeId: row.document_type_id,
    documentTypeName: row.hr_document_types?.name ?? "Documento",
    documentTypeCode: row.hr_document_types?.code ?? "",
    documentTypeCategory: row.hr_document_types?.category ?? "",
    unitName: compactLabel(row.units) || "Todas as unidades permitidas",
    departmentName: compactLabel(row.departments) || "Todos os departamentos",
    jobPositionName: compactLabel(row.job_positions) || "Todos os cargos",
    scopeLabel: scopeParts.length ? scopeParts.join(" / ") : "Regra global",
    isRequired: row.is_required,
    dueDaysAfterAdmission: row.due_days_after_admission,
    recurrenceMonths: row.recurrence_months,
    priority: row.priority,
    notes: row.notes ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
