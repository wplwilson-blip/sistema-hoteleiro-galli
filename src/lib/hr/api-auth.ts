import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import {
  apiError,
  logBaseCadastroError,
  requireAuthenticatedRequest,
  type SupabaseAdmin
} from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const HR_PERMISSIONS = {
  employeesView: "HR:employees.view",
  employeesManage: "HR:employees.manage",
  employeesSensitiveView: "HR:employees.sensitive.view",
  documentsView: "HR:documents.view",
  documentsManage: "HR:documents.manage",
  documentsSensitiveView: "HR:documents.sensitive.view",
  documentsVerify: "HR:documents.verify",
  evaluationsView: "HR:evaluations.view",
  evaluationsManage: "HR:evaluations.manage",
  evaluationsReview: "HR:evaluations.review",
  evaluationsSensitiveView: "HR:evaluations.sensitive.view",
  developmentManage: "HR:development.manage",
  movementsView: "HR:movements.view",
  movementsManage: "HR:movements.manage",
  movementsApprove: "HR:movements.approve",
  movementsSensitiveView: "HR:movements.sensitive.view",
  trainingsView: "HR:trainings.view",
  trainingsManage: "HR:trainings.manage",
  trainingsAssign: "HR:trainings.assign",
  trainingsVerify: "HR:trainings.verify",
  trainingsSensitiveView: "HR:trainings.sensitive.view",
  occupationalView: "HR:occupational.view",
  occupationalManage: "HR:occupational.manage",
  occupationalVerify: "HR:occupational.verify",
  occupationalSensitiveView: "HR:occupational.sensitive.view",
  historyView: "HR:history.view",
  historySensitiveView: "HR:history.sensitive.view",
  workflowsView: "HR:workflows.view",
  workflowsManage: "HR:workflows.manage",
  workflowsApprove: "HR:workflows.approve",
  workflowsCancel: "HR:workflows.cancel",
  workflowsSensitiveView: "HR:workflows.sensitive.view",
  workflowStepsView: "HR:workflow_steps.view",
  workflowStepsManage: "HR:workflow_steps.manage",
  workflowStepsComplete: "HR:workflow_steps.complete",
  workflowStepsReturn: "HR:workflow_steps.return",
  workflowEventsView: "HR:workflow_events.view",
  workflowEventsSensitiveView: "HR:workflow_events.sensitive.view"
} as const;

export type HrPermissionCode = (typeof HR_PERMISSIONS)[keyof typeof HR_PERMISSIONS];

export type HrRequestContext = {
  session: SessionContext;
  supabase: SupabaseAdmin;
  requiredPermission: HrPermissionCode;
  accessibleUnitIds: string[];
  isSuperAdmin: boolean;
};

export type HrEmployeeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  full_name: string;
  preferred_name: string | null;
  document_number: string | null;
  corporate_email: string | null;
  personal_email: string | null;
  phone: string | null;
  hire_date: string | null;
  termination_date: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export class HrAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "HrAuthorizationError";
    this.status = status;
  }
}

export function hrApiError(message: string, status = 400) {
  return apiError(message, status);
}

export function logHrApiError(stage: string, error: { name?: string; message?: string; code?: string }) {
  logBaseCadastroError(`hr.${stage}`, error);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

async function userHasActiveSuperAdminProfile(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(code)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("access_profiles.code", SUPER_ADMIN_PROFILE_CODE)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("super_admin_profile_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as permissoes de RH.", 500);
  }

  return Boolean(data?.length);
}

async function getAllActiveUnitIds(supabase: SupabaseAdmin) {
  const { data, error } = await supabase.from("units").select("id").eq("status", "active").is("deleted_at", null);

  if (error) {
    logHrApiError("units_list_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as unidades permitidas.", 500);
  }

  return unique((data ?? []).map((unit) => unit.id));
}

async function getPermissionId(supabase: SupabaseAdmin, permissionCode: HrPermissionCode) {
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", permissionCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("permission_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as permissoes de RH.", 500);
  }

  return data?.[0]?.id as string | undefined;
}

async function getActiveUserUnitLinks(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("unit_id, access_profile_id, units!inner(id, status), access_profiles!inner(id, status)")
    .eq("app_user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("units.status", "active")
    .is("units.deleted_at", null)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null);

  if (error) {
    logHrApiError("user_unit_links_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as unidades permitidas.", 500);
  }

  return data ?? [];
}

async function getProfileAllowedIds(supabase: SupabaseAdmin, profileIds: string[], permissionId: string) {
  if (!profileIds.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("profile_permissions")
    .select("access_profile_id")
    .in("access_profile_id", profileIds)
    .eq("permission_id", permissionId)
    .eq("is_allowed", true)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("profile_permissions_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as permissoes de RH.", 500);
  }

  return new Set(unique((data ?? []).map((permission) => permission.access_profile_id)));
}

