import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { appUserHasSuperAdminLink, getEffectivePermissionCodes } from "@/lib/auth/session";

// Fase 3-A: permissoes EFETIVAS de um usuario-ALVO (READ-ONLY). Gate: ADMIN:permissions.view.
// Reusa os helpers da Fase 1 (nao duplica a resolucao de permissao). Super admin => ["*"].
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requirePermission("ADMIN:permissions.view");

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const targetId = params.id;

    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id, username, display_name")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle();

    if (targetError) {
      logBaseCadastroError("admin_permissions.user_lookup_failed", targetError);
      return apiError("Nao foi possivel carregar o usuario.", 500);
    }

    if (!target) {
      return apiError("Usuario nao encontrado.", 404);
    }

    const { data: linkRows, error: linksError } = await supabase
      .from("user_unit_links")
      .select("unit_id, access_profile_id")
      .eq("app_user_id", targetId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (linksError) {
      logBaseCadastroError("admin_permissions.user_links_failed", linksError);
      return apiError("Nao foi possivel carregar os vinculos do usuario.", 500);
    }

    const links = (linkRows ?? []).map((link) => ({ unit_id: link.unit_id, access_profile_id: link.access_profile_id }));

    // isSuperAdmin do ALVO (reuso do helper existente) + permissoes efetivas (perfil + overrides).
    const isSuperAdmin = await appUserHasSuperAdminLink(supabase, targetId);
    const permissions = await getEffectivePermissionCodes(supabase, { isSuperAdmin, appUserId: targetId, links });

    // Perfis ativos do alvo (contexto de exibicao).
    const profileIds = Array.from(new Set(links.map((link) => link.access_profile_id)));
    const { data: profileRows } = profileIds.length
      ? await supabase
          .from("access_profiles")
          .select("code, name")
          .in("id", profileIds)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("name", { ascending: true })
      : { data: [] };

    // Fase 3-B (read-only): breakdown para a UI de edicao.
    // profilePermissions = codigos concedidos pelos PERFIS do alvo (SEM overrides).
    const { data: grantRows, error: grantError } = profileIds.length
      ? await supabase
          .from("profile_permissions")
          .select("permissions!inner(code, status, deleted_at)")
          .in("access_profile_id", profileIds)
          .eq("is_allowed", true)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };

    if (grantError) {
      logBaseCadastroError("admin_permissions.user_profile_grants_failed", grantError);
      return apiError("Nao foi possivel carregar as permissoes de perfil do usuario.", 500);
    }

    const profilePermissions = Array.from(
      new Set(
        ((grantRows ?? []) as any[])
          .map((row) => row.permissions as { code: string; status: string; deleted_at: string | null })
          .filter((permission) => permission && permission.status === "active" && !permission.deleted_at)
          .map((permission) => permission.code)
      )
    );

    // overrides ativos do alvo (escopo global: unit_id null).
    const { data: overrideRows, error: overrideError } = await supabase
      .from("user_permission_overrides")
      .select("is_allowed, permissions!inner(code)")
      .eq("app_user_id", targetId)
      .is("unit_id", null)
      .eq("status", "active")
      .is("deleted_at", null);

    if (overrideError) {
      logBaseCadastroError("admin_permissions.user_overrides_failed", overrideError);
      return apiError("Nao foi possivel carregar as excecoes do usuario.", 500);
    }

    const overrides = ((overrideRows ?? []) as any[]).map((row) => ({
      permissionCode: (row.permissions as { code: string }).code,
      isAllowed: Boolean(row.is_allowed)
    }));

    return NextResponse.json({
      ok: true,
      user: { id: target.id, username: target.username, displayName: target.display_name },
      isSuperAdmin,
      permissions,
      profiles: (profileRows ?? []).map((profile) => ({ code: profile.code, name: profile.name })),
      profilePermissions,
      overrides
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar as permissoes do usuario.", 500);
  }
}
