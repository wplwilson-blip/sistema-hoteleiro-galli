import { getPurchaseRequestStatusTone } from "@/lib/purchases/schemas";
import {
  type PurchaseQuoteEvidenceConfidence,
  type PurchaseQuoteEvidenceClassificationInput,
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";

export type PurchaseRequestSummary = {
  id: string;
  requestNumber: string;
  title: string;
  justification: string;
  requestType: "normal" | "emergency";
  requestTypeLabel: string;
  priority: "low" | "normal" | "high" | "critical";
  priorityLabel: string;
  status: "submitted" | "under_review" | "quotation" | "approved" | "rejected" | "cancelled";
  statusLabel: string;
  unitId: string;
  departmentId: string;
  totalEstimatedAmount: number;
  totalApprovedAmount: number;
  quotationRequired: boolean;
  requiredQuoteCount: number;
  approvalRequired: boolean;
  directorApprovalRequired: boolean;
  approvalStatus?: "pending" | "approved" | "rejected" | "returned_to_purchases" | null;
  approvalDecisionNotes?: string;
  createdAt: string;
};

export type PurchaseRequestItem = {
  id: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitOfMeasureLabel: string;
  notes: string;
};

export type PurchaseRequestDetail = PurchaseRequestSummary & {
  items: PurchaseRequestItem[];
};

export type QuoteQueueFilter = "purchasing_queue" | "quotation" | "winner_selected" | "returned" | "pending_approval" | "finished" | "all";

export type PurchaseQuoteItem = {
  id: string;
  purchaseRequestItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  deliveryNotes: string;
};

export type PurchaseQuoteRecord = {
  id: string;
  purchaseRequestId: string;
  supplierId: string;
  supplierName: string;
  supplierTradeName: string;
  supplierDocumentNumber: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string;
  totalAmount: number;
  totalAmountLabel: string;
  deliveryDays: number | string;
  paymentTerms: string;
  isSelected: boolean;
  isRecurringSupplierQuote: boolean;
  quoteValidityException: boolean;
  quoteValidityExceptionReason: string;
  quoteSourceType: PurchaseQuoteSourceType | "";
  evidenceType: PurchaseQuoteEvidenceType | "";
  evidenceConfidence: PurchaseQuoteEvidenceConfidence | "";
  sourceContactName: string;
  sourceContactChannel: PurchaseQuoteSourceContactChannel | "";
  sourceReference: string;
  sourceUrl: string;
  sourceNotes: string;
  evidenceMissingReason: string;
  requiresAttachment: boolean;
  requiresJustification: boolean;
  hasFormalEvidence: boolean;
  isVerbalQuote: boolean;
  isEmergencyQuote: boolean;
  emergencyReason: string;
  regularizationRequired: boolean;
  regularizationDeadline: string;
  notes: string;
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  statusLabel: string;
  statusTone: "visual" | "warning" | "danger" | "success" | "info";
  quoteRound?: number;
  supersededByQuoteId: string;
  supersededAt: string;
  isSuperseded: boolean;
  isLockedByFormalDossier: boolean;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
  items: PurchaseQuoteItem[];
};

export type SupplierRecord = {
  id: string;
  name: string;
  tradeName: string;
  documentType?: string;
  documentNumber: string;
  phone?: string;
  whatsapp?: string;
  unitId: string;
  status: string;
};

export type QuoteItemFormValue = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  deliveryNotes: string;
};

export type PurchaseQuoteFormValues = {
  supplierId: string;
  quoteDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  notes: string;
  isRecurringSupplierQuote: boolean;
  quoteValidityException: boolean;
  quoteValidityExceptionReason: string;
  quoteSourceType: PurchaseQuoteSourceType | "";
  evidenceType: PurchaseQuoteEvidenceType | "";
  evidenceConfidence: PurchaseQuoteEvidenceConfidence | "";
  sourceContactName: string;
  sourceContactChannel: PurchaseQuoteSourceContactChannel | "";
  sourceReference: string;
  sourceUrl: string;
  sourceNotes: string;
  evidenceMissingReason: string;
  requiresAttachment: boolean;
  requiresJustification: boolean;
  hasFormalEvidence: boolean;
  isVerbalQuote: boolean;
  isEmergencyQuote: boolean;
  emergencyReason: string;
  regularizationRequired: boolean;
  regularizationDeadline: string;
  items: QuoteItemFormValue[];
};

