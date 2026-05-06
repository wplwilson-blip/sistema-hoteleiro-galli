import {
  getPurchaseApprovalLevelLabel,
  roundMoney,
  type PurchaseApprovalLevel,
  type PurchaseApprovalStatus,
  type SupabaseAdmin
} from "@/lib/purchases/api";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
  getPurchaseUnitOfMeasureLabel,
  type PurchaseUnitOfMeasure
} from "@/lib/purchases/schemas";
import {
  classifyPurchaseQuoteEvidence,
  getPurchaseQuoteEvidenceConfidenceLabel,
  getPurchaseQuoteEvidenceConfidenceFromClassification,
  getPurchaseQuoteEvidenceTypeLabel,
  getPurchaseQuoteSourceContactChannelLabel,
  getPurchaseQuoteSourceTypeLabel,
  getPurchaseQuoteStatusLabel,
  type PurchaseQuoteEvidenceConfidence,
  type PurchaseQuoteEvidenceType,
  type PurchaseQuoteSourceContactChannel,
  type PurchaseQuoteSourceType
} from "@/lib/purchases/quote-schemas";

export const PURCHASE_APPROVAL_SNAPSHOT_RULE = "hotel_galli_purchase_approval_v1";

export class PurchaseApprovalSnapshotError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PurchaseApprovalSnapshotError";
    this.status = status;
  }
}

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  department_id: string | null;
  cost_center_id: string | null;
  requested_by: string | null;
  request_number: string;
  title: string;
  description: string | null;
  justification: string;
  request_type: "normal" | "emergency";
  priority: "low" | "normal" | "high" | "critical";
  desired_date: string | null;
  total_estimated_amount: string | number;
  total_approved_amount: string | number | null;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  approval_status: PurchaseApprovalStatus | null;
  approval_level: PurchaseApprovalLevel | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approval_decision_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

type PurchaseRequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_description: string;
  quantity: string | number;
  unit_of_measure: string;
  estimated_unit_price: string | number;
  estimated_total_price: string | number;
  approved_unit_price: string | number | null;
  approved_total_price: string | number | null;
  notes: string | null;
  created_at: string;
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
  notes: string | null;
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  original_quote_id: string | null;
  parent_quote_id: string | null;
  quote_round: number | null;
  superseded_by_quote_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
};

type SupplierRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  name: string;
  trade_name: string | null;
  document_type: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contact_name: string | null;
  category: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  file_mime_type: string;
  file_size_bytes: string | number;
  storage_bucket: string | null;
  description: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  uploaded_by: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};

type UnitRow = { id: string; code: string; name: string };
type DepartmentRow = { id: string; code: string; name: string };
type CostCenterRow = { id: string; code: string; name: string };
type UserRow = { id: string; display_name: string; username: string };

type CreatePurchaseApprovalSnapshotInput = {
  supabase: SupabaseAdmin;
  purchaseRequestId: string;
  selectedQuoteId: string;
  submittedBy: string;
  approvalLevel: PurchaseApprovalLevel;
  totalAmount: number;
  approvalStatusAtCreation: PurchaseApprovalStatus;
  isResubmission: boolean;
};

type CreatedPurchaseApprovalSnapshot = {
  id: string;
  snapshot_number: number;
};

