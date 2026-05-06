import { NextResponse } from "next/server";
import { apiError, getUnitOrganizationId, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPurchaseQuoteStatusLabel, getPurchaseQuoteStatusTone } from "@/lib/purchases/quote-schemas";
import { getPurchasePriorityLabel, getPurchaseRequestStatusLabel, getPurchaseRequestTypeLabel, getPurchaseUnitOfMeasureLabel, type PurchaseUnitOfMeasure } from "@/lib/purchases/schemas";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  department_id: string | null;
  requested_by: string | null;
  request_number: string;
  title: string;
  justification: string;
  request_type: "normal" | "emergency";
  priority: "low" | "normal" | "high" | "critical";
  status: "submitted" | "under_review" | "quotation";
  total_estimated_amount: string | number;
  total_approved_amount: string | number;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  approval_status?: "pending" | "approved" | "rejected" | "returned_to_purchases" | null;
  approval_decision_notes?: string | null;
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
  name: string;
  trade_name: string | null;
  document_number: string | null;
  unit_id: string | null;
  status: "active" | "inactive" | "archived";
};

type QuoteRow = {
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
  superseded_by_quote_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};

type QuoteItemRow = {
  id: string;
  purchase_quote_id: string;
  purchase_request_item_id: string;
  item_description: string;
  quantity: string | number;
  unit_price: string | number;
  total_price: string | number;
  delivery_notes: string | null;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function mapSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    tradeName: row.trade_name ?? "",
    documentNumber: row.document_number ?? "",
    unitId: row.unit_id ?? "",
    status: row.status
  };
}

function mapQuoteItem(item: QuoteItemRow) {
  return {
    id: item.id,
    purchaseRequestItemId: item.purchase_request_item_id,
    description: item.item_description,
    quantity: toNumber(item.quantity),
    unitPrice: toNumber(item.unit_price),
    totalPrice: toNumber(item.total_price),
    deliveryNotes: item.delivery_notes ?? ""
  };
}

function mapQuote(row: QuoteRow, supplier?: SupplierRow, items: QuoteItemRow[] = [], lockedQuoteIds = new Set<string>()) {
  const total = toNumber(row.total_amount);

  return {
    id: row.id,
    purchaseRequestId: row.purchase_request_id,
    supplierId: row.supplier_id,
    supplierName: supplier?.name ?? "",
    supplierTradeName: supplier?.trade_name ?? "",
    supplierDocumentNumber: supplier?.document_number ?? "",
    quoteNumber: row.quote_number,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    totalAmount: total,
    totalAmountLabel: formatMoney(total),
    deliveryDays: row.delivery_days ?? "",
    paymentTerms: row.payment_terms ?? "",
    isSelected: row.is_selected,
    isRecurringSupplierQuote: row.is_recurring_supplier_quote,
    quoteValidityException: row.quote_validity_exception,
    quoteValidityExceptionReason: row.quote_validity_exception_reason ?? "",
    quoteSourceType: row.quote_source_type ?? "",
    evidenceType: row.evidence_type ?? "",
    evidenceConfidence: row.evidence_confidence ?? "",
    sourceContactName: row.source_contact_name ?? "",
    sourceContactChannel: row.source_contact_channel ?? "",
    sourceReference: row.source_reference ?? "",
    sourceUrl: row.source_url ?? "",
    sourceNotes: row.source_notes ?? "",
    evidenceMissingReason: row.evidence_missing_reason ?? "",
    requiresAttachment: row.requires_attachment,
    requiresJustification: row.requires_justification,
    hasFormalEvidence: row.has_formal_evidence,
    isVerbalQuote: row.is_verbal_quote,
    isEmergencyQuote: row.is_emergency_quote,
    emergencyReason: row.emergency_reason ?? "",
    regularizationRequired: row.regularization_required,
    regularizationDeadline: row.regularization_deadline ?? "",
    notes: row.notes ?? "",
    status: row.status,
    statusLabel: getPurchaseQuoteStatusLabel(row.status),
    statusTone: getPurchaseQuoteStatusTone(row.status),
    supersededByQuoteId: row.superseded_by_quote_id ?? "",
    supersededAt: row.superseded_at ?? "",
    isSuperseded: Boolean(row.superseded_by_quote_id || row.superseded_at),
    isLockedByFormalDossier: lockedQuoteIds.has(row.id),
    isExpired: row.valid_until < new Date().toISOString().slice(0, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map(mapQuoteItem)
  };
}

async function loadSuppliers(supabase: SupabaseAdmin, organizationId: string, accessibleUnitIds: string[]) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, organization_id, unit_id, name, trade_name, document_number, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_quotes.suppliers_list_failed", error);
    throw new Error("Não foi possível carregar os fornecedores.");
  }

  const suppliers = ((data ?? []) as SupplierRow[]).filter((supplier) => !supplier.unit_id || accessibleUnitIds.includes(supplier.unit_id));

  return suppliers.map(mapSupplier);
}

