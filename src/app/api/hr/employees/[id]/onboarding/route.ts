import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit,
  type HrRequestContext
} from "@/lib/hr/api-auth";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { ensureAutomaticEmployeeOnboarding } from "@/lib/hr/employee-onboarding-auto";

type RouteParams = { params: { id: string } };

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
  organization_id: string;
  unit_id: string;
  employee_id: string;
  plan_item_id: string | null;
  title: string;
  description: string | null;
  category: string;
  owner_area: string;
  responsible_user_id: string | null;
  responsible_profile_code: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  status: string;
  is_required: boolean;
  is_critical: boolean;
  blocks_operational_release: boolean;
  related_document_type_id: string | null;
  related_employee_document_id: string | null;
  evidence_attachment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type HrDocumentTypeLite = {
  id: string;
  name: string;
  category: string;
};

type EmployeeDocumentLite = {
  id: string;
  status: string;
  valid_until: string | null;
  is_sensitive: boolean;
};

type HrOnboardingPlanRow = {
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
};

type HrOnboardingPlanItemRow = {
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
};

const onboardingSelect =
  "id, organization_id, unit_id, employee_id, plan_id, status, operational_release_status, started_at, expected_release_at, released_at, completed_at, blocked_reason, notes, created_at, updated_at";
const onboardingItemSelect =
  "id, onboarding_id, organization_id, unit_id, employee_id, plan_item_id, title, description, category, owner_area, responsible_user_id, responsible_profile_code, due_at, completed_at, completed_by, status, is_required, is_critical, blocks_operational_release, related_document_type_id, related_employee_document_id, evidence_attachment_id, notes, created_at, updated_at";
const onboardingPlanSelect =
  "id, organization_id, unit_id, department_id, job_position_id, admission_type, name, description, priority, status";
const onboardingPlanItemSelect =
  "id, plan_id, organization_id, title, description, category, owner_area, responsible_profile_code, due_days_after_start, is_required, is_critical, blocks_operational_release, related_document_type_id, sort_order";

const startOnboardingSchema = z.object({
  planId: z.string().uuid("Plano de onboarding invalido.").optional()
});

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(dueAt);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

function isResolved(status: string) {
  return status === "completed" || status === "waived" || status === "cancelled";
}

function isOpenBlocker(item: EmployeeOnboardingItemRow) {
  return !isResolved(item.status) && (item.is_critical || item.blocks_operational_release || item.status === "blocked");
}

function addDaysIso(startedAt: Date, days: number | null) {
  if (days === null || days === undefined) return null;
  const dueAt = new Date(startedAt);
  dueAt.setDate(dueAt.getDate() + days);
  return dueAt.toISOString();
}

function planSpecificity(plan: HrOnboardingPlanRow) {
  if (plan.job_position_id && plan.unit_id) return 1;
  if (plan.job_position_id) return 2;
  if (plan.department_id && plan.unit_id) return 3;
  if (plan.department_id) return 4;
  if (plan.unit_id) return 5;
  return 6;
}

function mapPlan(plan: HrOnboardingPlanRow) {
  const specificity = planSpecificity(plan);
  const labels: Record<number, string> = {
    1: "Cargo e unidade",
    2: "Cargo",
    3: "Departamento e unidade",
    4: "Departamento",
    5: "Unidade",
    6: "Organizacao"
  };

  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    priority: plan.priority,
    specificity,
    scopeLabel: labels[specificity] ?? "Organizacao"
  };
}

function planMatchesEmployee(plan: HrOnboardingPlanRow, employee: { organization_id: string | null; unit_id: string | null; department_id: string | null; job_position_id: string | null }) {
  if (!employee.organization_id || plan.organization_id !== employee.organization_id) return false;
  if (plan.admission_type) return false;
  if (plan.unit_id && plan.unit_id !== employee.unit_id) return false;
  if (plan.department_id && plan.department_id !== employee.department_id) return false;
  if (plan.job_position_id && plan.job_position_id !== employee.job_position_id) return false;
  return true;
}