type UpdatePurchaseApprovalSnapshotDecisionInput = {
  supabase: SupabaseAdmin;
  purchaseRequestId: string;
  decision: Exclude<PurchaseApprovalStatus, "pending">;
  decisionReason: string | null;
  decidedBy: string;
  decidedAt: string;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function parseDeliveryDays(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isQuoteValidForRecommendation(quote: PurchaseQuoteRow) {
  return (
    !quote.superseded_by_quote_id &&
    !quote.superseded_at &&
    (quote.status === "received" || quote.status === "selected" || quote.status === "rejected") &&
    quote.valid_until >= new Date().toISOString().slice(0, 10)
  );
}

function compareRecommendedQuotes(left: PurchaseQuoteRow, right: PurchaseQuoteRow) {
  const leftTotal = toNumber(left.total_amount);
  const rightTotal = toNumber(right.total_amount);

  if (leftTotal !== rightTotal) {
    return leftTotal - rightTotal;
  }

  const leftDelivery = parseDeliveryDays(left.delivery_days);
  const rightDelivery = parseDeliveryDays(right.delivery_days);

  if (leftDelivery !== null && rightDelivery !== null && leftDelivery !== rightDelivery) {
    return leftDelivery - rightDelivery;
  }

  if (leftDelivery !== null && rightDelivery === null) {
    return -1;
  }

  if (leftDelivery === null && rightDelivery !== null) {
    return 1;
  }

  const leftCreated = new Date(left.created_at).getTime();
  const rightCreated = new Date(right.created_at).getTime();

  if (Number.isFinite(leftCreated) && Number.isFinite(rightCreated) && leftCreated !== rightCreated) {
    return leftCreated - rightCreated;
  }

  return left.quote_number.localeCompare(right.quote_number, "pt-BR");
}

function buildRecommendationReason(recommendedQuote: PurchaseQuoteRow | null) {
  if (!recommendedQuote) {
    return "Nenhuma cotação elegível para recomendação no momento do envio.";
  }

  return "Menor valor elegível, com desempate por prazo de entrega, data de criação e número da cotação.";
}

function mapSupplier(row: SupplierRow | null | undefined) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    name: row.name,
    tradeName: row.trade_name,
    documentType: row.document_type,
    documentNumber: row.document_number,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    contactName: row.contact_name,
    category: row.category,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    module: row.module,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: toNumber(row.file_size_bytes),
    storageBucket: row.storage_bucket ?? "attachments",
    description: row.description,
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    uploadedBy: row.uploaded_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQuoteItem(row: PurchaseQuoteItemRow) {
  return {
    id: row.id,
    purchaseQuoteId: row.purchase_quote_id,
    purchaseRequestItemId: row.purchase_request_item_id,
    description: row.item_description,
    quantity: toNumber(row.quantity),
    unitPrice: roundMoney(toNumber(row.unit_price)),
    totalPrice: roundMoney(toNumber(row.total_price)),
    deliveryNotes: row.delivery_notes,
    createdAt: row.created_at
  };
}

function mapQuote(
  row: PurchaseQuoteRow,
  supplier: SupplierRow | undefined,
  quoteItems: PurchaseQuoteItemRow[],
  attachments: AttachmentRow[],
  recommendedQuoteId: string | null
  ) {
  const classification = classifyPurchaseQuoteEvidence({
    quoteSourceType: row.quote_source_type,
    evidenceType: row.evidence_type,
    sourceContactName: row.source_contact_name,
    sourceContactChannel: row.source_contact_channel,
    sourceReference: row.source_reference,
    sourceUrl: row.source_url,
    sourceNotes: row.source_notes,
    evidenceMissingReason: row.evidence_missing_reason,
    isVerbalQuote: row.is_verbal_quote,
    isEmergencyQuote: row.is_emergency_quote,
    emergencyReason: row.emergency_reason,
    regularizationRequired: row.regularization_required,
    regularizationDeadline: row.regularization_deadline,
    hasAttachment: attachments.length > 0
  });
  const evidenceConfidence = getPurchaseQuoteEvidenceConfidenceFromClassification(classification.status);

  return {
    id: row.id,
    purchaseRequestId: row.purchase_request_id,
    supplier: mapSupplier(supplier),
    quoteNumber: row.quote_number,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    totalAmount: roundMoney(toNumber(row.total_amount)),
    deliveryDays: row.delivery_days,
    paymentTerms: row.payment_terms,
    isSelected: row.is_selected,
    isRecommended: recommendedQuoteId === row.id,
    isRecurringSupplierQuote: row.is_recurring_supplier_quote,
    quoteValidityException: row.quote_validity_exception,
    quoteValidityExceptionReason: row.quote_validity_exception_reason,
    evidence: {
      quoteSourceType: row.quote_source_type,
      quoteSourceTypeLabel: getPurchaseQuoteSourceTypeLabel(row.quote_source_type),
      evidenceType: row.evidence_type,
      evidenceTypeLabel: getPurchaseQuoteEvidenceTypeLabel(row.evidence_type),
      evidenceConfidence,
      evidenceConfidenceLabel: getPurchaseQuoteEvidenceConfidenceLabel(evidenceConfidence),
      sourceContactName: row.source_contact_name,
      sourceContactChannel: row.source_contact_channel,
      sourceContactChannelLabel: getPurchaseQuoteSourceContactChannelLabel(row.source_contact_channel),
      sourceReference: row.source_reference,
      sourceUrl: row.source_url,
      sourceNotes: row.source_notes,
      evidenceMissingReason: row.evidence_missing_reason,
      requiresAttachment: classification.requiresAttachment,
      requiresJustification: classification.requiresJustification,
      hasFormalEvidence: classification.hasFormalEvidence,
      isVerbalQuote: row.is_verbal_quote,
      isEmergencyQuote: row.is_emergency_quote,
      emergencyReason: row.emergency_reason,
      regularizationRequired: row.regularization_required,
      regularizationDeadline: row.regularization_deadline,
      documentaryClassification: classification.status,
      documentaryClassificationLabel: classification.label,
      documentaryClassificationSeverity: classification.severity,
      documentaryClassificationReason: classification.reason,
      requiresDirectorApproval: classification.requiresDirectorApproval,
      auditAlerts: classification.alerts
    },
    notes: row.notes,
    status: row.status,
    statusLabel: getPurchaseQuoteStatusLabel(row.status),
    originalQuoteId: row.original_quote_id,
    parentQuoteId: row.parent_quote_id,
    quoteRound: row.quote_round ?? 1,
    supersededByQuoteId: row.superseded_by_quote_id,
    supersededAt: row.superseded_at,
    isSuperseded: Boolean(row.superseded_by_quote_id || row.superseded_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: quoteItems.map(mapQuoteItem),
    attachments: attachments.map(mapAttachment)
  };
}

function mapRequestItem(row: PurchaseRequestItemRow) {
  return {
    id: row.id,
    description: row.item_description,
    quantity: toNumber(row.quantity),
    unitOfMeasure: row.unit_of_measure,
    unitOfMeasureLabel: getPurchaseUnitOfMeasureLabel(row.unit_of_measure as PurchaseUnitOfMeasure),
    estimatedUnitPrice: roundMoney(toNumber(row.estimated_unit_price)),
    estimatedTotalPrice: roundMoney(toNumber(row.estimated_total_price)),
    approvedUnitPrice: row.approved_unit_price === null ? null : roundMoney(toNumber(row.approved_unit_price)),
    approvedTotalPrice: row.approved_total_price === null ? null : roundMoney(toNumber(row.approved_total_price)),
    notes: row.notes,
    createdAt: row.created_at
  };
}

async function fetchNextSnapshotNumber(supabase: SupabaseAdmin, purchaseRequestId: string) {
  const { data, error } = await supabase
    .from("purchase_approval_snapshots")
    .select("snapshot_number")
    .eq("purchase_request_id", purchaseRequestId)
    .is("deleted_at", null)
    .order("snapshot_number", { ascending: false })
    .limit(1);

  if (error) {
    throw new PurchaseApprovalSnapshotError("Não foi possível calcular o número do dossiê formal.", 500);
  }

  return Number(data?.[0]?.snapshot_number ?? 0) + 1;
}

async function assertNoPendingSnapshot(supabase: SupabaseAdmin, purchaseRequestId: string) {
  const { data, error } = await supabase
    .from("purchase_approval_snapshots")
    .select("id")
    .eq("purchase_request_id", purchaseRequestId)
    .eq("snapshot_status", "pending")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    throw new PurchaseApprovalSnapshotError("Não foi possível validar dossiês formais pendentes.", 500);
  }

  if (data?.length) {
    throw new PurchaseApprovalSnapshotError("Já existe um dossiê formal aguardando aprovação para esta compra.", 409);
  }
}

export async function deletePurchaseApprovalSnapshot(supabase: SupabaseAdmin, snapshotId: string) {
  await supabase.from("purchase_approval_snapshots").delete().eq("id", snapshotId);
}

export async function assertPendingPurchaseApprovalSnapshot(supabase: SupabaseAdmin, purchaseRequestId: string) {
  const { data, error } = await supabase
    .from("purchase_approval_snapshots")
    .select("id")
    .eq("purchase_request_id", purchaseRequestId)
    .eq("snapshot_status", "pending")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new PurchaseApprovalSnapshotError("Nao foi possivel validar o dossie formal pendente.", 500);
  }

  if (!data) {
    throw new PurchaseApprovalSnapshotError("Nenhum dossie formal pendente foi encontrado para esta compra.", 409);
  }
}

export async function updatePendingPurchaseApprovalSnapshotDecision(input: UpdatePurchaseApprovalSnapshotDecisionInput) {
  const { supabase, purchaseRequestId, decision, decisionReason, decidedBy, decidedAt } = input;

  const { data, error } = await supabase
    .from("purchase_approval_snapshots")
    .update({
      snapshot_status: decision,
      decided_by: decidedBy,
      decided_at: decidedAt,
      decision,
      decision_reason: decisionReason,
      updated_by: decidedBy,
      updated_at: decidedAt
    })
    .eq("purchase_request_id", purchaseRequestId)
    .eq("snapshot_status", "pending")
    .is("deleted_at", null)
    .select("id, snapshot_number")
    .maybeSingle();

  if (error) {
    throw new PurchaseApprovalSnapshotError("Nao foi possivel atualizar o dossie formal da aprovacao.", 500);
  }

  if (!data) {
    throw new PurchaseApprovalSnapshotError("Nenhum dossie formal pendente foi encontrado para esta compra.", 409);
  }

  return data as CreatedPurchaseApprovalSnapshot;
}

export async function createPurchaseApprovalSnapshot(input: CreatePurchaseApprovalSnapshotInput) {
  const { supabase, purchaseRequestId, selectedQuoteId, submittedBy, approvalLevel, totalAmount, approvalStatusAtCreation, isResubmission } = input;

  await assertNoPendingSnapshot(supabase, purchaseRequestId);

  const { data: requestData, error: requestError } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, department_id, cost_center_id, requested_by, request_number, title, description, justification, request_type, priority, desired_date, total_estimated_amount, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, approval_status, approval_level, approval_decided_at, approval_decided_by, approval_decision_notes, status, created_at, updated_at, created_by, updated_by"
    )
    .eq("id", purchaseRequestId)
    .is("deleted_at", null)
    .single();

  if (requestError || !requestData) {
    throw new PurchaseApprovalSnapshotError("Não foi possível carregar a solicitação para gerar o dossiê formal.", 500);
  }

  const purchaseRequest = requestData as PurchaseRequestRow;

  const [
    requestItemsResult,
    quoteRowsResult,
    unitResult,
    departmentResult,
    costCenterResult,
    requesterResult,
    submitterResult
  ] = await Promise.all([
    supabase
      .from("purchase_request_items")
      .select("id, purchase_request_id, item_description, quantity, unit_of_measure, estimated_unit_price, estimated_total_price, approved_unit_price, approved_total_price, notes, created_at")
      .eq("purchase_request_id", purchaseRequest.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("purchase_quotes")
      .select(
        "id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, is_recurring_supplier_quote, quote_validity_exception, quote_validity_exception_reason, quote_source_type, evidence_type, evidence_confidence, source_contact_name, source_contact_channel, source_reference, source_url, source_notes, evidence_missing_reason, requires_attachment, requires_justification, has_formal_evidence, is_verbal_quote, is_emergency_quote, emergency_reason, regularization_required, regularization_deadline, notes, status, original_quote_id, parent_quote_id, quote_round, superseded_by_quote_id, superseded_at, created_at, updated_at"
      )
      .eq("purchase_request_id", purchaseRequest.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("units").select("id, code, name").eq("id", purchaseRequest.unit_id).is("deleted_at", null).limit(1),
    purchaseRequest.department_id
      ? supabase.from("departments").select("id, code, name").eq("id", purchaseRequest.department_id).is("deleted_at", null).limit(1)
      : Promise.resolve({ data: [], error: null }),
    purchaseRequest.cost_center_id
      ? supabase.from("cost_centers").select("id, code, name").eq("id", purchaseRequest.cost_center_id).is("deleted_at", null).limit(1)
      : Promise.resolve({ data: [], error: null }),
    purchaseRequest.requested_by
      ? supabase.from("app_users").select("id, display_name, username").eq("id", purchaseRequest.requested_by).is("deleted_at", null).limit(1)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("app_users").select("id, display_name, username").eq("id", submittedBy).is("deleted_at", null).limit(1)
  ]);

  if (requestItemsResult.error || quoteRowsResult.error || unitResult.error || departmentResult.error || costCenterResult.error || requesterResult.error || submitterResult.error) {
    throw new PurchaseApprovalSnapshotError("Não foi possível carregar os dados do dossiê formal.", 500);
  }

  const requestItems = (requestItemsResult.data ?? []) as PurchaseRequestItemRow[];
  const quotes = (quoteRowsResult.data ?? []) as PurchaseQuoteRow[];
  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId && quote.is_selected);

  if (!selectedQuote) {
    throw new PurchaseApprovalSnapshotError("Cotação vencedora não encontrada para gerar o dossiê formal.", 409);
  }

  const quoteIds = quotes.map((quote) => quote.id);
  const supplierIds = Array.from(new Set(quotes.map((quote) => quote.supplier_id)));

  const [quoteItemsResult, suppliersResult, attachmentsResult] = await Promise.all([
    quoteIds.length
      ? supabase
          .from("purchase_quote_items")
          .select("id, purchase_quote_id, purchase_request_item_id, item_description, quantity, unit_price, total_price, delivery_notes, created_at")
          .in("purchase_quote_id", quoteIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase
          .from("suppliers")
          .select("id, organization_id, unit_id, name, trade_name, document_type, document_number, email, phone, whatsapp, contact_name, category, notes, status, created_at, updated_at")
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      ? supabase
          .from("attachments")
          .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
          .eq("module", "purchases")
          .eq("entity_type", "purchase_quote")
          .in("entity_id", quoteIds)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (quoteItemsResult.error || suppliersResult.error || attachmentsResult.error) {
    throw new PurchaseApprovalSnapshotError("Não foi possível carregar cotações, fornecedores ou anexos do dossiê formal.", 500);
  }

  const quoteItemsByQuoteId = new Map<string, PurchaseQuoteItemRow[]>();
  for (const item of (quoteItemsResult.data ?? []) as PurchaseQuoteItemRow[]) {
    quoteItemsByQuoteId.set(item.purchase_quote_id, [...(quoteItemsByQuoteId.get(item.purchase_quote_id) ?? []), item]);
  }

  const attachmentsByQuoteId = new Map<string, AttachmentRow[]>();
  for (const attachment of (attachmentsResult.data ?? []) as AttachmentRow[]) {
    attachmentsByQuoteId.set(attachment.entity_id, [...(attachmentsByQuoteId.get(attachment.entity_id) ?? []), attachment]);
  }

  const suppliersById = new Map(((suppliersResult.data ?? []) as SupplierRow[]).map((supplier) => [supplier.id, supplier]));
  const recommendedQuote = [...quotes.filter(isQuoteValidForRecommendation)].sort(compareRecommendedQuotes)[0] ?? null;
  const recommendationReason = buildRecommendationReason(recommendedQuote);
  const selectedSupplier = suppliersById.get(selectedQuote.supplier_id);
  const snapshotNumber = await fetchNextSnapshotNumber(supabase, purchaseRequest.id);
  const now = new Date().toISOString();
  const unit = ((unitResult.data ?? []) as UnitRow[])[0] ?? null;
  const department = ((departmentResult.data ?? []) as DepartmentRow[])[0] ?? null;
  const costCenter = ((costCenterResult.data ?? []) as CostCenterRow[])[0] ?? null;
  const requester = ((requesterResult.data ?? []) as UserRow[])[0] ?? null;
  const submitter = ((submitterResult.data ?? []) as UserRow[])[0] ?? null;
  const quotePayloads = quotes.map((quote) =>
    mapQuote(
      quote,
      suppliersById.get(quote.supplier_id),
      quoteItemsByQuoteId.get(quote.id) ?? [],
      attachmentsByQuoteId.get(quote.id) ?? [],
      recommendedQuote?.id ?? null
    )
  );
  const selectedQuotePayload = quotePayloads.find((quote) => quote.id === selectedQuote.id) ?? null;
  const selectedQuoteEvidence = selectedQuotePayload?.evidence ?? null;

  const snapshotPayload = {
    schemaVersion: 1,
    generatedAt: now,
    isResubmission,
    approval: {
      statusAtCreation: approvalStatusAtCreation,
      previousApprovalStatus: purchaseRequest.approval_status,
      previousApprovalLevel: purchaseRequest.approval_level,
      rule: PURCHASE_APPROVAL_SNAPSHOT_RULE,
      ruleDescription: "Até R$ 200,00: Gerência Administrativa. Acima de R$ 200,00: Diretoria Geral.",
      level: approvalLevel,
      levelLabel: getPurchaseApprovalLevelLabel(approvalLevel),
      requiresDirectorApprovalByEvidence: Boolean(selectedQuoteEvidence?.requiresDirectorApproval),
      documentaryClassification: selectedQuoteEvidence?.documentaryClassification ?? null,
      documentaryClassificationLabel: selectedQuoteEvidence?.documentaryClassificationLabel ?? null,
      documentaryClassificationReason: selectedQuoteEvidence?.documentaryClassificationReason ?? null,
      totalAmount: roundMoney(totalAmount),
      currency: "BRL"
    },
    submittedBy: submitter
      ? {
          id: submitter.id,
          displayName: submitter.display_name,
          username: submitter.username
        }
      : {
          id: submittedBy,
          displayName: "",
          username: ""
        },
    request: {
      id: purchaseRequest.id,
      organizationId: purchaseRequest.organization_id,
      unitId: purchaseRequest.unit_id,
      departmentId: purchaseRequest.department_id,
      costCenterId: purchaseRequest.cost_center_id,
      requestedBy: requester
        ? {
            id: requester.id,
            displayName: requester.display_name,
            username: requester.username
          }
        : null,
      requestNumber: purchaseRequest.request_number,
      title: purchaseRequest.title,
      description: purchaseRequest.description,
      justification: purchaseRequest.justification,
      requestType: purchaseRequest.request_type,
      requestTypeLabel: getPurchaseRequestTypeLabel(purchaseRequest.request_type),
      priority: purchaseRequest.priority,
      priorityLabel: getPurchasePriorityLabel(purchaseRequest.priority),
      desiredDate: purchaseRequest.desired_date,
      totalEstimatedAmount: roundMoney(toNumber(purchaseRequest.total_estimated_amount)),
      totalApprovedAmountBeforeSubmission: roundMoney(toNumber(purchaseRequest.total_approved_amount)),
      quotationRequiredBeforeSubmission: purchaseRequest.quotation_required,
      requiredQuoteCountBeforeSubmission: purchaseRequest.required_quote_count,
      approvalRequiredBeforeSubmission: purchaseRequest.approval_required,
      directorApprovalRequiredBeforeSubmission: purchaseRequest.director_approval_required,
      status: purchaseRequest.status,
      statusLabel: getPurchaseRequestStatusLabel(purchaseRequest.status as Parameters<typeof getPurchaseRequestStatusLabel>[0]),
      createdAt: purchaseRequest.created_at,
      updatedAt: purchaseRequest.updated_at,
      createdBy: purchaseRequest.created_by,
      updatedBy: purchaseRequest.updated_by
    },
    unit: unit
      ? {
          id: unit.id,
          code: unit.code,
          name: unit.name
        }
      : null,
    department: department
      ? {
          id: department.id,
          code: department.code,
          name: department.name
        }
      : null,
    costCenter: costCenter
      ? {
          id: costCenter.id,
          code: costCenter.code,
          name: costCenter.name
        }
      : null,
    items: requestItems.map(mapRequestItem),
    selectedQuote: selectedQuotePayload,
    selectedSupplier: mapSupplier(selectedSupplier),
    recommendedQuote: recommendedQuote ? quotePayloads.find((quote) => quote.id === recommendedQuote.id) ?? null : null,
    recommendation: {
      recommendedQuoteId: recommendedQuote?.id ?? null,
      selectedQuoteId: selectedQuote.id,
      isSelectedQuoteRecommended: recommendedQuote?.id === selectedQuote.id,
      reason: recommendationReason,
      ignoredSupersededQuotes: quotes.filter((quote) => quote.superseded_by_quote_id || quote.superseded_at).map((quote) => quote.id)
    },
    quotes: quotePayloads,
    attachments: {
      selectedQuote: (attachmentsByQuoteId.get(selectedQuote.id) ?? []).map(mapAttachment),
      allQuotes: ((attachmentsResult.data ?? []) as AttachmentRow[]).map(mapAttachment)
    }
  };

  const { data: snapshot, error: snapshotError } = await supabase
    .from("purchase_approval_snapshots")
    .insert({
      organization_id: purchaseRequest.organization_id,
      unit_id: purchaseRequest.unit_id,
      purchase_request_id: purchaseRequest.id,
      selected_quote_id: selectedQuote.id,
      selected_supplier_id: selectedQuote.supplier_id,
      snapshot_number: snapshotNumber,
      snapshot_status: "pending",
      approval_status_at_creation: approvalStatusAtCreation,
      approval_rule: PURCHASE_APPROVAL_SNAPSHOT_RULE,
      approval_level: approvalLevel,
      total_amount: roundMoney(totalAmount),
      currency: "BRL",
      is_selected_quote_recommended: recommendedQuote?.id === selectedQuote.id,
      recommendation_reason: recommendationReason,
      submitted_by: submittedBy,
      submitted_at: now,
      snapshot_payload: snapshotPayload,
      created_at: now,
      updated_at: now,
      created_by: submittedBy,
      updated_by: submittedBy
    })
    .select("id, snapshot_number")
    .single();

  if (snapshotError) {
    if (snapshotError.code === "23505") {
      throw new PurchaseApprovalSnapshotError("Já existe um dossiê formal aguardando aprovação para esta compra.", 409);
    }

    throw new PurchaseApprovalSnapshotError("Não foi possível criar o dossiê formal da aprovação.", 500);
  }

  return snapshot as CreatedPurchaseApprovalSnapshot;
}
