import "server-only";

import { HrAuthorizationError, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import type { HrDocumentRuleOption } from "@/lib/hr/document-rules";

type RuleWritePayload = {
  organizationId?: string;
  unitId?: string;
  departmentId?: string;
  jobPositionId?: string;
  admissionType?: string;
  documentTypeId: string;
  isRequired: boolean;
  dueDaysAfterAdmission?: number;
  recurrenceMonths?: number;
  priority: number;
  notes?: string;
  status: string;
};

type UnitRow = { id: string; organization_id: string; code: string; name: string };
type DepartmentRow = { id: string; organization_id: string | null; unit_id: string | null; code: string; name: string };
type JobPositionRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  code: string;
  name: string;
};
type DocumentTypeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  code: string;
  name: string;
  category: string;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function optionLabel(row: { code: string | null; name: string | null }) {
  return [row.code, row.name].filter(Boolean).join(" - ");
}

function assertUnitWriteScope(context: HrRequestContext, unitId: string | null | undefined) {
  if (context.isSuperAdmin) return;
  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new HrAuthorizationError("Informe uma unidade permitida para criar ou alterar a regra documental.", 403);
  }
}

async function loadOne<T>(
  context: HrRequestContext,
  table: "units" | "departments" | "job_positions" | "hr_document_types",
  select: string,
  id: string,
  stage: string,
  message: string
) {
  const { data, error } = await context.supabase
    .from(table)
    .select(select)
    .eq("id", id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError(stage, error);
    throw new Error(message);
  }

  return (data?.[0] as T | undefined) ?? null;
}

export async function prepareHrDocumentRuleWrite(context: HrRequestContext, payload: RuleWritePayload) {
  const [unit, department, jobPosition, documentType] = await Promise.all([
    payload.unitId
      ? loadOne<UnitRow>(context, "units", "id, organization_id, code, name", payload.unitId, "document_rules.unit_lookup_failed", "Nao foi possivel validar a unidade da regra.")
      : Promise.resolve(null),
    payload.departmentId
      ? loadOne<DepartmentRow>(
          context,
          "departments",
          "id, organization_id, unit_id, code, name",
          payload.departmentId,
          "document_rules.department_lookup_failed",
          "Nao foi possivel validar o departamento da regra."
        )
      : Promise.resolve(null),
    payload.jobPositionId
      ? loadOne<JobPositionRow>(
          context,
          "job_positions",
          "id, organization_id, unit_id, department_id, code, name",
          payload.jobPositionId,
          "document_rules.job_position_lookup_failed",
          "Nao foi possivel validar o cargo da regra."
        )
      : Promise.resolve(null),
    loadOne<DocumentTypeRow>(
      context,
      "hr_document_types",
      "id, organization_id, unit_id, code, name, category",
      payload.documentTypeId,
      "document_rules.document_type_lookup_failed",
      "Nao foi possivel validar o tipo documental da regra."
    )
  ]);

  if (payload.unitId && !unit) throw new HrAuthorizationError("Unidade nao encontrada para a regra documental.", 404);
  if (payload.departmentId && !department) throw new HrAuthorizationError("Departamento nao encontrado para a regra documental.", 404);
  if (payload.jobPositionId && !jobPosition) throw new HrAuthorizationError("Cargo nao encontrado para a regra documental.", 404);
  if (!documentType) throw new HrAuthorizationError("Tipo documental nao encontrado para a regra.", 404);

  let organizationId = payload.organizationId ?? unit?.organization_id ?? department?.organization_id ?? jobPosition?.organization_id ?? documentType.organization_id ?? null;
  const unitId = payload.unitId ?? null;
  const departmentId = payload.departmentId ?? null;
  const jobPositionId = payload.jobPositionId ?? null;

  assertUnitWriteScope(context, unitId);

  if (unit && organizationId && unit.organization_id !== organizationId) {
    throw new HrAuthorizationError("A unidade nao pertence a organizacao informada.", 422);
  }

  if (department?.unit_id && unitId && department.unit_id !== unitId) {
    throw new HrAuthorizationError("O departamento nao pertence a unidade informada.", 422);
  }

  if (department?.organization_id && organizationId && department.organization_id !== organizationId) {
    throw new HrAuthorizationError("O departamento nao pertence a organizacao informada.", 422);
  }

  if (jobPosition?.unit_id && unitId && jobPosition.unit_id !== unitId) {
    throw new HrAuthorizationError("O cargo nao pertence a unidade informada.", 422);
  }

  if (jobPosition?.department_id && departmentId && jobPosition.department_id !== departmentId) {
    throw new HrAuthorizationError("O cargo nao pertence ao departamento informado.", 422);
  }

  if (jobPosition?.organization_id && organizationId && jobPosition.organization_id !== organizationId) {
    throw new HrAuthorizationError("O cargo nao pertence a organizacao informada.", 422);
  }

  if (documentType.unit_id && documentType.unit_id !== unitId) {
    throw new HrAuthorizationError("O tipo documental selecionado pertence a outra unidade.", 422);
  }

  if (documentType.organization_id && organizationId && documentType.organization_id !== organizationId) {
    throw new HrAuthorizationError("O tipo documental selecionado pertence a outra organizacao.", 422);
  }

  if (!organizationId && unit) organizationId = unit.organization_id;

  return {
    organization_id: organizationId,
    unit_id: unitId,
    department_id: departmentId,
    job_position_id: jobPositionId,
    admission_type: payload.admissionType || null,
    document_type_id: payload.documentTypeId,
    is_required: payload.isRequired,
    due_days_after_admission: payload.dueDaysAfterAdmission ?? null,
    recurrence_months: payload.recurrenceMonths ?? null,
    priority: payload.priority,
    notes: payload.notes?.trim() || null,
    status: payload.status
  };
}

