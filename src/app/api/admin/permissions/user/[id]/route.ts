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

    return NextResponse.json({
      ok: true,
      user: { id: target.id, username: target.username, displayName: target.display_name },
      isSuperAdmin,
      permissions,
      profiles: (profileRows ?? []).map((profile) => ({ code: profile.code, name: profile.name }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar as permissoes do usuario.", 500);
  }
}
