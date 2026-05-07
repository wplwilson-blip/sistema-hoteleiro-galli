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
const DATE_FILTER_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const severityRank: Record<DashboardSeverity, number> = {
  ok: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const severityScore: Record<DashboardSeverity, number> = {
  ok: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 5
};

type DashboardSeverity = "critical" | "high" | "medium" | "low" | "ok";
type PendencySeverity = Exclude<DashboardSeverity, "ok">;
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

type PendencyCode =
  | "critical_evidence"
  | "fragile_evidence"
  | "missing_required_attachment"
  | "emergency_without_regularization_defined"
  | "emergency_pending_regularization"
  | "regularization_overdue"
  | "regularization_due_soon"
  | "quote_expired"
  | "quote_expiring_soon"
  | "whatsapp_without_attachment"
  | "catalog_without_url_or_attachment"
  | "verbal_or_in_person_origin";

type DashboardPendency = {
  code: PendencyCode;
  label: string;
  severity: PendencySeverity;
};

type DateFilters = {
  createdFrom: string | null;
  createdTo: string | null;
  validUntilFrom: string | null;
  validUntilTo: string | null;
  regularizationFrom: string | null;
  regularizationTo: string | null;
};

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

type UnitSummary = {
  unitId: string;
  unitName: string | null;
  unitCode: string | null;
  totalQuotes: number;
  critical: number;
  fragile: number;
  missingRequiredAttachment: number;
  regularizationOverdue: number;
  emergencyPendingRegularization: number;
  expiredQuotes: number;
  criticalFragilePercentage: number;
};

type PendencyRanking = {
  code: PendencyCode;
  label: string;
  severity: PendencySeverity;
  count: number;
  percentage: number;
};

type SupplierRanking = {
  supplierId: string | null;
  supplierName: string;
  supplierDocumentNumber: string | null;
  quotesWithPendencies: number;
  totalPendencies: number;
  score: number;
  maxSeverity: DashboardSeverity;
};

type PendencyEvaluation = {
  pendencies: DashboardPendency[];
  severity: DashboardSeverity;
  missingRequiredAttachment: boolean;
  emergencyPendingRegularization: boolean;
  regularizationOverdue: boolean;
  regularizationDueSoon: boolean;
  expiredQuote: boolean;
  expiringSoon: boolean;
  daysUntilExpiration: number | null;
  daysUntilRegularization: number | null;
};

class DateFilterError extends Error {}

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

function percentage(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((part / total) * 1000) / 10;
}

function parseDateOnly(value: string | null | undefined) {
  if (!value || !DATE_FILTER_REGEX.test(value)) {
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

function readDateFilter(url: URL, key: keyof DateFilters) {
  const value = url.searchParams.get(key)?.trim() ?? "";

  if (!value) {
    return null;
  }

  if (!DATE_FILTER_REGEX.test(value)) {
    throw new DateFilterError("Filtros de data devem usar o formato YYYY-MM-DD.");
  }

  return value;
}

function readDateFilters(requestUrl: string): DateFilters {
  const url = new URL(requestUrl);

  return {
    createdFrom: readDateFilter(url, "createdFrom"),
    createdTo: readDateFilter(url, "createdTo"),
    validUntilFrom: readDateFilter(url, "validUntilFrom"),
    validUntilTo: readDateFilter(url, "validUntilTo"),
    regularizationFrom: readDateFilter(url, "regularizationFrom"),
    regularizationTo: readDateFilter(url, "regularizationTo")
  };
}

function toCreatedAtStart(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toCreatedAtEnd(value: string) {
  return `${value}T23:59:59.999Z`;
}

function addPendency(state: { pendencies: DashboardPendency[]; severity: DashboardSeverity }, pendency: DashboardPendency) {
  if (!state.pendencies.some((item) => item.code === pendency.code)) {
    state.pendencies.push(pendency);
  }

  state.severity = maxSeverity(state.severity, pendency.severity);
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
    pendencies: [] as DashboardPendency[],
    severity: classification === "acceptable_with_reservation" ? ("low" as DashboardSeverity) : ("ok" as DashboardSeverity)
  };

  if (classification === "critical") addPendency(state, { code: "critical_evidence", label: "Evidência crítica", severity: "critical" });
  if (classification === "fragile") addPendency(state, { code: "fragile_evidence", label: "Evidência frágil", severity: "high" });

  const missingRequiredAttachment = requiresAttachment && !hasAttachment;
  if (missingRequiredAttachment) addPendency(state, { code: "missing_required_attachment", label: "Sem anexo obrigatório", severity: "high" });

  const isEmergency = quote.is_emergency_quote || quote.quote_source_type === "emergency";
  const emergencyPendingRegularization =
    isEmergency && (!quote.regularization_required || (quote.regularization_required && classification !== "formal_sufficient"));
  if (emergencyPendingRegularization) {
    addPendency(
      state,
      quote.regularization_required
        ? { code: "emergency_pending_regularization", label: "Emergência com regularização pendente", severity: "high" }
        : { code: "emergency_without_regularization_defined", label: "Emergência sem regularização definida", severity: "high" }
    );
  }

  const daysUntilRegularization = daysUntil(quote.regularization_deadline, todayUtc);
  const regularizationOverdue = Boolean(quote.regularization_required && daysUntilRegularization != null && daysUntilRegularization < 0);
  if (regularizationOverdue) addPendency(state, { code: "regularization_overdue", label: "Regularização vencida", severity: "high" });

  const regularizationDueSoon = Boolean(
    quote.regularization_required && daysUntilRegularization != null && daysUntilRegularization >= 0 && daysUntilRegularization <= DUE_SOON_DAYS
  );
  if (regularizationDueSoon) addPendency(state, { code: "regularization_due_soon", label: "Regularização próxima do vencimento", severity: "medium" });

  const daysUntilExpiration = daysUntil(quote.valid_until, todayUtc);
  const expiredQuote = Boolean(daysUntilExpiration != null && daysUntilExpiration < 0);
  if (expiredQuote) addPendency(state, { code: "quote_expired", label: "Cotação vencida", severity: "medium" });

  const expiringSoon = Boolean(daysUntilExpiration != null && daysUntilExpiration >= 0 && daysUntilExpiration <= DUE_SOON_DAYS);
  if (expiringSoon) addPendency(state, { code: "quote_expiring_soon", label: "Cotação próxima do vencimento", severity: "low" });

  if (quote.quote_source_type === "whatsapp" && !hasAttachment) {
    addPendency(state, { code: "whatsapp_without_attachment", label: "WhatsApp sem print/anexo", severity: "medium" });
  }

  if (quote.quote_source_type === "website_catalog" && !hasAttachment && !hasText(quote.source_url)) {
    addPendency(state, { code: "catalog_without_url_or_attachment", label: "Catálogo/site sem URL ou anexo", severity: "medium" });
  }

  if (quote.quote_source_type === "phone_call" || quote.quote_source_type === "in_person" || quote.is_verbal_quote) {
    addPendency(state, { code: "verbal_or_in_person_origin", label: "Origem verbal/presencial", severity: "medium" });
  }

  return {
    pendencies: state.pendencies,
    severity: state.severity,
    missingRequiredAttachment,
    emergencyPendingRegularization,
    regularizationOverdue,
    regularizationDueSoon,
    expiredQuote,
    expiringSoon,
    daysUntilExpiration,
    daysUntilRegularization
  };
}

function mapById<T extends { id: string }>(rows: T[] | null | undefined) {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

function createEmptySummary() {
  return {
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
}

function createEmptyPayload(filters: DateFilters) {
  return {
    ok: true,
    summary: createEmptySummary(),
    items: [],
    unitSummary: [],
    pendencyRanking: [],
    supplierRanking: [],
    filters
  };
}

function incrementUnitSummary(map: Map<string, UnitSummary>, input: {
  unitId: string;
  unitName: string | null;
  unitCode: string | null;
  classification: PurchaseQuoteDocumentaryClassification;
  pendencyEvaluation: PendencyEvaluation;
}) {
  const current = map.get(input.unitId) ?? {
    unitId: input.unitId,
    unitName: input.unitName,
    unitCode: input.unitCode,
    totalQuotes: 0,
    critical: 0,
    fragile: 0,
    missingRequiredAttachment: 0,
    regularizationOverdue: 0,
    emergencyPendingRegularization: 0,
    expiredQuotes: 0,
    criticalFragilePercentage: 0
  };

  current.totalQuotes += 1;
  if (input.classification === "critical") current.critical += 1;
  if (input.classification === "fragile") current.fragile += 1;
  if (input.pendencyEvaluation.missingRequiredAttachment) current.missingRequiredAttachment += 1;
  if (input.pendencyEvaluation.regularizationOverdue) current.regularizationOverdue += 1;
  if (input.pendencyEvaluation.emergencyPendingRegularization) current.emergencyPendingRegularization += 1;
  if (input.pendencyEvaluation.expiredQuote) current.expiredQuotes += 1;
  current.criticalFragilePercentage = percentage(current.critical + current.fragile, current.totalQuotes);
  map.set(input.unitId, current);
}

function incrementPendencyRanking(map: Map<PendencyCode, PendencyRanking>, pendency: DashboardPendency, totalQuotes: number) {
  const current = map.get(pendency.code) ?? {
    code: pendency.code,
    label: pendency.label,
    severity: pendency.severity,
    count: 0,
    percentage: 0
  };

  current.count += 1;
  current.severity = maxSeverity(current.severity, pendency.severity) as PendencySeverity;
  current.percentage = percentage(current.count, totalQuotes);
  map.set(pendency.code, current);
}

function incrementSupplierRanking(map: Map<string, SupplierRanking>, input: {
  supplierId: string | null;
  supplierName: string | null;
  supplierDocumentNumber: string | null;
  pendencies: DashboardPendency[];
}) {
  if (!input.pendencies.length) {
    return;
  }

  const key = input.supplierId ?? "__missing_supplier__";
  const current = map.get(key) ?? {
    supplierId: input.supplierId,
    supplierName: input.supplierName || "Fornecedor não informado",
    supplierDocumentNumber: input.supplierDocumentNumber,
    quotesWithPendencies: 0,
    totalPendencies: 0,
    score: 0,
    maxSeverity: "ok" as DashboardSeverity
  };

  current.quotesWithPendencies += 1;
  current.totalPendencies += input.pendencies.length;

  for (const pendency of input.pendencies) {
    current.score += severityScore[pendency.severity];
    current.maxSeverity = maxSeverity(current.maxSeverity, pendency.severity);
  }

  map.set(key, current);
}

export async function GET(request: Request) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const filters = readDateFilters(request.url);
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    if (!accessibleUnitIds.length) {
      return NextResponse.json(createEmptyPayload(filters));
    }

    const supabase = createSupabaseAdminClient();
    let quoteQuery = supabase
      .from("purchase_quotes")
      .select(
        "id, unit_id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, is_selected, quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline, status, created_at, updated_at"
      )
      .in("unit_id", accessibleUnitIds)
      .is("deleted_at", null);

    if (filters.createdFrom) quoteQuery = quoteQuery.gte("created_at", toCreatedAtStart(filters.createdFrom));
    if (filters.createdTo) quoteQuery = quoteQuery.lte("created_at", toCreatedAtEnd(filters.createdTo));
    if (filters.validUntilFrom) quoteQuery = quoteQuery.gte("valid_until", filters.validUntilFrom);
    if (filters.validUntilTo) quoteQuery = quoteQuery.lte("valid_until", filters.validUntilTo);
    if (filters.regularizationFrom) quoteQuery = quoteQuery.gte("regularization_deadline", filters.regularizationFrom);
    if (filters.regularizationTo) quoteQuery = quoteQuery.lte("regularization_deadline", filters.regularizationTo);

    const { data: quoteRows, error: quoteError } = await quoteQuery.order("created_at", { ascending: false }).limit(DASHBOARD_QUOTE_LIMIT);

    if (quoteError) {
      logBaseCadastroError("purchase_documentation_dashboard.quotes_list_failed", quoteError);
      return apiError("Não foi possível carregar as pendências documentais de cotações.", 500);
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
      return apiError("Não foi possível carregar as solicitações vinculadas.", 500);
    }

    if (supplierResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.suppliers_list_failed", supplierResult.error);
      return apiError("Não foi possível carregar os fornecedores vinculados.", 500);
    }

    if (unitResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.units_list_failed", unitResult.error);
      return apiError("Não foi possível carregar as unidades vinculadas.", 500);
    }

    if (attachmentResult.error) {
      logBaseCadastroError("purchase_documentation_dashboard.attachments_list_failed", attachmentResult.error);
      return apiError("Não foi possível validar os anexos ativos das cotações.", 500);
    }

    const requestsById = mapById((requestResult.data ?? []) as RequestRow[]);
    const suppliersById = mapById((supplierResult.data ?? []) as SupplierRow[]);
    const unitsById = mapById((unitResult.data ?? []) as UnitRow[]);
    const attachmentsByQuoteId = new Map<string, number>();

    for (const attachment of (attachmentResult.data ?? []) as AttachmentRow[]) {
      attachmentsByQuoteId.set(attachment.entity_id, (attachmentsByQuoteId.get(attachment.entity_id) ?? 0) + 1);
    }

    const todayUtc = getTodayUtc();
    const summary = { ...createEmptySummary(), totalQuotes: quotes.length };
    const unitSummaryById = new Map<string, UnitSummary>();
    const pendencyRankingByCode = new Map<PendencyCode, PendencyRanking>();
    const supplierRankingById = new Map<string, SupplierRanking>();

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

      incrementUnitSummary(unitSummaryById, {
        unitId: quote.unit_id,
        unitName: unit?.name ?? null,
        unitCode: unit?.code ?? null,
        classification: classification.status,
        pendencyEvaluation
      });

      for (const pendency of pendencyEvaluation.pendencies) {
        incrementPendencyRanking(pendencyRankingByCode, pendency, quotes.length);
      }

      incrementSupplierRanking(supplierRankingById, {
        supplierId: quote.supplier_id,
        supplierName: supplier?.trade_name || supplier?.name || null,
        supplierDocumentNumber: supplier?.document_number ?? null,
        pendencies: pendencyEvaluation.pendencies
      });

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
        daysUntilExpiration: pendencyEvaluation.daysUntilExpiration,
        daysUntilRegularization: pendencyEvaluation.daysUntilRegularization,
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
    const unitSummary = Array.from(unitSummaryById.values()).sort((left, right) => {
      const riskDiff = right.criticalFragilePercentage - left.criticalFragilePercentage;
      return riskDiff || right.totalQuotes - left.totalQuotes || (left.unitName ?? left.unitId).localeCompare(right.unitName ?? right.unitId);
    });
    const pendencyRanking = Array.from(pendencyRankingByCode.values()).sort((left, right) => {
      const countDiff = right.count - left.count;
      return countDiff || severityRank[right.severity] - severityRank[left.severity] || left.label.localeCompare(right.label);
    });
    const supplierRanking = Array.from(supplierRankingById.values())
      .sort((left, right) => {
        const scoreDiff = right.score - left.score;
        return scoreDiff || right.totalPendencies - left.totalPendencies || left.supplierName.localeCompare(right.supplierName);
      })
      .slice(0, 10);

    return NextResponse.json({ ok: true, summary, items: sortedItems, unitSummary, pendencyRanking, supplierRanking, filters });
  } catch (error) {
    if (error instanceof DateFilterError) {
      return apiError(error.message, 400);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível carregar o dashboard documental de cotações.", 500);
  }
}