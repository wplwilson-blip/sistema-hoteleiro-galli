import "server-only";

export type HrOnboardingPlanRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  admission_type: string | null;
  name: string;
  description: string | null;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
  units?: { id: string; code: string | null; name: string | null } | null;
  departments?: { id: string; code: string | null; name: string | null } | null;
  job_positions?: { id: string; code: string | null; name: string | null } | null;
};

export type HrOnboardingPlanItemRow = {
  id: string;
  plan_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  category: string;
  owner_area: string;
  responsible_profile_code: string | null;
  due_days_after_start: number | null;
  is_required: boolean;
  is_critical: boolean;
  blocks_operational_release: boolean;
  related_document_type_id: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
  hr_document_types?: { id: string; code: string | null; name: string | null; category: string | null } | null;
};

export type HrOnboardingOption = {
  id: string;
  code: string;
  name: string;
  organizationId?: string | null;
  unitId?: string | null;
  departmentId?: string | null;
};

export const onboardingPlanSelect =
  "id, organization_id, unit_id, department_id, job_position_id, admission_type, name, description, priority, status, created_at, updated_at";

export const onboardingPlanListSelect = `${onboardingPlanSelect}, units(id, code, name), departments(id, code, name), job_positions(id, code, name)`;

export const onboardingPlanItemSelect =
  "id, plan_id, organization_id, title, description, category, owner_area, responsible_profile_code, due_days_after_start, is_required, is_critical, blocks_operational_release, related_document_type_id, sort_order, status, created_at, updated_at";

export const onboardingPlanItemListSelect = `${onboardingPlanItemSelect}, hr_document_types(id, code, name, category)`;

function compactLabel(input?: { code: string | null; name: string | null } | null) {
  if (!input) return "";
  return [input.code, input.name].filter(Boolean).join(" - ");
}

function scopeLabel(row: HrOnboardingPlanRow) {
  const scopeParts = [
    compactLabel(row.units),
    compactLabel(row.departments),
    compactLabel(row.job_positions),
    row.admission_type ? `Admissao: ${row.admission_type}` : ""
  ].filter(Boolean);

  return scopeParts.length ? scopeParts.join(" / ") : "Plano geral da organizacao";
}

export function mapHrOnboardingPlan(row: HrOnboardingPlanRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    departmentId: row.department_id,
    jobPositionId: row.job_position_id,
    admissionType: row.admission_type ?? "",
    name: row.name,
    description: row.description ?? "",
    priority: row.priority,
    status: row.status,
    scopeLabel: scopeLabel(row),
    unitName: compactLabel(row.units) || "Todas as unidades permitidas",
    departmentName: compactLabel(row.departments) || "Todos os departamentos",
    jobPositionName: compactLabel(row.job_positions) || "Todos os cargos",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapHrOnboardingPlanItem(row: HrOnboardingPlanItemRow) {
  return {
    id: row.id,
    planId: row.plan_id,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    ownerArea: row.owner_area,
    responsibleProfileCode: row.responsible_profile_code ?? "",
    dueDaysAfterStart: row.due_days_after_start,
    isRequired: row.is_required,
    isCritical: row.is_critical,
    blocksOperationalRelease: row.blocks_operational_release,
    relatedDocumentTypeId: row.related_document_type_id,
    relatedDocumentTypeName: row.hr_document_types?.name ?? "",
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
