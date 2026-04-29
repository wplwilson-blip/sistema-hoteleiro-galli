import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const initialSetupCheckMessage = "Nao foi possivel verificar o setup inicial.";
export const SUPER_ADMIN_PROFILE_CODE = "SUPER_ADMIN";
const noRowsPostgrestCodes = new Set(["PGRST116", "PGRST125"]);

export class InitialSetupCheckError extends Error {
  constructor() {
    super(initialSetupCheckMessage);
    this.name = "InitialSetupCheckError";
  }
}

function logInitialSetupCheckError(stage: string, error: unknown) {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message
        }
      : {
          name: "UnknownError",
          message: "unknown"
        };

  const errorWithCode = error as { code?: unknown };

  console.error("[auth.setup_initial.check_failed]", {
    stage,
    ...details,
    code: typeof errorWithCode?.code === "string" ? errorWithCode.code : undefined
  });
}

function raiseInitialSetupCheckError(stage: string, error: unknown): never {
  logInitialSetupCheckError(stage, error);
  throw new InitialSetupCheckError();
}

function isNoRowsPostgrestError(error: unknown) {
  const errorWithCode = error as { code?: unknown };

  return typeof errorWithCode?.code === "string" && noRowsPostgrestCodes.has(errorWithCode.code);
}

export async function hasActiveSuperAdmin() {
  let supabase: ReturnType<typeof createSupabaseAdminClient>;

  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    raiseInitialSetupCheckError("admin_client_config", error);
  }

  const { data: profile, error: profileError } = await supabase
    .from("access_profiles")
    .select("id")
    .eq("code", SUPER_ADMIN_PROFILE_CODE)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (profileError && isNoRowsPostgrestError(profileError)) {
    return false;
  }

  if (profileError) {
    raiseInitialSetupCheckError("super_admin_profile_lookup", profileError);
  }

  const superAdminProfile = profile?.[0];

  if (!superAdminProfile) {
    return false;
  }

  const { data: links, error: linksError } = await supabase
    .from("user_unit_links")
    .select("app_user_id")
    .eq("access_profile_id", superAdminProfile.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (linksError) {
    raiseInitialSetupCheckError("super_admin_link_lookup", linksError);
  }

  const appUserIds = Array.from(new Set(links?.map((link) => link.app_user_id).filter(Boolean) ?? []));

  if (!appUserIds.length) {
    return false;
  }

  const { data: activeUsers, error: activeUsersError } = await supabase
    .from("app_users")
    .select("id")
    .in("id", appUserIds)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (activeUsersError) {
    raiseInitialSetupCheckError("super_admin_user_lookup", activeUsersError);
  }

  return (activeUsers?.length ?? 0) > 0;
}

export async function getCurrentSessionContext(): Promise<SessionContext | null> {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await serverClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return getSessionContextByAuthUserId(user.id);
}

export async function getSessionContextByAuthUserId(authUserId: string): Promise<SessionContext | null> {
  const supabase = createSupabaseAdminClient();

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("id, username, display_name, status")
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .single();

  if (appUserError || !appUser || appUser.status !== "active") {
    return null;
  }

  const { data: links, error: linksError } = await supabase
    .from("user_unit_links")
    .select(
      "id, unit_id, access_profile_id, status, units!inner(id, name, code, status), access_profiles!inner(id, name, code, status)"
    )
    .eq("app_user_id", appUser.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("units.status", "active")
    .is("units.deleted_at", null)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .order("created_at", { ascending: true });

  if (linksError || !links?.length) {
    return null;
  }

  const firstLink = links[0] as any;
  const units = links.map((link: any) => ({
    id: link.units.id,
    name: link.units.name,
    code: link.units.code
  }));

  return {
    user: {
      id: appUser.id,
      name: appUser.display_name,
      username: appUser.username
    },
    profile: {
      id: firstLink.access_profiles.id,
      name: firstLink.access_profiles.name,
      code: firstLink.access_profiles.code
    },
    units,
    activeUnit: units[0]
  };
}
