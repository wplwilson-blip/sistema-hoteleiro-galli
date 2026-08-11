import { NextResponse } from "next/server";
import { z } from "zod";
import { PURCHASES_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getPurchaseQuotationMutationBlockMessage,
  roundMoney,
  sumPurchaseQuoteItems
} from "@/lib/purchases/api";
import {
  buildClearedWinnerRequestPatch,
  buildRequestEvents,
  buildStartQuotationRequestPatch,
  buildWinnerRequestPatch,
  mergeRequestPatches
} from "@/lib/purchases/quote-mutation-payloads";
import {
  classifyPurchaseQuoteEvidence,
  getPurchaseQuoteEvidenceConfidenceFromClassification,
  purchaseQuotePatchSchema
} from "@/lib/purchases/quote-schemas";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type PurchaseRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "quotation"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "awaiting_purchase"
  | "purchase_ordered"
  | "partially_received"
  | "received_total"
  | "received_with_divergence"
  | "closed"
  | "cancelled";

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  status: PurchaseRequestStatus;
  request_number: string;
  total_approved_amount: string | number | null;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  approval_status: "pending" | "approved" | "rejected" | "returned_to_purchases" | null;
  updated_at: string;
};

type PurchaseRequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_description: string;
  quantity: string | number;
  unit_of_measure: string;
  notes: string | null;
};

type PurchaseQuoteRow = {
  id: string;
  purchase_request_id: string;
  supplier_id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string;
  total_amount: string | number;
  delivery_days: number | null;
  payment_terms: string | null;
  is_selected: boolean;
  is_recurring_supplier_quote: boolean;
  quote_validity_exception: boolean;
  quote_validity_exception_reason: string | null;
  quote_source_type: string | null;
  evidence_type: string | null;
  evidence_confidence: string | null;
  source_contact_name: string | null;
  source_contact_channel: string | null;
  source_reference: string | null;
  source_url: string | null;
  source_notes: string | null;
  evidence_missing_reason: string | null;
  requires_attachment: boolean;
  requires_justification: boolean;
  has_formal_evidence: boolean;
  is_verbal_quote: boolean;
  is_emergency_quote: boolean;
  emergency_reason: string | null;
  regularization_required: boolean;
  regularization_deadline: string | null;
  notes: string | null;
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type PurchaseQuotePayloadItem = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  deliveryNotes?: string;
};

type PurchaseQuoteItemUpdateRow = {
  purchase_request_item_id: string;
  item_description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  delivery_notes: string | null;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  status: "active" | "inactive" | "archived";
};

class PurchaseQuoteFormalDossierError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "PurchaseQuoteFormalDossierError";
    this.status = status;
  }
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

const purchaseQuoteSelectColumns =
  "id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline, notes, status, created_at, updated_at, deleted_at";

function mapQuoteEvidenceUpdate(payload: z.infer<typeof purchaseQuotePatchSchema>, hasAttachment = false) {
  if (payload.action !== "save") {
    return {};
  }

  const classification = classifyPurchaseQuoteEvidence({
    quoteSourceType: payload.quoteSourceType,
    evidenceType: payload.evidenceType,
    sourceContactName: payload.sourceContactName,
    sourceContactChannel: payload.sourceContactChannel,
    sourceReference: payload.sourceReference,
    sourceUrl: payload.sourceUrl,
    sourceNotes: payload.sourceNotes,
    evidenceMissingReason: payload.evidenceMissingReason,
    isVerbalQuote: payload.isVerbalQuote,
    isEmergencyQuote: payload.isEmergencyQuote,
    emergencyReason: payload.emergencyReason,
    regularizationRequired: payload.regularizationRequired,
    regularizationDeadline: payload.regularizationDeadline,
    hasAttachment
  });

  return {
    quote_source_type: payload.quoteSourceType ?? null,
    evidence_type: payload.evidenceType ?? null,
    evidence_confidence: getPurchaseQuoteEvidenceConfidenceFromClassification(classification.status),
    source_contact_name: payload.sourceContactName?.trim() || null,
    source_contact_channel: payload.sourceContactChannel ?? null,
    source_reference: payload.sourceReference?.trim() || null,
    source_url: payload.sourceUrl?.trim() || null,
    source_notes: payload.sourceNotes?.trim() || null,
    evidence_missing_reason: payload.evidenceMissingReason?.trim() || null,
    requires_attachment: classification.requiresAttachment,
    requires_justification: classification.requiresJustification,
    has_formal_evidence: classification.hasFormalEvidence,
    is_verbal_quote: payload.isVerbalQuote ?? (payload.quoteSourceType === "phone_call" || payload.quoteSourceType === "in_person"),
    is_emergency_quote: payload.isEmergencyQuote ?? payload.quoteSourceType === "emergency",
    emergency_reason: payload.emergencyReason?.trim() || null,
    regularization_required: payload.regularizationRequired ?? false,
    regularization_deadline: payload.regularizationDeadline ?? null
  };
}