async function loadApplicablePlans(context: HrRequestContext, employee: { organization_id: string | null; unit_id: string | null; department_id: string | null; job_position_id: string | null }) {
  if (!employee.organization_id) return [];

  let query = context.supabase
    .from("hr_onboarding_plans")
    .select(onboardingPlanSelect)
    .eq("organization_id", employee.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("admission_type", null);

  const { data, error } = await query;

  if (error) {
    logHrApiError("employee_onboarding.applicable_plans_lookup_failed", error);
    throw new Error("Nao foi possivel carregar planos de onboarding aplicaveis.");
  }

  return ((data ?? []) as HrOnboardingPlanRow[])
    .filter((plan) => planMatchesEmployee(plan, employee))
    .sort((a, b) => planSpecificity(a) - planSpecificity(b) || a.priority - b.priority || a.name.localeCompare(b.name));
}

async function loadLatestOnboarding(context: HrRequestContext, employee: { id: string; unit_id: string | null }) {
  let onboardingQuery = context.supabase
    .from("employee_onboardings")
    .select(onboardingSelect)
    .eq("employee_id", employee.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (employee.unit_id) onboardingQuery = onboardingQuery.eq("unit_id", employee.unit_id);

  const { data, error } = await onboardingQuery;

  if (error) {
    logHrApiError("employee_onboarding.lookup_failed", error);
    throw new Error("Nao foi possivel carregar o onboarding agora. Tente novamente ou verifique se o colaborador esta ativo.");
  }

  return (data?.[0] as EmployeeOnboardingRow | undefined) ?? null;
}

async function loadDocumentTypes(context: HrRequestContext, ids: string[]) {
  if (!ids.length) return new Map<string, HrDocumentTypeLite>();

  const { data, error } = await context.supabase
    .from("hr_document_types")
    .select("id, name, category")
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_onboarding.document_types_lookup_failed", error);
    throw new Error("Nao foi possivel carregar documentos relacionados ao onboarding.");
  }

  return new Map(((data ?? []) as HrDocumentTypeLite[]).map((documentType) => [documentType.id, documentType]));
}

async function loadEmployeeDocuments(context: HrRequestContext, ids: string[]) {
  if (!ids.length) return new Map<string, EmployeeDocumentLite>();

  const { data, error } = await context.supabase
    .from("employee_documents")
    .select("id, status, valid_until, is_sensitive")
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_onboarding.employee_documents_lookup_failed", error);
    throw new Error("Nao foi possivel carregar vinculos documentais do onboarding.");
  }

  return new Map(((data ?? []) as EmployeeDocumentLite[]).map((document) => [document.id, document]));
}

