import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import {
  getHrAccessibleUnitIds,
  HrAuthorizationError,
  logHrApiError,
  type HrPermissionCode,
  type HrRequestContext,
  type HrScopeOptions
} from "@/lib/hr/api-auth";

export type HrPermissionAccess = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  hasPermission: boolean;
};

export class HrWorkflowRouteError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "HrWorkflowRouteError";
    this.code = code;
    this.status = status;
  }
}

export function hrWorkflowApiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function requireHrWorkflowPermission(permissionCode: HrPermissionCode, opts?: HrScopeOptions) {
  const { session } = await requireAuthenticatedRequest();

  if (!session) {
    return {
      context: null,
      response: hrWorkflowApiError("UNAUTHORIZED", "Sessao expirada. Entre novamente.", 401)
    };
  }

  const supabase = createSupabaseAdminClient();
  const access = await getHrAccessibleUnitIds(supabase, session, permissionCode, { scope: opts?.scope });

  if (!access.hasPermission) {
    return {
      context: null,
      response: hrWorkflowApiError("FORBIDDEN", "Voce nao tem permissao para acessar workflows de RH.", 403)
    };
  }

  return {
    context: {
      session,
      supabase,
      requiredPermission: permissionCode,
      accessibleUnitIds: access.accessibleUnitIds,
      isSuperAdmin: access.isSuperAdmin,
      hasPermissionInScope: access.hasPermissionInScope
    } satisfies HrRequestContext,
    response: null
  };
}

export async function getWorkflowPermissionAccess(context: HrRequestContext, permissionCode: HrPermissionCode) {
  return getHrAccessibleUnitIds(context.supabase, context.session, permissionCode);
}

export function canAccessWorkflowUnit(context: HrRequestContext, unitId: string | null | undefined) {
  return context.isSuperAdmin || Boolean(unitId && context.accessibleUnitIds.includes(unitId));
}

export function canUseWorkflowUnitFilter(context: HrRequestContext, unitId: string | undefined) {
  return !unitId || canAccessWorkflowUnit(context, unitId);
}

export function canAccessSensitiveWorkflowUnit(access: HrPermissionAccess, unitId: string | null | undefined) {
  return access.isSuperAdmin || Boolean(unitId && access.accessibleUnitIds.includes(unitId));
}

export function assertWorkflowUnitScope(context: HrRequestContext, unitId: string | null | undefined) {
  if (!canAccessWorkflowUnit(context, unitId)) {
    throw new HrWorkflowRouteError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
  }
}

export function handleHrWorkflowRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof HrWorkflowRouteError) {
    return hrWorkflowApiError(error.code, error.message, error.status);
  }

  if (error instanceof HrAuthorizationError) {
    if (error.status === 404) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Workflow nao encontrado.", 404);
    }

    if (error.status === 403) {
      return hrWorkflowApiError("FORBIDDEN", error.message, 403);
    }
  }

  logHrApiError("workflows.route_failed", error instanceof Error ? error : { message: fallbackMessage });
  return hrWorkflowApiError("INTERNAL_ERROR", fallbackMessage, 500);
}
