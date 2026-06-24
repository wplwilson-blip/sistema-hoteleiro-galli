import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest, type SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PermissionRequestContext<TPermissionCode extends string = string> = {
  session: SessionContext;
  supabase: SupabaseAdmin;
  requiredPermission: TPermissionCode;
  accessibleUnitIds: string[];
  isSuperAdmin: boolean;
};

export const BASE_PERMISSIONS = {
  unitsView: "BASE:units.view",
  unitsManage: "BASE:units.manage",
  departmentsView: "BASE:departments.view",
  departmentsManage: "BASE:departments.manage",
  jobPositionsView: "BASE:job_positions.view",
  jobPositionsManage: "BASE:job_positions.manage",
  employeesView: "BASE:employees.view",
  employeesManage: "BASE:employees.manage",
  suppliersView: "BASE:suppliers.view",
  suppliersManage: "BASE:suppliers.manage",
  usersView: "BASE:users.view",
  usersManage: "BASE:users.manage"
} as const;

export const PURCHASES_PERMISSIONS = {
  requestsView: "PURCHASES:requests.view",
  requestsManage: "PURCHASES:requests.manage",
  quotesView: "PURCHASES:quotes.view",
  quotesManage: "PURCHASES:quotes.manage",
  approvalsView: "PURCHASES:approvals.view",
  approvalsSubmit: "PURCHASES:approvals.submit",
  approvalsDecide: "PURCHASES:approvals.decide",
  approvalsDecideAdministrative: "PURCHASES:approvals.decide.administrative",
  approvalsDecideDirectorate: "PURCHASES:approvals.decide.directorate",
  documentationView: "PURCHASES:documentation.view"
} as const;

export const ATTACHMENTS_PERMISSIONS = {
  purchasesView: "ATTACHMENTS:purchases.view",
  purchasesManage: "ATTACHMENTS:purchases.manage"
} as const;

export type PermissionAccessResult = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  hasPermission: boolean;
};

export type PermissionAuthorizationOptions = {
  validationErrorMessage?: string;
  unitValidationErrorMessage?: string;
  forbiddenMessage?: string;
  notFoundMessage?: string;
  logError?: (stage: string, error: { name?: string; message?: string; code?: string }) => void;
};

export class PermissionAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "PermissionAuthorizationError";
    this.status = status;
  }
}

const defaultValidationErrorMessage = "Nao foi possivel validar as permissoes.";
const defaultUnitValidationErrorMessage = "Nao foi possivel validar as unidades permitidas.";
const defaultForbiddenMessage = "Voce nao tem permissao para acessar este recurso.";
const defaultNotFoundMessage = "Recurso nao encontrado.";

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function logPermissionError(
  options: PermissionAuthorizationOptions | undefined,
  stage: string,
  error: { name?: string; message?: string; code?: string }
) {
  if (options?.logError) {
    options.logError(stage, error);
    return;
  }

  logBaseCadastroError(`permissions.${stage}`, error);
}

