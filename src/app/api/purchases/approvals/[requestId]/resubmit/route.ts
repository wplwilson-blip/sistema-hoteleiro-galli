import { NextResponse } from "next/server";
import { PURCHASES_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateWinningQuoteApprovalFlags, getPurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import {
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";
import {
  createPurchaseApprovalSnapshot,
  PurchaseApprovalSnapshotError
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
};

type SelectedQuoteRow = {
  id: string;
  total_amount: string | number;
  quote_source_type: PurchaseQuoteSourceType | null;
  evidence_type: PurchaseQuoteEvidenceType | null;
  source_contact_name: string | null;
  source_contact_channel: PurchaseQuoteSourceContactChannel | null;
  source_reference: string | null;
  source_url: string | null;
  source_notes: string | null;
  evidence_missing_reason: string | null;
  is_verbal_quote: boolean;
  is_emergency_quote: boolean;
  emergency_reason: string | null;
  regularization_required: boolean;
  regularization_deadline: string | null;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function POST(_request: Request, { params }: { params: { requestId: string } }) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.approvalsSubmit);

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;
    const { data, error } = await supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status")
      .eq("id", params.requestId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      return apiError("SolicitaÃ§Ã£o de compra nÃ£o encontrada.", 404);
    }

    const purchaseRequest = data as PurchaseRequestRow;

    if (!accessibleUnitIds.includes(purchaseRequest.unit_id)) {
      return apiError("VocÃª nÃ£o tem acesso a esta unidade.", 403);
    }

    if (purchaseRequest.approval_status === "approved" || purchaseRequest.status === "approved") {
      return apiError("Esta compra jÃ¡ foi aprovada e nÃ£o pode ser reenviada.", 409);
    }

    if (purchaseRequest.approval_status === "rejected" || purchaseRequest.status === "rejected") {
      return apiError("Esta compra foi reprovada e nÃ£o pode ser reenviada.", 409);
    }

    if (purchaseRequest.approval_status === "pending" && purchaseRequest.approval_required && toNumber(purchaseRequest.total_approved_amount) > 0) {
      return apiError("Esta compra jÃ¡ estÃ¡ aguardando aprovaÃ§Ã£o.", 409);
    }

    if (purchaseRequest.status !== "quotation") {
      return apiError("Esta compra precisa estar em cotaÃ§Ã£o para ser enviada para aprovaÃ§Ã£o.", 409);
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("purchase_quotes")
      .select("id, total_amount, quote_source_type, evidence_type, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline")
      .eq("purchase_request_id", purchaseRequest.id)
      .eq("is_selected", true)
      .is("deleted_at", null)
      .limit(1);

    if (quoteError) {
      logBaseCadastroError("purchase_approvals.resubmit_quote_lookup_failed", quoteError);
      return apiError("NÃ£o foi possÃ­vel validar a cotaÃ§Ã£o vencedora.", 500);
    }

    const selectedQuote = quoteData?.[0] as SelectedQuoteRow | undefined;
    const isResubmission = purchaseRequest.approval_status === "returned_to_purchases";

    if (!selectedQuote) {
      return apiError(
        isResubmission
          ? "Selecione uma cotaÃ§Ã£o vencedora antes de reenviar para aprovaÃ§Ã£o."
          : "Selecione uma cotaÃ§Ã£o vencedora antes de enviar para aprovaÃ§Ã£o.",
        409
      );
    }

    const total = toNumber(selectedQuote.total_amount);
    const requestFlags = calculateWinningQuoteApprovalFlags(total);
    // Alçada por valor é a única fonte da verdade (docs/codex/59). A classificação
    // documental segue registrada no snapshot como selo de risco, mas não escala alçada.
    const approvalLevel = getPurchaseApprovalLevel(total);

    try {
      await createPurchaseApprovalSnapshot({
        supabase,
        purchaseRequestId: purchaseRequest.id,
        selectedQuoteId: selectedQuote.id,
        submittedBy: context.session.user.id,
        approvalLevel,
        totalAmount: total,
        approvalStatusAtCreation: "pending",
        isResubmission,
        requestUpdate: {
          nextStatus: "quotation",
          fromStatus: purchaseRequest.status,
          totalApprovedAmount: total,
          quotationRequired: requestFlags.quotationRequired,
          requiredQuoteCount: requestFlags.requiredQuoteCount,
          approvalRequired: requestFlags.approvalRequired,
          directorApprovalRequired: requestFlags.directorApprovalRequired
        },
        events: {
          submitEventType: isResubmission ? "purchase_resubmitted_for_approval" : "purchase_submitted_for_approval",
          submitEventDescription: isResubmission
            ? `Compra ${purchaseRequest.request_number} reenviada para aprovaÃ§Ã£o apÃ³s revisÃ£o de Compras.`
            : `Compra ${purchaseRequest.request_number} enviada para aprovaÃ§Ã£o.`,
          snapshotEventType: "approval_snapshot_created"
        }
      });
    } catch (snapshotError) {
      if (snapshotError instanceof PurchaseApprovalSnapshotError) {
        return apiError(snapshotError.message, snapshotError.status);
      }

      logBaseCadastroError("purchase_approvals.snapshot_create_failed", snapshotError instanceof Error ? snapshotError : { message: "unknown" });
      return apiError("NÃ£o foi possÃ­vel gerar o dossiÃª formal da aprovaÃ§Ã£o.", 500);
    }

    return NextResponse.json({ ok: true, message: isResubmission ? "Compra reenviada para aprovaÃ§Ã£o." : "Compra enviada para aprovaÃ§Ã£o." });
  } catch (error) {
    logBaseCadastroError("purchase_approvals.resubmit_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("NÃ£o foi possÃ­vel enviar para aprovaÃ§Ã£o.", 500);
  }
}
