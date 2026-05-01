import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  status: string;
  request_number: string;
  total_approved_amount: string | number;
  approval_status: PurchaseApprovalStatus | null;
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
      .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_status")
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

    if (purchaseRequest.approval_status !== "returned_to_purchases") {
      return apiError("Esta compra não está devolvida para revisão.", 409);
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("purchase_quotes")
      .select("id")
      .eq("purchase_request_id", purchaseRequest.id)
      .eq("is_selected", true)
      .is("deleted_at", null)
      .limit(1);

    if (quoteError) {
      logBaseCadastroError("purchase_approvals.resubmit_quote_lookup_failed", quoteError);
      return apiError("Não foi possível validar a cotação vencedora.", 500);
    }

    if (!quoteData?.[0]) {
      return apiError("Selecione uma cotação vencedora antes de reenviar para aprovação.", 409);
    }

    const total = toNumber(purchaseRequest.total_approved_amount);
    const { error: updateError } = await supabase
      .from("purchase_requests")
      .update({
        status: "quotation",
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
      return apiError("Não foi possível reenviar a compra para aprovação.", 500);
    }

    await supabase.from("purchase_request_events").insert({
      organization_id: purchaseRequest.organization_id,
      unit_id: purchaseRequest.unit_id,
      purchase_request_id: purchaseRequest.id,
      event_type: "purchase_resubmitted_for_approval",
      from_status: purchaseRequest.status,
      to_status: "quotation",
      description: `Compra ${purchaseRequest.request_number} reenviada para aprovação após revisão de Compras.`,
      created_by: session.user.id
    });

    return NextResponse.json({ ok: true, message: "Compra reenviada para aprovação." });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível reenviar para aprovação.", 500);
  }
}
