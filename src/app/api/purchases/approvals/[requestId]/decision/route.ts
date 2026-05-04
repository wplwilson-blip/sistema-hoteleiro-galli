import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logBaseCadastroError, requireSuperAdminRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPurchaseApprovalLevel, type PurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import {
  PurchaseApprovalSnapshotError,
  assertPendingPurchaseApprovalSnapshot,
  updatePendingPurchaseApprovalSnapshotDecision
} from "@/lib/purchases/approval-snapshots";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

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

async function insertPurchaseRequestEvent(
  supabase: SupabaseAdmin,
  input: {
    organizationId: string;
    unitId: string;
    purchaseRequestId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    description: string;
    createdBy: string;
  }
) {
  const { error } = await supabase.from("purchase_request_events").insert({
    organization_id: input.organizationId,
    unit_id: input.unitId,
    purchase_request_id: input.purchaseRequestId,
    event_type: input.eventType,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    description: input.description,
    created_by: input.createdBy
  });

  if (error) {
    logBaseCadastroError("purchase_approvals.event_create_failed", error);
    throw new Error("Não foi possível registrar o evento da aprovação.");
  }
}

export async function POST(request: Request, { params }: { params: { requestId: string } }) {
  const { session, response } = await requireSuperAdminRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = decisionSchema.parse(await request.json());

    if ((payload.decision === "rejected" || payload.decision === "returned_to_purchases") && !payload.justification.trim()) {
      return apiError(payload.decision === "rejected" ? "Informe a justificativa para reprovar a compra." : "Informe o que Compras precisa revisar.", 400);
    }

    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    const { data: requestData, error: requestError } = await supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, status, request_number, total_approved_amount, approval_required, approval_status, approval_level")
      .eq("id", params.requestId)
      .is("deleted_at", null)
      .single();

    if (requestError || !requestData) {
      logBaseCadastroError("purchase_approvals.request_lookup_failed", requestError ?? { message: "not found" });
      return apiError("Solicitação de compra não encontrada.", 404);
    }

    const purchaseRequest = requestData as PurchaseRequestRow;

    if (!accessibleUnitIds.includes(purchaseRequest.unit_id)) {
      return apiError("Você não tem acesso a esta unidade.", 403);
    }

    if (!purchaseRequest.approval_required || toNumber(purchaseRequest.total_approved_amount) <= 0) {
      return apiError("Esta solicitação não possui compra aguardando aprovação.", 409);
    }

    if (purchaseRequest.approval_status === "approved" || purchaseRequest.approval_status === "rejected") {
      return apiError("Esta compra já possui decisão registrada.", 409);
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
      return apiError("Não foi possível localizar a cotação vencedora.", 500);
    }

    const winningQuote = (quoteData?.[0] ?? null) as PurchaseQuoteRow | null;

    if (!winningQuote) {
      return apiError("Selecione uma cotação vencedora antes de decidir a aprovação.", 409);
    }

    const approvalLevel = purchaseRequest.approval_level ?? getPurchaseApprovalLevel(toNumber(purchaseRequest.total_approved_amount));
    const decidedAt = new Date().toISOString();
    const decisionReason = payload.justification.trim() || null;
    const nextStatus = payload.decision === "approved" ? "approved" : payload.decision === "rejected" ? "rejected" : "quotation";
    const eventDescription =
      payload.decision === "approved"
        ? `Compra ${purchaseRequest.request_number} aprovada.`
        : payload.decision === "rejected"
          ? `Compra ${purchaseRequest.request_number} reprovada. Justificativa: ${payload.justification.trim()}`
          : `Compra ${purchaseRequest.request_number} devolvida para Compras. Justificativa: ${payload.justification.trim()}`;

    try {
      await assertPendingPurchaseApprovalSnapshot(supabase, purchaseRequest.id);
    } catch (snapshotError) {
      if (snapshotError instanceof PurchaseApprovalSnapshotError) {
        return apiError(snapshotError.message, snapshotError.status);
      }

      logBaseCadastroError("purchase_approvals.snapshot_pending_lookup_failed", snapshotError instanceof Error ? snapshotError : { message: "unknown" });
      return apiError("Nao foi possivel validar o dossie formal pendente da aprovacao.", 500);
    }

    const { error: decisionError } = await supabase.from("purchase_approval_decisions").insert({
      organization_id: purchaseRequest.organization_id,
      unit_id: purchaseRequest.unit_id,
      purchase_request_id: purchaseRequest.id,
      purchase_quote_id: winningQuote.id,
      approval_level: approvalLevel,
      decision: payload.decision,
      justification: decisionReason,
      decided_by: session.user.id,
      decided_at: decidedAt
    });

    if (decisionError) {
      logBaseCadastroError("purchase_approvals.decision_insert_failed", decisionError);
      return apiError("Não foi possível registrar a decisão de aprovação.", 500);
    }

    const { error: updateError } = await supabase
      .from("purchase_requests")
      .update({
        status: nextStatus,
        approval_status: payload.decision,
        approval_level: approvalLevel,
        approval_decided_at: decidedAt,
        approval_decided_by: session.user.id,
        approval_decision_notes: decisionReason,
        updated_by: session.user.id
      })
      .eq("id", purchaseRequest.id);

    if (updateError) {
      logBaseCadastroError("purchase_approvals.request_update_failed", updateError);
      return apiError("A decisão foi registrada, mas não foi possível atualizar a solicitação.", 500);
    }

    try {
      await updatePendingPurchaseApprovalSnapshotDecision({
        supabase,
        purchaseRequestId: purchaseRequest.id,
        decision: payload.decision,
        decisionReason,
        decidedBy: session.user.id,
        decidedAt
      });
    } catch (snapshotError) {
      if (snapshotError instanceof PurchaseApprovalSnapshotError) {
        return apiError(snapshotError.message, snapshotError.status);
      }

      logBaseCadastroError("purchase_approvals.snapshot_decision_update_failed", snapshotError instanceof Error ? snapshotError : { message: "unknown" });
      return apiError("A decisao foi registrada, mas nao foi possivel atualizar o dossie formal da aprovacao.", 500);
    }

    await insertPurchaseRequestEvent(supabase, {
      organizationId: purchaseRequest.organization_id,
      unitId: purchaseRequest.unit_id,
      purchaseRequestId: purchaseRequest.id,
      eventType: payload.decision === "approved" ? "purchase_approved" : payload.decision === "rejected" ? "purchase_rejected" : "purchase_returned_to_purchases",
      fromStatus: purchaseRequest.status,
      toStatus: nextStatus,
      description: eventDescription,
      createdBy: session.user.id
    });

    return NextResponse.json({
      ok: true,
      message: payload.decision === "approved" ? "Compra aprovada com sucesso." : payload.decision === "rejected" ? "Compra reprovada com sucesso." : "Compra devolvida para revisão de Compras."
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("Dados inválidos para registrar a decisão.", 400);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível registrar a decisão.", 500);
  }
}
