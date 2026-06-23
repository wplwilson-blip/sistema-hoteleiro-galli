import { NextResponse } from "next/server";
import { z } from "zod";
import { PURCHASES_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildNextPurchaseQuoteNumber, roundMoney, sumPurchaseQuoteItems } from "@/lib/purchases/api";
import {
  classifyPurchaseQuoteEvidence,
  getPurchaseQuoteEvidenceConfidenceFromClassification,
  purchaseQuoteNegotiationCreateSchema
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
  request_number: string;
  status: PurchaseRequestStatus;
  total_approved_amount: string | number | null;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  approval_status: "pending" | "approved" | "rejected" | "returned_to_purchases" | "" | null;
  approval_level: string | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approval_decision_notes: string | null;
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
  organization_id: string;
  unit_id: string;
  purchase_request_id: string;
  supplier_id: string;
  quote_number: string;
  quote_date: string;
  valid_until: string;
  total_amount: string | number;
  delivery_days: number | null;
  payment_terms: string | null;
  is_selected: boolean;
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
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  original_quote_id: string | null;
  parent_quote_id: string | null;
  quote_round: number | null;
  superseded_by_quote_id: string | null;
  superseded_at: string | null;
  deleted_at: string | null;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  name: string;
  trade_name: string | null;
  status: "active" | "inactive" | "archived";
};

type NegotiationPayload = z.infer<typeof purchaseQuoteNegotiationCreateSchema>;

type NegotiationItemPayload = NegotiationPayload["items"][number] & {
  notes?: string;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function roundPercent(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

const quoteEvidenceSelectColumns =
  "quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline";

function mapNegotiationEvidenceInsert(payload: NegotiationPayload) {
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
    hasAttachment: false
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

function getNegotiationBlockMessage(requestRow: PurchaseRequestRow) {
  if (requestRow.approval_status === "pending") {
    return "NÃ£o Ã© possÃ­vel registrar nova proposta para uma compra aguardando aprovaÃ§Ã£o.";
  }

  if (requestRow.approval_status === "approved" || requestRow.status === "approved") {
    return "NÃ£o Ã© possÃ­vel registrar nova proposta para uma compra aprovada.";
  }

  if (requestRow.approval_status === "rejected" || requestRow.status === "rejected") {
    return "NÃ£o Ã© possÃ­vel registrar nova proposta para uma compra reprovada.";
  }

  if (requestRow.status === "cancelled") {
    return "NÃ£o Ã© possÃ­vel registrar nova proposta para uma compra cancelada.";
  }

  if (requestRow.approval_status === "returned_to_purchases") {
    return "";
  }

  if ((requestRow.approval_status ?? "") === "" && requestRow.status === "quotation") {
    return "";
  }

  return "A nova proposta negociada sÃ³ pode ser registrada para compras em cotaÃ§Ã£o.";
}

async function fetchRequestById(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, request_number, status, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, approval_status, approval_level, approval_decided_at, approval_decided_by, approval_decision_notes"
    )
    .eq("id", requestId)
    .is("deleted_at", null)
    .single();

  if (error) {
    logBaseCadastroError("purchase_quote_negotiations.request_lookup_failed", error);
    throw new Error("NÃ£o foi possÃ­vel localizar a solicitaÃ§Ã£o.");
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
    logBaseCadastroError("purchase_quote_negotiations.request_items_lookup_failed", error);
    throw new Error("NÃ£o foi possÃ­vel carregar os itens da solicitaÃ§Ã£o.");
  }

  return (data ?? []) as PurchaseRequestItemRow[];
}

async function fetchPreviousQuote(supabase: SupabaseAdmin, requestId: string, quoteId: string) {
  const { data, error } = await supabase
    .from("purchase_quotes")
    .select(
      `id, organization_id, unit_id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, ${quoteEvidenceSelectColumns}, status, original_quote_id, parent_quote_id, quote_round, superseded_by_quote_id, superseded_at, deleted_at`
    )
    .eq("id", quoteId)
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("CotaÃ§Ã£o nÃ£o encontrada ou jÃ¡ removida.");
    }

    logBaseCadastroError("purchase_quote_negotiations.previous_quote_lookup_failed", error);
    throw new Error("NÃ£o foi possÃ­vel localizar a cotaÃ§Ã£o anterior.");
  }

  return data as PurchaseQuoteRow;
}