async function applyUserPermissionOverrides(input: {
  supabase: SupabaseAdmin;
  userId: string;
  permissionId: string;
  linkedUnitIds: Set<string>;
  allowedUnitIds: Set<string>;
}) {
  const { data, error } = await input.supabase
    .from("user_permission_overrides")
    .select("unit_id, is_allowed")
    .eq("app_user_id", input.userId)
    .eq("permission_id", input.permissionId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("permission_overrides_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel validar as permissoes de RH.", 500);
  }

  for (const override of data ?? []) {
    if (!override.unit_id) {
      if (override.is_allowed) {
        Array.from(input.linkedUnitIds).forEach((unitId) => input.allowedUnitIds.add(unitId));
      } else {
        input.allowedUnitIds.clear();
      }
      continue;
    }

    if (!input.linkedUnitIds.has(override.unit_id)) {
      continue;
    }

    if (override.is_allowed) {
      input.allowedUnitIds.add(override.unit_id);
    } else {
      input.allowedUnitIds.delete(override.unit_id);
    }
  }
}

export async function getHrAccessibleUnitIds(supabase: SupabaseAdmin, session: SessionContext, permissionCode: HrPermissionCode) {
  const isSuperAdmin =
    session.profile.code === SUPER_ADMIN_PROFILE_CODE || (await userHasActiveSuperAdminProfile(supabase, session.user.id));

  if (isSuperAdmin) {
    return {
      isSuperAdmin,
      accessibleUnitIds: await getAllActiveUnitIds(supabase),
      hasPermission: true
    };
  }

  const permissionId = await getPermissionId(supabase, permissionCode);
  if (!permissionId) {
    return { isSuperAdmin, accessibleUnitIds: [], hasPermission: false };
  }

  const links = await getActiveUserUnitLinks(supabase, session.user.id);
  const linkedUnitIds = new Set(unique(links.map((link) => link.unit_id)));
  const profileIds = unique(links.map((link) => link.access_profile_id));
  const allowedProfileIds = await getProfileAllowedIds(supabase, profileIds, permissionId);
  const allowedUnitIds = new Set(
    unique(links.filter((link) => allowedProfileIds.has(link.access_profile_id)).map((link) => link.unit_id))
  );

  await applyUserPermissionOverrides({
    supabase,
    userId: session.user.id,
    permissionId,
    linkedUnitIds,
    allowedUnitIds
  });

  return {
    isSuperAdmin,
    accessibleUnitIds: Array.from(allowedUnitIds),
    hasPermission: allowedUnitIds.size > 0
  };
}

export async function userHasHrPermissionForUnit(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: HrPermissionCode,
  unitId: string | null | undefined
) {
  const access = await getHrAccessibleUnitIds(supabase, session, permissionCode);

  if (!access.hasPermission) {
    return false;
  }

  if (access.isSuperAdmin) {
    return true;
  }

  return Boolean(unitId && access.accessibleUnitIds.includes(unitId));
}

export async function requireHrPermission(permissionCode: HrPermissionCode) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return { context: null, response };
  }

  const supabase = createSupabaseAdminClient();
  const access = await getHrAccessibleUnitIds(supabase, session, permissionCode);

  if (!access.hasPermission) {
    return { context: null, response: hrApiError("Voce nao tem permissao para acessar os dados de RH.", 403) };
  }

  return {
    context: {
      session,
      supabase,
      requiredPermission: permissionCode,
      accessibleUnitIds: access.accessibleUnitIds,
      isSuperAdmin: access.isSuperAdmin
    },
    response: null
  };
}

export function assertUnitInHrScope(context: HrRequestContext, unitId: string | null | undefined) {
  if (context.isSuperAdmin) {
    return;
  }

  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new HrAuthorizationError("Recurso nao encontrado.", 404);
  }
}

export async function assertCanAccessHrEmployee(context: HrRequestContext, employeeId: string) {
  const { data, error } = await context.supabase
    .from("employees")
    .select(
      "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at, updated_at"
    )
    .eq("id", employeeId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("employee_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel localizar o colaborador.", 500);
  }

  const employee = data?.[0] as HrEmployeeRow | undefined;

  if (!employee) {
    throw new HrAuthorizationError("Recurso nao encontrado.", 404);
  }

  assertUnitInHrScope(context, employee.unit_id);

  return employee;
}

export function handleHrRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof HrAuthorizationError) {
    return hrApiError(error.message, error.status);
  }

  return hrApiError(error instanceof Error ? error.message : fallbackMessage, 500);
}
