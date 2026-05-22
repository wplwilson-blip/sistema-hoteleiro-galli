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

const onboardingSelect =
  "id, organization_id, unit_id, employee_id, plan_id, status, operational_release_status, started_at, expected_release_at, released_at, completed_at, blocked_reason, notes, created_at, updated_at";
const onboardingItemSelect =
  "id, onboarding_id, organization_id, unit_id, employee_id, plan_item_id, title, description, category, owner_area, responsible_user_id, responsible_profile_code, due_at, completed_at, completed_by, status, is_required, is_critical, blocks_operational_release, related_document_type_id, related_employee_document_id, evidence_attachment_id, notes, created_at, updated_at";

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

    let onboardingQuery = context.supabase
      .from("employee_onboardings")
      .select(onboardingSelect)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (employee.unit_id) onboardingQuery = onboardingQuery.eq("unit_id", employee.unit_id);

    const { data: onboardingData, error: onboardingError } = await onboardingQuery;

    if (onboardingError) {
      logHrApiError("employee_onboarding.lookup_failed", onboardingError);
      return hrApiError("Nao foi possivel carregar o onboarding do colaborador.", 500);
    }

    const onboarding = (onboardingData?.[0] as EmployeeOnboardingRow | undefined) ?? null;

    if (!onboarding) {
      return NextResponse.json({
        ok: true,
        data: null,
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