async function fetchSupplier(supabase: SupabaseAdmin, supplierId: string, organizationId: string, accessibleUnitIds: string[]) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, organization_id, unit_id, name, trade_name, status")
    .eq("id", supplierId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("purchase_quote_negotiations.supplier_lookup_failed", error);
    throw new Error("NÃ£o foi possÃ­vel validar o fornecedor da cotaÃ§Ã£o.");
  }

  const supplier = data?.[0] as SupplierRow | undefined;

  if (!supplier) {
    throw new Error("Fornecedor nÃ£o encontrado ou inativo.");
  }

  if (supplier.unit_id && !accessibleUnitIds.includes(supplier.unit_id)) {
    throw new Error("VocÃª nÃ£o tem acesso a este fornecedor.");
  }

  return supplier;
}

async function fetchExistingQuotes(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_quotes")
    .select("id, quote_number")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quote_negotiations.existing_quotes_lookup_failed", error);
    throw new Error("NÃ£o foi possÃ­vel carregar as cotaÃ§Ãµes da solicitaÃ§Ã£o.");
  }

  return (data ?? []) as Array<{ id: string; quote_number: string }>;
}

async function insertPurchaseRequestEvent(
  supabase: SupabaseAdmin,
  input: {
    organizationId: string;
    unitId: string;
    purchaseRequestId: string;
    eventType: string;
    fromStatus: PurchaseRequestStatus;
    toStatus: PurchaseRequestStatus;
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
    logBaseCadastroError("purchase_quote_negotiations.event_create_failed", error);
    throw new Error("NÃ£o foi possÃ­vel registrar o evento da negociaÃ§Ã£o.");
  }
}

function buildQuoteNumber(requestNumber: string, existingQuotes: Array<{ quote_number: string }>) {
  return buildNextPurchaseQuoteNumber(requestNumber, existingQuotes.map((quote) => quote.quote_number));
}

function calculateRound(previousQuote: PurchaseQuoteRow) {
  const previousRound = previousQuote.quote_round && previousQuote.quote_round > 0 ? previousQuote.quote_round : 1;

  return {
    originalQuoteId: previousQuote.original_quote_id ?? previousQuote.id,
    parentQuoteId: previousQuote.id,
    quoteRound: previousRound + 1
  };
}

function mapNegotiationItemRows(
  payload: NegotiationPayload,
  requestItems: PurchaseRequestItemRow[],
  requestRow: PurchaseRequestRow,
  quoteId: string,
  createdBy: string
) {
  const requestItemMap = new Map(requestItems.map((item) => [item.id, item]));
  const seenRequestItemIds = new Set<string>();

  return payload.items.map((item: NegotiationItemPayload) => {
    const requestItem = requestItemMap.get(item.purchaseRequestItemId);

    if (!requestItem) {
      throw new Error("Os itens informados nÃ£o pertencem Ã  solicitaÃ§Ã£o de compra.");
    }

    if (seenRequestItemIds.has(item.purchaseRequestItemId)) {
      throw new Error("Cada item da solicitaÃ§Ã£o deve aparecer apenas uma vez na nova proposta.");
    }

    seenRequestItemIds.add(item.purchaseRequestItemId);

    return {
      organization_id: requestRow.organization_id,
      unit_id: requestRow.unit_id,
      purchase_quote_id: quoteId,
      purchase_request_item_id: requestItem.id,
      item_description: item.itemDescription || requestItem.item_description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: roundMoney(item.quantity * item.unitPrice),
      delivery_notes: item.deliveryNotes?.trim() || item.notes?.trim() || null,
      created_by: createdBy,
      updated_by: createdBy
    };
  });
}

