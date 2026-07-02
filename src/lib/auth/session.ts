import "server-only";

import type { SessionContext } from "@/lib/auth/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveUnitCookie } from "@/lib/auth/active-unit";

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

/**
 * Fase 1: codigos de permissao EFETIVOS do usuario (uniao entre unidades), para filtrar a UI.
 * Read-only e ADITIVO — NAO altera a validacao server-side (requirePermission/policies).
 * Espelha a semantica do resolver por-codigo (permissions.ts): grants por perfil
 * (profile_permissions) + overrides (user_permission_overrides.is_allowed; unit_id nulo = todas as
 * unidades vinculadas). Um codigo e' "efetivo" se o usuario o tem em AO MENOS uma unidade.
 * Super admin => ["*"] (sentinela). Em erro de query: loga e retorna [] (degrade seguro; o menu so
 * mostra itens sem permissao — o servidor continua barrando o acesso real).
 */
export async function getEffectivePermissionCodes(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { isSuperAdmin: boolean; appUserId: string; links: Array<{ unit_id: string; access_profile_id: string }> }
): Promise<string[]> {
  if (input.isSuperAdmin) {
    return ["*"];
  }

  const profileIds = Array.from(new Set(input.links.map((link) => link.access_profile_id)));
  const linkedUnitIds = new Set(input.links.map((link) => link.unit_id));
  if (!profileIds.length) {
    return [];
  }

  const unitsByProfile = new Map<string, string[]>();
  for (const link of input.links) {
    unitsByProfile.set(link.access_profile_id, [...(unitsByProfile.get(link.access_profile_id) ?? []), link.unit_id]);
  }

  // permissionId -> code ; permissionId -> Set<unitId> permitido
  const codeById = new Map<string, string>();
  const allowedUnitsByPermission = new Map<string, Set<string>>();

  try {
    // 1) Grants por perfil (profile_permissions -> permissions).
    const { data: grantRows, error: grantError } = await supabase
      .from("profile_permissions")
      .select("access_profile_id, permissions!inner(id, code)")
      .in("access_profile_id", profileIds)
      .eq("is_allowed", true)
      .eq("status", "active")
      .is("deleted_at", null);

    if (grantError) {
      logInitialSetupCheckError("effective_permissions_grants", grantError);
      return [];
    }

    for (const row of (grantRows ?? []) as any[]) {
      const permission = row.permissions as { id: string; code: string };
      codeById.set(permission.id, permission.code);
      const set = allowedUnitsByPermission.get(permission.id) ?? new Set<string>();
      for (const unitId of unitsByProfile.get(row.access_profile_id) ?? []) {
        set.add(unitId);
      }
      allowedUnitsByPermission.set(permission.id, set);
    }

    // 2) Overrides por usuario (mesma semantica do resolver por-codigo).
    const { data: overrideRows, error: overrideError } = await supabase
      .from("user_permission_overrides")
      .select("permission_id, unit_id, is_allowed, permissions!inner(id, code)")
      .eq("app_user_id", input.appUserId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (overrideError) {
      logInitialSetupCheckError("effective_permissions_overrides", overrideError);
      return [];
    }

    for (const override of (overrideRows ?? []) as any[]) {
      codeById.set(override.permission_id, (override.permissions as { code: string }).code);
      const set = allowedUnitsByPermission.get(override.permission_id) ?? new Set<string>();

      if (!override.unit_id) {
        if (override.is_allowed) {
          linkedUnitIds.forEach((unitId) => set.add(unitId));
        } else {
          set.clear();
        }
      } else if (linkedUnitIds.has(override.unit_id)) {
        if (override.is_allowed) {
          set.add(override.unit_id);
        } else {
          set.delete(override.unit_id);
        }
      }

      allowedUnitsByPermission.set(override.permission_id, set);
    }
  } catch (error) {
    logInitialSetupCheckError("effective_permissions_unexpected", error);
    return [];
  }

  const codes: string[] = [];
  allowedUnitsByPermission.forEach((units, permissionId) => {
    if (units.size > 0) {
      const code = codeById.get(permissionId);
      if (code) {
        codes.push(code);
      }
    }
  });

  return Array.from(new Set(codes));
}

export async function getCurrentSessionContext(activeUnitIdOverride?: string): Promise<SessionContext | null> {
  const serverClient = createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await serverClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return getSessionContextByAuthUserId(user.id, activeUnitIdOverride);
}

export async function getSessionContextByAuthUserId(
  authUserId: string,
  activeUnitIdOverride?: string
): Promise<SessionContext | null> {
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

  const typedLinks = links as any[];
  const firstLink = typedLinks[0];

  // Super admin: detectado por possuir vinculo ativo com perfil SUPER_ADMIN.
  const superAdminLink = typedLinks.find((link) => link.access_profiles.code === SUPER_ADMIN_PROFILE_CODE);
  const isSuperAdmin = Boolean(superAdminLink);

  // Perfil de uma unidade: precedencia SUPER_ADMIN > demais, empate por created_at asc.
  // (typedLinks ja vem ordenado por created_at asc; firstLink desse filtro = mais antigo.)
  const profileForUnit = (unitId: string) => {
    if (isSuperAdmin) {
      return {
        id: superAdminLink.access_profiles.id,
        name: superAdminLink.access_profiles.name,
        code: superAdminLink.access_profiles.code
      };
    }

    const unitLinks = typedLinks.filter((link) => link.unit_id === unitId);
    const chosen =
      unitLinks.find((link) => link.access_profiles.code === SUPER_ADMIN_PROFILE_CODE) ?? unitLinks[0] ?? firstLink;

    return {
      id: chosen.access_profiles.id,
      name: chosen.access_profiles.name,
      code: chosen.access_profiles.code
    };
  };

  // units[]: super admin enxerga TODAS as unidades ativas (para o seletor nao ficar
  // preso a uma); demais usuarios enxergam apenas as unidades dos seus vinculos.
  // Em ambos os casos, deduplica por id (um usuario pode ter mais de um perfil na
  // mesma unidade -> a unidade aparece uma vez so).
  let units: Array<{ id: string; name: string; code: string }>;

  if (isSuperAdmin) {
    const { data: allUnits, error: allUnitsError } = await supabase
      .from("units")
      .select("id, name, code")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (allUnitsError) {
      // Fallback seguro: nao derruba a sessao do super admin por falha aqui.
      const map = new Map<string, { id: string; name: string; code: string }>();
      for (const link of typedLinks) {
        map.set(link.units.id, { id: link.units.id, name: link.units.name, code: link.units.code });
      }
      units = Array.from(map.values());
    } else {
      units = (allUnits ?? []).map((unit) => ({ id: unit.id, name: unit.name, code: unit.code }));
    }
  } else {
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const link of typedLinks) {
      map.set(link.units.id, { id: link.units.id, name: link.units.name, code: link.units.code });
    }
    units = Array.from(map.values());
  }

  if (!units.length) {
    // Garantia extra de fallback (ex.: super admin sem unidades ativas no banco).
    const map = new Map<string, { id: string; name: string; code: string }>();
    for (const link of typedLinks) {
      map.set(link.units.id, { id: link.units.id, name: link.units.name, code: link.units.code });
    }
    units = Array.from(map.values());
  }

  // Unidade ativa: override explicito (ex.: unidade recem-validada no endpoint) tem
  // prioridade sobre o cookie, evitando depender de ler cookie recem-gravado no mesmo
  // request. Em ambos os casos, a unidade so vale se estiver em units[]; senao fallback.
  const desiredUnitId = activeUnitIdOverride ?? getActiveUnitCookie();
  const activeUnit = (desiredUnitId ? units.find((unit) => unit.id === desiredUnitId) : undefined) ?? units[0];

  // Fase 1: permissoes efetivas (uniao entre unidades) para filtrar a UI (1 resolucao por load).
  const permissions = await getEffectivePermissionCodes(supabase, {
    isSuperAdmin,
    appUserId: appUser.id,
    links: typedLinks.map((link) => ({ unit_id: link.unit_id, access_profile_id: link.access_profile_id }))
  });

  return {
    user: {
      id: appUser.id,
      name: appUser.display_name,
      username: appUser.username
    },
    profile: profileForUnit(activeUnit.id),
    units,
    activeUnit,
    permissions
  };
}

// Helper read-only para validacao de troca de unidade (endpoint active-unit):
// o usuario possui algum vinculo ativo com perfil SUPER_ADMIN ativo?
export async function appUserHasSuperAdminLink(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  appUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(code, status, deleted_at)")
    .eq("app_user_id", appUserId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("access_profiles.code", SUPER_ADMIN_PROFILE_CODE)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);

  if (error) {
    return false;
  }

  return Boolean(data?.length);
}
