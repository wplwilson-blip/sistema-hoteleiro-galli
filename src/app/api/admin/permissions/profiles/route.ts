import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Fase 3-A: perfis de acesso + suas permissoes concedidas (READ-ONLY). Gate: ADMIN:permissions.view.
type ProfilePermission = { code: string; moduleCode: string; actionCode: string; name: string; description: string };

export async function GET() {
  const { context, response } = await requirePermission("ADMIN:permissions.view");

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    const { data: profiles, error: profilesError } = await supabase
      .from("access_profiles")
      .select("id, code, name, description, is_system_default")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (profilesError) {
      logBaseCadastroError("admin_permissions.profiles_failed", profilesError);
      return apiError("Nao foi possivel carregar os perfis de acesso.", 500);
    }

    const profileIds = (profiles ?? []).map((profile) => profile.id);

    const { data: grantRows, error: grantError } = profileIds.length
      ? await supabase
          .from("profile_permissions")
          .select("access_profile_id, permissions!inner(code, module_code, action_code, name, description, status, deleted_at)")
          .in("access_profile_id", profileIds)
          .eq("is_allowed", true)
          .eq("status", "active")
          .is("deleted_at", null)
      : { data: [], error: null };

    if (grantError) {
      logBaseCadastroError("admin_permissions.profile_grants_failed", grantError);
      return apiError("Nao foi possivel carregar as permissoes dos perfis.", 500);
    }

    const permissionsByProfile = new Map<string, ProfilePermission[]>();
    for (const row of (grantRows ?? []) as any[]) {
      const permission = row.permissions as { code: string; module_code: string; action_code: string; name: string; description: string | null; status: string; deleted_at: string | null };
      // Ignora permissoes inativas/removidas (o !inner apenas garante existencia do vinculo).
      if (!permission || permission.status !== "active" || permission.deleted_at) {
        continue;
      }
      const list = permissionsByProfile.get(row.access_profile_id) ?? [];
      list.push({
        code: permission.code,
        moduleCode: permission.module_code,
        actionCode: permission.action_code,
        name: permission.name,
        description: permission.description ?? ""
      });
      permissionsByProfile.set(row.access_profile_id, list);
    }

    return NextResponse.json({
      ok: true,
      profiles: (profiles ?? []).map((profile) => ({
        id: profile.id,
        code: profile.code,
        name: profile.name,
        description: profile.description ?? "",
        isSystemDefault: Boolean(profile.is_system_default),
        permissions: permissionsByProfile.get(profile.id) ?? []
      }))
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar os perfis de acesso.", 500);
  }
}