async function rollbackCreatedQuote(supabase: SupabaseAdmin, quoteId: string | null) {
  if (!quoteId) {
    return;
  }

  await supabase.from("purchase_quote_items").delete().eq("purchase_quote_id", quoteId);
  await supabase.from("purchase_quotes").delete().eq("id", quoteId);
}

async function restorePreviousQuote(supabase: SupabaseAdmin, previousQuote: PurchaseQuoteRow, actorId: string) {
  await supabase
    .from("purchase_quotes")
    .update({
      superseded_by_quote_id: previousQuote.superseded_by_quote_id,
      superseded_at: previousQuote.superseded_at,
      superseded_by: null,
      is_selected: previousQuote.is_selected,
      status: previousQuote.status,
      updated_by: actorId
    })
    .eq("id", previousQuote.id);
}

async function restoreRequestSelectionState(supabase: SupabaseAdmin, requestRow: PurchaseRequestRow, actorId: string) {
  await supabase
    .from("purchase_requests")
    .update({
      total_approved_amount: requestRow.total_approved_amount,
      quotation_required: requestRow.quotation_required,
      required_quote_count: requestRow.required_quote_count,
      approval_required: requestRow.approval_required,
      director_approval_required: requestRow.director_approval_required,
      approval_status: requestRow.approval_status || null,
      approval_level: requestRow.approval_level,
      approval_decided_at: requestRow.approval_decided_at,
      approval_decided_by: requestRow.approval_decided_by,
      approval_decision_notes: requestRow.approval_decision_notes,
      updated_by: actorId
    })
    .eq("id", requestRow.id);
}

