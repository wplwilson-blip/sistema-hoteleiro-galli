"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Ban, Check, Pencil, Plus, RotateCcw, Search, Truck } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, FormCard, LoadingTable, SelectField, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
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

type QuoteItemFormValue = {
  purchaseRequestItemId: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  deliveryNotes: string;
};

type PurchaseQuoteFormValues = {
  supplierId: string;
  quoteNumber: string;
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

function buildDefaultQuoteForm(request: PurchaseRequestDetail | null): PurchaseQuoteFormValues {
  const today = new Date();
  const validUntil = addDays(today, 90);

  return {
    supplierId: "",
    quoteNumber: "",
    quoteDate: toDateInputValue(today),
    validUntil: toDateInputValue(validUntil),
    deliveryDays: "",
    paymentTerms: "",
    notes: "",
    isRecurringSupplierQuote: false,
    quoteValidityException: false,
    quoteValidityExceptionReason: "",
    items: request?.items.map((item) => ({
      purchaseRequestItemId: item.id,
      itemDescription: item.description,
      quantity: String(item.quantity),
      unitPrice: "",
      deliveryNotes: ""
    })) ?? []
  };
}

function buildEditQuoteForm(quote: PurchaseQuoteRecord): PurchaseQuoteFormValues {
  return {
    supplierId: quote.supplierId,
    quoteNumber: quote.quoteNumber,
    quoteDate: quote.quoteDate,
    validUntil: quote.validUntil,
    deliveryDays: quote.deliveryDays === "" ? "" : String(quote.deliveryDays),
    paymentTerms: quote.paymentTerms,
    notes: quote.notes,
    isRecurringSupplierQuote: quote.isRecurringSupplierQuote,
    quoteValidityException: quote.quoteValidityException,
    quoteValidityExceptionReason: quote.quoteValidityExceptionReason,
    items: quote.items.map((item) => ({
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
  const selectedRequest = detailQuery.data?.request ?? null;
  const quotes = useMemo(() => detailQuery.data?.quotes ?? [], [detailQuery.data?.quotes]);

  useEffect(() => {
    if (!selectedRequestId && requests.length) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  useEffect(() => {
    if (!quoteValidityException) {
      quoteForm.clearErrors("quoteValidityExceptionReason");
    }
  }, [quoteValidityException, quoteForm]);

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

  function openRequest(requestId: string) {
    setSelectedRequestId(requestId);
    setQuoteFormOpen(false);
    setEditingQuoteId(null);
    setError("");
  }

  function openNewQuote() {
    if (!selectedRequest) {
      return;
    }

    const nextValues = buildDefaultQuoteForm(selectedRequest);
    setEditingQuoteId(null);
    setQuoteFormOpen(true);
    setError("");
    quoteForm.clearErrors();
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }

  function openEditQuote(quote: PurchaseQuoteRecord) {
    const nextValues = buildEditQuoteForm(quote);
    setEditingQuoteId(quote.id);
    setQuoteFormOpen(true);
    setError("");
    quoteForm.clearErrors();
    quoteForm.reset(nextValues);
    replace(nextValues.items);
  }

  function closeQuoteForm() {
    setQuoteFormOpen(false);
    setEditingQuoteId(null);
    setError("");
    quoteForm.clearErrors();
    quoteForm.reset(buildDefaultQuoteForm(selectedRequest));
    replace(buildDefaultQuoteForm(selectedRequest).items);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: PurchaseQuoteFormValues) => {
      if (!selectedRequestId) {
        throw new Error("Selecione uma solicitacao.");
      }

      const url = editingQuoteId
        ? `/api/purchases/requests/${selectedRequestId}/quotes/${editingQuoteId}`
        : `/api/purchases/requests/${selectedRequestId}/quotes`;
      const method = editingQuoteId ? "PATCH" : "POST";

      return requestJson(url, {
        method,
        body: JSON.stringify({ ...payload, action: "save" })
      });
    },
    onSuccess: async () => {
      setError("");
      setQuoteFormOpen(false);
      setEditingQuoteId(null);
      quoteForm.reset(buildDefaultQuoteForm(selectedRequest));
      replace(buildDefaultQuoteForm(selectedRequest).items);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] }),
        selectedRequestId ? queryClient.invalidateQueries({ queryKey: ["purchases", "quotes", selectedRequestId] }) : Promise.resolve()
      ]);
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
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes", requestId] })
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
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes", variables.requestId] })
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
        queryClient.invalidateQueries({ queryKey: ["purchases", "quotes", variables.requestId] })
      ]);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível cancelar a cotação.")
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
  const showQuoteWarning = selectedRequest ? Boolean(selectedRequest.requiredQuoteCount) && quotes.length < selectedRequest.requiredQuoteCount : false;

  const quoteItemsWatch = useWatch({ control: quoteForm.control, name: "items" });
  const quoteTotalPreview = useMemo(
    () => quoteItemsWatch?.reduce((sum, item) => sum + parseLocalizedNumber(item.quantity) * parseLocalizedNumber(item.unitPrice), 0) ?? 0,
    [quoteItemsWatch]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Buscar solicitacao</Label>
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
              <p className="text-sm text-muted-foreground">Somente solicitações enviadas, em análise ou em cotação.</p>
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
                    <th className="px-4 py-3 font-semibold">Titulo</th>
                    <th className="px-4 py-3 font-semibold">Prioridade</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredRequests.map((request) => {
                    const isSelected = request.id === selectedRequestId;

                    return (
                      <tr key={request.id} className={isSelected ? "bg-muted/30" : "hover:bg-muted/25"}>
                        <td className="px-4 py-3 font-medium">{request.requestNumber}</td>
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
                                onClick={() => {
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
                              <Button type="button" size="sm" variant="outline" onClick={() => openRequest(request.id)}>
                                <RotateCcw className="h-4 w-4" />
                                Abrir cotação
                              </Button>
                            ) : null}
                            <Button type="button" size="sm" onClick={() => openRequest(request.id)}>
                              <Search className="h-4 w-4" />
                              Ver cotacoes
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
          {!selectedRequest ? (
            <EmptyState title="Selecione uma solicitacao" description="Escolha uma solicitacao da lista para iniciar, cadastrar ou comparar cotacoes." />
          ) : (
            <>
              <div className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
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
                    {canOpenQuote ? (
                      <Button type="button" onClick={openNewQuote} disabled={!suppliers.length}>
                        <Plus className="h-4 w-4" />
                        Nova cotação
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
                      {selectedRequest.items.map((item) => (
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
                  Esta compra exige 3 cotacoes antes da aprovacao.
                </div>
              ) : null}

              <div className="rounded-lg border bg-card p-5 shadow-sm shadow-primary/5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Cotações cadastradas</h3>
                    <p className="text-xs text-muted-foreground">Compare fornecedor, prazo, condição e validade.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={openNewQuote} disabled={!selectedRequest || !suppliers.length || !canOpenQuote}>
                      <Plus className="h-4 w-4" />
                      Nova cotação
                    </Button>
                  </div>
                </div>

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
                          <th className="px-3 py-2 text-right font-semibold">Acoes</th>
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
              </div>

              {quoteFormOpen ? (
                <FormCard
                  title={editingQuoteId ? "Editar cotação" : "Nova cotação"}
                  onCancel={closeQuoteForm}
                >
                  <form className="space-y-5" onSubmit={quoteForm.handleSubmit((values) => saveMutation.mutate(values))}>
                    {!suppliers.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Nenhum fornecedor ativo disponível. Cadastre um fornecedor antes de registrar cotações.
                      </div>
                    ) : null}

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
                      <Field label="Número da cotação">
                        <TextInput placeholder="CQ-..." {...quoteForm.register("quoteNumber")} />
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
                      <Field label="Condicao de pagamento">
                        <TextInput placeholder="Ex.: 30 dias" {...quoteForm.register("paymentTerms")} />
                      </Field>
                      <Field label="Observacoes" className="lg:col-span-2">
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
                        <span className="text-sm text-muted-foreground">Cotacao de fornecedor recorrente/homologado</span>
                      </Field>
                      <Field label="Excecao de validade" className="flex items-center gap-2 lg:col-span-1">
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
                        <span className="text-sm text-muted-foreground">Permitir validade acima do padrao com justificativa</span>
                      </Field>
                      {quoteValidityException ? (
                        <Field label="Justificativa da excecao" className="lg:col-span-2">
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

                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">Itens cotados</h4>
                          <p className="text-xs text-muted-foreground">Informe o valor unitário para cada item solicitado.</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {fields.map((field, index) => (
                          <div key={field.id} className="rounded-md border bg-background p-3">
                            <div className="grid gap-3 lg:grid-cols-12">
                              <Field label="Item da solicitacao" className="lg:col-span-3">
                                <Controller
                                  control={quoteForm.control}
                                  name={`items.${index}.purchaseRequestItemId`}
                                  render={({ field: itemField }) => <input type="hidden" value={itemField.value ?? ""} readOnly />}
                                />
                                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                  {selectedRequest.items[index]?.description || "-"}
                                </div>
                              </Field>
                              <Field label="Descrição do item" className="lg:col-span-3">
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
                              <Field label="Valor unitário" className="lg:col-span-2">
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
                              <Field label="Total" className="lg:col-span-1">
                                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">
                                  {formatCurrency(parseLocalizedNumber(quoteItemsWatch?.[index]?.quantity) * parseLocalizedNumber(quoteItemsWatch?.[index]?.unitPrice))}
                                </div>
                              </Field>
                              <Field label="Observacoes de entrega" className="lg:col-span-1">
                                <Controller
                                  control={quoteForm.control}
                                  name={`items.${index}.deliveryNotes`}
                                  render={({ field: itemField }) => (
                                    <TextArea
                                      rows={2}
                                      value={itemField.value ?? ""}
                                      onBlur={itemField.onBlur}
                                      onChange={(event) => itemField.onChange(event.target.value)}
                                    />
                                  )}
                                />
                              </Field>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-muted-foreground">Valor será definido na cotação pelo setor de Compras.</p>
                        <p className="font-semibold text-foreground">Total: {formatCurrency(quoteTotalPreview)}</p>
                      </div>
                    </div>

                    <ErrorMessage message={error} />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {quoteForm.formState.errors.items?.message ?? "Compare fornecedores, prazo, condição de pagamento e validade antes de selecionar a melhor proposta."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="submit" disabled={saveMutation.isPending || !suppliers.length}>
                          <Pencil className="h-4 w-4" />
                          {editingQuoteId ? "Salvar cotação" : "Salvar cotação"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={closeQuoteForm}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  </form>
                </FormCard>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
