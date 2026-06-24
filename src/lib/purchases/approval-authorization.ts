import type { SessionContext } from "@/lib/auth/types";
import { PURCHASES_PERMISSIONS, PermissionAuthorizationError, userHasPermissionForUnit } from "@/lib/auth/permissions";
import type { PurchaseApprovalLevel, SupabaseAdmin } from "@/lib/purchases/api";

export class PurchaseApprovalAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "PurchaseApprovalAuthorizationError";
    this.status = status;
  }
}

export async function assertCanDecidePurchaseApprovalLevel(
  supabase: SupabaseAdmin,
  input: {
    session: SessionContext;
    unitId: string;
    approvalLevel: PurchaseApprovalLevel;
  }
) {
  const requiredPermission =
    input.approvalLevel === "general_directorate"
      ? PURCHASES_PERMISSIONS.approvalsDecideDirectorate
      : PURCHASES_PERMISSIONS.approvalsDecideAdministrative;
  const forbiddenMessage =
    input.approvalLevel === "general_directorate"
      ? "Aprovacao restrita a Diretoria Geral. Seu perfil nao possui autoridade para decidir este dossie nesta unidade."
      : "Voce nao tem permissao para decidir aprovacoes administrativas de compras nesta unidade.";

  try {
    const canDecide = await userHasPermissionForUnit(supabase, input.session, requiredPermission, input.unitId, {
      validationErrorMessage: "Nao foi possivel validar a autoridade para decidir este dossie.",
      unitValidationErrorMessage: "Nao foi possivel validar a autoridade para decidir este dossie."
    });

    if (canDecide) {
      return;
    }
  } catch (error) {
    if (error instanceof PermissionAuthorizationError) {
      throw new PurchaseApprovalAuthorizationError(error.message, error.status);
    }

    throw new PurchaseApprovalAuthorizationError(
      "Nao foi possivel validar a autoridade para decidir este dossie.",
      500
    );
  }

  throw new PurchaseApprovalAuthorizationError(forbiddenMessage, 403);
}
