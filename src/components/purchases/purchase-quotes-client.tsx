"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Ban, Check, Paperclip, Pencil, Plus, RotateCcw, Search, Trash2, Truck, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, LoadingTable, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/status-badge";
import { QuickSupplierDialog, type QuickSupplierRecord } from "@/components/purchases/quick-supplier-dialog";
import { cn } from "@/lib/utils";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestStatusTone,
  getPurchaseRequestTypeLabel
} from "@/lib/purchases/schemas";
import {
  getPurchaseQuoteStatusLabel,
  getPurchaseQuoteStatusTone,
  purchaseQuoteFormSchema,
} from "@/lib/purchases/quote-schemas";
import { z } from "zod";

type PurchaseRequestSummary = {
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

type PurchaseRequestItem = {
  id: string;
  description: string;
  quantity: number;
  unitOfMeasure: string;
  unitOfMeasureLabel: string;
  notes: string;
};

type PurchaseRequestDetail = PurchaseRequestSummary & {
  items: PurchaseRequestItem[];
};

type QuoteQueueFilter = "purchasing_queue" | "quotation" | "winner_selected" | "returned" | "pending_approval" | "finished" | "all";
type QuoteDetailTab = "summary" | "quotes" | "items" | "history";
type QuoteExpandedSection = "details" | "items" | "attachments" | null;

type PurchaseQuoteItem = {
  id: string;
  purchaseRequestItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  deliveryNotes: string;
};

type PurchaseQuoteRecord = {
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
  notes: string;
  status: "received" | "selected" | "rejected" | "expired" | "cancelled";
  statusLabel: string;
  statusTone: "visual" | "warning" | "danger" | "success" | "info";
  quoteRound?: number;
  supersededByQuoteId: string;
  supersededAt: string;
  isSuperseded: boolean;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
  items: PurchaseQuoteItem[];
};

type SupplierRecord = {
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

type AttachmentRecord = {
  id: string;
  module: string;
  entityType: string;
  entityId: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  description: string;
  createdAt: string;
  signedUrl?: string;
};

type PurchaseQuotesResponse = {
  ok: true;
  requests: PurchaseRequestSummary[];
  suppliers: SupplierRecord[];
};

type PurchaseQuoteDetailResponse = {
  ok: true;
  request: PurchaseRequestDetail;
  quotes: PurchaseQuoteRecord[];
  suppliers: SupplierRecord[];
};

type AttachmentsResponse = {
  ok: true;
  attachments: AttachmentRecord[];
};

type SaveQuoteResponse = {
  ok: true;
  quoteId?: string;
  quoteNumber?: string;
};

type QuoteItemFormValue = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  deliveryNotes: string;
};

type PurchaseQuoteFormValues = {
  supplierId: string;
  quoteDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  notes: string;
  isRecurringSupplierQuote: boolean;
  quoteValidityException: boolean;
  quoteValidityExceptionReason: string;
  items: QuoteItemFormValue[];
};

type NegotiationItemFormValue = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: string;
  previousUnitPrice: string;
  unitPrice: string;
  notes: string;
};

type NegotiationFormValues = {
  quoteDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  negotiationNotes: string;
  items: NegotiationItemFormValue[];
};

