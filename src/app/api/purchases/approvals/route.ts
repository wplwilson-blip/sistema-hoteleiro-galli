import { NextResponse } from "next/server";
import { PURCHASES_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPurchaseApprovalLevel, getPurchaseApprovalLevelLabel, type PurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import { getPurchasePriorityLabel, getPurchaseRequestStatusLabel, getPurchaseRequestTypeLabel, getPurchaseUnitOfMeasureLabel, type PurchaseUnitOfMeasure } from "@/lib/purchases/schemas";
import { getPurchaseQuoteStatusLabel, getPurchaseQuoteStatusTone } from "@/lib/purchases/quote-schemas";
import { ATTACHMENTS_BUCKET, createSignedAttachmentUrl, mapAttachment, type AttachmentRow } from "@/lib/attachments/api";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;
type SnapshotStatus = PurchaseApprovalStatus | "superseded";

type ApprovalSnapshotRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  purchase_request_id: string;
  snapshot_number: number;
  snapshot_status: SnapshotStatus;
  approval_level: PurchaseApprovalLevel;
  total_amount: string | number;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision: Exclude<PurchaseApprovalStatus, "pending"> | null;
  decision_reason: string | null;
  snapshot_payload: SnapshotPayload;
  created_at: string;
};

type SnapshotPayload = {
  generatedAt?: string;
  approval?: {
    level?: PurchaseApprovalLevel | string | null;
    levelLabel?: string | null;
    totalAmount?: number | string | null;
    currency?: string | null;
  };
  submittedBy?: {
    id?: string | null;
    displayName?: string | null;
    username?: string | null;
  } | null;
  request?: {
    id?: string | null;
    organizationId?: string | null;
    unitId?: string | null;
    departmentId?: string | null;
    requestedBy?: {
      id?: string | null;
      displayName?: string | null;
      username?: string | null;
    } | null;
    requestNumber?: string | null;
    title?: string | null;
    justification?: string | null;
    requestType?: string | null;
    requestTypeLabel?: string | null;
    priority?: string | null;
    priorityLabel?: string | null;
    status?: string | null;
    statusLabel?: string | null;
    createdAt?: string | null;
  };
  unit?: {
    id?: string | null;
    code?: string | null;
    name?: string | null;
  } | null;
  department?: {
    id?: string | null;
    code?: string | null;
    name?: string | null;
  } | null;
  items?: SnapshotItem[];
  selectedQuote?: SnapshotQuote | null;
  recommendedQuote?: SnapshotQuote | null;
  quotes?: SnapshotQuote[];
  recommendation?: {
    isSelectedQuoteRecommended?: boolean | null;
  };
};

type SnapshotQuote = {
  id?: string | null;
  supplier?: SnapshotSupplier | null;
  quoteNumber?: string | null;
  totalAmount?: number | string | null;
  deliveryDays?: number | string | null;
  paymentTerms?: string | null;
  isSelected?: boolean | null;
  isRecommended?: boolean | null;
  status?: string | null;
  statusLabel?: string | null;
  createdAt?: string | null;
  attachments?: SnapshotAttachment[];
  evidence?: SnapshotQuoteEvidence | null;
};

type SnapshotQuoteEvidence = {
  quoteSourceType?: string | null;
  quoteSourceTypeLabel?: string | null;
  evidenceType?: string | null;
  evidenceTypeLabel?: string | null;
  evidenceConfidence?: string | null;
  evidenceConfidenceLabel?: string | null;
  sourceContactName?: string | null;
  sourceContactChannel?: string | null;
  sourceContactChannelLabel?: string | null;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  sourceNotes?: string | null;
  evidenceMissingReason?: string | null;
  requiresAttachment?: boolean | null;
  requiresJustification?: boolean | null;
  hasFormalEvidence?: boolean | null;
  isVerbalQuote?: boolean | null;
  isEmergencyQuote?: boolean | null;
  emergencyReason?: string | null;
  regularizationRequired?: boolean | null;
  regularizationDeadline?: string | null;
  documentaryClassification?: string | null;
  documentaryClassificationLabel?: string | null;
  documentaryClassificationSeverity?: string | null;
  documentaryClassificationReason?: string | null;
  requiresDirectorApproval?: boolean | null;
  auditAlerts?: string[];
};

