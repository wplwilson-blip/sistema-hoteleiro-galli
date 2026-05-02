import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateWinningQuoteApprovalFlags, getPurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  status: string;
  request_number: string;
  total_approved_amount: string | number;
  approval_required: boolean;
  approval_status: PurchaseApprovalStatus | null;
};

type SelectedQuoteRow = {
  id: string;
  total_amount: string | number;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function POST(_request: Request, { params }: { params: { requestId: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const { data, error } = await supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status")
      .eq("id", params.requestId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return apiError("Solicitação de compra não encontrada.", 404);
    }

    const purchaseRequest = data as PurchaseRequestRow;

    if (!accessibleUnitIds.includes(purchaseRequest.unit_id)) {
      return apiError("Você não tem acesso a esta unidade.", 403);
    }

    if (purchaseRequest.approval_status === "approved" || purchaseRequest.status === "approved") {
      return apiError("Esta compra já foi aprovada e não pode ser reenviada.", 409);
    }

    if (purchaseRequest.approval_status === "rejected" || purchaseRequest.status === "rejected") {
      return apiError("Esta compra foi reprovada e não pode ser reenviada.", 409);
    }

    if (purchaseRequest.approval_status === "pending" && purchaseRequest.approval_required && toNumber(purchaseRequest.total_approved_amount) > 0) {
      return apiError("Esta compra já está aguardando aprovação.", 409);
    }

    if (purchaseRequest.status !== "quotation") {
      return apiError("Esta compra precisa estar em cotação para ser enviada para aprovação.", 409);
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("purchase_quotes")
      .select("id, total_amount")
      .eq("purchase_request_id", purchaseRequest.id)
      .eq("is_selected", true)
      .is("deleted_at", null)
      .limit(1);

    if (quoteError) {
      logBaseCadastroError("purchase_approvals.resubmit_quote_lookup_failed", quoteError);
      return apiError("Não foi possível validar a cotação vencedora.", 500);
    }

    const selectedQuote = quoteData?.[0] as SelectedQuoteRow | undefined;
    const isResubmission = purchaseRequest.approval_status === "returned_to_purchases";

    if (!selectedQuote) {
      return apiError(
        isResubmission
          ? "Selecione uma cotação vencedora antes de reenviar para aprovação."
          : "Selecione uma cotação vencedora antes de enviar para aprovação.",
        409
      );
    }

    const total = toNumber(selectedQuote.total_amount);
    const requestFlags = calculateWinningQuoteApprovalFlags(total);
    const { error: updateError } = await supabase
      .from("purchase_requests")
      .update({
        status: "quotation",
        total_approved_amount: total,
        quotation_required: requestFlags.quotationRequired,
        required_quote_count: requestFlags.requiredQuoteCount,
        approval_required: requestFlags.approvalRequired,
        director_approval_required: requestFlags.directorApprovalRequired,
        approval_status: "pending",
        approval_level: getPurchaseApprovalLevel(total),
        approval_decided_at: null,
        approval_decided_by: null,
        approval_decision_notes: null,
        updated_by: session.user.id
      })
      .eq("id", purchaseRequest.id);

    if (updateError) {
      logBaseCadastroError("purchase_approvals.resubmit_update_failed", updateError);
      return apiError(isResubmission ? "Não foi possível reenviar a compra para aprovação." : "Não foi possível enviar a compra para aprovação.", 500);
    }

    await supabase.from("purchase_request_events").insert({
      organization_id: purchaseRequest.organization_id,
      unit_id: purchaseRequest.unit_id,
      purchase_request_id: purchaseRequest.id,
      event_type: isResubmission ? "purchase_resubmitted_for_approval" : "purchase_submitted_for_approval",
      from_status: purchaseRequest.status,
      to_status: "quotation",
      description: isResubmission
        ? `Compra ${purchaseRequest.request_number} reenviada para aprovação após revisão de Compras.`
        : `Compra ${purchaseRequest.request_number} enviada para aprovação.`,
      created_by: session.user.id
    });

    return NextResponse.json({ ok: true, message: isResubmission ? "Compra reenviada para aprovação." : "Compra enviada para aprovação." });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível enviar para aprovação.", 500);
  }
}