const purchaseQuoteFormSchemaClient = purchaseQuoteFormSchema;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDecimalInputValue(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalizedNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseLocalizedNumberStrict(value: string | number | null | undefined) {
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

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${bytes} bytes`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeDocumentSearch(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function getSupplierContactLabel(supplier: SupplierRecord) {
  if (supplier.whatsapp) {
    return `WhatsApp: ${supplier.whatsapp}`;
  }

  if (supplier.phone) {
    return `Telefone: ${supplier.phone}`;
  }

  return "";
}

function getSupplierSummaryParts(supplier: SupplierRecord) {
  return [
    supplier.tradeName ? `Nome fantasia: ${supplier.tradeName}` : "",
    supplier.documentNumber ? `Documento: ${supplier.documentNumber}` : "",
    getSupplierContactLabel(supplier)
  ].filter(Boolean);
}

function getPurchaseRequestQuotationFlowStatus(request: PurchaseRequestSummary, hasWinningQuote = request.totalApprovedAmount > 0) {
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

function isPurchaseAwaitingApproval(request: PurchaseRequestSummary) {
  return request.approvalStatus === "pending" && request.approvalRequired && request.totalApprovedAmount > 0;
}

function isPurchaseClosedForQuotation(request: PurchaseRequestSummary) {
  return request.approvalStatus === "approved" || request.approvalStatus === "rejected" || request.status === "approved" || request.status === "rejected" || request.status === "cancelled";
}

function canMutatePurchaseQuotation(request: PurchaseRequestSummary | null | undefined) {
  if (!request) {
    return false;
  }

  if (request.approvalStatus === "returned_to_purchases") {
    return true;
  }

  return request.status === "quotation" && !isPurchaseAwaitingApproval(request) && !isPurchaseClosedForQuotation(request);
}

function requestHasWinnerSelected(request: PurchaseRequestSummary) {
  return request.totalApprovedAmount > 0;
}

function matchesQuoteQueueFilter(request: PurchaseRequestSummary, filter: QuoteQueueFilter) {
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

const quoteQueueFilters: Array<{ value: QuoteQueueFilter; label: string }> = [
  { value: "purchasing_queue", label: "Fila de Compras" },
  { value: "quotation", label: "Em cotação" },
  { value: "winner_selected", label: "Com vencedora selecionada" },
  { value: "returned", label: "Devolvidas para Compras" },
  { value: "pending_approval", label: "Aguardando aprovação" },
  { value: "finished", label: "Finalizadas" },
  { value: "all", label: "Todas" }
];

const quoteDetailTabs: Array<{ value: QuoteDetailTab; label: string }> = [
  { value: "summary", label: "Resumo" },
  { value: "quotes", label: "Cotações" },
  { value: "items", label: "Itens" },
  { value: "history", label: "Histórico" }
];

function isValidQuoteForRecommendation(quote: PurchaseQuoteRecord) {
  return (quote.status === "received" || quote.status === "selected" || quote.status === "rejected") && !quote.isExpired && !quote.isSuperseded;
}

function compareRecommendedQuotes(left: PurchaseQuoteRecord, right: PurchaseQuoteRecord) {
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

function getMostCommonPaymentTerms(quotes: PurchaseQuoteRecord[]) {
  const counts = new Map<string, number>();

  for (const quote of quotes) {
    const terms = quote.paymentTerms.trim();

    if (terms) {
      counts.set(terms, (counts.get(terms) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pt-BR"))[0]?.[0] ?? "";
}

function SupplierCombobox({
  suppliers,
  value,
  onChange,
  disabled
}: {
  suppliers: SupplierRecord[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
  const selectedSupplierSummary = selectedSupplier ? getSupplierSummaryParts(selectedSupplier).join(" • ") : "";
  const normalizedTerm = normalizeSearchValue(term);
  const documentTerm = normalizeDocumentSearch(term);
  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!normalizedTerm && !documentTerm) {
      return true;
    }

    const text = normalizeSearchValue([supplier.name, supplier.tradeName, supplier.documentNumber, supplier.phone, supplier.whatsapp].filter(Boolean).join(" "));
    const documentText = normalizeDocumentSearch([supplier.documentNumber, supplier.phone, supplier.whatsapp].filter(Boolean).join(" "));

    return text.includes(normalizedTerm) || Boolean(documentTerm && documentText.includes(documentTerm));
  });

  function selectSupplier(supplierId: string) {
    onChange(supplierId);
    setTerm("");
    setOpen(false);
  }

  return (
    <div className={cn("relative min-w-0 flex-1", open && "z-[80]")}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="h-auto min-h-10 w-full justify-start px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedSupplier ? selectedSupplier.name : "Selecione um fornecedor"}</p>
          {selectedSupplier ? (
            <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
              {selectedSupplierSummary}
            </p>
          ) : null}
        </div>
      </Button>

      {open ? (
        <div className="absolute left-0 top-full z-[90] mt-2 w-full min-w-[min(32rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-border bg-background p-0 shadow-xl shadow-black/15">
          <div className="border-b border-border bg-background p-3">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Buscar por razão social, nome fantasia, CNPJ/CPF ou telefone"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[22rem] overflow-y-auto bg-background p-2">
            {filteredSuppliers.length ? (
              filteredSuppliers.map((supplier) => {
                const summary = getSupplierSummaryParts(supplier).join(" • ");

                return (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => selectSupplier(supplier.id)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <Check className={supplier.id === value ? "mt-0.5 h-4 w-4 shrink-0 text-primary" : "mt-0.5 h-4 w-4 shrink-0 text-transparent"} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="block truncate text-sm font-semibold text-foreground" title={supplier.name}>
                        {supplier.name}
                      </span>
                      {summary ? (
                        <span className="block truncate text-xs leading-5 text-muted-foreground" title={summary}>
                          {summary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

async function requestFormData<T>(url: string, body: FormData): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    body
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

async function uploadAttachmentToQuote(input: { quoteId: string; file: File; description: string }) {
  const body = new FormData();
  body.append("module", "purchases");
  body.append("entity_type", "purchase_quote");
  body.append("entity_id", input.quoteId);
  body.append("description", input.description);
  body.append("visibility_scope", "unit");
  body.append("file", input.file);

  return requestFormData("/api/attachments", body);
}

function buildDefaultQuoteForm(request: PurchaseRequestDetail | null): PurchaseQuoteFormValues {
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
    items: requestItems.map((item) => ({
      purchaseRequestItemId: item.id,
      itemDescription: item.description,
      quantity: String(item.quantity),
      unitPrice: "",
      deliveryNotes: ""
    })) ?? []
  };
}

function buildEditQuoteForm(quote: PurchaseQuoteRecord): PurchaseQuoteFormValues {
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
    items: quoteItems.map((item) => ({
      purchaseRequestItemId: item.purchaseRequestItemId,
      itemDescription: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      deliveryNotes: item.deliveryNotes
    }))
  };
}

function buildDefaultNegotiationForm(quote: PurchaseQuoteRecord | null): NegotiationFormValues {
  const today = new Date();
  const validUntil = addDays(today, 30);

  return {
    quoteDate: toDateInputValue(today),
    validUntil: toDateInputValue(validUntil),
    deliveryDays: quote?.deliveryDays === "" || quote?.deliveryDays == null ? "" : String(quote.deliveryDays),
    paymentTerms: quote?.paymentTerms ?? "",
    negotiationNotes: "",
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

function getQuoteSupplierLabel(quote: PurchaseQuoteRecord | null) {
  if (!quote) {
    return "";
  }

  return quote.supplierTradeName || quote.supplierName || "Fornecedor não informado";
}

function getQuoteRoundLabel(quote: PurchaseQuoteRecord | null) {
  return `Rodada ${quote?.quoteRound ?? 1}`;
}

function getQuoteHighlight(quote: PurchaseQuoteRecord, isRecommendedQuote: boolean, selectedDiffersFromRecommendation: boolean) {
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

export function PurchaseQuotesClient() {
  const queryClient = useQueryClient();
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<Record<string, File | null>>({});
  const [attachmentDescriptions, setAttachmentDescriptions] = useState<Record<string, string>>({});
  const [pendingQuoteAttachmentFiles, setPendingQuoteAttachmentFiles] = useState<File[]>([]);
  const [pendingQuoteAttachmentDescription, setPendingQuoteAttachmentDescription] = useState("");
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickSuppliers, setQuickSuppliers] = useState<QuickSupplierRecord[]>([]);
  const [negotiationQuote, setNegotiationQuote] = useState<PurchaseQuoteRecord | null>(null);
  const [negotiationForm, setNegotiationForm] = useState<NegotiationFormValues>(() => buildDefaultNegotiationForm(null));
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<QuoteQueueFilter>("purchasing_queue");
  const [detailTab, setDetailTab] = useState<QuoteDetailTab>("summary");
  const [expandedQuoteSections, setExpandedQuoteSections] = useState<Record<string, QuoteExpandedSection>>({});
  const [expandedQuoteActions, setExpandedQuoteActions] = useState<Record<string, boolean>>({});

  const listQuery = useQuery({
    queryKey: ["purchases", "quotes", "requests"],
    queryFn: async () => requestJson<PurchaseQuotesResponse>("/api/purchases/quotes")
  });

  const detailQuery = useQuery({
    queryKey: ["purchases", "quotes", selectedRequestId],
    queryFn: async () => requestJson<PurchaseQuoteDetailResponse>(`/api/purchases/quotes?requestId=${selectedRequestId}`),
    enabled: Boolean(selectedRequestId)
  });

  const quoteForm = useForm<PurchaseQuoteFormValues>({
    resolver: zodResolver(purchaseQuoteFormSchemaClient),
    defaultValues: buildDefaultQuoteForm(null),
    mode: "onTouched",
    reValidateMode: "onChange"
  });

  const { fields, replace } = useFieldArray({
    control: quoteForm.control,
    name: "items"
  });

  const quoteValidityException = useWatch({
    control: quoteForm.control,
    name: "quoteValidityException"
  });

  const requests = useMemo(() => listQuery.data?.requests ?? [], [listQuery.data?.requests]);
  const suppliers = useMemo(() => detailQuery.data?.suppliers ?? listQuery.data?.suppliers ?? [], [detailQuery.data?.suppliers, listQuery.data?.suppliers]);
  const availableSuppliers = useMemo(() => {
    const suppliersById = new Map<string, SupplierRecord>();

    for (const supplier of [...suppliers, ...quickSuppliers]) {
      if (supplier.status === "active") {
        suppliersById.set(supplier.id, supplier);
      }
    }

    return Array.from(suppliersById.values()).sort((a, b) => (a.tradeName || a.name).localeCompare(b.tradeName || b.name, "pt-BR"));
  }, [quickSuppliers, suppliers]);
  const selectedRequest = detailQuery.data?.request?.id === selectedRequestId ? detailQuery.data.request : null;
  const quotes = useMemo(
    () => (detailQuery.data?.request?.id === selectedRequestId ? detailQuery.data.quotes : []),
    [detailQuery.data?.quotes, detailQuery.data?.request?.id, selectedRequestId]
  );
  const quoteIds = useMemo(() => quotes.map((quote) => quote.id), [quotes]);

  const attachmentsQuery = useQuery({
    queryKey: ["attachments", "purchase_quotes", quoteIds],
    queryFn: async () => {
      const entries = await Promise.all(
        quotes.map(async (quote) => {
          const params = new URLSearchParams({
            module: "purchases",
            entity_type: "purchase_quote",
            entity_id: quote.id
          });
          const payload = await requestJson<AttachmentsResponse>(`/api/attachments?${params.toString()}`);
          return [quote.id, payload.attachments] as const;
        })
      );

      return Object.fromEntries(entries) as Record<string, AttachmentRecord[]>;
    },
    enabled: quoteIds.length > 0
  });

  useEffect(() => {
    if (selectedRequestId && requests.length && !requests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId("");
    }
  }, [requests, selectedRequestId]);

  useEffect(() => {
    if (!quoteValidityException) {
      quoteForm.clearErrors("quoteValidityExceptionReason");
    }
  }, [quoteValidityException, quoteForm]);

  function clearQuoteTemporaryState(request: PurchaseRequestDetail | null = selectedRequest) {
    setQuoteFormOpen(false);
    setEditingQuoteId(null);
    setError("");
    setAttachmentMessage("");
    setAttachmentFiles({});
    setAttachmentDescriptions({});
    setPendingQuoteAttachmentFiles([]);
    setPendingQuoteAttachmentDescription("");
    quoteForm.clearErrors();
    const nextValues = buildDefaultQuoteForm(request);
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }

  function closeQuoteForm() {
    clearQuoteTemporaryState();
    setQuickSupplierOpen(false);
  }

  useEffect(() => {
    if (!selectedRequest) {
      return;
    }

    if (!quoteFormOpen || editingQuoteId) {
      return;
    }

    const nextValues = buildDefaultQuoteForm(selectedRequest);
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }, [editingQuoteId, quoteForm, quoteFormOpen, replace, selectedRequest]);

  useEffect(() => {
    if (quoteFormOpen && !selectedRequest) {
      setQuoteFormOpen(false);
      setEditingQuoteId(null);
    }
  }, [quoteFormOpen, selectedRequest]);

  function openRequest(requestId: string) {
    if (requestId === selectedRequestId) {
      return;
    }

    setSelectedRequestId(requestId);
    setDetailTab("summary");
    setExpandedQuoteSections({});
    setExpandedQuoteActions({});
    setNegotiationQuote(null);
    setNegotiationForm(buildDefaultNegotiationForm(null));
    clearQuoteTemporaryState(null);
  }

  function openNewQuote() {
    if (!selectedRequest) {
      return;
    }

    const nextValues = buildDefaultQuoteForm(selectedRequest);
    setEditingQuoteId(null);
    setQuoteFormOpen(true);
    setError("");
    setPendingQuoteAttachmentFiles([]);
    setPendingQuoteAttachmentDescription("");
    setQuickSupplierOpen(false);
    quoteForm.clearErrors();
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }

  function openEditQuote(quote: PurchaseQuoteRecord) {
    const nextValues = buildEditQuoteForm(quote);
    setEditingQuoteId(quote.id);
    setQuoteFormOpen(true);
    setError("");
    setPendingQuoteAttachmentFiles([]);
    setPendingQuoteAttachmentDescription("");
    setQuickSupplierOpen(false);
    quoteForm.clearErrors();
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }

  function openNegotiationForm(quote: PurchaseQuoteRecord) {
    setNegotiationQuote(quote);
    setNegotiationForm(buildDefaultNegotiationForm(quote));
    setQuoteFormOpen(false);
    setEditingQuoteId(null);
    setError("");
    setAttachmentMessage("");
  }

  function closeNegotiationForm() {
    setNegotiationQuote(null);
    setNegotiationForm(buildDefaultNegotiationForm(null));
    setError("");
  }

  function updateNegotiationField<K extends keyof NegotiationFormValues>(field: K, value: NegotiationFormValues[K]) {
    setNegotiationForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function updateNegotiationItem(index: number, patch: Partial<NegotiationItemFormValue>) {
    setNegotiationForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
    setError("");
  }

  function updateNegotiationUnitPrice(index: number, value: string) {
    if (value.includes("-")) {
      return;
    }

    updateNegotiationItem(index, { unitPrice: value });
  }

  function formatNegotiationUnitPrice(index: number) {
    const item = negotiationForm.items[index];
    const parsed = parseLocalizedNumberStrict(item?.unitPrice);

    if (parsed === null) {
      return;
    }

    updateNegotiationItem(index, { unitPrice: formatDecimalInputValue(Math.max(parsed, 0)) });
  }

  function buildNegotiationPayload() {
    if (!negotiationQuote) {
      throw new Error("Selecione a cotação anterior.");
    }

    if (!negotiationForm.quoteDate) {
      throw new Error("Informe a data da nova proposta.");
    }

    if (!negotiationForm.validUntil) {
      throw new Error("Informe a validade da nova proposta.");
    }

    if (negotiationForm.validUntil < negotiationForm.quoteDate) {
      throw new Error("A validade da nova proposta deve ser maior ou igual à data da nova proposta.");
    }

    if (!negotiationForm.items.length) {
      throw new Error("Informe ao menos um item para a nova proposta.");
    }

    const deliveryDaysValue = negotiationForm.deliveryDays.trim();
    const deliveryDays = deliveryDaysValue ? Number.parseInt(deliveryDaysValue.replace(/\D/g, ""), 10) : undefined;

    if (deliveryDaysValue && (deliveryDays === undefined || !Number.isFinite(deliveryDays) || deliveryDays < 0)) {
      throw new Error("Informe um prazo de entrega válido.");
    }

    return {
      quoteDate: negotiationForm.quoteDate,
      validUntil: negotiationForm.validUntil,
      deliveryDays,
      paymentTerms: negotiationForm.paymentTerms.trim() || undefined,
      negotiationNotes: negotiationForm.negotiationNotes.trim() || undefined,
      items: negotiationForm.items.map((item) => {
        const unitPrice = parseLocalizedNumberStrict(item.unitPrice);
        const quantity = parseLocalizedNumberStrict(item.quantity);

        if (quantity === null || quantity <= 0) {
          throw new Error("Informe uma quantidade válida para todos os itens.");
        }

        if (unitPrice === null) {
          throw new Error("Informe o novo valor unitário para todos os itens.");
        }

        if (unitPrice < 0) {
          throw new Error("O valor unitário não pode ser negativo.");
        }

        return {
          purchaseRequestItemId: item.purchaseRequestItemId,
          itemDescription: item.itemDescription,
          quantity,
          unitPrice,
          notes: item.notes.trim() || undefined
        };
      })
    };
  }

  async function handleQuickSupplierCreated(supplier: QuickSupplierRecord, message = "Fornecedor cadastrado com sucesso.") {
    setQuickSuppliers((current) => {
      const filtered = current.filter((item) => item.id !== supplier.id);
      return [...filtered, supplier];
    });
    quoteForm.setValue("supplierId", supplier.id, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    quoteForm.clearErrors("supplierId");
    setQuickSupplierOpen(false);
    setAttachmentMessage(message);
    setError("");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["base", "suppliers"] }),
      queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
      selectedRequestId ? queryClient.refetchQueries({ queryKey: ["purchases", "quotes", selectedRequestId], type: "active" }) : Promise.resolve()
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: PurchaseQuoteFormValues) => {
      if (!selectedRequestId) {
        throw new Error("Selecione uma solicitação.");
      }

      const url = editingQuoteId
        ? `/api/purchases/requests/${selectedRequestId}/quotes/${editingQuoteId}`
        : `/api/purchases/requests/${selectedRequestId}/quotes`;
      const method = editingQuoteId ? "PATCH" : "POST";

      return requestJson<SaveQuoteResponse>(url, {
        method,
        body: JSON.stringify({ ...payload, action: "save" })
      });
    },
    onSuccess: async (data) => {
      setError("");
      let uploadFailed = false;

      if (!editingQuoteId && data.quoteId && pendingQuoteAttachmentFiles.length) {
        for (const file of pendingQuoteAttachmentFiles) {
          try {
            await uploadAttachmentToQuote({
              quoteId: data.quoteId,
              file,
              description: pendingQuoteAttachmentDescription.trim()
            });
          } catch {
            uploadFailed = true;
          }
        }
      }

      setQuoteFormOpen(false);
      setEditingQuoteId(null);
      setPendingQuoteAttachmentFiles([]);
      setPendingQuoteAttachmentDescription("");
      quoteForm.reset(buildDefaultQuoteForm(selectedRequest));
      replace(buildDefaultQuoteForm(selectedRequest).items);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["attachments"] }),
        selectedRequestId ? queryClient.refetchQueries({ queryKey: ["purchases", "quotes", selectedRequestId], type: "active" }) : Promise.resolve()
      ]);
      setAttachmentMessage(uploadFailed ? "A cotação foi salva, mas não foi possível enviar um ou mais anexos." : "Cotação salva com sucesso.");
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível salvar a cotação.")
  });

  const negotiationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequestId || !negotiationQuote) {
        throw new Error("Selecione a cotação anterior.");
      }

      const payload = buildNegotiationPayload();

      return requestJson<{ ok: true; message: string }>(
        `/api/purchases/requests/${selectedRequestId}/quotes/${negotiationQuote.id}/negotiations`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
    },
    onSuccess: async (payload) => {
      setError("");
      setAttachmentMessage(payload.message || "Nova proposta negociada registrada com sucesso.");
      setNegotiationQuote(null);
      setNegotiationForm(buildDefaultNegotiationForm(null));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["purchases", "approvals"] }),
        selectedRequestId ? queryClient.refetchQueries({ queryKey: ["purchases", "quotes", selectedRequestId], type: "active" }) : Promise.resolve()
      ]);
    },
    onError: (mutationError) => {
      setAttachmentMessage("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível registrar a nova proposta negociada.");
    }
  });

  const startMutation = useMutation({
    mutationFn: async (requestId: string) =>
      requestJson(`/api/purchases/requests/${requestId}/quotes`, { method: "POST", body: JSON.stringify({ action: "start" }) }),
    onSuccess: async (_data, requestId) => {
      setError("");
      setSelectedRequestId(requestId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.refetchQueries({ queryKey: ["purchases", "quotes", requestId], type: "active" })
      ]);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível iniciar a cotação.")
  });

  const selectMutation = useMutation({
    mutationFn: async ({ requestId, quoteId }: { requestId: string; quoteId: string }) =>
      requestJson(`/api/purchases/requests/${requestId}/quotes/${quoteId}`, { method: "PATCH", body: JSON.stringify({ action: "select" }) }),
    onSuccess: async (_data, variables) => {
      setError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.refetchQueries({ queryKey: ["purchases", "quotes", variables.requestId], type: "active" })
      ]);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível selecionar a cotação.")
  });

  const unselectMutation = useMutation({
    mutationFn: async ({ requestId, quoteId }: { requestId: string; quoteId: string }) =>
      requestJson(`/api/purchases/requests/${requestId}/quotes/${quoteId}`, { method: "PATCH", body: JSON.stringify({ action: "unselect" }) }),
    onSuccess: async (_data, variables) => {
      setError("");
      setAttachmentMessage("Cotação removida como vencedora.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["purchases", "approvals"] }),
        queryClient.refetchQueries({ queryKey: ["purchases", "quotes", variables.requestId], type: "active" })
      ]);
    },
    onError: (mutationError) => {
      setAttachmentMessage("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível remover a cotação vencedora.");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ requestId, quoteId }: { requestId: string; quoteId: string }) =>
      requestJson(`/api/purchases/requests/${requestId}/quotes/${quoteId}`, { method: "DELETE" }),
    onSuccess: async (_data, variables) => {
      setError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.refetchQueries({ queryKey: ["purchases", "quotes", variables.requestId], type: "active" })
      ]);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível cancelar a cotação.")
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async ({ quoteId, file, description }: { quoteId: string; file: File; description: string }) => {
      return uploadAttachmentToQuote({ quoteId, file, description });
    },
    onSuccess: async (_data, variables) => {
      setError("");
      setAttachmentMessage("Arquivo enviado com sucesso.");
      setAttachmentFiles((current) => ({ ...current, [variables.quoteId]: null }));
      setAttachmentDescriptions((current) => ({ ...current, [variables.quoteId]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["attachments"] });
    },
    onError: (mutationError) => {
      setAttachmentMessage("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível enviar o arquivo.");
    }
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => requestJson(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setError("");
      setAttachmentMessage("Anexo removido com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["attachments"] });
    },
    onError: (mutationError) => {
      setAttachmentMessage("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível remover o anexo.");
    }
  });

  const resubmitMutation = useMutation({
    mutationFn: async (requestId: string) => requestJson<{ ok: true; message: string }>(`/api/purchases/approvals/${requestId}/resubmit`, { method: "POST" }),
    onSuccess: async (payload, requestId) => {
      setError("");
      setAttachmentMessage(payload.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["purchases", "approvals"] })
      ]);
      if (requestId) {
        await queryClient.refetchQueries({ queryKey: ["purchases", "quotes", requestId], type: "active" });
      }
      clearQuoteTemporaryState(null);
      setSelectedRequestId("");
    },
    onError: (mutationError) => {
      setAttachmentMessage("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível enviar para aprovação.");
    }
  });

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      if (!matchesQuoteQueueFilter(request, queueFilter)) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [request.requestNumber, request.title, request.justification, request.statusLabel, request.requestTypeLabel, request.priorityLabel]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [queueFilter, requests, search]);

  const canStart = selectedRequest?.status === "submitted" || selectedRequest?.status === "under_review";
  const canOpenQuote = selectedRequest?.status === "quotation";
  const selectedRequestItems = selectedRequest?.items ?? [];
  const isQuoteFormVisible = quoteFormOpen && Boolean(selectedRequest);
  const winningQuote = quotes.find((quote) => quote.isSelected) ?? null;
  const selectedRequestCanMutateQuotes = canMutatePurchaseQuotation(selectedRequest);
  const canCreateQuote = canOpenQuote && selectedRequestCanMutateQuotes && availableSuppliers.length > 0;
  const selectedRequestAwaitingApproval = selectedRequest ? isPurchaseAwaitingApproval(selectedRequest) : false;
  const selectedRequestClosedForQuotation = selectedRequest ? isPurchaseClosedForQuotation(selectedRequest) : false;
  const canSubmitApproval =
    selectedRequest?.status === "quotation" &&
    selectedRequest.approvalStatus !== "returned_to_purchases" &&
    Boolean(winningQuote) &&
    !selectedRequestAwaitingApproval &&
    !selectedRequestClosedForQuotation;
  const canResubmitApproval = selectedRequest?.approvalStatus === "returned_to_purchases" && Boolean(winningQuote);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const quoteComparison = useMemo(() => {
    const validQuotes = quotes.filter(isValidQuoteForRecommendation);
    const sortedQuotes = [...validQuotes].sort(compareRecommendedQuotes);
    const recommendedQuote = sortedQuotes[0] ?? null;
    const lowestQuote = sortedQuotes[0] ?? null;
    const bestDeliveryQuote = [...validQuotes]
      .filter((quote) => parseDeliveryDays(quote.deliveryDays) !== null)
      .sort((left, right) => {
        const deliveryDifference = (parseDeliveryDays(left.deliveryDays) ?? Number.MAX_SAFE_INTEGER) - (parseDeliveryDays(right.deliveryDays) ?? Number.MAX_SAFE_INTEGER);

        return deliveryDifference || compareRecommendedQuotes(left, right);
      })[0] ?? null;

    return {
      validQuotes,
      recommendedQuote,
      lowestQuote,
      bestDeliveryQuote,
      mostCommonPaymentTerms: getMostCommonPaymentTerms(validQuotes)
    };
  }, [quotes]);
  const selectedDiffersFromRecommendation = Boolean(
    winningQuote && quoteComparison.recommendedQuote && winningQuote.id !== quoteComparison.recommendedQuote.id
  );
  const validQuoteCount = quotes.filter(isValidQuoteForRecommendation).length;
  const showQuoteWarning = Boolean(winningQuote && winningQuote.totalAmount > 200 && validQuoteCount < 3);
  const quoteWarningText =
    validQuoteCount === 1
      ? "Há apenas 1 cotação válida cadastrada."
      : `Há apenas ${validQuoteCount} cotações válidas cadastradas.`;
  const selectedRequestFlowStatus = selectedRequest
    ? getPurchaseRequestQuotationFlowStatus(selectedRequest, Boolean(winningQuote))
    : { label: "", tone: "visual" as const };
  const selectedQueueFilter = quoteQueueFilters.find((filter) => filter.value === queueFilter) ?? quoteQueueFilters[0];

  const quoteItemsWatch = useWatch({ control: quoteForm.control, name: "items" });
  const quoteTotalPreview = useMemo(
    () => quoteItemsWatch?.reduce((sum, item) => sum + parseLocalizedNumber(item.quantity) * parseLocalizedNumber(item.unitPrice), 0) ?? 0,
    [quoteItemsWatch]
  );
  const negotiationPreviousTotal = negotiationQuote?.totalAmount ?? 0;
  const negotiationNewTotalPreview = useMemo(
    () => negotiationForm.items.reduce((sum, item) => sum + parseLocalizedNumber(item.quantity) * parseLocalizedNumber(item.unitPrice), 0),
    [negotiationForm.items]
  );
  const negotiationDiscountAmount = negotiationPreviousTotal - negotiationNewTotalPreview;
  const negotiationDiscountPercent = negotiationPreviousTotal > 0 ? (negotiationDiscountAmount / negotiationPreviousTotal) * 100 : 0;
  const attachmentsByQuoteId = attachmentsQuery.data ?? {};

  function uploadQuoteAttachment(quoteId: string) {
    const file = attachmentFiles[quoteId];

    if (!file) {
      setAttachmentMessage("");
      setError("Selecione um arquivo para enviar.");
      return;
    }

    uploadAttachmentMutation.mutate({
      quoteId,
      file,
      description: attachmentDescriptions[quoteId]?.trim() ?? ""
    });
  }

  function cancelQuote(quote: PurchaseQuoteRecord) {
    if (!selectedRequest) {
      return;
    }

    const confirmed = window.confirm("Você está cancelando esta cotação. Deseja continuar?");

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate({ requestId: selectedRequest.id, quoteId: quote.id });
  }

  function removeWinningQuote(quote: PurchaseQuoteRecord) {
    if (!selectedRequest) {
      return;
    }

    const confirmed = window.confirm(
      "Você está removendo esta cotação como vencedora. A solicitação ficará sem vencedora até que outra cotação seja selecionada. Deseja continuar?"
    );

    if (!confirmed) {
      return;
    }

    unselectMutation.mutate({ requestId: selectedRequest.id, quoteId: quote.id });
  }

  function closeRequestModal() {
    clearQuoteTemporaryState(null);
    setDetailTab("summary");
    setExpandedQuoteSections({});
    setExpandedQuoteActions({});
    setNegotiationQuote(null);
    setNegotiationForm(buildDefaultNegotiationForm(null));
    setSelectedRequestId("");
  }

  function toggleQuoteSection(quoteId: string, section: Exclude<QuoteExpandedSection, null>) {
    setExpandedQuoteSections((current) => ({
      ...current,
      [quoteId]: current[quoteId] === section ? null : section
    }));
  }

  function toggleQuoteActions(quoteId: string) {
    setExpandedQuoteActions((current) => ({
      ...current,
      [quoteId]: !current[quoteId]
    }));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-3 shadow-sm shadow-primary/5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <div className="min-w-0 space-y-1">
            <Label>Buscar solicitação</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Número, título, justificativa, status ou prioridade"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="quotes-view-filter">Visualização</Label>
            <select
              id="quotes-view-filter"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={queueFilter}
              onChange={(event) => setQueueFilter(event.target.value as QuoteQueueFilter)}
            >
              {quoteQueueFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-muted-foreground lg:text-right">
            <span className="font-medium text-foreground">{filteredRequests.length}</span> {filteredRequests.length === 1 ? "registro" : "registros"}
            <span className="block">em {selectedQueueFilter.label}</span>
          </div>
        </div>
      </section>

      {attachmentMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {attachmentMessage}
        </div>
      ) : null}
      {error && !quoteFormOpen && !selectedRequestId ? <ErrorMessage message={error} /> : null}

      <div className="space-y-3">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Solicitações em cotação e aprovação</h2>
              <p className="text-xs text-muted-foreground">Fila operacional para abrir, comparar e acompanhar cotações.</p>
            </div>
          </div>

          {listQuery.isLoading ? <LoadingTable label="Carregando solicitações..." /> : null}
          {listQuery.error ? (
            <ErrorMessage message={listQuery.error instanceof Error ? listQuery.error.message : "Erro ao carregar solicitações."} />
          ) : null}

          {!listQuery.isLoading && !filteredRequests.length ? (
            <EmptyState
              title="Nenhuma solicitação disponível para cotação."
              description="Solicitações enviadas ou devolvidas para Compras aparecerão aqui para análise e cotação."
            />
          ) : null}

          {filteredRequests.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {filteredRequests.map((request) => {
                const isSelected = request.id === selectedRequestId;
                const hasWinner = requestHasWinnerSelected(request);
                const flowStatus = getPurchaseRequestQuotationFlowStatus(request, hasWinner);

                return (
                  <article
                    key={request.id}
                    className={cn(
                      "flex min-w-0 flex-col justify-between rounded-lg border bg-card p-3 shadow-sm shadow-primary/5 transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "hover:border-primary/40"
                    )}
                  >
                    <button type="button" className="min-w-0 text-left" onClick={() => openRequest(request.id)}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{request.requestNumber}</p>
                        <StatusBadge status={flowStatus.tone} label={flowStatus.label} />
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{request.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{request.priorityLabel}</span>
                        <span>{request.requestTypeLabel}</span>
                        <span>{formatDate(request.createdAt)}</span>
                      </div>
                    </button>

                    <div className="mt-3 flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{hasWinner ? formatCurrency(request.totalApprovedAmount) : "Sem vencedora"}</span>
                        {hasWinner ? <span className="ml-2">vencedora</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(request.status === "submitted" || request.status === "under_review") ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              openRequest(request.id);
                              startMutation.mutate(request.id);
                            }}
                            disabled={startMutation.isPending}
                          >
                            <Truck className="h-4 w-4" />
                            Iniciar
                          </Button>
                        ) : null}
                        <Button type="button" size="sm" variant="outline" onClick={() => openRequest(request.id)}>
                          <Search className="h-4 w-4" />
                          Ver cotações
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        {selectedRequestId ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-2 py-3 backdrop-blur-sm sm:px-4 sm:py-6" role="presentation" onClick={closeRequestModal}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="quotes-detail-title"
              className="flex h-[94vh] max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-background shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Solicitação selecionada</p>
                    <h2 id="quotes-detail-title" className="mt-0.5 truncate text-base font-semibold text-foreground">
                      {selectedRequest?.requestNumber ?? "Carregando solicitação"}
                    </h2>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={closeRequestModal}>
                    <Ban className="h-4 w-4" />
                    Fechar
                  </Button>
                </div>
                {selectedRequest ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                    {quoteDetailTabs.map((tab) => (
                      <button
                        key={tab.value}
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                          detailTab === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        onClick={() => setDetailTab(tab.value)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <div className="space-y-3">
          {detailQuery.isLoading ? (
            <LoadingTable label="Carregando solicitação selecionada..." />
          ) : !selectedRequest ? (
            <EmptyState title="Solicitação não encontrada" description="Atualize a lista e tente abrir a solicitação novamente." />
          ) : (
            <>
              {error && !quoteFormOpen ? <ErrorMessage message={error} /> : null}

              {detailTab === "summary" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-card p-3 shadow-sm shadow-primary/5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{selectedRequest.requestNumber}</h3>
                          <StatusBadge status={selectedRequestFlowStatus.tone} label={selectedRequestFlowStatus.label} />
                          {winningQuote ? <StatusBadge status="success" label="Vencedora" /> : null}
                        </div>
                        <p className="break-words text-sm font-medium text-foreground">{selectedRequest.title}</p>
                        <p className="max-w-3xl break-words text-xs text-muted-foreground">{selectedRequest.justification}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>Prioridade: {selectedRequest.priorityLabel}</span>
                          <span>Tipo: {selectedRequest.requestTypeLabel}</span>
                          <span>Criação: {formatDate(selectedRequest.createdAt)}</span>
                        </div>
                      </div>
                      {canStart ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => startMutation.mutate(selectedRequest.id)} disabled={startMutation.isPending}>
                          <Truck className="h-4 w-4" />
                          Iniciar cotação
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Vencedora</p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground" title={winningQuote ? winningQuote.supplierTradeName || winningQuote.supplierName : "Nenhuma selecionada"}>
                        {winningQuote ? winningQuote.supplierTradeName || winningQuote.supplierName : "Nenhuma selecionada"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Valor</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{winningQuote ? winningQuote.totalAmountLabel : "-"}</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Próximo passo</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {selectedRequestAwaitingApproval
                          ? "Aguardar decisão"
                          : winningQuote
                            ? selectedRequest.approvalStatus === "returned_to_purchases" ? "Reenviar para aprovação" : "Enviar para aprovação"
                            : "Selecionar vencedora"}
                      </p>
                    </div>
                  </div>

                  {selectedRequest.approvalStatus === "returned_to_purchases" && selectedRequest.approvalDecisionNotes ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      <p className="font-medium">Motivo da devolução</p>
                      <p className="mt-1 break-words text-xs">{selectedRequest.approvalDecisionNotes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === "items" ? (
              <div className="rounded-lg border bg-card p-3 shadow-sm shadow-primary/5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Itens solicitados</h3>
                    <p className="text-xs text-muted-foreground">Base para preenchimento das cotações.</p>
                  </div>
                  <div className="text-sm font-semibold">
                    {selectedRequest.totalApprovedAmount > 0 ? formatCurrency(selectedRequest.totalApprovedAmount) : "Valor será definido na cotação."}
                  </div>
                </div>
                <div className="mt-4 max-w-full overflow-x-auto rounded-md border bg-background">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Descrição</th>
                        <th className="px-3 py-2 font-semibold">Qtd</th>
                        <th className="px-3 py-2 font-semibold">Unidade</th>
                        <th className="px-3 py-2 font-semibold">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedRequestItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.unitOfMeasureLabel}</td>
                          <td className="px-3 py-2 text-muted-foreground">{item.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              ) : null}

              {detailTab === "quotes" ? (
              <div className="rounded-lg border bg-card p-3 shadow-sm shadow-primary/5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Cotações cadastradas</h3>
                    <p className="text-xs text-muted-foreground">Compare fornecedor, prazo, condição e validade.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={openNewQuote} disabled={!selectedRequest || !canCreateQuote}>
                      <Plus className="h-4 w-4" />
                      Nova cotação
                    </Button>
                  </div>
                </div>

                {selectedRequest?.status === "quotation" && !availableSuppliers.length ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p>Cadastre ao menos um fornecedor ativo antes de registrar cotações.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100" onClick={() => setQuickSupplierOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Novo fornecedor
                      </Button>
                      <Link
                        href="/cadastros/fornecedores"
                        className="inline-flex items-center rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                      >
                        Ir para fornecedores
                      </Link>
                    </div>
                  </div>
                ) : null}

                {attachmentMessage ? (
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {attachmentMessage}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    <span className="text-xs text-muted-foreground">Vencedora</span>
                    <p className="truncate font-medium text-foreground">{winningQuote ? winningQuote.supplierTradeName || winningQuote.supplierName : "Nenhuma selecionada"}</p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    <span className="text-xs text-muted-foreground">Recomendada</span>
                    <p className="truncate font-medium text-foreground">{quoteComparison.recommendedQuote ? quoteComparison.recommendedQuote.supplierTradeName || quoteComparison.recommendedQuote.supplierName : "-"}</p>
                  </div>
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    <span className="text-xs text-muted-foreground">Menor valor</span>
                    <p className="font-medium text-foreground">{quoteComparison.lowestQuote?.totalAmountLabel ?? "-"}</p>
                  </div>
                </div>

                {showQuoteWarning ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Esta compra exige 3 cotações antes da aprovação. {quoteWarningText}
                  </div>
                ) : null}

                {selectedDiffersFromRecommendation ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    A vencedora selecionada é diferente da recomendada pelo sistema.
                  </div>
                ) : null}

                {quotes.length ? (
                  <div className="mt-3 space-y-2">
                    {quotes.map((quote) => {
                      const isRecommendedQuote = quoteComparison.recommendedQuote?.id === quote.id;
                      const quoteHighlight = getQuoteHighlight(quote, isRecommendedQuote, selectedDiffersFromRecommendation);
                      const supplier = supplierById.get(quote.supplierId);
                      const supplierTrustLabel = supplier?.status === "active" ? "Fornecedor ativo" : "Fornecedor cadastrado";
                      const quoteAttachments = attachmentsByQuoteId[quote.id] ?? [];
                      const selectedFile = attachmentFiles[quote.id];
                      const canMutateQuote = selectedRequestCanMutateQuotes && quote.status !== "cancelled" && !quote.isSuperseded;
                      const canRegisterNegotiation =
                        selectedRequestCanMutateQuotes &&
                        quote.status !== "cancelled" &&
                        !quote.isSuperseded &&
                        !selectedRequestAwaitingApproval &&
                        !selectedRequestClosedForQuotation;
                      const expandedSection = expandedQuoteSections[quote.id] ?? null;
                      const actionsOpen = Boolean(expandedQuoteActions[quote.id]);

                      return (
                      <article key={quote.id} className={cn("rounded-lg border bg-background p-3", quote.isSelected && "border-emerald-300 bg-emerald-50/60", quote.isSuperseded && "bg-muted/20")}>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="min-w-0 max-w-full truncate text-sm font-medium text-foreground" title={quote.supplierTradeName || quote.supplierName}>
                                  {quote.supplierTradeName || quote.supplierName}
                                </p>
                                <StatusBadge status={quote.statusTone} label={quote.statusLabel} />
                                {quoteHighlight ? <StatusBadge status={quoteHighlight.tone} label={quoteHighlight.label} /> : null}
                              </div>
                              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                                <span className="truncate" title={quote.quoteNumber}>Cotação: <strong className="font-medium text-foreground">{quote.quoteNumber}</strong></span>
                                <span>Total: <strong className="font-medium text-foreground">{quote.totalAmountLabel}</strong></span>
                                <span>Prazo: <strong className="font-medium text-foreground">{quote.deliveryDays || "-"}</strong></span>
                                <span>Pagamento: <strong className="font-medium text-foreground">{quote.paymentTerms || "-"}</strong></span>
                                <span>Validade: <strong className="font-medium text-foreground">{formatDate(quote.validUntil)}{quote.isExpired ? " vencida" : ""}</strong></span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 xl:justify-end">
                              {!quote.isSuperseded && !quote.isSelected && quote.status === "received" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => selectMutation.mutate({ requestId: selectedRequest.id, quoteId: quote.id })}
                                  disabled={selectMutation.isPending || !canMutateQuote}
                                >
                                  <Check className="h-4 w-4" />
                                  Selecionar
                                </Button>
                              ) : null}
                              {quote.isSuperseded ? (
                                <span className="inline-flex min-h-9 items-center rounded-md border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                  Superada por proposta mais recente
                                </span>
                              ) : (
                                <Button type="button" size="sm" variant="outline" onClick={() => toggleQuoteActions(quote.id)}>
                                  Mais ações
                                </Button>
                              )}
                            </div>
                          </div>

                          {actionsOpen && !quote.isSuperseded ? (
                            <div className="flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => openEditQuote(quote)} disabled={!canMutateQuote}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </Button>
                              {canRegisterNegotiation ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => openNegotiationForm(quote)} disabled={negotiationMutation.isPending}>
                                  <RotateCcw className="h-4 w-4" />
                                  Registrar nova proposta
                                </Button>
                              ) : null}
                              {!quote.isSelected ? (
                                <Button type="button" size="sm" variant="danger" onClick={() => cancelQuote(quote)} disabled={deleteMutation.isPending || !canMutateQuote}>
                                  <Ban className="h-4 w-4" />
                                  Cancelar cotação
                                </Button>
                              ) : (
                                <Button type="button" size="sm" variant="danger" onClick={() => removeWinningQuote(quote)} disabled={unselectMutation.isPending || !canMutateQuote}>
                                  <Ban className="h-4 w-4" />
                                  Remover vencedora
                                </Button>
                              )}
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2 border-t pt-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleQuoteSection(quote.id, "details")}>
                              Ver detalhes
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleQuoteSection(quote.id, "items")}>
                              Itens
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => toggleQuoteSection(quote.id, "attachments")}>
                              Anexos {quoteAttachments.length ? `(${quoteAttachments.length})` : ""}
                            </Button>
                          </div>

                          {expandedSection === "details" ? (
                            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                              <span>Documento: <strong className="font-medium text-foreground">{quote.supplierDocumentNumber || "-"}</strong></span>
                              <span>Fornecedor: <strong className="font-medium text-foreground">{supplierTrustLabel}</strong></span>
                              <span>Selecionada: <strong className="font-medium text-foreground">{quote.isSelected ? "Sim" : "Não"}</strong></span>
                              <span>Rodada: <strong className="font-medium text-foreground">{quote.quoteRound ?? 1}</strong></span>
                            </div>
                          ) : null}

                          {expandedSection === "items" ? (
                            <div className="max-w-full overflow-x-auto rounded-md border bg-muted/20">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b bg-muted/60 text-muted-foreground">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Item</th>
                                    <th className="px-3 py-2 font-medium">Qtd</th>
                                    <th className="px-3 py-2 font-medium">Unitário</th>
                                    <th className="px-3 py-2 font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {quote.items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="px-3 py-2 text-foreground">{item.description}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                                      <td className="px-3 py-2 font-medium text-foreground">{formatCurrency(item.totalPrice)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          {expandedSection === "attachments" ? (
                          <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <Paperclip className="h-4 w-4" />
                                Anexos da cotação
                              </div>
                              <p className="text-xs text-muted-foreground">Propostas, documentos ou imagens enviados para esta cotação.</p>
                            </div>

                            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_max-content] xl:items-end">
                              <div className="min-w-0 space-y-1">
                                <Label>Descrição opcional</Label>
                                <Input
                                  value={attachmentDescriptions[quote.id] ?? ""}
                                  onChange={(event) => setAttachmentDescriptions((current) => ({ ...current, [quote.id]: event.target.value }))}
                                  placeholder="Ex.: Proposta comercial"
                                  className="w-full min-w-0"
                                  disabled={!canMutateQuote}
                                />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <Label>Arquivo</Label>
                                <Input
                                  key={`${quote.id}-${selectedFile?.name ?? "empty"}`}
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                                  className="w-full min-w-0 max-w-full text-xs sm:text-sm"
                                  disabled={!canMutateQuote}
                                  onChange={(event) => {
                                    setError("");
                                    setAttachmentMessage("");
                                    setAttachmentFiles((current) => ({ ...current, [quote.id]: event.target.files?.[0] ?? null }));
                                  }}
                                />
                              </div>
                              <Button
                                type="button"
                                onClick={() => uploadQuoteAttachment(quote.id)}
                                disabled={uploadAttachmentMutation.isPending || !canMutateQuote}
                                className="w-full justify-center whitespace-nowrap xl:w-auto"
                              >
                                <Upload className="h-4 w-4" />
                                Enviar anexo
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase text-muted-foreground">Arquivos</p>
                              {attachmentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Carregando anexos...</p> : null}
                              {!attachmentsQuery.isLoading && !quoteAttachments.length ? (
                                <p className="text-sm text-muted-foreground">Nenhum anexo cadastrado para esta cotação.</p>
                              ) : null}
                              {quoteAttachments.length ? (
                                <div className="space-y-2">
                                  {quoteAttachments.map((attachment) => (
                                    <div key={attachment.id} className="rounded-md border bg-muted/20 p-3">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 flex-1 space-y-2">
                                          <p className="break-words text-sm font-semibold text-foreground">{attachment.fileName}</p>
                                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>Tipo: {attachment.fileMimeType}</span>
                                            <span>Tamanho: {formatFileSize(attachment.fileSizeBytes)}</span>
                                            <span>Envio: {formatDate(attachment.createdAt)}</span>
                                          </div>
                                          <p className="break-words text-xs text-muted-foreground">Descrição: {attachment.description || "-"}</p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap justify-start gap-2 lg:justify-end">
                                          {attachment.signedUrl ? (
                                            <Button type="button" size="sm" variant="outline" asChild>
                                              <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                                                Abrir
                                              </a>
                                            </Button>
                                          ) : null}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="danger"
                                            onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                                            disabled={deleteAttachmentMutation.isPending || !canMutateQuote}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            Remover
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </section>
                          ) : null}
                        </div>
                      </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhuma cotação cadastrada para esta solicitação."
                    description="Adicione uma nova cotação para comparar fornecedores e selecionar a vencedora."
                  />
                )}
              </div>
              ) : null}

              {detailTab === "history" ? (
                <div className="space-y-3">
                  {selectedRequest.approvalStatus === "returned_to_purchases" && selectedRequest.approvalDecisionNotes ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                      <p className="font-medium">Devolução para Compras</p>
                      <p className="mt-1 break-words text-xs">{selectedRequest.approvalDecisionNotes}</p>
                    </div>
                  ) : null}
                  <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-sm shadow-primary/5">
                    Histórico operacional detalhado ainda não está disponível nesta tela. Use as cotações e seus anexos para consultar o histórico preservado das propostas.
                  </div>
                </div>
              ) : null}

              {negotiationQuote ? (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" role="presentation" onClick={closeNegotiationForm}>
                  <div className="flex h-full w-full items-stretch justify-end p-0 sm:p-4">
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="negotiation-form-title"
                      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background shadow-2xl sm:max-w-[min(1040px,calc(100vw-2rem))] sm:rounded-l-2xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs text-muted-foreground">Nova proposta negociada</p>
                          <h3 id="negotiation-form-title" className="text-base font-semibold text-foreground">Registrar nova proposta negociada</h3>
                          <p className="max-w-2xl text-sm text-muted-foreground">
                            Crie uma nova proposta do mesmo fornecedor preservando o histórico da cotação anterior.
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={closeNegotiationForm}>
                          <Ban className="h-4 w-4" />
                          Fechar
                        </Button>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        <div className="space-y-4">
                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold">Cotação anterior</h4>
                              <p className="text-xs text-muted-foreground">Esta proposta será preservada e a nova proposta entrará como outra cotação recebida.</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <div className="min-w-0 rounded-md border bg-background/70 p-3 sm:col-span-2">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Número</p>
                                <p className="mt-1 overflow-x-auto whitespace-nowrap text-sm font-medium text-foreground">{negotiationQuote.quoteNumber}</p>
                              </div>
                              <div className="min-w-0 rounded-md border bg-background/70 p-3 sm:col-span-2">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Fornecedor</p>
                                <p className="mt-1 break-words text-sm font-medium text-foreground">{getQuoteSupplierLabel(negotiationQuote)}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Rodada atual</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{getQuoteRoundLabel(negotiationQuote)}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Valor anterior</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{negotiationQuote.totalAmountLabel}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Prazo</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{negotiationQuote.deliveryDays || "-"}</p>
                              </div>
                              <div className="min-w-0 rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Condição de pagamento</p>
                                <p className="mt-1 break-words text-sm font-medium text-foreground">{negotiationQuote.paymentTerms || "-"}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  <StatusBadge status={negotiationQuote.statusTone} label={negotiationQuote.statusLabel} />
                                  {negotiationQuote.isSelected ? <StatusBadge status="success" label="Vencedora" /> : null}
                                </div>
                              </div>
                            </div>
                          </section>

                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold">Dados da nova proposta</h4>
                            </div>
                            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                              <Field label="Data da nova proposta">
                                <TextInput
                                  type="date"
                                  value={negotiationForm.quoteDate}
                                  onChange={(event) => updateNegotiationField("quoteDate", event.target.value)}
                                />
                              </Field>
                              <Field label="Validade da nova proposta">
                                <TextInput
                                  type="date"
                                  value={negotiationForm.validUntil}
                                  onChange={(event) => updateNegotiationField("validUntil", event.target.value)}
                                />
                              </Field>
                              <Field label="Prazo de entrega (dias)">
                                <TextInput
                                  type="text"
                                  inputMode="numeric"
                                  value={negotiationForm.deliveryDays}
                                  onChange={(event) => updateNegotiationField("deliveryDays", event.target.value)}
                                />
                              </Field>
                              <Field label="Condição de pagamento">
                                <TextInput
                                  value={negotiationForm.paymentTerms}
                                  onChange={(event) => updateNegotiationField("paymentTerms", event.target.value)}
                                />
                              </Field>
                              <Field label="Observação da negociação" className="xl:col-span-2">
                                <TextArea
                                  rows={3}
                                  value={negotiationForm.negotiationNotes}
                                  placeholder="Ex.: fornecedor concedeu desconto após negociação por WhatsApp."
                                  onChange={(event) => updateNegotiationField("negotiationNotes", event.target.value)}
                                />
                              </Field>
                            </div>
                          </section>

                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold">Itens da nova proposta</h4>
                              <p className="text-xs text-muted-foreground">A quantidade permanece igual à cotação anterior. Informe apenas o novo valor unitário e observações da negociação por item.</p>
                            </div>
                            <div className="space-y-4">
                              {negotiationForm.items.map((item, index) => {
                                const quantity = parseLocalizedNumber(item.quantity);
                                const previousUnitPrice = parseLocalizedNumber(item.previousUnitPrice);
                                const newUnitPrice = parseLocalizedNumber(item.unitPrice);

                                return (
                                  <div key={item.purchaseRequestItemId} className="rounded-lg border bg-background p-3 shadow-sm">
                                    <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0 space-y-1">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Item</p>
                                        <p className="break-words text-sm font-semibold text-foreground">{item.itemDescription}</p>
                                        <p className="text-xs text-muted-foreground">Quantidade: {quantity}</p>
                                      </div>
                                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                                        <div className="rounded-md border bg-muted/30 px-3 py-2">
                                          <p className="text-xs uppercase text-muted-foreground">Valor anterior</p>
                                          <p className="font-semibold text-foreground">{formatCurrency(previousUnitPrice)}</p>
                                        </div>
                                        <div className="rounded-md border bg-muted/30 px-3 py-2">
                                          <p className="text-xs uppercase text-muted-foreground">Novo total</p>
                                          <p className="font-semibold text-foreground">{formatCurrency(quantity * newUnitPrice)}</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                                      <Field label="Novo valor unitário">
                                        <TextInput
                                          type="text"
                                          inputMode="decimal"
                                          value={item.unitPrice}
                                          onChange={(event) => updateNegotiationUnitPrice(index, event.target.value)}
                                          onBlur={() => formatNegotiationUnitPrice(index)}
                                        />
                                      </Field>
                                      <Field label="Observação do item">
                                        <TextArea
                                          rows={2}
                                          value={item.notes}
                                          onChange={(event) => updateNegotiationItem(index, { notes: event.target.value })}
                                        />
                                      </Field>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>

                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Valor anterior</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(negotiationPreviousTotal)}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Novo valor estimado</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(negotiationNewTotalPreview)}</p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Economia estimada</p>
                                <p className={cn("mt-1 text-sm font-semibold", negotiationDiscountAmount < 0 ? "text-amber-700" : "text-emerald-700")}>
                                  {formatCurrency(negotiationDiscountAmount)}
                                </p>
                              </div>
                              <div className="rounded-md border bg-background/70 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Economia estimada %</p>
                                <p className={cn("mt-1 text-sm font-semibold", negotiationDiscountAmount < 0 ? "text-amber-700" : "text-emerald-700")}>
                                  {negotiationDiscountPercent.toFixed(2).replace(".", ",")}%
                                </p>
                              </div>
                            </div>
                            {negotiationDiscountAmount < 0 ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Nova proposta maior que a anterior. A API permitirá salvar para preservar mudanças de escopo ou condição.
                              </div>
                            ) : null}
                            <p className="text-xs text-muted-foreground">Prévia visual. O cálculo oficial será feito no servidor.</p>
                          </section>

                          <ErrorMessage message={error} />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">A nova proposta não será vencedora automaticamente.</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button type="button" disabled={negotiationMutation.isPending} onClick={() => negotiationMutation.mutate()}>
                            <RotateCcw className="h-4 w-4" />
                            Salvar nova proposta
                          </Button>
                          <Button type="button" variant="ghost" onClick={closeNegotiationForm} disabled={negotiationMutation.isPending}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {isQuoteFormVisible ? (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" role="presentation" onClick={closeQuoteForm}>
                  <div className="flex h-full w-full items-stretch justify-end p-0 sm:p-4">
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="quote-form-title"
                      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background shadow-2xl sm:max-w-[min(1120px,calc(100vw-2rem))] sm:rounded-l-2xl"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-start justify-between border-b px-5 py-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {editingQuoteId ? "Editar cotação" : "Nova cotação"}
                          </p>
                          <h3 id="quote-form-title" className="text-base font-semibold text-foreground">
                            Informe os valores propostos pelo fornecedor para esta solicitação.
                          </h3>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={closeQuoteForm}>
                          <Ban className="h-4 w-4" />
                          Fechar
                        </Button>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                        <form className="space-y-4" onSubmit={quoteForm.handleSubmit((values) => saveMutation.mutate(values))}>
                          {!availableSuppliers.length ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <p>Nenhum fornecedor ativo disponível. Cadastre um fornecedor antes de registrar cotações.</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100" onClick={() => setQuickSupplierOpen(true)}>
                                  <Plus className="h-4 w-4" />
                                  Novo fornecedor
                                </Button>
                                <Link
                                  href="/cadastros/fornecedores"
                                  className="inline-flex items-center rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                                >
                                  Ir para fornecedores
                                </Link>
                              </div>
                            </div>
                          ) : null}

                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold">Dados da cotação</h4>
                              <p className="text-xs text-muted-foreground">Preencha as condições oferecidas pelo fornecedor para esta solicitação.</p>
                            </div>

                            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                              <Field label="Razão social / Nome do fornecedor">
                                <Controller
                                  control={quoteForm.control}
                                  name="supplierId"
                                  render={({ field }) => (
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                      <SupplierCombobox
                                        suppliers={availableSuppliers}
                                        value={field.value ?? ""}
                                        disabled={!availableSuppliers.length}
                                        onChange={(supplierId) => {
                                          field.onChange(supplierId);
                                          quoteForm.clearErrors("supplierId");
                                        }}
                                      />
                                      <Button type="button" variant="outline" onClick={() => setQuickSupplierOpen(true)} className="shrink-0">
                                        <Plus className="h-4 w-4" />
                                        Novo fornecedor
                                      </Button>
                                    </div>
                                  )}
                                />
                                <FieldError message={quoteForm.formState.errors.supplierId?.message} />
                              </Field>
                              <Field label="Data da cotação">
                                <Controller
                                  control={quoteForm.control}
                                  name="quoteDate"
                                  render={({ field }) => (
                                    <TextInput
                                      type="date"
                                      value={field.value ?? ""}
                                      onBlur={field.onBlur}
                                      onChange={(event) => {
                                        field.onChange(event.target.value);
                                        quoteForm.clearErrors("quoteDate");
                                      }}
                                    />
                                  )}
                                />
                                <FieldError message={quoteForm.formState.errors.quoteDate?.message} />
                              </Field>
                              <Field label="Validade da cotação">
                                <Controller
                                  control={quoteForm.control}
                                  name="validUntil"
                                  render={({ field }) => (
                                    <TextInput
                                      type="date"
                                      value={field.value ?? ""}
                                      onBlur={field.onBlur}
                                      onChange={(event) => {
                                        field.onChange(event.target.value);
                                        quoteForm.clearErrors("validUntil");
                                      }}
                                    />
                                  )}
                                />
                                <FieldError message={quoteForm.formState.errors.validUntil?.message} />
                              </Field>
                              <Field label="Prazo de entrega (dias)">
                                <Controller
                                  control={quoteForm.control}
                                  name="deliveryDays"
                                  render={({ field }) => (
                                    <TextInput
                                      type="text"
                                      inputMode="numeric"
                                      value={field.value ?? ""}
                                      onBlur={field.onBlur}
                                      onChange={(event) => {
                                        field.onChange(event.target.value);
                                        quoteForm.clearErrors("deliveryDays");
                                      }}
                                    />
                                  )}
                                />
                                <FieldError message={quoteForm.formState.errors.deliveryDays?.message} />
                              </Field>
                              <Field label="Condição de pagamento">
                                <TextInput placeholder="Ex.: 30 dias" {...quoteForm.register("paymentTerms")} />
                              </Field>
                              <Field label="Observações gerais" className="lg:col-span-2">
                                <TextArea rows={3} {...quoteForm.register("notes")} />
                              </Field>
                              <Field label="Fornecedor recorrente" className="flex items-center gap-2 lg:col-span-1">
                                <Controller
                                  control={quoteForm.control}
                                  name="isRecurringSupplierQuote"
                                  render={({ field }) => (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(field.value)}
                                      onChange={(event) => field.onChange(event.target.checked)}
                                      className="h-4 w-4 rounded border-input"
                                    />
                                  )}
                                />
                                <span className="text-sm text-muted-foreground">Cotação de fornecedor recorrente/homologado</span>
                              </Field>
                              <Field label="Exceção de validade" className="flex items-center gap-2 lg:col-span-1">
                                <Controller
                                  control={quoteForm.control}
                                  name="quoteValidityException"
                                  render={({ field }) => (
                                    <input
                                      type="checkbox"
                                      checked={Boolean(field.value)}
                                      onChange={(event) => field.onChange(event.target.checked)}
                                      className="h-4 w-4 rounded border-input"
                                    />
                                  )}
                                />
                                <span className="text-sm text-muted-foreground">Permitir validade acima do padrão com justificativa</span>
                              </Field>
                              {quoteValidityException ? (
                                <Field label="Justificativa da exceção" className="lg:col-span-2">
                                  <Controller
                                    control={quoteForm.control}
                                    name="quoteValidityExceptionReason"
                                    render={({ field }) => (
                                      <TextArea
                                        rows={3}
                                        value={field.value ?? ""}
                                        onBlur={field.onBlur}
                                        onChange={(event) => {
                                          field.onChange(event.target.value);
                                          quoteForm.clearErrors("quoteValidityExceptionReason");
                                        }}
                                      />
                                    )}
                                  />
                                  <FieldError message={quoteForm.formState.errors.quoteValidityExceptionReason?.message} />
                                </Field>
                              ) : null}
                            </div>
                          </section>

                          <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold">Itens cotados</h4>
                                <p className="text-xs text-muted-foreground">Cada item recebe o valor unitário proposto pelo fornecedor.</p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              {fields.map((field, index) => {
                                const requestItem = selectedRequestItems[index];
                                const itemQuantity = parseLocalizedNumber(quoteItemsWatch?.[index]?.quantity);
                                const itemUnitPrice = parseLocalizedNumber(quoteItemsWatch?.[index]?.unitPrice);

                                return (
                                  <div key={field.id} className="rounded-lg border bg-background p-3 shadow-sm">
                                    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Item da solicitação</p>
                                        <p className="text-sm font-semibold text-foreground">{requestItem?.description || "-"}</p>
                                        <p className="text-xs text-muted-foreground">
                                          Quantidade solicitada: {requestItem?.quantity ?? "-"} {requestItem?.unitOfMeasureLabel || ""}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-right">
                                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total do item</p>
                                        <p className="text-sm font-semibold text-foreground">{formatCurrency(itemQuantity * itemUnitPrice)}</p>
                                      </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 lg:grid-cols-12">
                                      <Field label="Descrição do item" className="lg:col-span-5">
                                        <Controller
                                          control={quoteForm.control}
                                          name={`items.${index}.itemDescription`}
                                          render={({ field: itemField }) => (
                                            <TextInput
                                              value={itemField.value ?? ""}
                                              onBlur={itemField.onBlur}
                                              onChange={(event) => {
                                                itemField.onChange(event.target.value);
                                                quoteForm.clearErrors(`items.${index}.itemDescription`);
                                              }}
                                            />
                                          )}
                                        />
                                        <FieldError message={quoteForm.formState.errors.items?.[index]?.itemDescription?.message} />
                                      </Field>
                                      <Field label="Quantidade" className="lg:col-span-2">
                                        <Controller
                                          control={quoteForm.control}
                                          name={`items.${index}.quantity`}
                                          render={({ field: itemField }) => (
                                            <TextInput
                                              type="text"
                                              inputMode="decimal"
                                              readOnly
                                              value={itemField.value ?? ""}
                                              onBlur={itemField.onBlur}
                                              onChange={(event) => {
                                                itemField.onChange(event.target.value);
                                                quoteForm.clearErrors(`items.${index}.quantity`);
                                              }}
                                            />
                                          )}
                                        />
                                        <FieldError message={quoteForm.formState.errors.items?.[index]?.quantity?.message} />
                                      </Field>
                                      <Field label="Unidade de medida" className="lg:col-span-2">
                                        <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">
                                          {requestItem?.unitOfMeasureLabel || "-"}
                                        </div>
                                      </Field>
                                      <Field label="Valor unitário" className="lg:col-span-3">
                                        <Controller
                                          control={quoteForm.control}
                                          name={`items.${index}.unitPrice`}
                                          render={({ field: itemField }) => (
                                            <TextInput
                                              type="text"
                                              inputMode="decimal"
                                              value={itemField.value ?? ""}
                                              onBlur={itemField.onBlur}
                                              onChange={(event) => {
                                                itemField.onChange(event.target.value);
                                                quoteForm.clearErrors(`items.${index}.unitPrice`);
                                              }}
                                            />
                                          )}
                                        />
                                        <FieldError message={quoteForm.formState.errors.items?.[index]?.unitPrice?.message} />
                                      </Field>
                                    </div>

                                    <Field label="Observações de entrega" className="mt-3">
                                      <Controller
                                        control={quoteForm.control}
                                        name={`items.${index}.deliveryNotes`}
                                        render={({ field: itemField }) => (
                                          <TextArea
                                            rows={3}
                                            value={itemField.value ?? ""}
                                            onBlur={itemField.onBlur}
                                            onChange={(event) => itemField.onChange(event.target.value)}
                                          />
                                        )}
                                      />
                                    </Field>
                                  </div>
                                );
                              })}
                            </div>
                          </section>

                          {!editingQuoteId ? (
                            <section className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold">Anexos da proposta</h4>
                                <p className="text-xs text-muted-foreground">Os arquivos serão enviados após salvar a cotação.</p>
                              </div>

                              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                <Field label="Descrição opcional">
                                  <TextInput
                                    value={pendingQuoteAttachmentDescription}
                                    onChange={(event) => setPendingQuoteAttachmentDescription(event.target.value)}
                                    placeholder="Ex.: Proposta comercial"
                                  />
                                </Field>
                                <Field label="Arquivos">
                                  <Input
                                    type="file"
                                    multiple
                                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                                    onChange={(event) => {
                                      setError("");
                                      setAttachmentMessage("");
                                      setPendingQuoteAttachmentFiles(Array.from(event.target.files ?? []));
                                    }}
                                  />
                                </Field>
                              </div>

                              {pendingQuoteAttachmentFiles.length ? (
                                <div className="rounded-md border bg-background p-3">
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">Selecionados</p>
                                  <ul className="mt-2 space-y-1 text-sm">
                                    {pendingQuoteAttachmentFiles.map((file) => (
                                      <li key={`${file.name}-${file.size}`} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                        <Paperclip className="h-4 w-4" />
                                        <span className="font-medium text-foreground">{file.name}</span>
                                        <span>{formatFileSize(file.size)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </section>
                          ) : null}

                          <ErrorMessage message={error} />
                        </form>
                      </div>

                      <div className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold text-foreground">Total da cotação: {formatCurrency(quoteTotalPreview)}</p>
                          <p className="text-xs text-muted-foreground">
                            {quoteForm.formState.errors.items?.message ?? "Compare fornecedores, prazo, condição de pagamento e validade antes de selecionar a melhor proposta."}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button type="button" disabled={saveMutation.isPending || !availableSuppliers.length} onClick={quoteForm.handleSubmit((values) => saveMutation.mutate(values))}>
                            <Pencil className="h-4 w-4" />
                            Salvar cotação
                          </Button>
                          <Button type="button" variant="ghost" onClick={closeQuoteForm}>
                            Fechar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <QuickSupplierDialog
                open={quickSupplierOpen}
                unitId={selectedRequest?.unitId}
                onClose={() => setQuickSupplierOpen(false)}
                onCreated={handleQuickSupplierCreated}
              />
            </>
          )}
                </div>
              </div>
              {selectedRequest ? (
                <div className="flex flex-col gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedRequestFlowStatus.label || "Fluxo de cotação"}</span>
                    <span className="ml-2">
                      {winningQuote ? `Vencedora: ${winningQuote.supplierTradeName || winningQuote.supplierName}` : "Nenhuma vencedora selecionada"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canSubmitApproval ? (
                      <Button type="button" size="sm" onClick={() => resubmitMutation.mutate(selectedRequest.id)} disabled={resubmitMutation.isPending}>
                        <Check className="h-4 w-4" />
                        Enviar para aprovação
                      </Button>
                    ) : null}
                    {canResubmitApproval ? (
                      <Button type="button" size="sm" onClick={() => resubmitMutation.mutate(selectedRequest.id)} disabled={resubmitMutation.isPending}>
                        <RotateCcw className="h-4 w-4" />
                        Reenviar para aprovação
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={closeRequestModal}>
                      Fechar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}






