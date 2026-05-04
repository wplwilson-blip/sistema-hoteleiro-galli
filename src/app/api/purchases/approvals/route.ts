import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireSuperAdminRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPurchaseApprovalLevel, getPurchaseApprovalLevelLabel, type PurchaseApprovalLevel, type PurchaseApprovalStatus } from "@/lib/purchases/api";
import { getPurchasePriorityLabel, getPurchaseRequestStatusLabel, getPurchaseRequestTypeLabel, getPurchaseUnitOfMeasureLabel, type PurchaseUnitOfMeasure } from "@/lib/purchases/schemas";
import { getPurchaseQuoteStatusLabel, getPurchaseQuoteStatusTone } from "@/lib/purchases/quote-schemas";
import { ATTACHMENTS_BUCKET, createSignedAttachmentUrl, mapAttachment, type AttachmentRow } from "@/lib/attachments/api";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

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
type UserRow = { id: string; display_name: string; username: string };
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

function mapQuote(row: PurchaseQuoteRow | null | undefined, supplier?: SupplierRow, attachments: ReturnType<typeof mapAttachment>[] = []) {
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
  const { session, response } = await requireSuperAdminRequest();

  if (response || !session) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const levelFilter = url.searchParams.get("level");
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    let query = supabase
      .from("purchase_requests")
      .select("id, organization_id, unit_id, department_id, requested_by, request_number, title, justification, request_type, priority, status, total_approved_amount, approval_required, director_approval_required, approval_status, approval_level, approval_decided_at, approval_decided_by, approval_decision_notes, created_at")
      .in("unit_id", accessibleUnitIds)
      .eq("approval_required", true)
      .gt("total_approved_amount", 0)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected" || statusFilter === "returned_to_purchases") {
      query = query.eq("approval_status", statusFilter);
    }

    if (levelFilter === "administrative_management" || levelFilter === "general_directorate") {
      query = query.eq("approval_level", levelFilter);
    }

    const { data: requestRows, error: requestError } = await query;

    if (requestError) {
      logBaseCadastroError("purchase_approvals.request_list_failed", requestError);
      return apiError("Não foi possível carregar aprovações de compras.", 500);
    }

    const requests = (requestRows ?? []) as ApprovalRequestRow[];
    const requestIds = requests.map((item) => item.id);
    const unitIds = Array.from(new Set(requests.map((item) => item.unit_id)));
    const departmentIds = Array.from(new Set(requests.map((item) => item.department_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set([...requests.map((item) => item.requested_by), ...requests.map((item) => item.approval_decided_by)].filter(Boolean))) as string[];

    const [{ data: quoteRows, error: quoteError }, { data: itemRows, error: itemError }, { data: units }, { data: departments }, { data: users }, { data: decisions }] = await Promise.all([
      requestIds.length
        ? supabase
            .from("purchase_quotes")
            .select("id, purchase_request_id, supplier_id, quote_number, quote_date, valid_until, total_amount, delivery_days, payment_terms, is_selected, status, superseded_by_quote_id, superseded_at, created_at, updated_at")
            .in("purchase_request_id", requestIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      requestIds.length
        ? supabase
            .from("purchase_request_items")
            .select("id, purchase_request_id, item_description, quantity, unit_of_measure, notes")
            .in("purchase_request_id", requestIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      unitIds.length ? supabase.from("units").select("id, code, name").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
      departmentIds.length ? supabase.from("departments").select("id, code, name").in("id", departmentIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? supabase.from("app_users").select("id, display_name, username").in("id", userIds) : Promise.resolve({ data: [], error: null }),
      requestIds.length
        ? supabase
            .from("purchase_approval_decisions")
            .select("id, purchase_request_id, purchase_quote_id, approval_level, decision, justification, decided_by, decided_at")
            .in("purchase_request_id", requestIds)
            .order("decided_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);

    if (quoteError) {
      logBaseCadastroError("purchase_approvals.quote_list_failed", quoteError);
      return apiError("Não foi possível carregar cotações das aprovações.", 500);
    }

    if (itemError) {
      logBaseCadastroError("purchase_approvals.items_list_failed", itemError);
      return apiError("Não foi possível carregar itens das aprovações.", 500);
    }

    const quotes = (quoteRows ?? []) as PurchaseQuoteRow[];
    const supplierIds = Array.from(new Set(quotes.map((quote) => quote.supplier_id)));
    const { data: suppliers, error: suppliersError } = supplierIds.length
      ? await supabase.from("suppliers").select("id, name, trade_name, document_number, status").in("id", supplierIds)
      : { data: [], error: null };

    if (suppliersError) {
      logBaseCadastroError("purchase_approvals.suppliers_list_failed", suppliersError);
      return apiError("Não foi possível carregar fornecedores das aprovações.", 500);
    }

    const quotesByRequest = new Map<string, PurchaseQuoteRow[]>();
    for (const quote of quotes) {
      quotesByRequest.set(quote.purchase_request_id, [...(quotesByRequest.get(quote.purchase_request_id) ?? []), quote]);
    }

    const itemsByRequest = new Map<string, RequestItemRow[]>();
    for (const item of (itemRows ?? []) as RequestItemRow[]) {
      itemsByRequest.set(item.purchase_request_id, [...(itemsByRequest.get(item.purchase_request_id) ?? []), item]);
    }

    const decisionsByRequest = new Map<string, DecisionRow[]>();
    for (const decision of (decisions ?? []) as DecisionRow[]) {
      decisionsByRequest.set(decision.purchase_request_id, [...(decisionsByRequest.get(decision.purchase_request_id) ?? []), decision]);
    }

    const unitsById = new Map(((units ?? []) as UnitRow[]).map((unit) => [unit.id, unit]));
    const departmentsById = new Map(((departments ?? []) as DepartmentRow[]).map((department) => [department.id, department]));
    const usersById = new Map(((users ?? []) as UserRow[]).map((user) => [user.id, user]));
    const suppliersById = new Map(((suppliers ?? []) as SupplierRow[]).map((supplier) => [supplier.id, supplier]));
    const quoteIds = quotes.map((quote) => quote.id);
    const { data: attachmentRows, error: attachmentsError } = quoteIds.length
      ? await supabase
          .from("attachments")
          .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
          .eq("module", "purchases")
          .eq("entity_type", "purchase_quote")
          .in("entity_id", quoteIds)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    if (attachmentsError) {
      logBaseCadastroError("purchase_approvals.attachments_list_failed", attachmentsError);
      return apiError("Não foi possível carregar anexos das cotações.", 500);
    }

    const attachmentsByQuote = new Map<string, ReturnType<typeof mapAttachment>[]>();
    for (const attachment of (attachmentRows ?? []) as ApprovalAttachmentRow[]) {
      const signedUrl = await createSignedAttachmentUrl(supabase, attachment.storage_bucket ?? ATTACHMENTS_BUCKET, attachment.file_path);
      attachmentsByQuote.set(attachment.entity_id, [...(attachmentsByQuote.get(attachment.entity_id) ?? []), mapAttachment(attachment, signedUrl)]);
    }

    const approvals = requests.map((approvalRequest) => {
      const requestQuotes = quotesByRequest.get(approvalRequest.id) ?? [];
      const winningQuote = requestQuotes.find((quote) => quote.is_selected) ?? null;
      const recommendedQuote = [...requestQuotes.filter(isValidQuoteForRecommendation)].sort(compareRecommendedQuotes)[0] ?? null;
      const approvalLevel = approvalRequest.approval_level ?? getPurchaseApprovalLevel(toNumber(approvalRequest.total_approved_amount));
      const decidedBy = approvalRequest.approval_decided_by ? usersById.get(approvalRequest.approval_decided_by) : null;
      const requester = approvalRequest.requested_by ? usersById.get(approvalRequest.requested_by) : null;
      const unit = unitsById.get(approvalRequest.unit_id);
      const department = approvalRequest.department_id ? departmentsById.get(approvalRequest.department_id) : null;

      return {
        id: approvalRequest.id,
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
        statusLabel: getPurchaseRequestStatusLabel(approvalRequest.status as any),
        totalApprovedAmount: toNumber(approvalRequest.total_approved_amount),
        totalApprovedAmountLabel: formatMoney(toNumber(approvalRequest.total_approved_amount)),
        approvalStatus: approvalRequest.approval_status ?? "pending",
        approvalLevel,
        approvalLevelLabel: getPurchaseApprovalLevelLabel(approvalLevel),
        approvalDecidedAt: approvalRequest.approval_decided_at ?? "",
        approvalDecisionNotes: approvalRequest.approval_decision_notes ?? "",
        approvalDecidedByName: decidedBy?.display_name ?? "",
        createdAt: approvalRequest.created_at,
        winningQuote: mapQuote(winningQuote, winningQuote ? suppliersById.get(winningQuote.supplier_id) : undefined, winningQuote ? attachmentsByQuote.get(winningQuote.id) ?? [] : []),
        recommendedQuote: mapQuote(recommendedQuote, recommendedQuote ? suppliersById.get(recommendedQuote.supplier_id) : undefined, recommendedQuote ? attachmentsByQuote.get(recommendedQuote.id) ?? [] : []),
        quotes: requestQuotes.map((quote) => mapQuote(quote, suppliersById.get(quote.supplier_id), attachmentsByQuote.get(quote.id) ?? [])).filter(Boolean),
        winnerDiffersFromRecommended: Boolean(winningQuote && recommendedQuote && winningQuote.id !== recommendedQuote.id),
        items: (itemsByRequest.get(approvalRequest.id) ?? []).map((item) => ({
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

    return NextResponse.json({ ok: true, approvals });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível carregar aprovações de compras.", 500);
  }
}
