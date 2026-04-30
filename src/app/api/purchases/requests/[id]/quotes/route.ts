import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildNextPurchaseQuoteNumber,
  roundMoney,
  sumPurchaseQuoteItems
} from "@/lib/purchases/api";
import { purchaseQuotePostSchema } from "@/lib/purchases/quote-schemas";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  request_number: string;
  status: "submitted" | "under_review" | "quotation" | "draft" | "cancelled" | "rejected" | "approved" | "purchase_ordered" | "received_total" | "received_with_divergence" | "closed" | "awaiting_purchase" | "partially_received";
  total_approved_amount: string | number;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  created_at: string;
};

type PurchaseRequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_description: string;
  quantity: string | number;
  unit_of_measure: string;
  notes: string | null;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  name: string;
  trade_name: string | null;
  document_number: string | null;
  status: "active" | "inactive" | "archived";
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
};

type PurchaseQuoteItemInput = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  deliveryNotes?: string;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function fetchRequestById(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, organization_id, unit_id, request_number, status, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, created_at")
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

async function fetchExistingQuotes(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_quotes")
    .select("id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, notes, status, created_at, updated_at")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quotes.existing_quotes_lookup_failed", error);
    throw new Error("Não foi possível carregar as cotações da solicitação.");
  }

  return (data ?? []) as PurchaseQuoteRow[];
}

async function fetchSupplier(supabase: SupabaseAdmin, supplierId: string, organizationId: string, accessibleUnitIds: string[]) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, organization_id, unit_id, name, trade_name, document_number, status")
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
    throw new Error("Fornecedor nao encontrado ou inativo.");
  }

  if (supplier.unit_id && !accessibleUnitIds.includes(supplier.unit_id)) {
    throw new Error("Você não tem acesso a este fornecedor.");
  }

  return supplier;
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