function mapItem(
  item: EmployeeOnboardingItemRow,
  documentTypesById: Map<string, HrDocumentTypeLite>,
  employeeDocumentsById: Map<string, EmployeeDocumentLite>
) {
  const documentType = item.related_document_type_id ? documentTypesById.get(item.related_document_type_id) ?? null : null;
  const employeeDocument = item.related_employee_document_id ? employeeDocumentsById.get(item.related_employee_document_id) ?? null : null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    ownerArea: item.owner_area,
    responsibleProfileCode: item.responsible_profile_code,
    dueAt: item.due_at,
    daysUntilDue: daysUntil(item.due_at),
    completedAt: item.completed_at,
    status: item.status,
    isRequired: item.is_required,
    isCritical: item.is_critical,
    blocksOperationalRelease: item.blocks_operational_release,
    notes: item.notes,
    updatedAt: item.updated_at,
    relatedDocument: documentType
      ? {
          documentTypeId: documentType.id,
          name: documentType.name,
          category: documentType.category,
          employeeDocumentId: employeeDocument?.id ?? null,
          employeeDocumentStatus: employeeDocument?.status ?? null,
          validUntil: employeeDocument?.valid_until ?? null,
          sensitiveRedacted: Boolean(employeeDocument?.is_sensitive)
        }
      : null
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const canManageOnboarding = await userHasHrPermissionForUnit(
      context.supabase,
      context.session,
      HR_PERMISSIONS.employeesManage,
      employee.unit_id
    );

    let onboarding = await loadLatestOnboarding(context, employee);

    if (!onboarding && employee.status === "active" && canManageOnboarding) {
      try {
        const result = await ensureAutomaticEmployeeOnboarding(context.supabase, employee.id, context.session.user.id);
        if (result.created) {
          onboarding = await loadLatestOnboarding(context, employee);
        }
      } catch (autoOnboardingError) {
        logHrApiError(
          "employee_onboarding.auto_create_on_get_failed",
          autoOnboardingError instanceof Error ? autoOnboardingError : { message: "Falha desconhecida ao gerar onboarding automatico." }
        );
      }
    }

    if (!onboarding) {
      const applicablePlans = await loadApplicablePlans(context, employee);

      return NextResponse.json({
        ok: true,
        data: null,
        applicablePlans: applicablePlans.map(mapPlan),
        emptyState: {
          title: applicablePlans.length ? "Onboarding ainda nao iniciado" : "Onboarding ainda nao iniciado",
          description: applicablePlans.length
            ? "Selecione um plano operacional para criar o checklist deste colaborador."
            : "Inicie o checklist padrao do hotel para acompanhar documentos, liberacoes e pendencias operacionais."
        },
        permissions: { canManageOnboarding }
      });
    }

    const { data: itemsData, error: itemsError } = await context.supabase
      .from("employee_onboarding_items")
      .select(onboardingItemSelect)
      .eq("onboarding_id", onboarding.id)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (itemsError) {
      logHrApiError("employee_onboarding.items_lookup_failed", itemsError);
      return hrApiError("Nao foi possivel carregar o checklist do onboarding.", 500);
    }

    const items = (itemsData ?? []) as EmployeeOnboardingItemRow[];
    const [documentTypesById, employeeDocumentsById] = await Promise.all([
      loadDocumentTypes(context, unique(items.map((item) => item.related_document_type_id))),
      loadEmployeeDocuments(context, unique(items.map((item) => item.related_employee_document_id)))
    ]);
    const totalItems = items.length;
    const resolvedItems = items.filter((item) => isResolved(item.status)).length;
    const criticalOpenItems = items.filter((item) => !isResolved(item.status) && item.is_critical).length;
    const blockingOpenItems = items.filter(isOpenBlocker).length;

    return NextResponse.json({
      ok: true,
      data: {
        id: onboarding.id,
        status: onboarding.status,
        operationalReleaseStatus: onboarding.operational_release_status,
        startedAt: onboarding.started_at,
        expectedReleaseAt: onboarding.expected_release_at,
        releasedAt: onboarding.released_at,
        completedAt: onboarding.completed_at,
        blockedReason: onboarding.blocked_reason,
        notes: onboarding.notes,
        updatedAt: onboarding.updated_at,
        progress: {
          totalItems,
          resolvedItems,
          percent: totalItems ? Math.round((resolvedItems / totalItems) * 100) : 0,
          criticalOpenItems,
          blockingOpenItems
        },
        items: items.map((item) => mapItem(item, documentTypesById, employeeDocumentsById))
      },
      permissions: { canManageOnboarding }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError("Recurso nao encontrado.", 404);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar o onboarding do colaborador.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesManage);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = startOnboardingSchema.parse(await request.json().catch(() => ({})));
    const employee = await assertCanAccessHrEmployee(context, id);

    if (!employee.organization_id || !employee.unit_id) {
      return hrApiError("Colaborador sem organizacao ou unidade valida para iniciar onboarding.", 422);
    }

    const { data: existingData, error: existingError } = await context.supabase
      .from("employee_onboardings")
      .select("id, status")
      .eq("employee_id", employee.id)
      .in("status", ["not_started", "in_progress"])
      .is("deleted_at", null)
      .limit(1);

    if (existingError) {
      logHrApiError("employee_onboarding.open_lookup_failed", existingError);
      return hrApiError("Nao foi possivel validar onboarding existente.", 500);
    }

    if (existingData?.length) {
      return hrApiError("Este colaborador ja possui um onboarding em aberto.", 409);
    }

    const applicablePlans = await loadApplicablePlans(context, employee);
    if (!applicablePlans.length) {
      const result = await ensureAutomaticEmployeeOnboarding(context.supabase, employee.id, context.session.user.id);
      if (!result.created) {
        return hrApiError("Nao foi possivel iniciar o onboarding padrao deste colaborador.", 422);
      }
      return NextResponse.json({ ok: true, data: { id: result.onboardingId } }, { status: 201 });
    }

    const selectedPlan = payload.planId ? applicablePlans.find((plan) => plan.id === payload.planId) ?? null : applicablePlans.length === 1 ? applicablePlans[0] : null;

    if (!selectedPlan) {
      return hrApiError("Selecione um plano de onboarding para iniciar este colaborador.", 422);
    }

    const { data: planItemsData, error: planItemsError } = await context.supabase
      .from("hr_onboarding_plan_items")
      .select(onboardingPlanItemSelect)
      .eq("plan_id", selectedPlan.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (planItemsError) {
      logHrApiError("employee_onboarding.plan_items_lookup_failed", planItemsError);
      return hrApiError("Nao foi possivel carregar os itens do plano selecionado.", 500);
    }

    const planItems = (planItemsData ?? []) as HrOnboardingPlanItemRow[];
    if (!planItems.length) {
      return hrApiError("O plano selecionado nao possui itens ativos.", 422);
    }

    const startedAt = new Date();
    const expectedReleaseAt = planItems
      .map((item) => addDaysIso(startedAt, item.due_days_after_start))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const hasCriticalOrBlocking = planItems.some((item) => item.is_critical || item.blocks_operational_release);

    const { data: onboardingData, error: onboardingError } = await context.supabase
      .from("employee_onboardings")
      .insert({
        organization_id: employee.organization_id,
        unit_id: employee.unit_id,
        employee_id: employee.id,
        plan_id: selectedPlan.id,
        status: "in_progress",
        operational_release_status: hasCriticalOrBlocking ? "critical_pending" : "partial",
        started_at: startedAt.toISOString(),
        expected_release_at: expectedReleaseAt,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(onboardingSelect)
      .single();

    if (onboardingError) {
      logHrApiError("employee_onboarding.create_failed", onboardingError);
      return hrApiError("Nao foi possivel iniciar o onboarding do colaborador.", 500);
    }

    const onboarding = onboardingData as EmployeeOnboardingRow;
    const itemsToInsert = planItems.map((item) => ({
      onboarding_id: onboarding.id,
      organization_id: employee.organization_id,
      unit_id: employee.unit_id,
      employee_id: employee.id,
      plan_item_id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      owner_area: item.owner_area,
      responsible_profile_code: item.responsible_profile_code,
      due_at: addDaysIso(startedAt, item.due_days_after_start),
      status: "pending",
      is_required: item.is_required,
      is_critical: item.is_critical,
      blocks_operational_release: item.blocks_operational_release,
      related_document_type_id: item.related_document_type_id,
      created_by: context.session.user.id,
      updated_by: context.session.user.id
    }));

    const { error: itemsInsertError } = await context.supabase.from("employee_onboarding_items").insert(itemsToInsert);

    if (itemsInsertError) {
      logHrApiError("employee_onboarding.items_create_failed", itemsInsertError);
      await context.supabase
        .from("employee_onboardings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: context.session.user.id,
          cancellation_reason: "Falha ao criar itens do onboarding.",
          deleted_at: new Date().toISOString(),
          deleted_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .eq("id", onboarding.id);
      return hrApiError("Onboarding criado, mas nao foi possivel gerar o checklist. Tente novamente.", 500);
    }

    return NextResponse.json({ ok: true, data: onboarding }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel iniciar o onboarding do colaborador.");
  }
}
