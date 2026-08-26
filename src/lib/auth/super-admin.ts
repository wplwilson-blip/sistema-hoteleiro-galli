import { logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

// Conjunto de app_user_ids que sao super admins ATIVOS:
// app_user ativo (status active, deleted_at null) COM vinculo user_unit_links ATIVO
// (status active, deleted_at null) no perfil SUPER_ADMIN. Vinculo inativo nao conta.
export async function getActiveSuperAdminUserIds(supabase: SupabaseAdmin): Promise<string[]> {
  const { data: profile, error: profileError } = await supabase
    .from("access_profiles")
    .select("id")
    .eq("code", SUPER_ADMIN_PROFILE_CODE)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (profileError) {
    logBaseCadastroError("users.super_admin_profile_lookup_failed", profileError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  const superAdminProfile = profile?.[0];

  if (!superAdminProfile) {
    return [];
  }

  const { data: links, error: linksError } = await supabase
    .from("user_unit_links")
    .select("app_user_id")
    .eq("access_profile_id", superAdminProfile.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (linksError) {
    logBaseCadastroError("users.super_admin_link_lookup_failed", linksError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  const candidateIds = Array.from(new Set((links ?? []).map((link) => link.app_user_id).filter(Boolean)));

  if (!candidateIds.length) {
    return [];
  }

  const { data: activeUsers, error: activeUsersError } = await supabase
    .from("app_users")
    .select("id")
    .in("id", candidateIds)
    .eq("status", "active")
    .is("deleted_at", null);

  if (activeUsersError) {
    logBaseCadastroError("users.super_admin_user_lookup_failed", activeUsersError);
    throw new Error("Nao foi possivel validar os super admins ativos.");
  }

  return Array.from(new Set((activeUsers ?? []).map((user) => user.id)));
}

/**
 * Pode EXCLUIR este usuario? Espelha, sem reimplementar, as duas recusas do DELETE em
 * src/app/api/base/users/[id]/route.ts:
 *   - o proprio usuario (409);
 *   - o ultimo super admin ativo (409, anti-lockout).
 *
 * Puro de proposito: recebe os ids ja' carregados e nao toca no banco, para ser testavel
 * no runner puro. A ordem das checagens define a precedencia da MENSAGEM quando o ator e'
 * tambem o ultimo super admin: vence "o proprio usuario", que e' o motivo mais direto.
 */
export function getUserDeletePermission(input: {
  userId: string;
  actorId: string;
  activeSuperAdminIds: string[];
}): { canDelete: boolean; cannotDeleteReason: string } {
  if (input.userId === input.actorId) {
    return { canDelete: false, cannotDeleteReason: "Voce nao pode excluir o proprio usuario." };
  }

  const isSuperAdmin = input.activeSuperAdminIds.includes(input.userId);
  const remaining = input.activeSuperAdminIds.filter((id) => id !== input.userId);

  if (isSuperAdmin && remaining.length === 0) {
    return { canDelete: false, cannotDeleteReason: "Nao e possivel excluir o ultimo super admin ativo." };
  }

  return { canDelete: true, cannotDeleteReason: "" };
}
