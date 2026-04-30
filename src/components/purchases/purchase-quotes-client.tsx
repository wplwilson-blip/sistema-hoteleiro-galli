"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Ban, Check, Paperclip, Pencil, Plus, RotateCcw, Search, Trash2, Truck, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/status-badge";
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
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
  items: PurchaseQuoteItem[];
};

type SupplierRecord = {
  id: string;
  name: string;
  tradeName: string;
  documentNumber: string;
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

const purchaseQuoteFormSchemaClient = purchaseQuoteFormSchema;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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
  const [search, setSearch] = useState("");

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
    quoteForm.clearErrors();
    quoteForm.reset(nextValues);
    replace(nextValues.items);
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

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      if (!term) {
        return true;
      }

      return [request.requestNumber, request.title, request.justification, request.statusLabel, request.requestTypeLabel, request.priorityLabel]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });
  }, [requests, search]);

  const canStart = selectedRequest?.status === "submitted" || selectedRequest?.status === "under_review";
  const canOpenQuote = selectedRequest?.status === "quotation";
  const canCreateQuote = canOpenQuote && suppliers.length > 0;
  const showQuoteWarning = selectedRequest ? Boolean(selectedRequest.requiredQuoteCount) && quotes.length < selectedRequest.requiredQuoteCount : false;
  const selectedRequestItems = selectedRequest?.items ?? [];
  const isQuoteFormVisible = quoteFormOpen && Boolean(selectedRequest);

  const quoteItemsWatch = useWatch({ control: quoteForm.control, name: "items" });
  const quoteTotalPreview = useMemo(
    () => quoteItemsWatch?.reduce((sum, item) => sum + parseLocalizedNumber(item.quantity) * parseLocalizedNumber(item.unitPrice), 0) ?? 0,
    [quoteItemsWatch]
  );
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Buscar solicitação</Label>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Número, título, justificativa, status ou prioridade"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Solicitações elegíveis</h2>
              <p className="text-sm text-muted-foreground">Clique em uma solicitação ou use Selecionar para carregar os detalhes e cotações à direita.</p>
            </div>
          </div>

          {listQuery.isLoading ? <LoadingTable label="Carregando solicitações..." /> : null}
          {listQuery.error ? (
            <ErrorMessage message={listQuery.error instanceof Error ? listQuery.error.message : "Erro ao carregar solicitações."} />
          ) : null}

          {!listQuery.isLoading && !filteredRequests.length ? (
            <EmptyState title="Nenhuma solicitação elegível" description="Solicitações enviadas ou em análise aparecerão aqui para cotação." />
          ) : null}

          {filteredRequests.length ? (
            <div className="overflow-hidden rounded-lg border bg-card shadow-sm shadow-primary/5">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                          <th className="px-4 py-3 font-semibold">Número</th>
                    <th className="px-4 py-3 font-semibold">Título</th>
                    <th className="px-4 py-3 font-semibold">Prioridade</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRequests.map((request) => {
                    const isSelected = request.id === selectedRequestId;

                    return (
                      <tr
                        key={request.id}
                        className={isSelected ? "cursor-pointer bg-primary/10" : "cursor-pointer hover:bg-muted/25"}
                        onClick={() => openRequest(request.id)}
                      >
                        <td className={isSelected ? "border-l-4 border-primary px-4 py-3 font-medium" : "border-l-4 border-transparent px-4 py-3 font-medium"}>
                          <div className="flex flex-col gap-1">
                            <span>{request.requestNumber}</span>
                            {isSelected ? (
                              <span className="inline-flex w-fit rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Selecionada</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{request.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{request.justification}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{request.priorityLabel}</td>
                        <td className="px-4 py-3 text-muted-foreground">{request.requestTypeLabel}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={getPurchaseRequestStatusTone(request.status)} label={request.statusLabel} />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {request.totalApprovedAmount > 0 ? formatCurrency(request.totalApprovedAmount) : "Valor será definido na cotação"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {request.status === "submitted" || request.status === "under_review" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openRequest(request.id);
                                  startMutation.mutate(request.id);
                                }}
                                disabled={startMutation.isPending}
                              >
                                <Truck className="h-4 w-4" />
                                Iniciar cotação
                              </Button>
                            ) : null}
                            {request.status === "quotation" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openRequest(request.id);
                                }}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Abrir cotação
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              disabled={isSelected}
                              onClick={(event) => {
                                event.stopPropagation();
                                openRequest(request.id);
                              }}
                            >
                              {isSelected ? <Check className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                              {isSelected ? "Selecionada" : "Selecionar"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          {selectedRequestId && detailQuery.isLoading ? (
            <LoadingTable label="Carregando solicitação selecionada..." />
          ) : !selectedRequest ? (
            <EmptyState title="Selecione uma solicitação" description="Selecione uma solicitação à esquerda para visualizar os itens e cadastrar cotações." />
          ) : (
            <>
              <div className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Solicitação selecionada</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{selectedRequest.requestNumber}</h2>
                      <StatusBadge status={getPurchaseRequestStatusTone(selectedRequest.status)} label={selectedRequest.statusLabel} />
                    </div>
                    <h3 className="text-base font-semibold">{selectedRequest.title}</h3>
                    <p className="max-w-3xl text-sm text-muted-foreground">{selectedRequest.justification}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Prioridade: {selectedRequest.priorityLabel}</span>
                      <span>Tipo: {selectedRequest.requestTypeLabel}</span>
                      <span>Criação: {formatDate(selectedRequest.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canStart ? (
                      <Button type="button" variant="outline" onClick={() => startMutation.mutate(selectedRequest.id)} disabled={startMutation.isPending}>
                        <Truck className="h-4 w-4" />
                        Iniciar cotação
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Itens solicitados</h3>
                    <p className="text-xs text-muted-foreground">Base para preenchimento das cotações.</p>
                  </div>
                  <div className="text-sm font-semibold">
                    {selectedRequest.totalApprovedAmount > 0 ? formatCurrency(selectedRequest.totalApprovedAmount) : "Valor será definido na cotação."}
                  </div>
                </div>
                <div className="mt-4 overflow-hidden rounded-md border bg-background">
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

              {showQuoteWarning ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Esta compra exige 3 cotações antes da aprovação.
                </div>
              ) : null}

              <div className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
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

                {selectedRequest?.status === "quotation" && !suppliers.length ? (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p>Cadastre ao menos um fornecedor ativo antes de registrar cotações.</p>
                    <Link
                      href="/cadastros/fornecedores"
                      className="mt-3 inline-flex items-center rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                    >
                      Ir para fornecedores
                    </Link>
                  </div>
                ) : null}

                {attachmentMessage ? (
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    {attachmentMessage}
                  </div>
                ) : null}

                {quotes.length ? (
                  <div className="mt-4 overflow-hidden rounded-md border bg-background">
                    <table className="w-full min-w-[1180px] text-left text-sm">
                      <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Fornecedor</th>
                          <th className="px-3 py-2 font-semibold">Número</th>
                          <th className="px-3 py-2 font-semibold">Total</th>
                          <th className="px-3 py-2 font-semibold">Prazo</th>
                          <th className="px-3 py-2 font-semibold">Pagamento</th>
                          <th className="px-3 py-2 font-semibold">Validade</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Selecionada</th>
                          <th className="px-3 py-2 text-right font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {quotes.map((quote) => (
                          <tr key={quote.id} className={quote.isSelected ? "bg-primary/5" : ""}>
                            <td className="px-3 py-2">
                              <div className="font-medium">{quote.supplierTradeName || quote.supplierName}</div>
                              <div className="text-xs text-muted-foreground">{quote.supplierDocumentNumber || "-"}</div>
                            </td>
                            <td className="px-3 py-2">{quote.quoteNumber}</td>
                            <td className="px-3 py-2 font-medium">{quote.totalAmountLabel}</td>
                            <td className="px-3 py-2 text-muted-foreground">{quote.deliveryDays || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{quote.paymentTerms || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatDate(quote.validUntil)}
                              {quote.isExpired ? <span className="ml-2 text-xs text-amber-700">Vencida</span> : null}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={quote.statusTone} label={quote.statusLabel} />
                            </td>
                            <td className="px-3 py-2">
                              {quote.isSelected ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  Sim
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Não</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => openEditQuote(quote)}>
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => selectMutation.mutate({ requestId: selectedRequest.id, quoteId: quote.id })}
                                  disabled={selectMutation.isPending || quote.isSelected}
                                >
                                  <Check className="h-4 w-4" />
                                  Selecionar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteMutation.mutate({ requestId: selectedRequest.id, quoteId: quote.id })}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Ban className="h-4 w-4" />
                                  Cancelar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="Nenhuma cotação cadastrada" description="Use Nova cotação para registrar propostas de fornecedores." />
                )}

                {quotes.length ? (
                  <div className="mt-5 space-y-4">
                    {quotes.map((quote) => {
                      const quoteAttachments = attachmentsByQuoteId[quote.id] ?? [];
                      const selectedFile = attachmentFiles[quote.id];

                      return (
                        <section key={quote.id} className="space-y-4 rounded-lg border bg-background p-4">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <Paperclip className="h-4 w-4" />
                                Anexos
                              </div>
                              <p className="text-xs text-muted-foreground">Propostas, documentos ou imagens enviados pelo fornecedor.</p>
                              <p className="text-xs font-medium text-foreground">
                                {quote.quoteNumber} - {quote.supplierTradeName || quote.supplierName}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
                            <div className="space-y-1">
                              <Label>Descrição opcional</Label>
                              <Input
                                value={attachmentDescriptions[quote.id] ?? ""}
                                onChange={(event) => setAttachmentDescriptions((current) => ({ ...current, [quote.id]: event.target.value }))}
                                placeholder="Ex.: Proposta comercial"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Arquivo</Label>
                              <Input
                                key={`${quote.id}-${selectedFile?.name ?? "empty"}`}
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                                onChange={(event) => {
                                  setError("");
                                  setAttachmentMessage("");
                                  setAttachmentFiles((current) => ({ ...current, [quote.id]: event.target.files?.[0] ?? null }));
                                }}
                              />
                            </div>
                            <Button type="button" onClick={() => uploadQuoteAttachment(quote.id)} disabled={uploadAttachmentMutation.isPending}>
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
                                          variant="outline"
                                          onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                                          disabled={deleteAttachmentMutation.isPending}
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
                      );
                    })}
                  </div>
                ) : null}
              </div>

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
                      <div className="flex items-start justify-between border-b px-6 py-5">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {editingQuoteId ? "Editar cotação" : "Nova cotação"}
                          </p>
                          <h3 id="quote-form-title" className="text-lg font-semibold text-foreground">
                            Informe os valores propostos pelo fornecedor para esta solicitação.
                          </h3>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={closeQuoteForm}>
                          <Ban className="h-4 w-4" />
                          Fechar
                        </Button>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
                        <form className="space-y-6" onSubmit={quoteForm.handleSubmit((values) => saveMutation.mutate(values))}>
                          {!suppliers.length ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <p>Nenhum fornecedor ativo disponível. Cadastre um fornecedor antes de registrar cotações.</p>
                              <Link
                                href="/cadastros/fornecedores"
                                className="mt-3 inline-flex items-center rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
                              >
                                Ir para fornecedores
                              </Link>
                            </div>
                          ) : null}

                          <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                            <div className="space-y-1">
                              <h4 className="text-sm font-semibold">Dados da cotação</h4>
                              <p className="text-xs text-muted-foreground">Preencha as condições oferecidas pelo fornecedor para esta solicitação.</p>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <Field label="Fornecedor">
                                <Controller
                                  control={quoteForm.control}
                                  name="supplierId"
                                  render={({ field }) => (
                                    <SelectField
                                      name={field.name}
                                      value={field.value ?? ""}
                                      onBlur={field.onBlur}
                                      onChange={(event) => {
                                        field.onChange(event.target.value);
                                        quoteForm.clearErrors("supplierId");
                                      }}
                                      disabled={!suppliers.length}
                                    >
                                      <option value="">Selecione</option>
                                      {suppliers.map((supplier) => (
                                        <option key={supplier.id} value={supplier.id}>
                                          {supplier.tradeName || supplier.name}
                                        </option>
                                      ))}
                                    </SelectField>
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

                          <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
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
                                  <div key={field.id} className="rounded-xl border bg-background p-4 shadow-sm">
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
                            <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold">Anexos da proposta</h4>
                                <p className="text-xs text-muted-foreground">Os arquivos serão enviados após salvar a cotação.</p>
                              </div>

                              <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)]">
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

                      <div className="flex flex-col gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold text-foreground">Total da cotação: {formatCurrency(quoteTotalPreview)}</p>
                          <p className="text-xs text-muted-foreground">
                            {quoteForm.formState.errors.items?.message ?? "Compare fornecedores, prazo, condição de pagamento e validade antes de selecionar a melhor proposta."}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button type="button" disabled={saveMutation.isPending || !suppliers.length} onClick={quoteForm.handleSubmit((values) => saveMutation.mutate(values))}>
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}