export async function POST(_request: Request, { params }: { params: { id: string; quoteId: string } }) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.quotesManage);

  if (response || !context) {
    return response;
  }

  let createdQuoteId: string | null = null;
  let previousQuoteForRollback: PurchaseQuoteRow | null = null;
  let requestForRollback: PurchaseRequestRow | null = null;

  try {
    const payload = purchaseQuoteNegotiationCreateSchema.parse(await _request.json());
    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;
    const requestRow = await fetchRequestById(supabase, params.id);
    requestForRollback = requestRow;

    if (!accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("VocÃª nÃ£o tem acesso a esta solicitaÃ§Ã£o.", 403);
    }

    const blockMessage = getNegotiationBlockMessage(requestRow);
    if (blockMessage) {
      return apiError(blockMessage, 409);
    }

    const previousQuote = await fetchPreviousQuote(supabase, requestRow.id, params.quoteId);
    previousQuoteForRollback = previousQuote;

    if (previousQuote.status === "cancelled" || previousQuote.deleted_at) {
      return apiError("CotaÃ§Ã£o nÃ£o encontrada ou jÃ¡ removida.", 404);
    }

    if (previousQuote.superseded_by_quote_id || previousQuote.superseded_at) {
      return apiError("Esta cotaÃ§Ã£o jÃ¡ foi superada por uma proposta mais recente.", 409);
    }

    const supplier = await fetchSupplier(supabase, previousQuote.supplier_id, requestRow.organization_id, accessibleUnitIds);
    const requestItems = await fetchRequestItems(supabase, requestRow.id);

    if (payload.items.length === 0) {
      return apiError("Informe ao menos um item para a nova proposta.", 422);
    }

    const { originalQuoteId, parentQuoteId, quoteRound } = calculateRound(previousQuote);
    const totalAmount = sumPurchaseQuoteItems(payload.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));
    const previousTotalAmount = roundMoney(toNumber(previousQuote.total_amount));
    const discountAmount = roundMoney(previousTotalAmount - totalAmount);
    const discountPercent = previousTotalAmount > 0 ? roundPercent((discountAmount / previousTotalAmount) * 100) : 0;

    let quoteNumber = "";
    let duplicateQuoteErrorMessage = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existingQuotes = await fetchExistingQuotes(supabase, requestRow.id);
      quoteNumber = buildQuoteNumber(requestRow.request_number, existingQuotes);

      const { data, error: quoteError } = await supabase
        .from("purchase_quotes")
        .insert({
          organization_id: requestRow.organization_id,
          unit_id: requestRow.unit_id,
          purchase_request_id: requestRow.id,
          supplier_id: previousQuote.supplier_id,
          quote_number: quoteNumber,
          quote_date: payload.quoteDate,
          valid_until: payload.validUntil,
          total_amount: totalAmount,
          delivery_days: payload.deliveryDays ?? null,
          payment_terms: payload.paymentTerms ?? null,
          is_selected: false,
          is_recurring_supplier_quote: false,
          quote_validity_exception: false,
          quote_validity_exception_reason: null,
          ...mapNegotiationEvidenceInsert(payload),
          notes: payload.negotiationNotes ?? null,
          status: "received",
          original_quote_id: originalQuoteId,
          parent_quote_id: parentQuoteId,
          quote_round: quoteRound,
          created_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .select(`id, organization_id, unit_id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, ${quoteEvidenceSelectColumns}, status, original_quote_id, parent_quote_id, quote_round, superseded_by_quote_id, superseded_at, deleted_at`)
        .single();

      if (!quoteError) {
        createdQuoteId = data.id;
        break;
      }

      if (quoteError.code === "23505" && attempt < 2) {
        duplicateQuoteErrorMessage = quoteError.message;
        continue;
      }

      logBaseCadastroError("purchase_quote_negotiations.quote_create_failed", quoteError);
      return apiError(quoteError.message || "NÃ£o foi possÃ­vel salvar a nova proposta.", 500);
    }

    if (!createdQuoteId) {
      return apiError(duplicateQuoteErrorMessage || "NÃ£o foi possÃ­vel gerar um nÃºmero Ãºnico para a nova proposta.", 409);
    }

    const quoteItemRows = mapNegotiationItemRows(payload, requestItems, requestRow, createdQuoteId, context.session.user.id);
    const { error: quoteItemsError } = await supabase.from("purchase_quote_items").insert(quoteItemRows);

    if (quoteItemsError) {
      logBaseCadastroError("purchase_quote_negotiations.items_create_failed", quoteItemsError);
      await rollbackCreatedQuote(supabase, createdQuoteId);
      return apiError(quoteItemsError.message || "NÃ£o foi possÃ­vel salvar os itens da nova proposta.", 500);
    }

    const { error: previousUpdateError } = await supabase
      .from("purchase_quotes")
      .update({
        superseded_by_quote_id: createdQuoteId,
        superseded_at: new Date().toISOString(),
        superseded_by: context.session.user.id,
        is_selected: false,
        status: previousQuote.is_selected ? "received" : previousQuote.status,
        updated_by: context.session.user.id
      })
      .eq("id", previousQuote.id)
      .eq("purchase_request_id", requestRow.id)
      .is("deleted_at", null)
      .is("superseded_by_quote_id", null)
      .is("superseded_at", null)
      .select("id")
      .single();

    if (previousUpdateError) {
      if (previousUpdateError.code === "PGRST116") {
        await rollbackCreatedQuote(supabase, createdQuoteId);
        return apiError("Esta cotaÃ§Ã£o jÃ¡ foi superada por uma proposta mais recente.", 409);
      }

      logBaseCadastroError("purchase_quote_negotiations.previous_update_failed", previousUpdateError);
      await rollbackCreatedQuote(supabase, createdQuoteId);
      return apiError("NÃ£o foi possÃ­vel marcar a cotaÃ§Ã£o anterior como superada.", 500);
    }

    if (previousQuote.is_selected) {
      const preserveReturnedDecision = requestRow.approval_status === "returned_to_purchases";
      const { error: requestUpdateError } = await supabase
        .from("purchase_requests")
        .update({
          total_approved_amount: 0,
          quotation_required: false,
          required_quote_count: 0,
          approval_required: false,
          director_approval_required: false,
          approval_status: requestRow.approval_status === "returned_to_purchases" ? "returned_to_purchases" : null,
          approval_level: null,
          ...(preserveReturnedDecision
            ? {}
            : {
                approval_decided_at: null,
                approval_decided_by: null,
                approval_decision_notes: null
              }),
          updated_by: context.session.user.id
        })
        .eq("id", requestRow.id);

      if (requestUpdateError) {
        logBaseCadastroError("purchase_quote_negotiations.request_unselect_failed", requestUpdateError);
        await restorePreviousQuote(supabase, previousQuote, context.session.user.id);
        await rollbackCreatedQuote(supabase, createdQuoteId);
        return apiError("NÃ£o foi possÃ­vel atualizar a solicitaÃ§Ã£o ao remover a vencedora anterior.", 500);
      }
    }

    const { data: negotiation, error: negotiationError } = await supabase
      .from("purchase_quote_negotiations")
      .insert({
        organization_id: requestRow.organization_id,
        unit_id: requestRow.unit_id,
        purchase_request_id: requestRow.id,
        supplier_id: previousQuote.supplier_id,
        original_quote_id: originalQuoteId,
        previous_quote_id: previousQuote.id,
        new_quote_id: createdQuoteId,
        round_number: quoteRound,
        previous_total_amount: previousTotalAmount,
        new_total_amount: totalAmount,
        discount_amount: discountAmount,
        discount_percent: discountPercent,
        negotiation_notes: payload.negotiationNotes ?? null,
        negotiated_by: context.session.user.id,
        negotiated_at: new Date().toISOString(),
        created_by: context.session.user.id
      })
      .select("*")
      .single();

    if (negotiationError) {
      logBaseCadastroError("purchase_quote_negotiations.create_failed", negotiationError);
      if (previousQuote.is_selected && requestForRollback) {
        await restoreRequestSelectionState(supabase, requestForRollback, context.session.user.id);
      }
      await restorePreviousQuote(supabase, previousQuote, context.session.user.id);
      await rollbackCreatedQuote(supabase, createdQuoteId);
      return apiError("NÃ£o foi possÃ­vel registrar a negociaÃ§Ã£o.", 500);
    }

    try {
      await insertPurchaseRequestEvent(supabase, {
        organizationId: requestRow.organization_id,
        unitId: requestRow.unit_id,
        purchaseRequestId: requestRow.id,
        eventType: "quote_negotiated",
        fromStatus: requestRow.status,
        toStatus: requestRow.status,
        description: `Nova proposta negociada registrada para o fornecedor ${supplier.trade_name || supplier.name}, rodada ${quoteRound}.`,
        createdBy: context.session.user.id
      });
    } catch (eventError) {
      await supabase.from("purchase_quote_negotiations").delete().eq("id", negotiation.id);
      if (previousQuote.is_selected && requestForRollback) {
        await restoreRequestSelectionState(supabase, requestForRollback, context.session.user.id);
      }
      await restorePreviousQuote(supabase, previousQuote, context.session.user.id);
      await rollbackCreatedQuote(supabase, createdQuoteId);
      return apiError(eventError instanceof Error ? eventError.message : "NÃ£o foi possÃ­vel registrar o evento da negociaÃ§Ã£o.", 500);
    }

    const { data: quote } = await supabase
      .from("purchase_quotes")
      .select(`id, organization_id, unit_id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, ${quoteEvidenceSelectColumns}, status, original_quote_id, parent_quote_id, quote_round, superseded_by_quote_id, superseded_at, created_at, updated_at`)
      .eq("id", createdQuoteId)
      .single();

    return NextResponse.json({
      ok: true,
      message: "Nova proposta negociada registrada com sucesso.",
      quote,
      negotiation
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invÃ¡lidos.", 422);
    }

    if (error instanceof Error && error.message === "CotaÃ§Ã£o nÃ£o encontrada ou jÃ¡ removida.") {
      return apiError(error.message, 404);
    }

    if (previousQuoteForRollback && createdQuoteId) {
      const supabase = context.supabase;
      if (requestForRollback && previousQuoteForRollback.is_selected) {
        await restoreRequestSelectionState(supabase, requestForRollback, context.session.user.id);
      }
      await restorePreviousQuote(supabase, previousQuoteForRollback, context.session.user.id);
      await rollbackCreatedQuote(supabase, createdQuoteId);
    }

    return apiError(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel registrar a nova proposta negociada.", 500);
  }
}
