import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import {
  assertUnitInPermissionScope,
  getAccessibleUnitIdsForPermission,
  PermissionAuthorizationError,
  requirePermission,
  userHasPermissionForUnit,
  type PermissionAuthorizationOptions
} from "@/lib/auth/permissions";
import {
  apiError,
  logBaseCadastroError,
  type SupabaseAdmin
} from "@/lib/base-cadastros/api-helpers";

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
  conductView: "HR:conduct.view",
  conductManage: "HR:conduct.manage",
  conductReview: "HR:conduct.review",
  conductSensitiveView: "HR:conduct.sensitive.view",
  terminationsView: "HR:terminations.view",
  terminationsManage: "HR:terminations.manage",
  terminationsReview: "HR:terminations.review",
  terminationsSensitiveView: "HR:terminations.sensitive.view",
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

const hrPermissionOptions: PermissionAuthorizationOptions = {
  validationErrorMessage: "Nao foi possivel validar as permissoes de RH.",
  unitValidationErrorMessage: "Nao foi possivel validar as unidades permitidas.",
  forbiddenMessage: "Voce nao tem permissao para acessar os dados de RH.",
  notFoundMessage: "Recurso nao encontrado.",
  logError: logHrApiError
};

function rethrowAsHrAuthorizationError(error: unknown): never {
  if (error instanceof PermissionAuthorizationError) {
    throw new HrAuthorizationError(error.message, error.status);
  }

  throw error;
}

export async function getHrAccessibleUnitIds(supabase: SupabaseAdmin, session: SessionContext, permissionCode: HrPermissionCode) {
  try {
    return await getAccessibleUnitIdsForPermission(supabase, session, permissionCode, hrPermissionOptions);
  } catch (error) {
    rethrowAsHrAuthorizationError(error);
  }
}

export async function userHasHrPermissionForUnit(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: HrPermissionCode,
  unitId: string | null | undefined
) {
  try {
    return await userHasPermissionForUnit(supabase, session, permissionCode, unitId, hrPermissionOptions);
  } catch (error) {
    rethrowAsHrAuthorizationError(error);
  }
}

export async function requireHrPermission(permissionCode: HrPermissionCode) {
  try {
    return await requirePermission<HrPermissionCode>(permissionCode, hrPermissionOptions);
  } catch (error) {
    rethrowAsHrAuthorizationError(error);
  }
}

export function assertUnitInHrScope(context: HrRequestContext, unitId: string | null | undefined) {
  try {
    assertUnitInPermissionScope(context, unitId, hrPermissionOptions);
  } catch (error) {
    rethrowAsHrAuthorizationError(error);
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
  if (error instanceof HrAuthorizationError || error instanceof PermissionAuthorizationError) {
    return hrApiError(error.message, error.status);
  }

  return hrApiError(error instanceof Error ? error.message : fallbackMessage, 500);
}