function buildQuoteNumber(requestNumber: string, existingQuotes: PurchaseQuoteRow[]) {
  return buildNextPurchaseQuoteNumber(requestNumber, existingQuotes.map((quote) => quote.quote_number));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = purchaseQuotePostSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("Você não tem acesso a esta solicitação.", 403);
    }

    const requestItems = await fetchRequestItems(supabase, requestRow.id);

    if (payload.action === "start") {
      if (requestRow.status === "quotation") {
        return NextResponse.json({ ok: true });
      }

      if (requestRow.status !== "submitted" && requestRow.status !== "under_review") {
        return apiError("A cotação so pode ser iniciada em uma solicitação enviada.", 409);
      }

      const { error: updateError } = await supabase
        .from("purchase_requests")
        .update({ status: "quotation", updated_by: session.user.id })
        .eq("id", requestRow.id);

      if (updateError) {
        logBaseCadastroError("purchase_quotes.start_failed", updateError);
        return apiError(updateError.message || "Não foi possível iniciar a cotação.", 500);
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

      const updatedRequest = await fetchRequestById(supabase, requestRow.id);

      return NextResponse.json({
        ok: true,
        request: {
          id: updatedRequest.id,
          status: updatedRequest.status,
          statusLabel: "Em cotação"
        }
      });
    }

    if (requestRow.status === "submitted" || requestRow.status === "under_review") {
      const { error: updateError } = await supabase
        .from("purchase_requests")
        .update({ status: "quotation", updated_by: session.user.id })
        .eq("id", requestRow.id);

      if (updateError) {
        logBaseCadastroError("purchase_quotes.auto_start_failed", updateError);
        return apiError(updateError.message || "Não foi possível iniciar a cotação.", 500);
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
      return apiError("A cotação so pode ser registrada para solicitacoes em análise ou em cotação.", 409);
    }

    if (requestItems.length === 0) {
      return apiError("Não há itens cadastrados nesta solicitação.", 409);
    }

    const supplier = await fetchSupplier(supabase, payload.supplierId, requestRow.organization_id, accessibleUnitIds);
    const requestItemMap = new Map(requestItems.map((item) => [item.id, item]));
    const seenRequestItemIds = new Set<string>();

    if (payload.items.length !== requestItems.length) {
      throw new Error("Informe um item cotado para cada item da solicitação.");
    }

    const quoteItems: PurchaseQuoteItemInput[] = payload.items.map((item: PurchaseQuoteItemInput) => {
      if (!requestItemMap.has(item.purchaseRequestItemId)) {
        throw new Error("Item da cotação nao pertence a solicitação.");
      }

      if (seenRequestItemIds.has(item.purchaseRequestItemId)) {
        throw new Error("Cada item da solicitação deve aparecer apenas uma vez na cotação.");
      }

      seenRequestItemIds.add(item.purchaseRequestItemId);

      return {
        purchaseRequestItemId: item.purchaseRequestItemId,
        itemDescription: item.itemDescription,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        deliveryNotes: item.deliveryNotes ?? ""
      };
    });

    if (seenRequestItemIds.size !== requestItems.length) {
      throw new Error("Informe um item cotado para cada item da solicitação.");
    }

    const totalAmount = sumPurchaseQuoteItems(quoteItems.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));
    let quoteInsert: { id: string } | null = null;
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
          supplier_id: supplier.id,
          quote_number: quoteNumber,
          quote_date: payload.quoteDate,
          valid_until: payload.validUntil,
          total_amount: totalAmount,
          delivery_days: payload.deliveryDays ?? null,
          payment_terms: payload.paymentTerms ?? null,
          is_selected: false,
          is_recurring_supplier_quote: payload.isRecurringSupplierQuote ?? false,
          quote_validity_exception: payload.quoteValidityException ?? false,
          quote_validity_exception_reason: payload.quoteValidityExceptionReason?.trim() || null,
          notes: payload.notes ?? null,
          status: "received",
          created_by: session.user.id,
          updated_by: session.user.id
        })
        .select("id")
        .single();

      if (!quoteError) {
        quoteInsert = data;
        break;
      }

      if (quoteError.code === "23505" && attempt < 2) {
        duplicateQuoteErrorMessage = quoteError.message;
        continue;
      }

      logBaseCadastroError("purchase_quotes.create_failed", quoteError);
      return apiError(quoteError.message || "Não foi possível salvar a cotação.", 500);
    }

    if (!quoteInsert) {
      return apiError(duplicateQuoteErrorMessage || "Não foi possível gerar um número único para a cotação.", 409);
    }

    const quoteId = quoteInsert.id;
    const quoteItemRows = quoteItems.map((item) => {
      const requestItem = requestItemMap.get(item.purchaseRequestItemId)!;
      return {
        organization_id: requestRow.organization_id,
        unit_id: requestRow.unit_id,
        purchase_quote_id: quoteId,
        purchase_request_item_id: requestItem.id,
        item_description: item.itemDescription || requestItem.item_description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: roundMoney(item.quantity * item.unitPrice),
        delivery_notes: item.deliveryNotes ? item.deliveryNotes : null,
        created_by: session.user.id,
        updated_by: session.user.id
      };
    });

    const { error: quoteItemsError } = await supabase.from("purchase_quote_items").insert(quoteItemRows);

    if (quoteItemsError) {
      logBaseCadastroError("purchase_quotes.items_create_failed", quoteItemsError);
      await supabase.from("purchase_quotes").delete().eq("id", quoteId);
      return apiError(quoteItemsError.message || "Não foi possível salvar os itens da cotação.", 500);
    }

    await insertPurchaseRequestEvent(supabase, {
      organizationId: requestRow.organization_id,
      unitId: requestRow.unit_id,
      purchaseRequestId: requestRow.id,
      eventType: "quote_created",
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      description: "Cotacao registrada.",
      createdBy: session.user.id
    });

    return NextResponse.json({ ok: true, quoteId, quoteNumber });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível salvar a cotação.", 500);
  }
}

