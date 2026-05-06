import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { calculateWinningQuoteApprovalFlags, getPurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import {
  classifyPurchaseQuoteEvidence,
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";
import {
  createPurchaseApprovalSnapshot,
  deletePurchaseApprovalSnapshot,
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
      .select("id, total_amount, quote_source_type, evidence_type, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline")
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
    const { data: attachmentRows, error: attachmentError } = await supabase
      .from("attachments")
      .select("id")
      .eq("module", "purchases")
      .eq("entity_type", "purchase_quote")
      .eq("entity_id", selectedQuote.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (attachmentError) {
      logBaseCadastroError("purchase_approvals.resubmit_attachment_lookup_failed", attachmentError);
      return apiError("Não foi possível validar os anexos da cotação vencedora.", 500);
    }

    const evidenceClassification = classifyPurchaseQuoteEvidence({
      quoteSourceType: selectedQuote.quote_source_type,
      evidenceType: selectedQuote.evidence_type,
      sourceContactName: selectedQuote.source_contact_name,
      sourceContactChannel: selectedQuote.source_contact_channel,
      sourceReference: selectedQuote.source_reference,
      sourceUrl: selectedQuote.source_url,
      sourceNotes: selectedQuote.source_notes,
      evidenceMissingReason: selectedQuote.evidence_missing_reason,
      isVerbalQuote: selectedQuote.is_verbal_quote,
      isEmergencyQuote: selectedQuote.is_emergency_quote,
      emergencyReason: selectedQuote.emergency_reason,
      regularizationRequired: selectedQuote.regularization_required,
      regularizationDeadline: selectedQuote.regularization_deadline,
      hasAttachment: Boolean(attachmentRows?.length)
    });
    const approvalLevel = evidenceClassification.requiresDirectorApproval ? "general_directorate" : getPurchaseApprovalLevel(total);
    let approvalSnapshot: { id: string; snapshot_number: number } | null = null;

    try {
      approvalSnapshot = await createPurchaseApprovalSnapshot({
        supabase,
        purchaseRequestId: purchaseRequest.id,
        selectedQuoteId: selectedQuote.id,
        submittedBy: session.user.id,
        approvalLevel,
        totalAmount: total,
        approvalStatusAtCreation: "pending",
        isResubmission
      });
    } catch (snapshotError) {
      if (snapshotError instanceof PurchaseApprovalSnapshotError) {
        return apiError(snapshotError.message, snapshotError.status);
      }

      logBaseCadastroError("purchase_approvals.snapshot_create_failed", snapshotError instanceof Error ? snapshotError : { message: "unknown" });
      return apiError("Não foi possível gerar o dossiê formal da aprovação.", 500);
    }

    const { error: updateError } = await supabase
      .from("purchase_requests")
      .update({
        status: "quotation",
        total_approved_amount: total,
        quotation_required: requestFlags.quotationRequired,
        required_quote_count: requestFlags.requiredQuoteCount,
        approval_required: requestFlags.approvalRequired || evidenceClassification.requiresDirectorApproval,
        director_approval_required: requestFlags.directorApprovalRequired || evidenceClassification.requiresDirectorApproval,
        approval_status: "pending",
        approval_level: approvalLevel,
        approval_decided_at: null,
        approval_decided_by: null,
        approval_decision_notes: null,
        updated_by: session.user.id
      })
      .eq("id", purchaseRequest.id);

    if (updateError) {
      logBaseCadastroError("purchase_approvals.resubmit_update_failed", updateError);
      if (approvalSnapshot) {
        await deletePurchaseApprovalSnapshot(supabase, approvalSnapshot.id);
      }
      return apiError(isResubmission ? "Não foi possível reenviar a compra para aprovação." : "Não foi possível enviar a compra para aprovação.", 500);
    }

    const { error: eventError } = await supabase.from("purchase_request_events").insert([
      {
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
      },
      {
        organization_id: purchaseRequest.organization_id,
        unit_id: purchaseRequest.unit_id,
        purchase_request_id: purchaseRequest.id,
        event_type: "approval_snapshot_created",
        from_status: purchaseRequest.status,
        to_status: "quotation",
        description: `Dossie formal de aprovacao #${approvalSnapshot?.snapshot_number ?? "-"} criado para a compra ${purchaseRequest.request_number}.`,
        created_by: session.user.id
      }
    ]);

    if (eventError) {
      logBaseCadastroError("purchase_approvals.resubmit_event_create_failed", eventError);
    }

    return NextResponse.json({ ok: true, message: isResubmission ? "Compra reenviada para aprovação." : "Compra enviada para aprovação." });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível enviar para aprovação.", 500);
  }
}
