import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  calculatePurchaseRequestFlags,
  calculateWinningQuoteApprovalFlags,
  getPurchaseApprovalLevel,
  normalizeOptionalUuid,
  roundMoney,
  sumPurchaseQuoteItems
} from "@/lib/purchases/api";
import { purchaseQuotePatchSchema } from "@/lib/purchases/quote-schemas";

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
  notes: string | null;
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type PurchaseQuoteItemRow = {
  id: string;
  purchase_quote_id: string;
  purchase_request_item_id: string;
  item_description: string;
  quantity: string | number;
  unit_price: string | number;
  total_price: string | number;
  delivery_notes: string | null;
  created_at?: string;
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

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function mapQuoteItemInsertRow(item: PurchaseQuoteItemRow, quoteId: string, organizationId: string, unitId: string, createdBy: string) {
  return {
    organization_id: organizationId,
    unit_id: unitId,
    purchase_quote_id: quoteId,
    purchase_request_item_id: item.purchase_request_item_id,
    item_description: item.item_description,
    quantity: toNumber(item.quantity),
    unit_price: toNumber(item.unit_price),
    total_price: roundMoney(toNumber(item.quantity) * toNumber(item.unit_price)),
    delivery_notes: item.delivery_notes ?? null,
    created_by: createdBy,
    updated_by: createdBy
  };
}

async function fetchRequestById(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, status, request_number, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, updated_at"
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
      "id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, notes, status, created_at, updated_at, deleted_at"
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

async function fetchQuoteItems(supabase: SupabaseAdmin, quoteId: string) {
  const { data, error } = await supabase
    .from("purchase_quote_items")
    .select("id, purchase_quote_id, purchase_request_item_id, item_description, quantity, unit_price, total_price, delivery_notes, created_at")
    .eq("purchase_quote_id", quoteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quotes.quote_items_lookup_failed", error);
    throw new Error("Não foi possível carregar os itens da cotação.");
  }

  return (data ?? []) as PurchaseQuoteItemRow[];
}

async function fetchExistingQuotes(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_quotes")
    .select(
      "id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, notes, status, created_at, updated_at, deleted_at"
    )
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quotes.existing_quotes_lookup_failed", error);
    throw new Error("Não foi possível carregar as cotações da solicitação.");
  }

  return (data ?? []) as PurchaseQuoteRow[];
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
    logBaseCadastroError("purchase_quotes.event_create_failed", error);
    throw new Error("Não foi possível registrar o evento da cotação.");
  }
}

function buildRestoredQuoteRows(quoteItems: PurchaseQuoteItemRow[], quoteId: string, createdBy: string) {
  return quoteItems.map((item) => ({
    purchase_quote_id: quoteId,
    purchase_request_item_id: item.purchase_request_item_id,
    item_description: item.item_description,
    quantity: toNumber(item.quantity),
    unit_price: toNumber(item.unit_price),
    total_price: toNumber(item.total_price),
    delivery_notes: item.delivery_notes ?? null,
    created_by: createdBy,
    updated_by: createdBy
  }));
}