type SnapshotSupplier = {
  id?: string | null;
  name?: string | null;
  tradeName?: string | null;
  documentNumber?: string | null;
  status?: string | null;
};

type SnapshotAttachment = {
  id?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | string | null;
  storageBucket?: string | null;
  description?: string | null;
  createdAt?: string | null;
};

type SnapshotItem = {
  id?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unitOfMeasureLabel?: string | null;
  notes?: string | null;
};

type DecisionRow = {
  id: string;
  purchase_request_id: string;
  purchase_quote_id: string | null;
  approval_level: PurchaseApprovalLevel;
  decision: "approved" | "rejected" | "returned_to_purchases";
  justification: string | null;
  decided_by: string | null;
  decided_at: string;
};

type UserRow = { id: string; display_name: string; username: string };

type ApprovalRequestRow = {
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
  status: string;
  total_approved_amount: string | number;
  approval_required: boolean;
  director_approval_required: boolean;
  approval_status: PurchaseApprovalStatus | null;
  approval_level: PurchaseApprovalLevel | null;
  approval_decided_at: string | null;
  approval_decided_by: string | null;
  approval_decision_notes: string | null;
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
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  superseded_by_quote_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApprovalAttachmentRow = AttachmentRow;

type SupplierRow = {
  id: string;
  name: string;
  trade_name: string | null;
  document_number: string | null;
  status: "active" | "inactive" | "archived";
};

type RequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_description: string;
  quantity: string | number;
  unit_of_measure: string;
  notes: string | null;
};

type UnitRow = { id: string; code: string; name: string };
type DepartmentRow = { id: string; code: string; name: string };