export type NegotiationItemFormValue = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: string;
  previousUnitPrice: string;
  unitPrice: string;
  notes: string;
};

export type NegotiationFormValues = {
  quoteDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  negotiationNotes: string;
  quoteSourceType: PurchaseQuoteSourceType | "";
  evidenceType: PurchaseQuoteEvidenceType | "";
  evidenceConfidence: PurchaseQuoteEvidenceConfidence | "";
  sourceContactName: string;
  sourceContactChannel: PurchaseQuoteSourceContactChannel | "";
  sourceReference: string;
  sourceUrl: string;
  sourceNotes: string;
  evidenceMissingReason: string;
  requiresAttachment: boolean;
  requiresJustification: boolean;
  hasFormalEvidence: boolean;
  isVerbalQuote: boolean;
  isEmergencyQuote: boolean;
  emergencyReason: string;
  regularizationRequired: boolean;
  regularizationDeadline: string;
  items: NegotiationItemFormValue[];
};

export function buildEvidenceClassificationInput(values: Partial<PurchaseQuoteFormValues | NegotiationFormValues>, hasAttachment: boolean): PurchaseQuoteEvidenceClassificationInput {
  return {
    quoteSourceType: values.quoteSourceType,
    evidenceType: values.evidenceType,
    sourceContactName: values.sourceContactName,
    sourceContactChannel: values.sourceContactChannel,
    sourceReference: values.sourceReference,
    sourceUrl: values.sourceUrl,
    sourceNotes: values.sourceNotes,
    evidenceMissingReason: values.evidenceMissingReason,
    isVerbalQuote: values.isVerbalQuote,
    isEmergencyQuote: values.isEmergencyQuote,
    emergencyReason: values.emergencyReason,
    regularizationRequired: values.regularizationRequired,
    regularizationDeadline: values.regularizationDeadline,
    hasAttachment
  };
}

export function getEvidenceUploadHint(sourceType: PurchaseQuoteSourceType | "" | null | undefined) {
  switch (sourceType) {
    case "formal_proposal":
      return "Anexe a proposta formal em PDF ou imagem.";
    case "email":
      return "Anexe o PDF, print ou cópia do e-mail recebido.";
    case "whatsapp":
      return "Anexe o print da conversa ou proposta recebida pelo WhatsApp.";
    case "website_catalog":
      return "Informe a URL consultada e, se possível, anexe um print da página/catálogo.";
    case "phone_call":
      return "Cotação por ligação normalmente não possui arquivo. Registre contato, relato e justificativa.";
    case "in_person":
      return "Cotação presencial normalmente exige relato e justificativa quando não houver documento.";
    case "emergency":
      return "Anexe qualquer evidência disponível e registre motivo da emergência. Se não houver documento, informe regularização posterior.";
    case "recurring_supplier":
      return "Anexe documento do fornecedor recorrente se houver; sem documento, registre referência e observação.";
    default:
      return "Anexe qualquer arquivo de evidência disponível ou registre a justificativa da ausência.";
  }
}