async function loadEligibleRequests(supabase: SupabaseAdmin, accessibleUnitIds: string[]) {
  if (!accessibleUnitIds.length) {
    return [] as Array<{
      id: string;
      requestNumber: string;
      title: string;
      justification: string;
      requestType: "normal" | "emergency";
      requestTypeLabel: string;
      priority: "low" | "normal" | "high" | "critical";
      priorityLabel: string;
      status: "submitted" | "under_review" | "quotation";
      statusLabel: string;
      unitId: string;
      departmentId: string;
      totalEstimatedAmount: number;
      totalApprovedAmount: number;
      quotationRequired: boolean;
      requiredQuoteCount: number;
      approvalRequired: boolean;
      directorApprovalRequired: boolean;
      createdAt: string;
    }>;
  }

  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, organization_id, unit_id, department_id, requested_by, request_number, title, justification, request_type, priority, status, total_estimated_amount, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, approval_status, approval_decision_notes, created_at")
    .in("unit_id", accessibleUnitIds)
    .in("status", ["submitted", "under_review", "quotation"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    logBaseCadastroError("purchase_quotes.request_list_failed", error);
    throw new Error("Não foi possível carregar as solicitacoes para cotação.");
  }

  const requestRows = (data ?? []) as PurchaseRequestRow[];
  return requestRows.map((request) => ({
    id: request.id,
    requestNumber: request.request_number,
    title: request.title,
    justification: request.justification,
    requestType: request.request_type,
    requestTypeLabel: getPurchaseRequestTypeLabel(request.request_type),
    priority: request.priority,
    priorityLabel: getPurchasePriorityLabel(request.priority),
    status: request.status,
    statusLabel: getPurchaseRequestStatusLabel(request.status),
    unitId: request.unit_id,
    departmentId: request.department_id ?? "",
    totalEstimatedAmount: toNumber(request.total_estimated_amount),
    totalApprovedAmount: toNumber(request.total_approved_amount),
    quotationRequired: request.quotation_required,
    requiredQuoteCount: request.required_quote_count,
    approvalRequired: request.approval_required,
    directorApprovalRequired: request.director_approval_required,
    approvalStatus: request.approval_status,
    approvalDecisionNotes: request.approval_decision_notes ?? "",
    createdAt: request.created_at
  }));
}

async function loadRequestDetail(supabase: SupabaseAdmin, requestId: string, accessibleUnitIds: string[]) {
  const { data: request, error: requestError } = await supabase
    .from("purchase_requests")
    .select("id, organization_id, unit_id, department_id, requested_by, request_number, title, justification, request_type, priority, status, total_estimated_amount, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, approval_status, approval_decision_notes, created_at")
    .eq("id", requestId)
    .is("deleted_at", null)
    .single();

  if (requestError) {
    logBaseCadastroError("purchase_quotes.request_detail_failed", requestError);
    throw new Error("Não foi possível localizar a solicitação.");
  }

  const { data: requestItems, error: itemsError } = await supabase
    .from("purchase_request_items")
    .select("id, purchase_request_id, item_description, quantity, unit_of_measure, notes")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (itemsError) {
    logBaseCadastroError("purchase_quotes.request_items_detail_failed", itemsError);
    throw new Error("Não foi possível carregar os itens da solicitação.");
  }

  const { data: quoteRows, error: quotesError } = await supabase
    .from("purchase_quotes")
    .select("id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline, notes, status, superseded_by_quote_id, superseded_at, created_at, updated_at")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (quotesError) {
    logBaseCadastroError("purchase_quotes.detail_list_failed", quotesError);
    throw new Error("Não foi possível carregar as cotações.");
  }

  const quoteIds = (quoteRows ?? []).map((quote) => quote.id);
  const { data: quoteItems, error: quoteItemsError } = quoteIds.length
    ? await supabase
        .from("purchase_quote_items")
        .select("id, purchase_quote_id, purchase_request_item_id, item_description, quantity, unit_price, total_price, delivery_notes")
        .in("purchase_quote_id", quoteIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (quoteItemsError) {
    logBaseCadastroError("purchase_quotes.detail_quote_items_failed", quoteItemsError);
    throw new Error("Não foi possível carregar os itens das cotações.");
  }

  const { data: suppliers, error: suppliersError } = await supabase
    .from("suppliers")
    .select("id, name, trade_name, document_number, unit_id, status")
    .eq("organization_id", request.organization_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (suppliersError) {
    logBaseCadastroError("purchase_quotes.detail_suppliers_failed", suppliersError);
    throw new Error("Não foi possível carregar os fornecedores.");
  }

  const accessibleSuppliers = ((suppliers ?? []) as SupplierRow[]).filter((supplier) => !supplier.unit_id || accessibleUnitIds.includes(supplier.unit_id));
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("purchase_approval_snapshots")
    .select("selected_quote_id, snapshot_payload")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null);

  if (snapshotsError) {
    logBaseCadastroError("purchase_quotes.snapshot_lock_list_failed", snapshotsError);
    throw new Error("Não foi possível validar o vínculo das cotações com dossiês formais.");
  }

  const lockedQuoteIds = new Set<string>();
  for (const snapshot of snapshots ?? []) {
    if (snapshot.selected_quote_id) {
      lockedQuoteIds.add(snapshot.selected_quote_id);
    }

    const payload = snapshot.snapshot_payload as { quotes?: Array<{ id?: string | null }>; selectedQuote?: { id?: string | null } | null } | null;
    if (payload?.selectedQuote?.id) {
      lockedQuoteIds.add(payload.selectedQuote.id);
    }

    for (const quote of payload?.quotes ?? []) {
      if (quote.id) {
        lockedQuoteIds.add(quote.id);
      }
    }
  }

  const supplierMap = new Map(accessibleSuppliers.map((supplier) => [supplier.id, supplier]));
  const quoteItemsByQuoteId = new Map<string, QuoteItemRow[]>();
  for (const item of (quoteItems ?? []) as QuoteItemRow[]) {
    quoteItemsByQuoteId.set(item.purchase_quote_id, [...(quoteItemsByQuoteId.get(item.purchase_quote_id) ?? []), item]);
  }

  return {
    request: {
      id: request.id,
      requestNumber: request.request_number,
      title: request.title,
      justification: request.justification,
      unitId: request.unit_id,
      requestType: request.request_type,
      requestTypeLabel: getPurchaseRequestTypeLabel(request.request_type),
      priority: request.priority,
      priorityLabel: getPurchasePriorityLabel(request.priority),
      status: request.status,
      statusLabel: getPurchaseRequestStatusLabel(request.status),
      totalApprovedAmount: toNumber(request.total_approved_amount),
      quotationRequired: request.quotation_required,
      requiredQuoteCount: request.required_quote_count,
      approvalRequired: request.approval_required,
      directorApprovalRequired: request.director_approval_required,
      approvalStatus: request.approval_status,
      approvalDecisionNotes: request.approval_decision_notes ?? "",
      createdAt: request.created_at,
      items: (requestItems ?? []).map((item) => ({
        id: item.id,
        description: item.item_description,
        quantity: toNumber(item.quantity),
        unitOfMeasure: item.unit_of_measure,
        unitOfMeasureLabel: getPurchaseUnitOfMeasureLabel(item.unit_of_measure as PurchaseUnitOfMeasure),
        notes: item.notes ?? ""
      }))
    },
    quotes: (quoteRows ?? []).map((quote) => mapQuote(quote as QuoteRow, supplierMap.get(quote.supplier_id), quoteItemsByQuoteId.get(quote.id) ?? [], lockedQuoteIds)),
    suppliers: accessibleSuppliers.map(mapSupplier)
  };
}

export async function GET(request: Request) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("requestId")?.trim() ?? "";
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    if (!accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, requests: [], suppliers: [], quotes: [] });
    }

    const organizationId = await getUnitOrganizationId(supabase, accessibleUnitIds[0]);

    if (requestId) {
      const detail = await loadRequestDetail(supabase, requestId, accessibleUnitIds);

      if (!accessibleUnitIds.includes(detail.request.unitId)) {
        return apiError("Você não tem acesso a esta solicitação.", 403);
      }

      const suppliers = await loadSuppliers(supabase, organizationId, accessibleUnitIds);

      return NextResponse.json({
        ok: true,
        request: detail.request,
        quotes: detail.quotes,
        suppliers
      });
    }

    const requests = await loadEligibleRequests(supabase, accessibleUnitIds);
    const suppliers = await loadSuppliers(supabase, organizationId, accessibleUnitIds);

    return NextResponse.json({
      ok: true,
      requests,
      suppliers
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível carregar as cotações.", 500);
  }
}