async function restoreQuoteSelectionState(
  supabase: SupabaseAdmin,
  requestRow: PurchaseRequestRow,
  currentQuote: PurchaseQuoteRow,
  existingQuotes: PurchaseQuoteRow[],
  actorId: string
) {
  const requestTotal = toNumber(requestRow.total_approved_amount);
  const requestFlags = requestTotal > 0 ? calculateWinningQuoteApprovalFlags(requestTotal) : calculatePurchaseRequestFlags(requestTotal);

  await supabase
    .from("purchase_requests")
    .update({
      total_approved_amount: toNumber(requestRow.total_approved_amount),
      quotation_required: requestFlags.quotationRequired,
      required_quote_count: requestFlags.requiredQuoteCount,
          approval_required: requestFlags.approvalRequired,
          director_approval_required: requestFlags.directorApprovalRequired,
          approval_status: "pending",
          approval_level: requestTotal > 0 ? getPurchaseApprovalLevel(requestTotal) : null,
          approval_decided_at: null,
          approval_decided_by: null,
          approval_decision_notes: null,
          updated_by: actorId
    })
    .eq("id", requestRow.id);

  for (const quote of existingQuotes) {
    await supabase
      .from("purchase_quotes")
      .update({
        is_selected: quote.id === currentQuote.id ? currentQuote.is_selected : quote.is_selected,
        status: quote.id === currentQuote.id ? currentQuote.status : quote.status,
        updated_by: actorId
      })
      .eq("id", quote.id);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string; quoteId: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = purchaseQuotePatchSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("Você não tem acesso a esta solicitação.", 403);
    }

    const quoteRow = await fetchQuoteById(supabase, requestRow.id, params.quoteId);

    if (payload.action === "select") {
      if (requestRow.status !== "quotation") {
        return apiError("A cotação so pode ser selecionada em uma solicitação em cotação.", 409);
      }

      if (quoteRow.status !== "received" && quoteRow.status !== "selected" && quoteRow.status !== "rejected") {
        return apiError("A cotação selecionada deve estar recebida, rejeitada ou selecionada.", 409);
      }

      const existingQuotes = await fetchExistingQuotes(supabase, requestRow.id);
      const selectedTotal = roundMoney(toNumber(quoteRow.total_amount));
      const requestFlags = calculateWinningQuoteApprovalFlags(selectedTotal);

      const { error: unselectError } = await supabase
        .from("purchase_quotes")
        .update({ is_selected: false, status: "rejected", updated_by: session.user.id })
        .eq("purchase_request_id", requestRow.id)
        .neq("id", quoteRow.id)
        .is("deleted_at", null);

      if (unselectError) {
        logBaseCadastroError("purchase_quotes.select_clear_failed", unselectError);
        await restoreQuoteSelectionState(supabase, requestRow, quoteRow, existingQuotes, session.user.id);
        return apiError("Não foi possível atualizar as cotações da solicitação.", 500);
      }

      const { error: selectError } = await supabase
        .from("purchase_quotes")
        .update({ is_selected: true, status: "selected", updated_by: session.user.id })
        .eq("id", quoteRow.id)
        .eq("purchase_request_id", requestRow.id)
        .is("deleted_at", null);

      if (selectError) {
        logBaseCadastroError("purchase_quotes.select_update_failed", selectError);
        await restoreQuoteSelectionState(supabase, requestRow, quoteRow, existingQuotes, session.user.id);
        return apiError("Não foi possível selecionar a cotação.", 500);
      }

      const { error: requestUpdateError } = await supabase
        .from("purchase_requests")
        .update({
          total_approved_amount: selectedTotal,
          quotation_required: requestFlags.quotationRequired,
          required_quote_count: requestFlags.requiredQuoteCount,
          approval_required: requestFlags.approvalRequired,
          director_approval_required: requestFlags.directorApprovalRequired,
          approval_status: "pending",
          approval_level: getPurchaseApprovalLevel(selectedTotal),
          approval_decided_at: null,
          approval_decided_by: null,
          approval_decision_notes: null,
          updated_by: session.user.id
        })
        .eq("id", requestRow.id);

      if (requestUpdateError) {
        logBaseCadastroError("purchase_quotes.select_request_update_failed", requestUpdateError);
        await restoreQuoteSelectionState(supabase, requestRow, quoteRow, existingQuotes, session.user.id);
        return apiError("Não foi possível atualizar a solicitação com a cotação selecionada.", 500);
      }

      try {
        await insertPurchaseRequestEvent(supabase, {
          organizationId: requestRow.organization_id,
          unitId: requestRow.unit_id,
          purchaseRequestId: requestRow.id,
          eventType: "quote_selected",
          fromStatus: requestRow.status,
          toStatus: requestRow.status,
          description: "Cotacao selecionada.",
          createdBy: session.user.id
        });
      } catch (eventError) {
        await restoreQuoteSelectionState(supabase, requestRow, quoteRow, existingQuotes, session.user.id);
        return apiError(eventError instanceof Error ? eventError.message : "Não foi possível registrar a selecao da cotação.", 500);
      }

      return NextResponse.json({ ok: true });
    }

    const editableStatuses: PurchaseQuoteRow["status"][] = ["received", "selected"];
    if (!editableStatuses.includes(quoteRow.status)) {
      return apiError("A cotação nao pode ser editada neste status.", 409);
    }

    const requestItems = await fetchRequestItems(supabase, requestRow.id);
    const quoteItemsBefore = await fetchQuoteItems(supabase, quoteRow.id);
    const requestItemMap = new Map(requestItems.map((item) => [item.id, item]));
    const seenRequestItemIds = new Set<string>();

    if (requestRow.status === "submitted" || requestRow.status === "under_review") {
      const { error: startError } = await supabase
        .from("purchase_requests")
        .update({ status: "quotation", updated_by: session.user.id })
        .eq("id", requestRow.id);

      if (startError) {
        logBaseCadastroError("purchase_quotes.auto_start_failed", startError);
        return apiError("Não foi possível iniciar a cotação.", 500);
      }

      await insertPurchaseRequestEvent(supabase, {
        organizationId: requestRow.organization_id,
        unitId: requestRow.unit_id,
        purchaseRequestId: requestRow.id,
        eventType: "quotation_started",
        fromStatus: requestRow.status,
        toStatus: "quotation",
        description: "Cotacao iniciada.",
        createdBy: session.user.id
      });
    } else if (requestRow.status !== "quotation") {
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

    const totalAmount = sumPurchaseQuoteItems(quoteItems.map((item: PurchaseQuoteItemUpdateRow) => ({ quantity: item.quantity, unitPrice: item.unit_price })));
    const quoteUpdateBody = {
      supplier_id: parsed.supplierId,
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
      notes: parsed.notes ?? null,
      status: quoteRow.is_selected ? "selected" : "received",
      updated_by: session.user.id
    };

    const { error: updateError } = await supabase.from("purchase_quotes").update(quoteUpdateBody).eq("id", quoteRow.id).eq("purchase_request_id", requestRow.id);

    if (updateError) {
      logBaseCadastroError("purchase_quotes.update_failed", updateError);
      return apiError(updateError.message || "Não foi possível atualizar a cotação.", 500);
    }

    const { error: deleteItemsError } = await supabase.from("purchase_quote_items").delete().eq("purchase_quote_id", quoteRow.id);

    if (deleteItemsError) {
      logBaseCadastroError("purchase_quotes.items_delete_failed", deleteItemsError);
      await supabase.from("purchase_quotes").update({
        supplier_id: quoteRow.supplier_id,
        quote_number: quoteRow.quote_number,
        quote_date: quoteRow.quote_date,
        valid_until: quoteRow.valid_until,
        total_amount: quoteRow.total_amount,
        delivery_days: quoteRow.delivery_days,
        payment_terms: quoteRow.payment_terms,
        is_selected: quoteRow.is_selected,
        is_recurring_supplier_quote: quoteRow.is_recurring_supplier_quote,
        quote_validity_exception: quoteRow.quote_validity_exception,
        quote_validity_exception_reason: quoteRow.quote_validity_exception_reason,
        notes: quoteRow.notes,
        status: quoteRow.status,
        updated_by: session.user.id
      }).eq("id", quoteRow.id);
      return apiError("Não foi possível atualizar os itens da cotação.", 500);
    }

    const { error: insertItemsError } = await supabase.from("purchase_quote_items").insert(
      quoteItems.map((item) => ({
        organization_id: requestRow.organization_id,
        unit_id: requestRow.unit_id,
        purchase_quote_id: quoteRow.id,
        purchase_request_item_id: item.purchase_request_item_id,
        item_description: item.item_description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        delivery_notes: item.delivery_notes,
        created_by: session.user.id,
        updated_by: session.user.id
      }))
    );

    if (insertItemsError) {
      logBaseCadastroError("purchase_quotes.items_insert_failed", insertItemsError);
      await supabase.from("purchase_quotes").update({
        supplier_id: quoteRow.supplier_id,
        quote_number: quoteRow.quote_number,
        quote_date: quoteRow.quote_date,
        valid_until: quoteRow.valid_until,
        total_amount: quoteRow.total_amount,
        delivery_days: quoteRow.delivery_days,
        payment_terms: quoteRow.payment_terms,
        is_selected: quoteRow.is_selected,
        is_recurring_supplier_quote: quoteRow.is_recurring_supplier_quote,
        quote_validity_exception: quoteRow.quote_validity_exception,
        quote_validity_exception_reason: quoteRow.quote_validity_exception_reason,
        notes: quoteRow.notes,
        status: quoteRow.status,
        updated_by: session.user.id
      }).eq("id", quoteRow.id);
      await supabase.from("purchase_quote_items").insert(buildRestoredQuoteRows(quoteItemsBefore, quoteRow.id, session.user.id));
      return apiError("Não foi possível atualizar os itens da cotação.", 500);
    }

    const requestFlags = calculateWinningQuoteApprovalFlags(totalAmount);
    if (quoteRow.is_selected) {
      const { error: requestUpdateError } = await supabase
        .from("purchase_requests")
        .update({
          total_approved_amount: totalAmount,
          quotation_required: requestFlags.quotationRequired,
          required_quote_count: requestFlags.requiredQuoteCount,
          approval_required: requestFlags.approvalRequired,
          director_approval_required: requestFlags.directorApprovalRequired,
          approval_status: "pending",
          approval_level: getPurchaseApprovalLevel(totalAmount),
          approval_decided_at: null,
          approval_decided_by: null,
          approval_decision_notes: null,
          updated_by: session.user.id
        })
        .eq("id", requestRow.id);

      if (requestUpdateError) {
        logBaseCadastroError("purchase_quotes.request_update_failed", requestUpdateError);
        await supabase.from("purchase_quote_items").delete().eq("purchase_quote_id", quoteRow.id);
        await supabase.from("purchase_quote_items").insert(buildRestoredQuoteRows(quoteItemsBefore, quoteRow.id, session.user.id));
        await supabase.from("purchase_quotes").update({
          supplier_id: quoteRow.supplier_id,
          quote_number: quoteRow.quote_number,
          quote_date: quoteRow.quote_date,
          valid_until: quoteRow.valid_until,
          total_amount: quoteRow.total_amount,
          delivery_days: quoteRow.delivery_days,
          payment_terms: quoteRow.payment_terms,
          is_selected: quoteRow.is_selected,
          is_recurring_supplier_quote: quoteRow.is_recurring_supplier_quote,
          quote_validity_exception: quoteRow.quote_validity_exception,
          quote_validity_exception_reason: quoteRow.quote_validity_exception_reason,
          notes: quoteRow.notes,
          status: quoteRow.status,
          updated_by: session.user.id
        }).eq("id", quoteRow.id);
        return apiError("Não foi possível atualizar a solicitação com o total da cotação.", 500);
      }
    }

    await insertPurchaseRequestEvent(supabase, {
      organizationId: requestRow.organization_id,
      unitId: requestRow.unit_id,
      purchaseRequestId: requestRow.id,
      eventType: "quote_updated",
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      description: "Cotacao atualizada.",
      createdBy: session.user.id
    });

    return NextResponse.json({ ok: true, quoteId: quoteRow.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    if (error instanceof Error && error.message === "Cotação não encontrada ou já removida.") {
      return apiError(error.message, 404);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível atualizar a cotação.", 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string; quoteId: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!session.units.some((unit) => unit.id === requestRow.unit_id)) {
      return apiError("Você não tem acesso a esta solicitação.", 403);
    }

    const quoteRow = await fetchQuoteById(supabase, requestRow.id, params.quoteId);

    if (quoteRow.status === "cancelled" || quoteRow.deleted_at) {
      return apiError("Cotação não encontrada ou já removida.", 404);
    }

    const quoteItems = await fetchQuoteItems(supabase, quoteRow.id);
    const wasSelected = quoteRow.is_selected;
    const now = new Date().toISOString();

    const { error: quoteUpdateError } = await supabase
      .from("purchase_quotes")
      .update({
        status: "cancelled",
        is_selected: false,
        deleted_at: now,
        deleted_by: session.user.id,
        updated_by: session.user.id
      })
      .eq("id", quoteRow.id);

    if (quoteUpdateError) {
      logBaseCadastroError("purchase_quotes.delete_failed", quoteUpdateError);
      return apiError("Não foi possível cancelar a cotação.", 500);
    }

    const { error: itemsUpdateError } = await supabase
      .from("purchase_quote_items")
      .update({
        deleted_at: now,
        deleted_by: session.user.id,
        updated_by: session.user.id
      })
      .eq("purchase_quote_id", quoteRow.id);

    if (itemsUpdateError) {
      logBaseCadastroError("purchase_quotes.delete_items_failed", itemsUpdateError);
      await supabase.from("purchase_quotes").update({ status: quoteRow.status, is_selected: quoteRow.is_selected, deleted_at: null, deleted_by: null, updated_by: session.user.id }).eq("id", quoteRow.id);
      return apiError("Não foi possível cancelar os itens da cotação.", 500);
    }

    if (wasSelected) {
      const { error: requestUpdateError } = await supabase
        .from("purchase_requests")
        .update({
          total_approved_amount: 0,
          quotation_required: false,
          required_quote_count: 0,
          approval_required: false,
          director_approval_required: false,
          approval_status: "pending",
          approval_level: null,
          approval_decided_at: null,
          approval_decided_by: null,
          approval_decision_notes: null,
          updated_by: session.user.id
        })
        .eq("id", requestRow.id);

      if (requestUpdateError) {
        logBaseCadastroError("purchase_quotes.delete_request_failed", requestUpdateError);
        await supabase.from("purchase_quotes").update({ status: quoteRow.status, is_selected: quoteRow.is_selected, deleted_at: null, deleted_by: null, updated_by: session.user.id }).eq("id", quoteRow.id);
        await supabase.from("purchase_quote_items").update({ deleted_at: null, deleted_by: null, updated_by: session.user.id }).eq("purchase_quote_id", quoteRow.id);
        return apiError("Não foi possível atualizar a solicitação apos o cancelamento da cotação.", 500);
      }
    }

    await insertPurchaseRequestEvent(supabase, {
      organizationId: requestRow.organization_id,
      unitId: requestRow.unit_id,
      purchaseRequestId: requestRow.id,
      eventType: "quote_cancelled",
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      description: wasSelected ? "Cotação vencedora cancelada. A solicitação ficou sem cotação vencedora." : "Cotacao cancelada.",
      createdBy: session.user.id
    });

    return NextResponse.json({
      ok: true,
      quoteId: quoteRow.id,
      cancelledItems: quoteItems.length
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Cotação não encontrada ou já removida.") {
      return apiError(error.message, 404);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível cancelar a cotação.", 500);
  }
}

