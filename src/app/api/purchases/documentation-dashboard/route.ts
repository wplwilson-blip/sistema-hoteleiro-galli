import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import {
  classifyPurchaseQuoteEvidence,
  getPurchaseQuoteEvidenceConfidenceFromClassification,
  getPurchaseQuoteEvidenceTypeLabel,
  getPurchaseQuoteSourceContactChannelLabel,
  getPurchaseQuoteSourceTypeLabel,
  getPurchaseQuoteStatusLabel,
  type PurchaseQuoteDocumentaryClassification,
  type PurchaseQuoteEvidenceConfidence,
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";
import { getPurchaseRequestStatusLabel } from "@/lib/purchases/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DASHBOARD_QUOTE_LIMIT = 500;
const DUE_SOON_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type DashboardSeverity = "critical" | "high" | "medium" | "low" | "ok";
type QuoteStatus = "received" | "selected" | "rejected" | "expired" | "cancelled";
type RequestStatus =
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

type QuoteRow = {
  id: string;
  unit_id: string;
  purchase_request_id: string;
  supplier_id: string | null;
  quote_number: string | null;
  quote_date: string | null;
  valid_until: string | null;
  total_amount: string | number | null;
  is_selected: boolean;
  quote_source_type: PurchaseQuoteSourceType | null;
  evidence_type: PurchaseQuoteEvidenceType | null;
  evidence_confidence: PurchaseQuoteEvidenceConfidence | null;
  source_contact_name: string | null;
  source_contact_channel: PurchaseQuoteSourceContactChannel | null;
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
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
};

type RequestRow = {
  id: string;
  request_number: string;
  title: string;
  status: RequestStatus;
  approval_status: string | null;
};

type SupplierRow = {
  id: string;
  name: string;
  trade_name: string | null;
  document_number: string | null;
};

type UnitRow = {
  id: string;
  name: string;
  code: string | null;
};

type AttachmentRow = {
  entity_id: string;
};

type PendencyEvaluation = {
  pendencies: string[];
  severity: DashboardSeverity;
  missingRequiredAttachment: boolean;
  emergencyPendingRegularization: boolean;
  regularizationOverdue: boolean;
  regularizationDueSoon: boolean;
  expiredQuote: boolean;
  expiringSoon: boolean;
};

const severityRank: Record<DashboardSeverity, number> = {
  ok: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function maxSeverity(current: DashboardSeverity, candidate: DashboardSeverity) {
  return severityRank[candidate] > severityRank[current] ? candidate : current;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysUntil(dateValue: string | null | undefined, todayUtc: Date) {
  const date = parseDateOnly(dateValue);

  if (!date) {
    return null;
  }

  return Math.floor((date.getTime() - todayUtc.getTime()) / DAY_IN_MS);
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function addPendency(state: { pendencies: string[]; severity: DashboardSeverity }, label: string, severity: DashboardSeverity) {
  if (!state.pendencies.includes(label)) {
    state.pendencies.push(label);
  }

  state.severity = maxSeverity(state.severity, severity);
}

function evaluatePendencies(input: {
  quote: QuoteRow;
  classification: PurchaseQuoteDocumentaryClassification;
  requiresAttachment: boolean;
  hasAttachment: boolean;
  todayUtc: Date;
}): PendencyEvaluation {
  const { quote, classification, requiresAttachment, hasAttachment, todayUtc } = input;
  const state = {
    pendencies: [] as string[],
    severity: classification === "acceptable_with_reservation" ? ("low" as DashboardSeverity) : ("ok" as DashboardSeverity)
  };

  if (classification === "critical") addPendency(state, "Evidencia critica", "critical");
  if (classification === "fragile") addPendency(state, "Evidencia fragil", "high");

  const missingRequiredAttachment = requiresAttachment && !hasAttachment;
  if (missingRequiredAttachment) addPendency(state, "Sem anexo obrigatorio", "high");

  const isEmergency = quote.is_emergency_quote || quote.quote_source_type === "emergency";
  const emergencyPendingRegularization =
    isEmergency && (!quote.regularization_required || (quote.regularization_required && classification !== "formal_sufficient"));
  if (emergencyPendingRegularization) {
    addPendency(
      state,
      quote.regularization_required ? "Emergencia com regularizacao pendente" : "Emergencia sem regularizacao definida",
      "high"
    );
  }

  const regularizationDays = daysUntil(quote.regularization_deadline, todayUtc);
  const regularizationOverdue = Boolean(quote.regularization_required && regularizationDays != null && regularizationDays < 0);
  if (regularizationOverdue) addPendency(state, "Regularizacao vencida", "high");

  const regularizationDueSoon = Boolean(
    quote.regularization_required && regularizationDays != null && regularizationDays >= 0 && regularizationDays <= DUE_SOON_DAYS
  );
  if (regularizationDueSoon) addPendency(state, "Regularizacao proxima do vencimento", "medium");

  const validityDays = daysUntil(quote.valid_until, todayUtc);
  const expiredQuote = Boolean(validityDays != null && validityDays < 0);
  if (expiredQuote) addPendency(state, "Cotacao vencida", "medium");

  const expiringSoon = Boolean(validityDays != null && validityDays >= 0 && validityDays <= DUE_SOON_DAYS);
  if (expiringSoon) addPendency(state, "Cotacao proxima do vencimento", "low");

  if (quote.quote_source_type === "whatsapp" && !hasAttachment) addPendency(state, "WhatsApp sem print/anexo", "medium");
  if (quote.quote_source_type === "website_catalog" && !hasAttachment && !hasText(quote.source_url)) {
    addPendency(state, "Catalogo/site sem URL ou anexo", "medium");
  }
  if (quote.quote_source_type === "phone_call" || quote.quote_source_type === "in_person" || quote.is_verbal_quote) {
    addPendency(state, "Origem verbal/presencial", "medium");
  }

  return {
    pendencies: state.pendencies,
    severity: state.severity,
    missingRequiredAttachment,
    emergencyPendingRegularization,
    regularizationOverdue,
    regularizationDueSoon,
    expiredQuote,
    expiringSoon
  };
}

function mapById<T extends { id: string }>(rows: T[] | null | undefined) {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

export async function GET() {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const emptySummary = {
      totalQuotes: 0,
      critical: 0,
      fragile: 0,
      acceptableWithReservation: 0,
      formalSufficient: 0,
      missingRequiredAttachment: 0,
      emergencyPendingRegularization: 0,
      regularizationOverdue: 0,
      regularizationDueSoon: 0,
      expiredQuotes: 0,
      expiringSoon: 0,
      limit: DASHBOARD_QUOTE_LIMIT
    };

    if (!accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, summary: emptySummary, items: [] });
    }

    const supabase = createSupabaseAdminClient();
    const { data: quoteRows, error: quoteError } = await supabase
      .from("purchase_quotes")
      .select(
        "id, unit_id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, is_selected, quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline, status, created_at, updated_at"
      )
      .in("unit_id", accessibleUnitIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(DASHBOARD_QUOTE_LIMIT);

    if (quoteError) {
      logBaseCadastroError("purchase_documentation_dashboard.quotes_list_failed", quoteError);
      return apiError("Nao foi possivel carregar as pendencias documentais de cotacoes.", 500);
    }

    const quotes = (quoteRows ?? []) as QuoteRow[];
    const quoteIds = quotes.map((quote) => quote.id);
    const requestIds = Array.from(new Set(quotes.map((quote) => quote.purchase_request_id)));
    const supplierIds = Array.from(new Set(quotes.map((quote) => quote.supplier_id).filter(Boolean))) as string[];
    const unitIds = Array.from(new Set(quotes.map((quote) => quote.unit_id)));

    const [requestResult, supplierResult, unitResult, attachmentResult] = await Promise.all([
      requestIds.length
        ? supabase
            .from("purchase_requests")
            .select("id, request_number, title, status, approval_status")
            .in("id", requestIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      supplierIds.length
        ? supabase
            .from("suppliers")
            .select("id, name, trade_name, document_number")
            .in("id", supplierIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      unitIds.length ? supabase.from("units").select("id, name, code").in("id", unitIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
      quoteIds.length
        ? supabase
            .from("attachments")
            .select("entity_id")
            .eq("module", "purchases")
            .eq("entity_type", "purchase_quote")
            .in("entity_id", quoteIds)
            .eq("status", "active")
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (requestResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.requests_list_failed", requestResult.error);
      return apiError("Nao foi possivel carregar as solicitacoes vinculadas.", 500);
    }

    if (supplierResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.suppliers_list_failed", supplierResult.error);
      return apiError("Nao foi possivel carregar os fornecedores vinculados.", 500);
    }

    if (unitResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.units_list_failed", unitResult.error);
      return apiError("Nao foi possivel carregar as unidades vinculadas.", 500);
    }

    if (attachmentResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.attachments_list_failed", attachmentResult.error);
      return apiError("Nao foi possivel validar os anexos ativos das cotacoes.", 500);
    }

    const requestsById = mapById((requestResult.data ?? []) as RequestRow[]);
    const suppliersById = mapById((supplierResult.data ?? []) as SupplierRow[]);
    const unitsById = mapById((unitResult.data ?? []) as UnitRow[]);
    const attachmentsByQuoteId = new Map<string, number>();

    for (const attachment of (attachmentResult.data ?? []) as AttachmentRow[]) {
      attachmentsByQuoteId.set(attachment.entity_id, (attachmentsByQuoteId.get(attachment.entity_id) ?? 0) + 1);
    }

    const todayUtc = getTodayUtc();
    const summary = { ...emptySummary, totalQuotes: quotes.length };

    const items = quotes.map((quote) => {
      const activeAttachmentsCount = attachmentsByQuoteId.get(quote.id) ?? 0;
      const hasAttachment = activeAttachmentsCount > 0;
      const classification = classifyPurchaseQuoteEvidence({
        quoteSourceType: quote.quote_source_type,
        evidenceType: quote.evidence_type,
        sourceContactName: quote.source_contact_name,
        sourceContactChannel: quote.source_contact_channel,
        sourceReference: quote.source_reference,
        sourceUrl: quote.source_url,
        sourceNotes: quote.source_notes,
        evidenceMissingReason: quote.evidence_missing_reason,
        isVerbalQuote: quote.is_verbal_quote,
        isEmergencyQuote: quote.is_emergency_quote,
        emergencyReason: quote.emergency_reason,
        regularizationRequired: quote.regularization_required,
        regularizationDeadline: quote.regularization_deadline,
        hasAttachment
      });
      const pendencyEvaluation = evaluatePendencies({
        quote,
        classification: classification.status,
        requiresAttachment: classification.requiresAttachment,
        hasAttachment,
        todayUtc
      });
      const requestRow = requestsById.get(quote.purchase_request_id);
      const supplier = quote.supplier_id ? suppliersById.get(quote.supplier_id) : null;
      const unit = unitsById.get(quote.unit_id);
      const totalAmount = toNumber(quote.total_amount);

      if (classification.status === "critical") summary.critical += 1;
      if (classification.status === "fragile") summary.fragile += 1;
      if (classification.status === "acceptable_with_reservation") summary.acceptableWithReservation += 1;
      if (classification.status === "formal_sufficient") summary.formalSufficient += 1;
      if (pendencyEvaluation.missingRequiredAttachment) summary.missingRequiredAttachment += 1;
      if (pendencyEvaluation.emergencyPendingRegularization) summary.emergencyPendingRegularization += 1;
      if (pendencyEvaluation.regularizationOverdue) summary.regularizationOverdue += 1;
      if (pendencyEvaluation.regularizationDueSoon) summary.regularizationDueSoon += 1;
      if (pendencyEvaluation.expiredQuote) summary.expiredQuotes += 1;
      if (pendencyEvaluation.expiringSoon) summary.expiringSoon += 1;

      return {
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        requestId: quote.purchase_request_id,
        requestCode: requestRow?.request_number ?? null,
        requestTitle: requestRow?.title ?? "",
        requestStatus: requestRow?.status ?? "",
        requestStatusLabel: requestRow ? getPurchaseRequestStatusLabel(requestRow.status) : "",
        approvalStatus: requestRow?.approval_status ?? null,
        unitId: quote.unit_id,
        unitName: unit?.name ?? null,
        unitCode: unit?.code ?? null,
        supplierId: quote.supplier_id,
        supplierName: supplier?.trade_name || supplier?.name || null,
        supplierDocumentNumber: supplier?.document_number ?? null,
        status: quote.status,
        statusLabel: getPurchaseQuoteStatusLabel(quote.status),
        totalAmount,
        totalAmountLabel: formatMoney(totalAmount),
        validUntil: quote.valid_until,
        quoteDate: quote.quote_date,
        createdAt: quote.created_at,
        updatedAt: quote.updated_at,
        isSelected: quote.is_selected,
        quoteSourceType: quote.quote_source_type,
        quoteSourceTypeLabel: getPurchaseQuoteSourceTypeLabel(quote.quote_source_type),
        sourceContactChannel: quote.source_contact_channel,
        sourceContactChannelLabel: getPurchaseQuoteSourceContactChannelLabel(quote.source_contact_channel),
        sourceContactName: quote.source_contact_name,
        sourceReference: quote.source_reference,
        sourceUrl: quote.source_url,
        evidenceType: quote.evidence_type,
        evidenceTypeLabel: getPurchaseQuoteEvidenceTypeLabel(quote.evidence_type),
        evidenceConfidence: getPurchaseQuoteEvidenceConfidenceFromClassification(classification.status),
        requiresAttachment: classification.requiresAttachment,
        requiresJustification: classification.requiresJustification,
        hasFormalEvidence: classification.hasFormalEvidence,
        isVerbalQuote: quote.is_verbal_quote,
        isEmergencyQuote: quote.is_emergency_quote,
        emergencyReason: quote.emergency_reason,
        regularizationRequired: quote.regularization_required,
        regularizationDeadline: quote.regularization_deadline,
        activeAttachmentsCount,
        documentationClassification: classification.status,
        documentationClassificationLabel: classification.label,
        documentationClassificationReason: classification.reason,
        pendencies: pendencyEvaluation.pendencies,
        severity: pendencyEvaluation.severity
      };
    });

    const sortedItems = items.sort((left, right) => {
      const severityDiff = severityRank[right.severity] - severityRank[left.severity];
      return severityDiff || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    return NextResponse.json({ ok: true, summary, items: sortedItems });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar o dashboard documental de cotacoes.", 500);
  }
}
