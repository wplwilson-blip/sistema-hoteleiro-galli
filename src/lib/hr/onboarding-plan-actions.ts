import "server-only";

import { HrAuthorizationError, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { onboardingPlanSelect, type HrOnboardingOption, type HrOnboardingPlanRow } from "@/lib/hr/onboarding-plans";

type PlanWritePayload = {
  organizationId?: string;
  unitId?: string;
  departmentId?: string;
  jobPositionId?: string;
  admissionType?: string;
  name: string;
  description?: string;
  priority: number;
  status: string;
};

type ItemWritePayload = {
  title: string;
  description?: string;
  category: string;
  ownerArea: string;
  responsibleProfileCode?: string;
  dueDaysAfterStart?: number;
  isRequired: boolean;
  isCritical: boolean;
  blocksOperationalRelease: boolean;
  relatedDocumentTypeId?: string;
  sortOrder: number;
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
type DocumentTypeRow = { id: string; organization_id: string | null; unit_id: string | null; code: string; name: string; category: string };

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function optionLabel(row: { code: string | null; name: string | null }) {
  return [row.code, row.name].filter(Boolean).join(" - ");
}

function assertUnitWriteScope(context: HrRequestContext, unitId: string | null | undefined) {
  if (context.isSuperAdmin) return;
  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new HrAuthorizationError("Informe uma unidade permitida para criar ou alterar o plano de onboarding.", 403);
  }
}

export function assertCanAccessOnboardingPlan(context: HrRequestContext, plan: Pick<HrOnboardingPlanRow, "unit_id">) {
  if (context.isSuperAdmin) return;
  if (plan.unit_id && context.accessibleUnitIds.includes(plan.unit_id)) return;
  if (!plan.unit_id) return;
  throw new HrAuthorizationError("Plano de onboarding nao encontrado.", 404);
}

export async function loadHrOnboardingPlan(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase
    .from("hr_onboarding_plans")
    .select(onboardingPlanSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("onboarding_plans.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o plano de onboarding.");
  }

  return (data?.[0] as HrOnboardingPlanRow | undefined) ?? null;
}

async function loadOne<T>(
  context: HrRequestContext,
  table: "organizations" | "units" | "departments" | "job_positions" | "hr_document_types",
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

async function getDefaultOrganizationId(context: HrRequestContext) {
  if (!context.isSuperAdmin && context.accessibleUnitIds.length) {
    const { data, error } = await context.supabase
      .from("units")
      .select("organization_id")
      .eq("id", context.accessibleUnitIds[0])
      .limit(1);

    if (error) {
      logHrApiError("onboarding_plans.default_unit_org_failed", error);
      throw new Error("Nao foi possivel identificar a organizacao do plano.");
    }

    return data?.[0]?.organization_id as string | undefined;
  }

  const { data, error } = await context.supabase
    .from("organizations")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    logHrApiError("onboarding_plans.default_org_failed", error);
    throw new Error("Nao foi possivel identificar a organizacao do plano.");
  }

  return data?.[0]?.id as string | undefined;
}

export async function prepareHrOnboardingPlanWrite(context: HrRequestContext, payload: PlanWritePayload) {
  const [unit, department, jobPosition] = await Promise.all([
    payload.unitId
      ? loadOne<UnitRow>(context, "units", "id, organization_id, code, name", payload.unitId, "onboarding_plans.unit_lookup_failed", "Nao foi possivel validar a unidade.")
      : Promise.resolve(null),
    payload.departmentId
      ? loadOne<DepartmentRow>(
          context,
          "departments",
          "id, organization_id, unit_id, code, name",
          payload.departmentId,
          "onboarding_plans.department_lookup_failed",
          "Nao foi possivel validar o departamento."
        )
      : Promise.resolve(null),
    payload.jobPositionId
      ? loadOne<JobPositionRow>(
          context,
          "job_positions",
          "id, organization_id, unit_id, department_id, code, name",
          payload.jobPositionId,
          "onboarding_plans.job_position_lookup_failed",
          "Nao foi possivel validar o cargo."
        )
      : Promise.resolve(null)
  ]);

  if (payload.unitId && !unit) throw new HrAuthorizationError("Unidade nao encontrada para o plano.", 404);
  if (payload.departmentId && !department) throw new HrAuthorizationError("Departamento nao encontrado para o plano.", 404);
  if (payload.jobPositionId && !jobPosition) throw new HrAuthorizationError("Cargo nao encontrado para o plano.", 404);

  const unitId = payload.unitId ?? null;
  const departmentId = payload.departmentId ?? null;
  const jobPositionId = payload.jobPositionId ?? null;
  assertUnitWriteScope(context, unitId);

  let organizationId =
    payload.organizationId ?? unit?.organization_id ?? department?.organization_id ?? jobPosition?.organization_id ?? (await getDefaultOrganizationId(context));

  if (!organizationId) {
    throw new HrAuthorizationError("Nao foi possivel definir a organizacao do plano.", 422);
  }

  if (unit && unit.organization_id !== organizationId) {
    throw new HrAuthorizationError("A unidade nao pertence a organizacao informada.", 422);
  }
  if (department?.unit_id && unitId && department.unit_id !== unitId) {
    throw new HrAuthorizationError("O departamento nao pertence a unidade informada.", 422);
  }
  if (department?.organization_id && department.organization_id !== organizationId) {
    throw new HrAuthorizationError("O departamento nao pertence a organizacao informada.", 422);
  }
  if (jobPosition?.unit_id && unitId && jobPosition.unit_id !== unitId) {
    throw new HrAuthorizationError("O cargo nao pertence a unidade informada.", 422);
  }
  if (jobPosition?.department_id && departmentId && jobPosition.department_id !== departmentId) {
    throw new HrAuthorizationError("O cargo nao pertence ao departamento informado.", 422);
  }
  if (jobPosition?.organization_id && jobPosition.organization_id !== organizationId) {
    throw new HrAuthorizationError("O cargo nao pertence a organizacao informada.", 422);
  }

  return {
    organization_id: organizationId,
    unit_id: unitId,
    department_id: departmentId,
    job_position_id: jobPositionId,
    admission_type: payload.admissionType || null,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    priority: payload.priority,
    status: payload.status
  };
}

export async function prepareHrOnboardingPlanItemWrite(context: HrRequestContext, plan: HrOnboardingPlanRow, payload: ItemWritePayload) {
  assertCanAccessOnboardingPlan(context, plan);

  let documentType: DocumentTypeRow | null = null;
  if (payload.relatedDocumentTypeId) {
    documentType = await loadOne<DocumentTypeRow>(
      context,
      "hr_document_types",
      "id, organization_id, unit_id, code, name, category",
      payload.relatedDocumentTypeId,
      "onboarding_plan_items.document_type_lookup_failed",
      "Nao foi possivel validar o tipo documental."
    );
    if (!documentType) throw new HrAuthorizationError("Tipo documental nao encontrado para o item.", 404);
    if (documentType.unit_id && documentType.unit_id !== plan.unit_id) {
      throw new HrAuthorizationError("O tipo documental selecionado pertence a outra unidade.", 422);
    }
    if (documentType.organization_id && documentType.organization_id !== plan.organization_id) {
      throw new HrAuthorizationError("O tipo documental selecionado pertence a outra organizacao.", 422);
    }
  }

  return {
    plan_id: plan.id,
    organization_id: plan.organization_id,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    category: payload.category,
    owner_area: payload.ownerArea,
    responsible_profile_code: payload.responsibleProfileCode?.trim() || null,
    due_days_after_start: payload.dueDaysAfterStart ?? null,
    is_required: payload.isRequired,
    is_critical: payload.isCritical,
    blocks_operational_release: payload.blocksOperationalRelease,
    related_document_type_id: payload.relatedDocumentTypeId || null,
    sort_order: payload.sortOrder,
    status: payload.status
  };
}

export async function loadHrOnboardingPlanOptions(context: HrRequestContext) {
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

  if (unitsResult.error) throw new Error("Nao foi possivel carregar unidades para onboarding.");
  if (departmentsResult.error) throw new Error("Nao foi possivel carregar departamentos para onboarding.");
  if (jobPositionsResult.error) throw new Error("Nao foi possivel carregar cargos para onboarding.");
  if (documentTypesResult.error) throw new Error("Nao foi possivel carregar tipos documentais para onboarding.");

  const accessibleUnitIds = new Set(context.accessibleUnitIds);
  const organizationIds = new Set(unique((unitsResult.data ?? []).map((unit) => unit.organization_id)));
  const documentTypes = ((documentTypesResult.data ?? []) as DocumentTypeRow[]).filter((type) => {
    if (context.isSuperAdmin) return true;
    if (!type.organization_id && !type.unit_id) return true;
    if (type.unit_id) return accessibleUnitIds.has(type.unit_id);
    return Boolean(type.organization_id && organizationIds.has(type.organization_id));
  });

  const toOption = (row: UnitRow | DepartmentRow | JobPositionRow | DocumentTypeRow): HrOnboardingOption => ({
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