async function userHasActiveSuperAdminProfile(
  supabase: SupabaseAdmin,
  userId: string,
  options?: PermissionAuthorizationOptions
) {
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
    logPermissionError(options, "super_admin_profile_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return Boolean(data?.length);
}

async function getAllActiveUnitIds(supabase: SupabaseAdmin, options?: PermissionAuthorizationOptions) {
  const { data, error } = await supabase.from("units").select("id").eq("status", "active").is("deleted_at", null);

  if (error) {
    logPermissionError(options, "units_list_failed", error);
    throw new PermissionAuthorizationError(options?.unitValidationErrorMessage ?? defaultUnitValidationErrorMessage, 500);
  }

  return unique((data ?? []).map((unit) => unit.id));
}

async function getPermissionId(
  supabase: SupabaseAdmin,
  permissionCode: string,
  options?: PermissionAuthorizationOptions
) {
  const { data, error } = await supabase
    .from("permissions")
    .select("id")
    .eq("code", permissionCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logPermissionError(options, "permission_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return data?.[0]?.id as string | undefined;
}

async function getActiveUserUnitLinks(
  supabase: SupabaseAdmin,
  userId: string,
  options?: PermissionAuthorizationOptions
) {
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
    logPermissionError(options, "user_unit_links_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.unitValidationErrorMessage ?? defaultUnitValidationErrorMessage, 500);
  }

  return data ?? [];
}

async function getProfileAllowedIds(
  supabase: SupabaseAdmin,
  profileIds: string[],
  permissionId: string,
  options?: PermissionAuthorizationOptions
) {
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
    logPermissionError(options, "profile_permissions_lookup_failed", error);
    throw new PermissionAuthorizationError(options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
  }

  return new Set(unique((data ?? []).map((permission) => permission.access_profile_id)));
}

async function applyUserPermissionOverrides(input: {
  supabase: SupabaseAdmin;
  userId: string;
  permissionId: string;
  linkedUnitIds: Set<string>;
  allowedUnitIds: Set<string>;
  options?: PermissionAuthorizationOptions;
}) {
  const { data, error } = await input.supabase
    .from("user_permission_overrides")
    .select("unit_id, is_allowed")
    .eq("app_user_id", input.userId)
    .eq("permission_id", input.permissionId)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logPermissionError(input.options, "permission_overrides_lookup_failed", error);
    throw new PermissionAuthorizationError(input.options?.validationErrorMessage ?? defaultValidationErrorMessage, 500);
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

export async function getAccessibleUnitIdsForPermission(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: string,
  options?: PermissionAuthorizationOptions
): Promise<PermissionAccessResult> {
  const isSuperAdmin =
    session.profile.code === SUPER_ADMIN_PROFILE_CODE ||
    (await userHasActiveSuperAdminProfile(supabase, session.user.id, options));

  if (isSuperAdmin) {
    return {
      isSuperAdmin,
      accessibleUnitIds: await getAllActiveUnitIds(supabase, options),
      hasPermission: true
    };
  }

  const permissionId = await getPermissionId(supabase, permissionCode, options);
  if (!permissionId) {
    return { isSuperAdmin, accessibleUnitIds: [], hasPermission: false };
  }

  const links = await getActiveUserUnitLinks(supabase, session.user.id, options);
  const linkedUnitIds = new Set(unique(links.map((link) => link.unit_id)));
  const profileIds = unique(links.map((link) => link.access_profile_id));
  const allowedProfileIds = await getProfileAllowedIds(supabase, profileIds, permissionId, options);
  const allowedUnitIds = new Set(
    unique(links.filter((link) => allowedProfileIds.has(link.access_profile_id)).map((link) => link.unit_id))
  );

  await applyUserPermissionOverrides({
    supabase,
    userId: session.user.id,
    permissionId,
    linkedUnitIds,
    allowedUnitIds,
    options
  });

  return {
    isSuperAdmin,
    accessibleUnitIds: Array.from(allowedUnitIds),
    hasPermission: allowedUnitIds.size > 0
  };
}

export async function userHasPermissionForUnit(
  supabase: SupabaseAdmin,
  session: SessionContext,
  permissionCode: string,
  unitId: string | null | undefined,
  options?: PermissionAuthorizationOptions
) {
  const access = await getAccessibleUnitIdsForPermission(supabase, session, permissionCode, options);

  if (!access.hasPermission) {
    return false;
  }

  if (access.isSuperAdmin) {
    return true;
  }

  return Boolean(unitId && access.accessibleUnitIds.includes(unitId));
}

export async function requirePermission<TPermissionCode extends string = string>(
  permissionCode: TPermissionCode,
  options?: PermissionAuthorizationOptions
) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return { context: null, response };
  }

  const supabase = createSupabaseAdminClient();
  const access = await getAccessibleUnitIdsForPermission(supabase, session, permissionCode, options);

  if (!access.hasPermission) {
    return {
      context: null,
      response: apiError(options?.forbiddenMessage ?? defaultForbiddenMessage, 403)
    };
  }

  return {
    context: {
      session,
      supabase,
      requiredPermission: permissionCode,
      accessibleUnitIds: access.accessibleUnitIds,
      isSuperAdmin: access.isSuperAdmin
    } satisfies PermissionRequestContext<TPermissionCode>,
    response: null
  };
}

export function assertUnitInPermissionScope(
  context: PermissionRequestContext,
  unitId: string | null | undefined,
  options?: PermissionAuthorizationOptions
) {
  if (context.isSuperAdmin) {
    return;
  }

  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new PermissionAuthorizationError(options?.notFoundMessage ?? defaultNotFoundMessage, 404);
  }
}