async function fetchRequestById(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, status, request_number, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, approval_status, updated_at"
    )
    .eq("id", requestId)
    .is("deleted_at", null)
    .single();

  if (error) {
    logBaseCadastroError("purchase_quotes.request_lookup_failed", error);
    throw new Error("Não foi possível localizar a solicitação.");
  }

  return data as PurchaseRequestRow;
}

async function fetchRequestItems(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .select("id, purchase_request_id, item_description, quantity, unit_of_measure, notes")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quotes.request_items_lookup_failed", error);
    throw new Error("Não foi possível carregar os itens da solicitação.");
  }

  return (data ?? []) as PurchaseRequestItemRow[];
}

async function fetchQuoteById(supabase: SupabaseAdmin, requestId: string, quoteId: string) {
  const { data, error } = await supabase
    .from("purchase_quotes")
    .select(
      purchaseQuoteSelectColumns
    )
    .eq("id", quoteId)
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Cotação não encontrada ou já removida.");
    }

    logBaseCadastroError("purchase_quotes.quote_lookup_failed", error);
    throw new Error("Não foi possível localizar a cotação.");
  }

  return data as PurchaseQuoteRow;
}

async function quoteHasActiveEvidenceAttachment(supabase: SupabaseAdmin, quoteId: string) {
  const { data, error } = await supabase
    .from("attachments")
    .select("id")
    .eq("module", "purchases")
    .eq("entity_type", "purchase_quote")
    .eq("entity_id", quoteId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("purchase_quotes.attachment_lookup_failed", error);
    throw new Error("Não foi possível validar os anexos da cotação.");
  }

  return Boolean(data?.length);
}

function snapshotPayloadContainsQuote(snapshotPayload: unknown, quoteId: string) {
  if (!snapshotPayload || typeof snapshotPayload !== "object") {
    return false;
  }

  const payload = snapshotPayload as {
    selectedQuote?: { id?: string | null } | null;
    recommendedQuote?: { id?: string | null } | null;
    quotes?: Array<{ id?: string | null }>;
  };

  return (
    payload.selectedQuote?.id === quoteId ||
    payload.recommendedQuote?.id === quoteId ||
    Boolean(payload.quotes?.some((quote) => quote.id === quoteId))
  );
}

async function assertQuoteIsNotInFormalDossier(supabase: SupabaseAdmin, requestId: string, quoteId: string) {
  const { data, error } = await supabase
    .from("purchase_approval_snapshots")
    .select("id, selected_quote_id, snapshot_payload")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null);

  if (error) {
    logBaseCadastroError("purchase_quotes.snapshot_lock_lookup_failed", error);
    throw new Error("Não foi possível validar se a cotação já integra dossiê formal.");
  }

  const isLocked = (data ?? []).some((snapshot) => snapshot.selected_quote_id === quoteId || snapshotPayloadContainsQuote(snapshot.snapshot_payload, quoteId));

  if (isLocked) {
    throw new PurchaseQuoteFormalDossierError("Esta cotação já faz parte de um dossiê formal de aprovação. Para preservar a auditoria, registre uma nova proposta.");
  }
}

async function fetchSupplier(supabase: SupabaseAdmin, supplierId: string, organizationId: string, accessibleUnitIds: string[]) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, organization_id, unit_id, status")
    .eq("id", supplierId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("purchase_quotes.supplier_lookup_failed", error);
    throw new Error("Não foi possível validar o fornecedor selecionado.");
  }

  const supplier = data?.[0] as SupplierRow | undefined;

  if (!supplier) {
    throw new Error("Fornecedor não encontrado ou inativo.");
  }

  if (supplier.unit_id && !accessibleUnitIds.includes(supplier.unit_id)) {
    throw new Error("Você não tem acesso a este fornecedor.");
  }

  return supplier;
}

