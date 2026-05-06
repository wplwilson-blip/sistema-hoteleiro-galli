import type { SessionContext } from "@/lib/auth/types";
import { SUPER_ADMIN_PROFILE_CODE } from "@/lib/auth/session";
import type { PurchaseApprovalLevel, SupabaseAdmin } from "@/lib/purchases/api";

const DIRECTORATE_PROFILE_CODES = ["UNIT_DIRECTOR"];

export class PurchaseApprovalAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "PurchaseApprovalAuthorizationError";
    this.status = status;
  }
}

async function hasActiveUnitProfile(
  supabase: SupabaseAdmin,
  input: {
    userId: string;
    unitId: string;
    profileCodes: string[];
  }
) {
  const { data, error } = await supabase
    .from("user_unit_links")
    .select("id, access_profiles!inner(code)")
    .eq("app_user_id", input.userId)
    .eq("unit_id", input.unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("access_profiles.code", input.profileCodes)
    .eq("access_profiles.status", "active")
    .is("access_profiles.deleted_at", null)
    .limit(1);

  if (error) {
    throw new PurchaseApprovalAuthorizationError("Nao foi possivel validar a autoridade para decidir este dossie.", 500);
  }

  return Boolean(data?.length);
}

export async function assertCanDecidePurchaseApprovalLevel(
  supabase: SupabaseAdmin,
  input: {
    session: SessionContext;
    unitId: string;
    approvalLevel: PurchaseApprovalLevel;
  }
) {
  if (input.approvalLevel !== "general_directorate") {
    if (input.session.profile.code !== SUPER_ADMIN_PROFILE_CODE) {
      throw new PurchaseApprovalAuthorizationError("Voce nao tem permissao para decidir aprovacoes de compras.", 403);
    }

    return;
  }

  const hasDirectorateAuthority = await hasActiveUnitProfile(supabase, {
    userId: input.session.user.id,
    unitId: input.unitId,
    profileCodes: DIRECTORATE_PROFILE_CODES
  });

  if (!hasDirectorateAuthority) {
    throw new PurchaseApprovalAuthorizationError(
      "Aprovacao restrita a Diretoria. Seu perfil nao possui autoridade para decidir este dossie.",
      403
    );
  }
}