export async function loadHrDocumentRuleOptions(context: HrRequestContext) {
  const unitsQuery = context.supabase.from("units").select("id, organization_id, code, name").eq("status", "active").is("deleted_at", null);
  const departmentsQuery = context.supabase
    .from("departments")
    .select("id, organization_id, unit_id, code, name")
    .eq("status", "active")
    .is("deleted_at", null);
  const jobPositionsQuery = context.supabase
    .from("job_positions")
    .select("id, organization_id, unit_id, department_id, code, name")
    .eq("status", "active")
    .is("deleted_at", null);
  const documentTypesQuery = context.supabase
    .from("hr_document_types")
    .select("id, organization_id, unit_id, code, name, category")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (!context.isSuperAdmin) {
    unitsQuery.in("id", context.accessibleUnitIds);
    departmentsQuery.or(`unit_id.is.null,unit_id.in.(${context.accessibleUnitIds.join(",")})`);
    jobPositionsQuery.or(`unit_id.is.null,unit_id.in.(${context.accessibleUnitIds.join(",")})`);
  }

  const [unitsResult, departmentsResult, jobPositionsResult, documentTypesResult] = await Promise.all([
    unitsQuery.order("name", { ascending: true }),
    departmentsQuery.order("name", { ascending: true }),
    jobPositionsQuery.order("name", { ascending: true }),
    documentTypesQuery
  ]);

  if (unitsResult.error) {
    logHrApiError("document_rules.options_units_failed", unitsResult.error);
    throw new Error("Nao foi possivel carregar unidades para regras documentais.");
  }
  if (departmentsResult.error) {
    logHrApiError("document_rules.options_departments_failed", departmentsResult.error);
    throw new Error("Nao foi possivel carregar departamentos para regras documentais.");
  }
  if (jobPositionsResult.error) {
    logHrApiError("document_rules.options_jobs_failed", jobPositionsResult.error);
    throw new Error("Nao foi possivel carregar cargos para regras documentais.");
  }
  if (documentTypesResult.error) {
    logHrApiError("document_rules.options_types_failed", documentTypesResult.error);
    throw new Error("Nao foi possivel carregar tipos documentais para regras.");
  }

  const accessibleUnitIds = new Set(context.accessibleUnitIds);
  const organizationIds = new Set(unique((unitsResult.data ?? []).map((unit) => unit.organization_id)));
  const documentTypes = ((documentTypesResult.data ?? []) as DocumentTypeRow[]).filter((type) => {
    if (context.isSuperAdmin) return true;
    if (!type.organization_id && !type.unit_id) return true;
    if (type.unit_id) return accessibleUnitIds.has(type.unit_id);
    return Boolean(type.organization_id && organizationIds.has(type.organization_id));
  });

  const toOption = (row: UnitRow | DepartmentRow | JobPositionRow | DocumentTypeRow): HrDocumentRuleOption => ({
    id: row.id,
    code: row.code,
    name: optionLabel(row),
    organizationId: "organization_id" in row ? row.organization_id : null,
    unitId: "unit_id" in row ? row.unit_id : null,
    departmentId: "department_id" in row ? row.department_id : null
  });

  return {
    units: ((unitsResult.data ?? []) as UnitRow[]).map(toOption),
    departments: ((departmentsResult.data ?? []) as DepartmentRow[]).map(toOption),
    jobPositions: ((jobPositionsResult.data ?? []) as JobPositionRow[]).map(toOption),
    documentTypes: documentTypes.map(toOption)
  };
}