export function formatDecimalInputValue(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseLocalizedNumberStrict(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDeliveryDays(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeDocumentSearch(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function getSupplierContactLabel(supplier: SupplierRecord) {
  if (supplier.whatsapp) {
    return `WhatsApp: ${supplier.whatsapp}`;
  }

  if (supplier.phone) {
    return `Telefone: ${supplier.phone}`;
  }

  return "";
}

export function getSupplierSummaryParts(supplier: SupplierRecord) {
  return [
    supplier.tradeName ? `Nome fantasia: ${supplier.tradeName}` : "",
    supplier.documentNumber ? `Documento: ${supplier.documentNumber}` : "",
    getSupplierContactLabel(supplier)
  ].filter(Boolean);
}

export function getPurchaseRequestQuotationFlowStatus(request: PurchaseRequestSummary, hasWinningQuote = request.totalApprovedAmount > 0) {
  if (request.approvalStatus === "approved" || request.status === "approved") {
    return { label: "Compra aprovada", tone: "success" as const, stage: "approval" as const };
  }

  if (request.approvalStatus === "rejected" || request.status === "rejected") {
    return { label: "Compra reprovada", tone: "danger" as const, stage: "approval" as const };
  }

  if (request.approvalStatus === "returned_to_purchases") {
    return { label: "Devolvida para Compras", tone: "info" as const, stage: "approval" as const };
  }

  if (isPurchaseAwaitingApproval(request)) {
    return request.totalApprovedAmount > 200
      ? { label: "Aguardando aprovação da Diretoria Geral", tone: "warning" as const, stage: "approval" as const }
      : { label: "Aguardando aprovação da Gerência Administrativa", tone: "info" as const, stage: "approval" as const };
  }

  if (request.status === "quotation" && hasWinningQuote) {
    return { label: "Vencedora selecionada", tone: "success" as const, stage: "quotation" as const };
  }

  return {
    label: request.statusLabel,
    tone: getPurchaseRequestStatusTone(request.status),
    stage: "quotation" as const
  };
}

export function isPurchaseAwaitingApproval(request: PurchaseRequestSummary) {
  return request.approvalStatus === "pending" && request.approvalRequired && request.totalApprovedAmount > 0;
}

export function isPurchaseClosedForQuotation(request: PurchaseRequestSummary) {
  return request.approvalStatus === "approved" || request.approvalStatus === "rejected" || request.status === "approved" || request.status === "rejected" || request.status === "cancelled";
}

export function canMutatePurchaseQuotation(request: PurchaseRequestSummary | null | undefined) {
  if (!request) {
    return false;
  }

  if (request.approvalStatus === "returned_to_purchases") {
    return true;
  }

  return request.status === "quotation" && !isPurchaseAwaitingApproval(request) && !isPurchaseClosedForQuotation(request);
}

export function requestHasWinnerSelected(request: PurchaseRequestSummary) {
  return request.totalApprovedAmount > 0;
}

export function matchesQuoteQueueFilter(request: PurchaseRequestSummary, filter: QuoteQueueFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "finished") {
    return isPurchaseClosedForQuotation(request);
  }

  if (filter === "pending_approval") {
    return isPurchaseAwaitingApproval(request);
  }

  if (filter === "returned") {
    return request.approvalStatus === "returned_to_purchases";
  }

  if (filter === "winner_selected") {
    return (
      requestHasWinnerSelected(request) &&
      !isPurchaseAwaitingApproval(request) &&
      !isPurchaseClosedForQuotation(request) &&
      request.approvalStatus !== "returned_to_purchases"
    );
  }

  if (filter === "quotation") {
    return (
      request.status === "quotation" &&
      request.approvalStatus !== "returned_to_purchases" &&
      !isPurchaseAwaitingApproval(request) &&
      !isPurchaseClosedForQuotation(request)
    );
  }

  return (
    (request.status === "submitted" || request.status === "under_review" || request.status === "quotation" || request.approvalStatus === "returned_to_purchases") &&
    !isPurchaseAwaitingApproval(request) &&
    !isPurchaseClosedForQuotation(request)
  );
}

export function isValidQuoteForRecommendation(quote: PurchaseQuoteRecord) {
  return (quote.status === "received" || quote.status === "selected" || quote.status === "rejected") && !quote.isExpired && !quote.isSuperseded;
}

export function compareRecommendedQuotes(left: PurchaseQuoteRecord, right: PurchaseQuoteRecord) {
  if (left.totalAmount !== right.totalAmount) {
    return left.totalAmount - right.totalAmount;
  }

  const leftDeliveryDays = parseDeliveryDays(left.deliveryDays);
  const rightDeliveryDays = parseDeliveryDays(right.deliveryDays);

  if (leftDeliveryDays !== null && rightDeliveryDays !== null && leftDeliveryDays !== rightDeliveryDays) {
    return leftDeliveryDays - rightDeliveryDays;
  }

  if (leftDeliveryDays !== null && rightDeliveryDays === null) {
    return -1;
  }

  if (leftDeliveryDays === null && rightDeliveryDays !== null) {
    return 1;
  }

  const leftCreatedAt = new Date(left.createdAt).getTime();
  const rightCreatedAt = new Date(right.createdAt).getTime();

  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.quoteNumber.localeCompare(right.quoteNumber, "pt-BR");
}

export function getMostCommonPaymentTerms(quotes: PurchaseQuoteRecord[]) {
  const counts = new Map<string, number>();

  for (const quote of quotes) {
    const terms = quote.paymentTerms.trim();

    if (terms) {
      counts.set(terms, (counts.get(terms) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pt-BR"))[0]?.[0] ?? "";
}

export function buildDefaultQuoteForm(request: PurchaseRequestDetail | null): PurchaseQuoteFormValues {
  const today = new Date();
  const validUntil = addDays(today, 90);
  const requestItems = request?.items ?? [];

  return {
    supplierId: "",
    quoteDate: toDateInputValue(today),
    validUntil: toDateInputValue(validUntil),
    deliveryDays: "",
    paymentTerms: "",
    notes: "",
    isRecurringSupplierQuote: false,
    quoteValidityException: false,
    quoteValidityExceptionReason: "",
    quoteSourceType: "formal_proposal",
    evidenceType: "attached_file",
    evidenceConfidence: "critical",
    sourceContactName: "",
    sourceContactChannel: "",
    sourceReference: "",
    sourceUrl: "",
    sourceNotes: "",
    evidenceMissingReason: "",
    requiresAttachment: false,
    requiresJustification: false,
    hasFormalEvidence: false,
    isVerbalQuote: false,
    isEmergencyQuote: false,
    emergencyReason: "",
    regularizationRequired: false,
    regularizationDeadline: "",
    items: requestItems.map((item) => ({
      purchaseRequestItemId: item.id,
      itemDescription: item.description,
      quantity: String(item.quantity),
      unitPrice: "",
      deliveryNotes: ""
    })) ?? []
  };
}

export function buildEditQuoteForm(quote: PurchaseQuoteRecord): PurchaseQuoteFormValues {
  const quoteItems = quote.items ?? [];

  return {
    supplierId: quote.supplierId,
    quoteDate: quote.quoteDate,
    validUntil: quote.validUntil,
    deliveryDays: quote.deliveryDays === "" ? "" : String(quote.deliveryDays),
    paymentTerms: quote.paymentTerms,
    notes: quote.notes,
    isRecurringSupplierQuote: quote.isRecurringSupplierQuote,
    quoteValidityException: quote.quoteValidityException,
    quoteValidityExceptionReason: quote.quoteValidityExceptionReason,
    quoteSourceType: quote.quoteSourceType,
    evidenceType: quote.evidenceType,
    evidenceConfidence: quote.evidenceConfidence,
    sourceContactName: quote.sourceContactName,
    sourceContactChannel: quote.sourceContactChannel,
    sourceReference: quote.sourceReference,
    sourceUrl: quote.sourceUrl,
    sourceNotes: quote.sourceNotes,
    evidenceMissingReason: quote.evidenceMissingReason,
    requiresAttachment: quote.requiresAttachment,
    requiresJustification: quote.requiresJustification,
    hasFormalEvidence: quote.hasFormalEvidence,
    isVerbalQuote: quote.isVerbalQuote,
    isEmergencyQuote: quote.isEmergencyQuote,
    emergencyReason: quote.emergencyReason,
    regularizationRequired: quote.regularizationRequired,
    regularizationDeadline: quote.regularizationDeadline,
    items: quoteItems.map((item) => ({
      purchaseRequestItemId: item.purchaseRequestItemId,
      itemDescription: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      deliveryNotes: item.deliveryNotes
    }))
  };
}

export function buildDefaultNegotiationForm(quote: PurchaseQuoteRecord | null): NegotiationFormValues {
  const today = new Date();
  const validUntil = addDays(today, 30);

  return {
    quoteDate: toDateInputValue(today),
    validUntil: toDateInputValue(validUntil),
    deliveryDays: quote?.deliveryDays === "" || quote?.deliveryDays == null ? "" : String(quote.deliveryDays),
    paymentTerms: quote?.paymentTerms ?? "",
    negotiationNotes: "",
    quoteSourceType: quote?.quoteSourceType || "formal_proposal",
    evidenceType: quote?.evidenceType || "attached_file",
    evidenceConfidence: quote?.evidenceConfidence || "critical",
    sourceContactName: quote?.sourceContactName ?? "",
    sourceContactChannel: quote?.sourceContactChannel ?? "",
    sourceReference: quote?.sourceReference ?? "",
    sourceUrl: quote?.sourceUrl ?? "",
    sourceNotes: quote?.sourceNotes ?? "",
    evidenceMissingReason: quote?.evidenceMissingReason ?? "",
    requiresAttachment: quote?.requiresAttachment ?? false,
    requiresJustification: quote?.requiresJustification ?? false,
    hasFormalEvidence: quote?.hasFormalEvidence ?? false,
    isVerbalQuote: quote?.isVerbalQuote ?? false,
    isEmergencyQuote: quote?.isEmergencyQuote ?? false,
    emergencyReason: quote?.emergencyReason ?? "",
    regularizationRequired: quote?.regularizationRequired ?? false,
    regularizationDeadline: quote?.regularizationDeadline ?? "",
    items: (quote?.items ?? []).map((item) => ({
      purchaseRequestItemId: item.purchaseRequestItemId,
      itemDescription: item.description,
      quantity: String(item.quantity),
      previousUnitPrice: String(item.unitPrice),
      unitPrice: String(item.unitPrice),
      notes: item.deliveryNotes ?? ""
    }))
  };
}

export function getQuoteSupplierLabel(quote: PurchaseQuoteRecord | null) {
  if (!quote) {
    return "";
  }

  return quote.supplierTradeName || quote.supplierName || "Fornecedor não informado";
}

export function getQuoteRoundLabel(quote: PurchaseQuoteRecord | null) {
  return `Rodada ${quote?.quoteRound ?? 1}`;
}

export function getQuoteHighlight(quote: PurchaseQuoteRecord, isRecommendedQuote: boolean, selectedDiffersFromRecommendation: boolean) {
  if (quote.isSuperseded) {
    return { label: "Superada", tone: "visual" as const };
  }

  if (quote.isSelected) {
    return selectedDiffersFromRecommendation
      ? { label: "Vencedora fora da recomendação", tone: "warning" as const }
      : { label: "Vencedora", tone: "success" as const };
  }

  if (isRecommendedQuote) {
    return { label: "Recomendada", tone: "info" as const };
  }

  return null;
}

// ---------------------------------------------------------------- bloco de origem e evidencia
// Campos que moram dentro do bloco recolhivel "Detalhes da origem e evidencia", na ORDEM
// VISUAL da tela. A ordem importa: o auto-open foca o primeiro erro desta lista, e "primeiro"
// precisa significar o mais alto na tela, nao o primeiro que o zod emitiu.
//
// Todo `path` que validatePurchaseQuoteForm (quote-schemas.ts) pode emitir esta' aqui OU e'
// de campo fora do bloco (supplierId, quoteDate, validUntil, quoteValidityExceptionReason,
// items). O teste de cobertura em tests/unit/quote-evidence-visibility.spec.ts guarda isso.
export const EVIDENCE_BLOCK_FIELDS = [
  "quoteSourceType",
  "evidenceType",
  "sourceContactName",
  "sourceContactChannel",
  "sourceReference",
  "sourceUrl",
  "regularizationDeadline",
  "evidenceMissingReason",
  "sourceNotes",
  "emergencyReason"
] as const;

export type EvidenceBlockField = (typeof EVIDENCE_BLOCK_FIELDS)[number];

// Tipos de evidencia que pressupoem arquivo. O bloco de anexos so' aparece nestes; nos demais
// (call_note, in_person_note, catalog_link, none) o arquivo nao faz parte do caminho.
export const EVIDENCE_TYPES_WITH_FILE: PurchaseQuoteEvidenceType[] = [
  "attached_file",
  "email_copy",
  "whatsapp_screenshot",
  "other"
];

export function evidenceTypeExpectsFile(evidenceType: PurchaseQuoteEvidenceType | "" | null | undefined) {
  return EVIDENCE_TYPES_WITH_FILE.includes(evidenceType as PurchaseQuoteEvidenceType);
}

/**
 * Primeiro campo do bloco de evidencia com erro, na ordem visual. Devolve null quando o
 * submit falhou so' fora do bloco — nesse caso o bloco NAO deve abrir sozinho.
 */
export function getFirstEvidenceFieldError(
  errors: Partial<Record<string, unknown>> | null | undefined
): EvidenceBlockField | null {
  if (!errors) {
    return null;
  }

  return EVIDENCE_BLOCK_FIELDS.find((field) => Boolean(errors[field])) ?? null;
}

/**
 * O bloco de anexos aparece quando o tipo de evidencia pressupoe arquivo.
 *
 * As duas ultimas condicoes sao guarda contra orfanar arquivo: se o usuario ja' selecionou
 * arquivos (ou a cotacao em edicao ja' tem anexo vinculado) e depois troca para um tipo sem
 * arquivo, o bloco CONTINUA visivel — senao ele perderia a lista e o botao Remover, ficando
 * com arquivo pendente que nao consegue mais ver.
 */
export function shouldShowAttachmentBlock(input: {
  evidenceType: PurchaseQuoteEvidenceType | "" | null | undefined;
  pendingFileCount: number;
  linkedAttachmentCount?: number;
}) {
  return (
    evidenceTypeExpectsFile(input.evidenceType) ||
    input.pendingFileCount > 0 ||
    (input.linkedAttachmentCount ?? 0) > 0
  );
}

/** Arquivo pendente num tipo de evidencia que nao usa arquivo: mostra o aviso de orfao. */
export function hasOrphanPendingAttachment(input: {
  evidenceType: PurchaseQuoteEvidenceType | "" | null | undefined;
  pendingFileCount: number;
}) {
  return input.pendingFileCount > 0 && !evidenceTypeExpectsFile(input.evidenceType);
}

/**
 * Espelha a exigencia de sourceNotes do superRefine (quote-schemas.ts) para rotular o campo
 * com honestidade. Depois do M2-b, nos ramos verbais a justificativa substitui a observacao.
 */
export function isSourceNotesRequired(values: {
  quoteSourceType: PurchaseQuoteSourceType | "" | null | undefined;
  isVerbalQuote?: boolean | null;
  sourceContactName?: string | null;
  evidenceMissingReason?: string | null;
}) {
  const hasJustification = Boolean(values.evidenceMissingReason?.trim());

  if (values.quoteSourceType === "other") {
    return true;
  }

  if (values.isVerbalQuote && !hasJustification) {
    return true;
  }

  if (values.quoteSourceType === "phone_call" && !hasJustification) {
    return true;
  }

  if (values.quoteSourceType === "in_person" && !values.sourceContactName?.trim() && !hasJustification) {
    return true;
  }

  return false;
}

/**
 * P3: a classificacao documental so' e' exibida depois que ha' o que classificar.
 *
 * Nao basta checar "origem e tipo preenchidos": buildDefaultQuoteForm ja' entrega
 * formal_proposal + attached_file, e sem anexo isso cai no default `critical` — a tela abria
 * acusando "Critica" uma cotacao que o usuario nao tinha comecado.
 */
export function shouldShowEvidenceClassification(input: {
  hasDirtyEvidenceField: boolean;
  pendingFileCount: number;
  linkedAttachmentCount?: number;
  isEditing: boolean;
  submitFailed: boolean;
}) {
  return (
    input.hasDirtyEvidenceField ||
    input.pendingFileCount > 0 ||
    (input.linkedAttachmentCount ?? 0) > 0 ||
    input.isEditing ||
    input.submitFailed
  );
}