// Traduz as sentinelas das RPCs transacionais (migration 083) para as MESMAS mensagens e
// status que a rota devolvia quando as escritas eram sequenciais.
function mapQuoteRpcError(rpcError: { message?: string }, fallbackMessage: string) {
  const message = rpcError.message ?? "";

  if (message.includes("PURCHASE_QUOTE_LOCKED_IN_DOSSIER")) {
    return apiError("Esta cotação já faz parte de um dossiê formal de aprovação. Para preservar a auditoria, registre uma nova proposta.", 409);
  }

  if (message.includes("PURCHASE_QUOTE_NOT_FOUND") || message.includes("PURCHASE_QUOTE_ALREADY_CANCELLED")) {
    return apiError("Cotação não encontrada ou já removida.", 404);
  }

  if (message.includes("PURCHASE_REQUEST_NOT_FOUND")) {
    return apiError("Não foi possível localizar a solicitação.", 404);
  }

  return apiError(fallbackMessage, 500);
}

export async function PATCH(request: Request, { params }: { params: { id: string; quoteId: string } }) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.quotesManage);

  if (response || !context) {
    return response;
  }

  try {
    const payload = purchaseQuotePatchSchema.parse(await request.json());
    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("Você não tem acesso a esta solicitação.", 403);
    }

    const mutationBlockMessage = getPurchaseQuotationMutationBlockMessage({
      status: requestRow.status,
      approvalStatus: requestRow.approval_status,
      approvalRequired: requestRow.approval_required,
      totalApprovedAmount: requestRow.total_approved_amount
    });

    if (mutationBlockMessage) {
      return apiError(mutationBlockMessage, 409);
    }

    const quoteRow = await fetchQuoteById(supabase, requestRow.id, params.quoteId);

    if (payload.action === "unselect") {
      await assertQuoteIsNotInFormalDossier(supabase, requestRow.id, quoteRow.id);

      if (requestRow.status !== "quotation") {
        return apiError("A cotação vencedora só pode ser removida em uma solicitação em cotação.", 409);
      }

      if (!quoteRow.is_selected) {
        return apiError("Esta cotação não está marcada como vencedora.", 409);
      }

      // UMA transacao: cotacao + solicitacao + evento (migration 083).
      const { error: rpcError } = await supabase.rpc("purchase_set_quote_selection", {
        p_request_id: requestRow.id,
        p_quote_id: quoteRow.id,
        p_select: false,
        p_request_update: buildClearedWinnerRequestPatch({ requestRow, actorId: context.session.user.id }),
        p_events: buildRequestEvents([
          {
            eventType: "quote_unselected",
            fromStatus: requestRow.status,
            toStatus: requestRow.status,
            description: "Cotação removida como vencedora."
          }
        ]),
        p_actor_id: context.session.user.id
      });

      if (rpcError) {
        logBaseCadastroError("purchase_quotes.unselect_rpc_failed", rpcError);
        return mapQuoteRpcError(rpcError, "Não foi possível remover a cotação vencedora.");
      }

      return NextResponse.json({ ok: true, message: "Cotação removida como vencedora." });
    }

    if (payload.action === "select") {
      await assertQuoteIsNotInFormalDossier(supabase, requestRow.id, quoteRow.id);

      if (requestRow.status !== "quotation") {
        return apiError("A cotação so pode ser selecionada em uma solicitação em cotação.", 409);
      }

      if (quoteRow.status !== "received" && quoteRow.status !== "selected" && quoteRow.status !== "rejected") {
        return apiError("A cotação selecionada deve estar recebida, rejeitada ou selecionada.", 409);
      }

      const selectedTotal = roundMoney(toNumber(quoteRow.total_amount));

      // UMA transacao: desmarca as demais, marca a vencedora (gravando selected_by),
      // atualiza total_approved_amount/approval_level e registra o evento. Fecha a janela
      // em que a solicitacao ficava com vencedora NOVA e alcada ANTIGA.
      const { error: rpcError } = await supabase.rpc("purchase_set_quote_selection", {
        p_request_id: requestRow.id,
        p_quote_id: quoteRow.id,
        p_select: true,
        p_request_update: buildWinnerRequestPatch({
          requestRow,
          totalAmount: selectedTotal,
          actorId: context.session.user.id
        }),
        p_events: buildRequestEvents([
          {
            eventType: "quote_selected",
            fromStatus: requestRow.status,
            toStatus: requestRow.status,
            description: "Cotacao selecionada."
          }
        ]),
        p_actor_id: context.session.user.id
      });

      if (rpcError) {
        logBaseCadastroError("purchase_quotes.select_rpc_failed", rpcError);
        return mapQuoteRpcError(rpcError, "Não foi possível selecionar a cotação.");
      }

      return NextResponse.json({ ok: true });
    }

    const editableStatuses: PurchaseQuoteRow["status"][] = ["received", "selected"];
    if (!editableStatuses.includes(quoteRow.status)) {
      return apiError("A cotação nao pode ser editada neste status.", 409);
    }

    await assertQuoteIsNotInFormalDossier(supabase, requestRow.id, quoteRow.id);

    const requestItems = await fetchRequestItems(supabase, requestRow.id);
    const requestItemMap = new Map(requestItems.map((item) => [item.id, item]));
    const seenRequestItemIds = new Set<string>();

    // Auto-start (submitted/under_review -> quotation) deixa de ser escrita solta: entra no
    // MESMO patch/transacao do salvamento, junto com o evento "quotation_started".
    const startsQuotation = requestRow.status === "submitted" || requestRow.status === "under_review";

    if (!startsQuotation && requestRow.status !== "quotation") {
      return apiError("A cotação so pode ser editada em uma solicitação em análise ou em cotação.", 409);
    }

    const parsed = purchaseQuotePatchSchema.parse(payload);
    if (parsed.action !== "save") {
      return apiError("Ação invalida para edicao de cotação.", 409);
    }

    const quoteItems: PurchaseQuoteItemUpdateRow[] = parsed.items.map((item: PurchaseQuotePayloadItem) => {
      if (!requestItemMap.has(item.purchaseRequestItemId)) {
        throw new Error("Item da cotação nao pertence a solicitação.");
      }

      if (seenRequestItemIds.has(item.purchaseRequestItemId)) {
        throw new Error("Cada item da solicitação deve aparecer apenas uma vez na cotação.");
      }

      seenRequestItemIds.add(item.purchaseRequestItemId);

      const requestItem = requestItemMap.get(item.purchaseRequestItemId)!;

      return {
        purchase_request_item_id: requestItem.id,
        item_description: item.itemDescription || requestItem.item_description,
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unitPrice),
        total_price: roundMoney(toNumber(item.quantity) * toNumber(item.unitPrice)),
        delivery_notes: item.deliveryNotes?.trim() ? item.deliveryNotes.trim() : null
      };
    });

    if (seenRequestItemIds.size !== requestItems.length) {
      throw new Error("Informe um item cotado para cada item da solicitação.");
    }

    const supplier = await fetchSupplier(supabase, parsed.supplierId, requestRow.organization_id, accessibleUnitIds);
    const totalAmount = sumPurchaseQuoteItems(quoteItems.map((item: PurchaseQuoteItemUpdateRow) => ({ quantity: item.quantity, unitPrice: item.unit_price })));
    const hasActiveAttachment = await quoteHasActiveEvidenceAttachment(supabase, quoteRow.id);
    const quoteUpdateBody = {
      supplier_id: supplier.id,
      quote_number: quoteRow.quote_number,
      quote_date: parsed.quoteDate,
      valid_until: parsed.validUntil,
      total_amount: totalAmount,
      delivery_days: parsed.deliveryDays ?? null,
      payment_terms: parsed.paymentTerms ?? null,
      is_selected: quoteRow.is_selected,
      is_recurring_supplier_quote: parsed.isRecurringSupplierQuote ?? false,
      quote_validity_exception: parsed.quoteValidityException ?? false,
      quote_validity_exception_reason: parsed.quoteValidityExceptionReason?.trim() || null,
      ...mapQuoteEvidenceUpdate(parsed, hasActiveAttachment),
      notes: parsed.notes ?? null,
      status: quoteRow.is_selected ? "selected" : "received",
      updated_by: context.session.user.id
    };

    // UMA transacao (migration 083): auto-start opcional + valores da cotacao + troca dos
    // itens (delete + insert) + totais/alcada da solicitacao + eventos. Antes eram ate' seis
    // escritas soltas com rollback manual que nao cobria queda de processo — e a janela
    // entre a troca dos itens e o update da solicitacao deixava total_approved_amount
    // defasado, ou seja, alcada de aprovacao errada.
    const events = buildRequestEvents([
      ...(startsQuotation
        ? [
            {
              eventType: "quotation_started",
              fromStatus: requestRow.status,
              toStatus: "quotation" as const,
              description: "Cotacao iniciada."
            }
          ]
        : []),
      {
        eventType: "quote_updated",
        fromStatus: startsQuotation ? "quotation" : requestRow.status,
        toStatus: startsQuotation ? "quotation" : requestRow.status,
        description: "Cotacao atualizada."
      }
    ]);

    const requestPatch = mergeRequestPatches(
      startsQuotation ? buildStartQuotationRequestPatch(context.session.user.id) : null,
      quoteRow.is_selected
        ? buildWinnerRequestPatch({ requestRow, totalAmount, actorId: context.session.user.id })
        : null
    );

    const { error: rpcError } = await supabase.rpc("purchase_save_quote_values", {
      p_request_id: requestRow.id,
      p_quote_id: quoteRow.id,
      p_quote_update: quoteUpdateBody,
      p_items: quoteItems,
      p_request_update: requestPatch,
      p_events: events,
      p_actor_id: context.session.user.id
    });

    if (rpcError) {
      logBaseCadastroError("purchase_quotes.save_rpc_failed", rpcError);
      return mapQuoteRpcError(rpcError, "Não foi possível atualizar a cotação.");
    }

    return NextResponse.json({ ok: true, quoteId: quoteRow.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    if (error instanceof PurchaseQuoteFormalDossierError) {
      return apiError(error.message, error.status);
    }

    if (error instanceof Error && error.message === "Cotação não encontrada ou já removida.") {
      return apiError(error.message, 404);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível atualizar a cotação.", 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string; quoteId: string } }) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.quotesManage);

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!context.accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("Você não tem acesso a esta solicitação.", 403);
    }

    const mutationBlockMessage = getPurchaseQuotationMutationBlockMessage({
      status: requestRow.status,
      approvalStatus: requestRow.approval_status,
      approvalRequired: requestRow.approval_required,
      totalApprovedAmount: requestRow.total_approved_amount
    });

    if (mutationBlockMessage) {
      return apiError(mutationBlockMessage, 409);
    }

    const quoteRow = await fetchQuoteById(supabase, requestRow.id, params.quoteId);

    await assertQuoteIsNotInFormalDossier(supabase, requestRow.id, quoteRow.id);

    if (quoteRow.status === "cancelled" || quoteRow.deleted_at) {
      return apiError("Cotação não encontrada ou já removida.", 404);
    }

    const wasSelected = quoteRow.is_selected;

    // UMA transacao (migration 083): soft-delete da cotacao + itens + reset da solicitacao
    // (quando era a vencedora) + evento. `cancelledItems` passa a vir da propria RPC,
    // contado sob o lock — antes era um SELECT separado, sujeito a corrida.
    const { data: rpcData, error: rpcError } = await supabase.rpc("purchase_cancel_quote", {
      p_request_id: requestRow.id,
      p_quote_id: quoteRow.id,
      p_request_update: wasSelected
        ? buildClearedWinnerRequestPatch({ requestRow, actorId: context.session.user.id })
        : null,
      p_events: buildRequestEvents([
        {
          eventType: "quote_cancelled",
          fromStatus: requestRow.status,
          toStatus: requestRow.status,
          description: wasSelected
            ? "Cotação vencedora cancelada. A solicitação ficou sem cotação vencedora."
            : "Cotacao cancelada."
        }
      ]),
      p_actor_id: context.session.user.id
    });

    if (rpcError) {
      logBaseCadastroError("purchase_quotes.cancel_rpc_failed", rpcError);
      return mapQuoteRpcError(rpcError, "Não foi possível cancelar a cotação.");
    }

    return NextResponse.json({
      ok: true,
      quoteId: quoteRow.id,
      cancelledItems: (rpcData as { cancelledItems?: number } | null)?.cancelledItems ?? 0
    });
  } catch (error) {
    if (error instanceof PurchaseQuoteFormalDossierError) {
      return apiError(error.message, error.status);
    }

    if (error instanceof Error && error.message === "Cotação não encontrada ou já removida.") {
      return apiError(error.message, 404);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível cancelar a cotação.", 500);
  }
}
