import { NextResponse } from "next/server";
import { z } from "zod";
import { PURCHASES_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { getPurchaseApprovalLevel, type PurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import { assertCanDecidePurchaseApprovalLevel, PurchaseApprovalAuthorizationError } from "@/lib/purchases/approval-authorization";
import {
  PurchaseApprovalSnapshotError,
  assertPendingPurchaseApprovalSnapshot
} from "@/lib/purchases/approval-snapshots";

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  status: string;
  request_number: string;
  total_approved_amount: string | number;
  approval_required: boolean;
  approval_status: PurchaseApprovalStatus | null;
  approval_level: PurchaseApprovalLevel | null;
};

type PurchaseQuoteRow = {
  id: string;
  purchase_request_id: string;
  is_selected: boolean;
  total_amount: string | number;
};

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "returned_to_purchases"]),
  justification: z.string().trim().optional().default("")
});

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function POST(request: Request, { params }: { params: { requestId: string } }) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.approvalsView);

  if (response || !context) {
    return response;
  }

  try {
    const payload = decisionSchema.parse(await request.json());

    if ((payload.decision === "rejected" || payload.decision === "returned_to_purchases") && !payload.justification.trim()) {
      return apiError(payload.decision === "rejected" ? "Informe a justificativa para reprovar a compra." : "Informe o que Compras precisa revisar.", 400);
    }

    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;

    const { data: requestData, error: requestError } = await supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status, approval_level")
      .eq("id", params.requestId)
      .is("deleted_at", null)
      .single();

    if (requestError || !requestData) {
      logBaseCadastroError("purchase_approvals.request_lookup_failed", requestError ?? { message: "not found" });
      return apiError("SolicitaÃ§Ã£o de compra nÃ£o encontrada.", 404);
    }

    const purchaseRequest = requestData as PurchaseRequestRow;

    if (!accessibleUnitIds.includes(purchaseRequest.unit_id)) {
      return apiError("VocÃª nÃ£o tem acesso a esta unidade.", 403);
    }

    if (!purchaseRequest.approval_required || toNumber(purchaseRequest.total_approved_amount) <= 0) {
      return apiError("Esta solicitaÃ§Ã£o nÃ£o possui compra aguardando aprovaÃ§Ã£o.", 409);
    }

    if (purchaseRequest.approval_status === "approved" || purchaseRequest.approval_status === "rejected") {
      return apiError("Esta compra jÃ¡ possui decisÃ£o registrada.", 409);
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("purchase_quotes")
      .select("id, purchase_request_id, is_selected, total_amount")
      .eq("purchase_request_id", purchaseRequest.id)
      .eq("is_selected", true)
      .is("deleted_at", null)
      .limit(1);

    if (quoteError) {
      logBaseCadastroError("purchase_approvals.winning_quote_lookup_failed", quoteError);
      return apiError("NÃ£o foi possÃ­vel localizar a cotaÃ§Ã£o vencedora.", 500);
    }

    const winningQuote = (quoteData?.[0] ?? null) as PurchaseQuoteRow | null;

    if (!winningQuote) {
      return apiError("Selecione uma cotaÃ§Ã£o vencedora antes de decidir a aprovaÃ§Ã£o.", 409);
    }

    let approvalLevel = purchaseRequest.approval_level ?? getPurchaseApprovalLevel(toNumber(purchaseRequest.total_approved_amount));
    const decidedAt = new Date().toISOString();
    const nextStatus = payload.decision === "approved" ? "approved" : payload.decision === "rejected" ? "rejected" : "quotation";
    const eventDescription =
      payload.decision === "approved"
        ? `Compra ${purchaseRequest.request_number} aprovada.`
        : payload.decision === "rejected"
          ? `Compra ${purchaseRequest.request_number} reprovada. Justificativa: ${payload.justification.trim()}`
          : `Compra ${purchaseRequest.request_number} devolvida para Compras. Justificativa: ${payload.justification.trim()}`;

    try {
      const pendingSnapshot = await assertPendingPurchaseApprovalSnapshot(supabase, purchaseRequest.id);
      approvalLevel = pendingSnapshot.approval_level;
    } catch (snapshotError) {
      if (snapshotError instanceof PurchaseApprovalSnapshotError) {
        return apiError(snapshotError.message, snapshotError.status);
      }

      logBaseCadastroError("purchase_approvals.snapshot_pending_lookup_failed", snapshotError instanceof Error ? snapshotError : { message: "unknown" });
      return apiError("Nao foi possivel validar o dossie formal pendente da aprovacao.", 500);
    }

    try {
      await assertCanDecidePurchaseApprovalLevel(supabase, {
        session: context.session,
        unitId: purchaseRequest.unit_id,
        approvalLevel
      });
    } catch (authorizationError) {
      if (authorizationError instanceof PurchaseApprovalAuthorizationError) {
        return apiError(authorizationError.message, authorizationError.status);
      }

      logBaseCadastroError("purchase_approvals.authority_check_failed", authorizationError instanceof Error ? authorizationError : { message: "unknown" });
      return apiError("Nao foi possivel validar a autoridade para decidir este dossie.", 500);
    }

    const { error: rpcError } = await supabase.rpc("purchase_apply_approval_decision", {
      p_request_id: purchaseRequest.id,
      p_winning_quote_id: winningQuote.id,
      p_decision: payload.decision,
      p_justification: payload.justification,
      p_decided_by: context.session.user.id,
      p_decided_at: decidedAt,
      p_next_status: nextStatus,
      p_from_status: purchaseRequest.status,
      p_event_type:
        payload.decision === "approved"
          ? "purchase_approved"
          : payload.decision === "rejected"
            ? "purchase_rejected"
            : "purchase_returned_to_purchases",
      p_event_description: eventDescription
    });

    if (rpcError) {
      if (rpcError.message.includes("PURCHASE_REQUEST_NOT_FOUND")) {
        return apiError("Solicitação de compra não encontrada.", 404);
      }

      if (rpcError.message.includes("PURCHASE_ALREADY_DECIDED") || rpcError.message.includes("PURCHASE_SNAPSHOT_NOT_PENDING")) {
        return apiError("Esta compra já possui decisão registrada.", 409);
      }

      logBaseCadastroError("purchase_approvals.decision_rpc_failed", rpcError);
      return apiError("Não foi possível registrar a decisão de aprovação.", 500);
    }

    return NextResponse.json({
      ok: true,
      message: payload.decision === "approved" ? "Compra aprovada com sucesso." : payload.decision === "rejected" ? "Compra reprovada com sucesso." : "Compra devolvida para revisÃ£o de Compras."
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("Dados invÃ¡lidos para registrar a decisÃ£o.", 400);
    }

    return apiError(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel registrar a decisÃ£o.", 500);
  }
}