function hasFormalApprovalStatus(row: ApprovalRequestRow): row is ApprovalRequestRow & { approval_status: PurchaseApprovalStatus } {
  return row.approval_status !== null;
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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

function isValidQuoteForRecommendation(quote: PurchaseQuoteRow) {
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

function normalizeApprovalStatus(status: SnapshotStatus): PurchaseApprovalStatus {
  return status === "superseded" ? "returned_to_purchases" : status;
}

function mapSnapshotSupplier(supplier: SnapshotSupplier | null | undefined) {
  return {
    supplierName: supplier?.name ?? "",
    supplierTradeName: supplier?.tradeName ?? "",
    supplierDocumentNumber: supplier?.documentNumber ?? "",
    supplierStatus: supplier?.status ?? "active"
  };
}

async function mapSnapshotAttachment(supabase: SupabaseAdmin, attachment: SnapshotAttachment) {
  const filePath = attachment.filePath ?? "";
  const storageBucket = attachment.storageBucket ?? ATTACHMENTS_BUCKET;
  const signedUrl = filePath ? await createSignedAttachmentUrl(supabase, storageBucket, filePath) : undefined;

  return {
    id: attachment.id ?? filePath,
    fileName: attachment.fileName ?? "Anexo",
    fileMimeType: attachment.fileMimeType ?? "",
    fileSizeBytes: toNumber(attachment.fileSizeBytes),
    description: attachment.description ?? "",
    createdAt: attachment.createdAt ?? "",
    signedUrl
  };
}

async function mapSnapshotQuote(supabase: SupabaseAdmin, quote: SnapshotQuote | null | undefined) {
  if (!quote) {
    return null;
  }

  const totalAmount = toNumber(quote.totalAmount);
  const attachments = await Promise.all((quote.attachments ?? []).map((attachment) => mapSnapshotAttachment(supabase, attachment)));

  return {
    id: quote.id ?? "",
    ...mapSnapshotSupplier(quote.supplier),
    quoteNumber: quote.quoteNumber ?? "",
    totalAmount,
    totalAmountLabel: formatMoney(totalAmount),
    deliveryDays: quote.deliveryDays ?? "",
    paymentTerms: quote.paymentTerms ?? "",
    isSelected: Boolean(quote.isSelected),
    statusLabel: quote.statusLabel ?? quote.status ?? "",
    evidence: quote.evidence ?? null,
    attachments
  };
}

function mapLegacyQuote(row: PurchaseQuoteRow | null | undefined, supplier?: SupplierRow, attachments: ReturnType<typeof mapAttachment>[] = []) {
  if (!row) {
    return null;
  }

  const total = toNumber(row.total_amount);

  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: supplier?.name ?? "",
    supplierTradeName: supplier?.trade_name ?? "",
    supplierDocumentNumber: supplier?.document_number ?? "",
    supplierStatus: supplier?.status ?? "active",
    quoteNumber: row.quote_number,
    totalAmount: total,
    totalAmountLabel: formatMoney(total),
    deliveryDays: row.delivery_days ?? "",
    paymentTerms: row.payment_terms ?? "",
    isSelected: row.is_selected,
    status: row.status,
    statusLabel: getPurchaseQuoteStatusLabel(row.status),
    statusTone: getPurchaseQuoteStatusTone(row.status),
    createdAt: row.created_at,
    attachments
  };
}

export async function GET(request: Request) {
  const { context, response } = await requirePermission(PURCHASES_PERMISSIONS.approvalsView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const levelFilter = url.searchParams.get("level");
    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;

    let requestQuery = supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, department_id, requested_by, request_number, title, justification, request_type, priority, status, total_approved_amount, approval_required, director_approval_required, approval_status, approval_level, approval_decided_at, approval_decided_by, approval_decision_notes, created_at")
      .in("unit_id", accessibleUnitIds)
      .eq("approval_required", true)
      .gt("total_approved_amount", 0)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected" || statusFilter === "returned_to_purchases") {
      requestQuery = requestQuery.eq("approval_status", statusFilter);
    }

    if (levelFilter === "administrative_management" || levelFilter === "general_directorate") {
      requestQuery = requestQuery.eq("approval_level", levelFilter);
    }

    const { data: requestRows, error: requestError } = await requestQuery;

    if (requestError) {
      logBaseCadastroError("purchase_approvals.request_list_failed", requestError);
      return apiError("Nao foi possivel carregar aprovacoes de compras.", 500);
    }

    const approvalRequests = ((requestRows ?? []) as ApprovalRequestRow[]).filter(hasFormalApprovalStatus);
    const approvalRequestIds = approvalRequests.map((requestRow) => requestRow.id);
    let snapshotQuery = supabase
      .from("purchase_approval_snapshots")
      .select(
        "id, organization_id, unit_id, purchase_request_id, snapshot_number, snapshot_status, approval_level, total_amount, submitted_at, decided_by, decided_at, decision, decision_reason, snapshot_payload, created_at"
      )
      .is("deleted_at", null)
      .neq("snapshot_status", "superseded")
      .order("submitted_at", { ascending: false });

    if (approvalRequestIds.length) {
      snapshotQuery = snapshotQuery.in("purchase_request_id", approvalRequestIds);
    } else {
      snapshotQuery = snapshotQuery.in("purchase_request_id", ["00000000-0000-0000-0000-000000000000"]);
    }

    if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected" || statusFilter === "returned_to_purchases") {
      snapshotQuery = snapshotQuery.eq("snapshot_status", statusFilter);
    }

    if (levelFilter === "administrative_management" || levelFilter === "general_directorate") {
      snapshotQuery = snapshotQuery.eq("approval_level", levelFilter);
    }

    const { data: snapshotRows, error: snapshotError } = await snapshotQuery;

    if (snapshotError) {
      logBaseCadastroError("purchase_approvals.snapshot_list_failed", snapshotError);
      return apiError("Nao foi possivel carregar dossies formais de aprovacao.", 500);
    }

    const snapshots = (snapshotRows ?? []) as ApprovalSnapshotRow[];
    const snapshotRequestIds = new Set(snapshots.map((snapshot) => snapshot.purchase_request_id));
    const legacyRequests = approvalRequests.filter((requestRow) => !snapshotRequestIds.has(requestRow.id));
    const legacyRequestIds = legacyRequests.map((item) => item.id);
    const requestIds = Array.from(new Set([...Array.from(snapshotRequestIds), ...legacyRequestIds]));
    const decisionUserIds = new Set<string>();

    const { data: decisions, error: decisionsError } = requestIds.length
      ? await supabase
          .from("purchase_approval_decisions")
          .select("id, purchase_request_id, purchase_quote_id, approval_level, decision, justification, decided_by, decided_at")
          .in("purchase_request_id", requestIds)
          .order("decided_at", { ascending: false })
      : { data: [], error: null };

    if (decisionsError) {
      logBaseCadastroError("purchase_approvals.decisions_list_failed", decisionsError);
      return apiError("Nao foi possivel carregar historico de decisoes das aprovacoes.", 500);
    }

    for (const decision of (decisions ?? []) as DecisionRow[]) {
      if (decision.decided_by) {
        decisionUserIds.add(decision.decided_by);
      }
    }

    for (const snapshot of snapshots) {
      if (snapshot.decided_by) {
        decisionUserIds.add(snapshot.decided_by);
      }
    }

    for (const legacyRequest of legacyRequests) {
      if (legacyRequest.requested_by) {
        decisionUserIds.add(legacyRequest.requested_by);
      }

      if (legacyRequest.approval_decided_by) {
        decisionUserIds.add(legacyRequest.approval_decided_by);
      }
    }

    const { data: users } = decisionUserIds.size
      ? await supabase.from("app_users").select("id, display_name, username").in("id", Array.from(decisionUserIds))
      : { data: [] };

    const usersById = new Map(((users ?? []) as UserRow[]).map((user) => [user.id, user]));
    const decisionsByRequest = new Map<string, DecisionRow[]>();

    for (const decision of (decisions ?? []) as DecisionRow[]) {
      decisionsByRequest.set(decision.purchase_request_id, [...(decisionsByRequest.get(decision.purchase_request_id) ?? []), decision]);
    }

    const legacyUnitIds = Array.from(new Set(legacyRequests.map((item) => item.unit_id)));
    const legacyDepartmentIds = Array.from(new Set(legacyRequests.map((item) => item.department_id).filter(Boolean))) as string[];
    const [
      { data: legacyQuoteRows, error: legacyQuoteError },
      { data: legacyItemRows, error: legacyItemError },
      { data: legacyUnits },
      { data: legacyDepartments }
    ] = await Promise.all([
      legacyRequestIds.length
        ? supabase
            .from("purchase_quotes")
            .select("id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, status, superseded_by_quote_id, superseded_at, created_at, updated_at")
            .in("purchase_request_id", legacyRequestIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      legacyRequestIds.length
        ? supabase
            .from("purchase_request_items")
            .select("id, purchase_request_id, item_description, quantity, unit_of_measure, notes")
            .in("purchase_request_id", legacyRequestIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      legacyUnitIds.length ? supabase.from("units").select("id, code, name").in("id", legacyUnitIds) : Promise.resolve({ data: [], error: null }),
      legacyDepartmentIds.length ? supabase.from("departments").select("id, code, name").in("id", legacyDepartmentIds) : Promise.resolve({ data: [], error: null })
    ]);

    if (legacyQuoteError) {
      logBaseCadastroError("purchase_approvals.legacy_quote_list_failed", legacyQuoteError);
      return apiError("Nao foi possivel carregar cotacoes das aprovacoes legadas.", 500);
    }

    if (legacyItemError) {
      logBaseCadastroError("purchase_approvals.legacy_items_list_failed", legacyItemError);
      return apiError("Nao foi possivel carregar itens das aprovacoes legadas.", 500);
    }

    const legacyQuotes = (legacyQuoteRows ?? []) as PurchaseQuoteRow[];
    const legacySupplierIds = Array.from(new Set(legacyQuotes.map((quote) => quote.supplier_id)));
    const { data: legacySuppliers, error: legacySuppliersError } = legacySupplierIds.length
      ? await supabase.from("suppliers").select("id, name, trade_name, document_number, status").in("id", legacySupplierIds)
      : { data: [], error: null };

    if (legacySuppliersError) {
      logBaseCadastroError("purchase_approvals.legacy_suppliers_list_failed", legacySuppliersError);
      return apiError("Nao foi possivel carregar fornecedores das aprovacoes legadas.", 500);
    }

    const legacyQuotesByRequest = new Map<string, PurchaseQuoteRow[]>();
    for (const quote of legacyQuotes) {
      legacyQuotesByRequest.set(quote.purchase_request_id, [...(legacyQuotesByRequest.get(quote.purchase_request_id) ?? []), quote]);
    }

    const legacyItemsByRequest = new Map<string, RequestItemRow[]>();
    for (const item of (legacyItemRows ?? []) as RequestItemRow[]) {
      legacyItemsByRequest.set(item.purchase_request_id, [...(legacyItemsByRequest.get(item.purchase_request_id) ?? []), item]);
    }

    const legacyUnitsById = new Map(((legacyUnits ?? []) as UnitRow[]).map((unit) => [unit.id, unit]));
    const legacyDepartmentsById = new Map(((legacyDepartments ?? []) as DepartmentRow[]).map((department) => [department.id, department]));
    const legacySuppliersById = new Map(((legacySuppliers ?? []) as SupplierRow[]).map((supplier) => [supplier.id, supplier]));
    const legacyQuoteIds = legacyQuotes.map((quote) => quote.id);
    const { data: legacyAttachmentRows, error: legacyAttachmentsError } = legacyQuoteIds.length
      ? await supabase
          .from("attachments")
          .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
          .eq("module", "purchases")
          .eq("entity_type", "purchase_quote")
          .in("entity_id", legacyQuoteIds)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (legacyAttachmentsError) {
      logBaseCadastroError("purchase_approvals.legacy_attachments_list_failed", legacyAttachmentsError);
      return apiError("Nao foi possivel carregar anexos das aprovacoes legadas.", 500);
    }

    const legacyAttachmentsByQuote = new Map<string, ReturnType<typeof mapAttachment>[]>();
    for (const attachment of (legacyAttachmentRows ?? []) as ApprovalAttachmentRow[]) {
      const signedUrl = await createSignedAttachmentUrl(supabase, attachment.storage_bucket ?? ATTACHMENTS_BUCKET, attachment.file_path);
      legacyAttachmentsByQuote.set(attachment.entity_id, [...(legacyAttachmentsByQuote.get(attachment.entity_id) ?? []), mapAttachment(attachment, signedUrl)]);
    }

    const snapshotApprovals = await Promise.all(
      snapshots.map(async (snapshot) => {
        const payload = snapshot.snapshot_payload ?? {};
        const requestPayload = payload.request ?? {};
        const unitPayload = payload.unit ?? null;
        const departmentPayload = payload.department ?? null;
        const approvalStatus = normalizeApprovalStatus(snapshot.snapshot_status);
        const approvalLevel = snapshot.approval_level;
        const winningQuote = await mapSnapshotQuote(supabase, payload.selectedQuote ?? null);
        const recommendedQuote = await mapSnapshotQuote(supabase, payload.recommendedQuote ?? null);
        const quotes = (await Promise.all((payload.quotes ?? []).map((quote) => mapSnapshotQuote(supabase, quote)))).filter(Boolean);
        const decidedBy = snapshot.decided_by ? usersById.get(snapshot.decided_by) : null;

        return {
          id: snapshot.id,
          purchaseRequestId: snapshot.purchase_request_id,
          snapshotNumber: snapshot.snapshot_number,
          organizationId: snapshot.organization_id,
          unitId: snapshot.unit_id,
          unitName: unitPayload?.name ?? "",
          unitCode: unitPayload?.code ?? "",
          departmentId: requestPayload.departmentId ?? "",
          departmentName: departmentPayload?.name ?? "",
          departmentCode: departmentPayload?.code ?? "",
          requestedByName: requestPayload.requestedBy?.displayName ?? "",
          requestNumber: requestPayload.requestNumber ?? "",
          title: requestPayload.title ?? "",
          justification: requestPayload.justification ?? "",
          requestType: requestPayload.requestType ?? "",
          requestTypeLabel: requestPayload.requestTypeLabel ?? "",
          priority: requestPayload.priority ?? "",
          priorityLabel: requestPayload.priorityLabel ?? "",
          status: requestPayload.status ?? "",
          statusLabel: requestPayload.statusLabel ?? "",
          totalApprovedAmount: toNumber(payload.approval?.totalAmount ?? snapshot.total_amount),
          totalApprovedAmountLabel: formatMoney(toNumber(payload.approval?.totalAmount ?? snapshot.total_amount)),
          approvalStatus,
          approvalLevel,
          approvalLevelLabel: payload.approval?.levelLabel ?? getPurchaseApprovalLevelLabel(approvalLevel),
          approvalDecidedAt: snapshot.decided_at ?? "",
          approvalDecisionNotes: snapshot.decision_reason ?? "",
          approvalDecidedByName: decidedBy?.display_name ?? "",
          createdAt: requestPayload.createdAt ?? snapshot.created_at,
          submittedAt: snapshot.submitted_at,
          winningQuote,
          recommendedQuote,
          quotes,
          winnerDiffersFromRecommended: Boolean(payload.recommendation && payload.recommendation.isSelectedQuoteRecommended === false),
          items: (payload.items ?? []).map((item) => ({
            id: item.id ?? "",
            description: item.description ?? "",
            quantity: toNumber(item.quantity),
            unitOfMeasureLabel: item.unitOfMeasureLabel ?? "",
            notes: item.notes ?? ""
          })),
          decisions: (decisionsByRequest.get(snapshot.purchase_request_id) ?? []).map((decision) => ({
            id: decision.id,
            purchaseQuoteId: decision.purchase_quote_id ?? "",
            approvalLevel: decision.approval_level,
            approvalLevelLabel: getPurchaseApprovalLevelLabel(decision.approval_level),
            decision: decision.decision,
            justification: decision.justification ?? "",
            decidedByName: decision.decided_by ? usersById.get(decision.decided_by)?.display_name ?? "" : "",
            decidedAt: decision.decided_at
          }))
        };
      })
    );

    const legacyApprovals = legacyRequests.map((approvalRequest) => {
      const requestQuotes = legacyQuotesByRequest.get(approvalRequest.id) ?? [];
      const winningQuote = requestQuotes.find((quote) => quote.is_selected) ?? null;
      const recommendedQuote = [...requestQuotes.filter(isValidQuoteForRecommendation)].sort(compareRecommendedQuotes)[0] ?? null;
      const approvalLevel = approvalRequest.approval_level ?? getPurchaseApprovalLevel(toNumber(approvalRequest.total_approved_amount));
      const decidedBy = approvalRequest.approval_decided_by ? usersById.get(approvalRequest.approval_decided_by) : null;
      const requester = approvalRequest.requested_by ? usersById.get(approvalRequest.requested_by) : null;
      const unit = legacyUnitsById.get(approvalRequest.unit_id);
      const department = approvalRequest.department_id ? legacyDepartmentsById.get(approvalRequest.department_id) : null;

      return {
        id: `legacy-${approvalRequest.id}`,
        purchaseRequestId: approvalRequest.id,
        snapshotNumber: 0,
        isLegacyWithoutSnapshot: true,
        organizationId: approvalRequest.organization_id,
        unitId: approvalRequest.unit_id,
        unitName: unit?.name ?? "",
        unitCode: unit?.code ?? "",
        departmentId: approvalRequest.department_id ?? "",
        departmentName: department?.name ?? "",
        departmentCode: department?.code ?? "",
        requestedByName: requester?.display_name ?? "",
        requestNumber: approvalRequest.request_number,
        title: approvalRequest.title,
        justification: approvalRequest.justification,
        requestType: approvalRequest.request_type,
        requestTypeLabel: getPurchaseRequestTypeLabel(approvalRequest.request_type),
        priority: approvalRequest.priority,
        priorityLabel: getPurchasePriorityLabel(approvalRequest.priority),
        status: approvalRequest.status,
        statusLabel: getPurchaseRequestStatusLabel(approvalRequest.status as Parameters<typeof getPurchaseRequestStatusLabel>[0]),
        totalApprovedAmount: toNumber(approvalRequest.total_approved_amount),
        totalApprovedAmountLabel: formatMoney(toNumber(approvalRequest.total_approved_amount)),
        approvalStatus: approvalRequest.approval_status,
        approvalLevel,
        approvalLevelLabel: getPurchaseApprovalLevelLabel(approvalLevel),
        approvalDecidedAt: approvalRequest.approval_decided_at ?? "",
        approvalDecisionNotes: approvalRequest.approval_decision_notes ?? "",
        approvalDecidedByName: decidedBy?.display_name ?? "",
        createdAt: approvalRequest.created_at,
        submittedAt: approvalRequest.created_at,
        winningQuote: mapLegacyQuote(winningQuote, winningQuote ? legacySuppliersById.get(winningQuote.supplier_id) : undefined, winningQuote ? legacyAttachmentsByQuote.get(winningQuote.id) ?? [] : []),
        recommendedQuote: mapLegacyQuote(recommendedQuote, recommendedQuote ? legacySuppliersById.get(recommendedQuote.supplier_id) : undefined, recommendedQuote ? legacyAttachmentsByQuote.get(recommendedQuote.id) ?? [] : []),
        quotes: requestQuotes.map((quote) => mapLegacyQuote(quote, legacySuppliersById.get(quote.supplier_id), legacyAttachmentsByQuote.get(quote.id) ?? [])).filter(Boolean),
        winnerDiffersFromRecommended: Boolean(winningQuote && recommendedQuote && winningQuote.id !== recommendedQuote.id),
        items: (legacyItemsByRequest.get(approvalRequest.id) ?? []).map((item) => ({
          id: item.id,
          description: item.item_description,
          quantity: toNumber(item.quantity),
          unitOfMeasure: item.unit_of_measure,
          unitOfMeasureLabel: getPurchaseUnitOfMeasureLabel(item.unit_of_measure as PurchaseUnitOfMeasure),
          notes: item.notes ?? ""
        })),
        decisions: (decisionsByRequest.get(approvalRequest.id) ?? []).map((decision) => ({
          id: decision.id,
          purchaseQuoteId: decision.purchase_quote_id ?? "",
          approvalLevel: decision.approval_level,
          approvalLevelLabel: getPurchaseApprovalLevelLabel(decision.approval_level),
          decision: decision.decision,
          justification: decision.justification ?? "",
          decidedByName: decision.decided_by ? usersById.get(decision.decided_by)?.display_name ?? "" : "",
          decidedAt: decision.decided_at
        }))
      };
    });

    const approvals = [...snapshotApprovals, ...legacyApprovals].sort((left, right) => {
      const leftTime = new Date(left.submittedAt || left.createdAt).getTime();
      const rightTime = new Date(right.submittedAt || right.createdAt).getTime();

      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });

    return NextResponse.json({ ok: true, approvals });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar aprovacoes de compras.", 500);
  }
}
