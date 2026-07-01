"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Eye, Pencil, Send, Ban, CirclePlus } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, FormCard, LoadingTable, SelectField, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import { canDo } from "@/lib/auth/permissions-ui";
import { StatusBadge } from "@/components/common/status-badge";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestStatusTone,
  getPurchaseRequestTypeLabel,
  purchaseUnitOfMeasureOptions,
  purchasePrioritySchema,
  purchaseUnitOfMeasureSchema,
  purchaseRequestTypeSchema,
  purchaseRequestWriteSchema
} from "@/lib/purchases/schemas";
import { z } from "zod";

const purchaseRequestFormSchema = purchaseRequestWriteSchema.omit({ action: true });

type PurchaseRequestFormValues = z.infer<typeof purchaseRequestFormSchema>;

type PurchaseRequestStatus =
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

type PurchaseRequestItem = {
  id: string;
  description: string;
  quantity: number;
  unitOfMeasure: z.infer<typeof purchaseUnitOfMeasureSchema>;
  unitOfMeasureLabel: string;
  notes: string;
};

type PurchaseRequestRecord = {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  requestedById: string;
  requestedByName: string;
  requestNumber: string;
  title: string;
  description: string;
  justification: string;
  requestType: z.infer<typeof purchaseRequestTypeSchema>;
  requestTypeLabel: string;
  priority: z.infer<typeof purchasePrioritySchema>;
  priorityLabel: string;
  desiredDate: string;
  totalEstimatedAmount: number;
  totalApprovedAmount: number;
  quotationRequired: boolean;
  requiredQuoteCount: number;
  approvalRequired: boolean;
  directorApprovalRequired: boolean;
  approvalStatus?: "pending" | "approved" | "rejected" | "returned_to_purchases" | null;
  approvalDecisionNotes?: string;
  status: PurchaseRequestStatus;
  statusLabel: string;
  approvalRequestId: string;
  budgetPeriodId: string;
  budgetLineId: string;
  budgetReservationId: string;
  overBudget: boolean;
  overBudgetJustification: string;
  paymentRequestId: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseRequestItem[];
};

type PurchaseRequestsResponse = {
  ok: true;
  requests: PurchaseRequestRecord[];
  units: Array<{ id: string; code: string; name: string }>;
  departments: Array<{ id: string; unit_id: string; code: string; name: string }>;
  costCenters: Array<{ id: string; unit_id: string; code: string; name: string }>;
};

const emptyItem = {
  description: "",
  quantity: 1,
  unitOfMeasure: "" as PurchaseRequestFormValues["items"][number]["unitOfMeasure"],
  notes: ""
};

const emptyForm: PurchaseRequestFormValues = {
  unitId: "",
  departmentId: "",
  costCenterId: "",
  title: "",
  description: "",
  justification: "",
  requestType: "normal",
  priority: "normal",
  desiredDate: "",
  items: [emptyItem]
};

type PurchaseRequestQueueFilter = "active" | "quotation" | "pending_approval" | "returned" | "finished" | "all";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function isPurchaseRequestAwaitingApproval(request: PurchaseRequestRecord) {
  return request.approvalStatus === "pending" && request.approvalRequired && request.totalApprovedAmount > 0;
}

function isPurchaseRequestFinished(request: PurchaseRequestRecord) {
  return (
    request.approvalStatus === "approved" ||
    request.approvalStatus === "rejected" ||
    request.status === "approved" ||
    request.status === "rejected" ||
    request.status === "closed" ||
    request.status === "cancelled"
  );
}

function canCancelPurchaseRequest(request: PurchaseRequestRecord) {
  const isInitialStatus = request.status === "draft" || request.status === "submitted" || request.status === "under_review";
  const hasApprovalDecision =
    request.approvalStatus === "approved" ||
    request.approvalStatus === "rejected" ||
    request.approvalStatus === "returned_to_purchases";

  return (
    isInitialStatus &&
    !hasApprovalDecision &&
    !isPurchaseRequestAwaitingApproval(request) &&
    !isPurchaseRequestFinished(request) &&
    request.totalApprovedAmount <= 0 &&
    !request.approvalRequestId
  );
}

function matchesQueueFilter(request: PurchaseRequestRecord, filter: PurchaseRequestQueueFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return request.status === "draft" || request.status === "submitted" || request.status === "under_review";
  }

  if (filter === "quotation") {
    return request.status === "quotation" && !isPurchaseRequestAwaitingApproval(request) && request.approvalStatus !== "returned_to_purchases" && !isPurchaseRequestFinished(request);
  }

  if (filter === "pending_approval") {
    return isPurchaseRequestAwaitingApproval(request);
  }

  if (filter === "returned") {
    return request.approvalStatus === "returned_to_purchases";
  }

  return isPurchaseRequestFinished(request);
}

function getPurchaseRequestFlowStatus(request: PurchaseRequestRecord) {
  if (request.approvalStatus === "approved" || request.status === "approved") {
    return { label: "Compra aprovada", tone: "success" as const };
  }

  if (request.approvalStatus === "rejected" || request.status === "rejected") {
    return { label: "Compra reprovada", tone: "danger" as const };
  }

  if (request.approvalStatus === "returned_to_purchases") {
    return { label: "Devolvida para Compras", tone: "info" as const };
  }

  if (isPurchaseRequestAwaitingApproval(request)) {
    return request.totalApprovedAmount > 200
      ? { label: "Aguardando aprovação da Diretoria Geral", tone: "warning" as const }
      : { label: "Aguardando aprovação da Gerência Administrativa", tone: "info" as const };
  }

  if (request.status === "quotation" && request.totalApprovedAmount > 0) {
    return { label: "Vencedora selecionada", tone: "success" as const };
  }

  return {
    label: request.statusLabel,
    tone: getPurchaseRequestStatusTone(request.status)
  };
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

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

export function PurchaseRequestsClient() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseRequestQueueFilter>("active");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editingStatus, setEditingStatus] = useState<PurchaseRequestStatus | null>(null);
  const [submitAction, setSubmitAction] = useState<"save" | "submit">("save");

  // Unidade ativa na queryKey: trocar a unidade no header refaz fetch da lista
  // (agora escopada por unidade ativa no servidor), sem vazar a unidade anterior.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  // Fase 2: gate de UI. Esconde acoes de mutacao para quem nao tem requests.manage (UNIAO); o
  // servidor continua barrando por unidade. "*" (super admin) => tudo. O disabled de fluxo e' mantido.
  const permissions = useAppStore((state) => state.permissions);
  const canManageRequests = canDo(permissions, "PURCHASES:requests.manage");
  const purchasesQuery = useQuery({
    queryKey: ["purchases", "requests", activeUnitId],
    queryFn: async () => requestJson<PurchaseRequestsResponse>("/api/purchases/requests")
  });

  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues: emptyForm,
    mode: "onTouched",
    reValidateMode: "onChange"
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const selectedUnitId = useWatch({ control: form.control, name: "unitId" });

  const units = useMemo(() => purchasesQuery.data?.units ?? [], [purchasesQuery.data?.units]);
  const departments = useMemo(() => purchasesQuery.data?.departments ?? [], [purchasesQuery.data?.departments]);
  const costCenters = useMemo(() => purchasesQuery.data?.costCenters ?? [], [purchasesQuery.data?.costCenters]);
  const requests = useMemo(() => purchasesQuery.data?.requests ?? [], [purchasesQuery.data?.requests]);
  const editingRequest = useMemo(() => requests.find((request) => request.id === editingId) ?? null, [editingId, requests]);

  const activeDepartments = useMemo(
    () => departments.filter((department) => !selectedUnitId || department.unit_id === selectedUnitId),
    [departments, selectedUnitId]
  );
  const activeCostCenters = useMemo(
    () => costCenters.filter((costCenter) => !selectedUnitId || costCenter.unit_id === selectedUnitId),
    [costCenters, selectedUnitId]
  );

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesSearch =
        !term ||
        [request.requestNumber, request.title, request.unitName, request.departmentName, request.statusLabel, request.requestedByName]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(term));

      const matchesStatus = matchesQueueFilter(request, statusFilter);
      const matchesPriority = !priorityFilter || request.priority === priorityFilter;
      const matchesType = !typeFilter || request.requestType === typeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesType;
    });
  }, [requests, search, statusFilter, priorityFilter, typeFilter]);

  useEffect(() => {
    if (!selectedUnitId) {
      return;
    }

    const departmentIsValid = activeDepartments.some((department) => department.id === form.getValues("departmentId"));
    const costCenterIsValid = activeCostCenters.some((costCenter) => costCenter.id === form.getValues("costCenterId"));

    if (!departmentIsValid) {
      form.setValue("departmentId", "", { shouldDirty: true, shouldValidate: false });
      form.clearErrors("departmentId");
    }

    if (!costCenterIsValid) {
      form.setValue("costCenterId", "", { shouldDirty: true, shouldValidate: false });
      form.clearErrors("costCenterId");
    }
  }, [activeCostCenters, activeDepartments, form, selectedUnitId]);

  const saveMutation = useMutation({
    mutationFn: async (payload: PurchaseRequestFormValues & { action: "save" | "submit" }) => {
      const url = editingId ? `/api/purchases/requests/${editingId}` : "/api/purchases/requests";
      const method = editingId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditingId(null);
      setEditingStatus(null);
      form.reset(emptyForm);
      replace([emptyItem]);
      await queryClient.invalidateQueries({ queryKey: ["purchases", "requests"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível salvar a solicitação.")
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => requestJson(`/api/purchases/requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
    onSuccess: async () => {
      setFormOpen(false);
      setEditingId(null);
      setEditingStatus(null);
      setError("");
      form.clearErrors();
      await queryClient.invalidateQueries({ queryKey: ["purchases", "requests"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Não foi possível cancelar a solicitação.")
  });

  function openNew() {
    // Pré-seleciona a unidade ATIVA (a que o usuário está operando), não a primeira arbitraria.
    // Fallback defensivo: se a unidade ativa nao estiver entre as unidades de compras, usa units[0].
    const initialUnitId =
      activeUnitId && units.some((unit) => unit.id === activeUnitId) ? activeUnitId : units[0]?.id ?? "";

    setEditingId(null);
    setEditingStatus("draft");
    setExpandedRequestId(null);
    setError("");
    form.clearErrors();
    form.reset({
      ...emptyForm,
      unitId: initialUnitId
    });
    replace([emptyItem]);
    setFormOpen(true);
  }

  function openEdit(request: PurchaseRequestRecord) {
    setEditingId(request.id);
    setEditingStatus(request.status);
    setExpandedRequestId(request.id);
    setError("");
    form.clearErrors();
    form.reset({
      unitId: request.unitId,
      departmentId: request.departmentId,
      costCenterId: request.costCenterId,
      title: request.title,
      description: request.description,
      justification: request.justification,
      requestType: request.requestType,
      priority: request.priority,
      desiredDate: request.desiredDate,
      items: request.items.length
        ? request.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
            notes: item.notes
          }))
        : [emptyItem]
    });
    replace(
      request.items.length
        ? request.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
            notes: item.notes
          }))
        : [emptyItem]
    );
    setFormOpen(true);
  }

  function submitForm(action: "save" | "submit") {
    if (action === "submit" && editingStatus === "submitted") {
      return;
    }

    setSubmitAction(action);
    void form.handleSubmit((values) => saveMutation.mutate({ ...values, action }))();
  }

  const isSubmittedEdit = editingId !== null && editingStatus === "submitted";
  const canCancelEditingRequest = editingRequest ? canCancelPurchaseRequest(editingRequest) : false;

  function canEdit(request: PurchaseRequestRecord) {
    return request.status === "draft" || request.status === "submitted";
  }

  function addItem() {
    append({ ...emptyItem });
  }

  function buildUnitLabel(request: PurchaseRequestRecord) {
    return request.unitCode ? `${request.unitCode} - ${request.unitName}` : request.unitName;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Número, título, unidade, departamento ou solicitante" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Fila</Label>
            <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PurchaseRequestQueueFilter)} data-testid="solicitacao-filtro-fila">
              <option value="active">Aguardando tratamento</option>
              <option value="quotation">Em cotação</option>
              <option value="pending_approval">Aguardando aprovação</option>
              <option value="returned">Devolvidas</option>
              <option value="finished">Finalizadas</option>
              <option value="all">Todas</option>
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <SelectField value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">Todas</option>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <SelectField value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">Todos</option>
              <option value="normal">Normal</option>
              <option value="emergency">Emergencial</option>
            </SelectField>
          </div>
        </div>
        {canManageRequests ? (
          <Button onClick={openNew} data-testid="solicitacao-nova">
            <Plus className="h-4 w-4" />
            Nova solicitação
          </Button>
        ) : null}
      </div>

      {formOpen ? (
        <FormCard
          title={editingId ? "Editar solicitação de compra" : "Nova solicitação de compra"}
          onCancel={() => {
            setFormOpen(false);
            setEditingId(null);
            setEditingStatus(null);
            setError("");
            form.clearErrors();
          }}
        >
          <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <Field label="Unidade">
                <Controller
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("unitId");
                      }}
                      data-testid="solicitacao-unidade"
                    >
                      <option value="">Selecione</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.code} - {unit.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                />
                <FieldError message={form.formState.errors.unitId?.message} />
              </Field>
              <Field label="Departamento">
                <Controller
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("departmentId");
                      }}
                      data-testid="solicitacao-departamento"
                    >
                      <option value="">Selecione</option>
                      {activeDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.code} - {department.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                />
                <FieldError message={form.formState.errors.departmentId?.message} />
              </Field>
              <Field label="Centro de custo">
                <Controller
                  control={form.control}
                  name="costCenterId"
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("costCenterId");
                      }}
                    >
                      <option value="">Sem centro de custo</option>
                      {activeCostCenters.map((costCenter) => (
                        <option key={costCenter.id} value={costCenter.id}>
                          {costCenter.code} - {costCenter.name}
                        </option>
                      ))}
                    </SelectField>
                  )}
                />
                <FieldError message={form.formState.errors.costCenterId?.message} />
              </Field>
              <Field label="Título">
                <Controller
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <TextInput
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("title");
                      }}
                      data-testid="solicitacao-titulo"
                    />
                  )}
                />
                <FieldError message={form.formState.errors.title?.message} />
              </Field>
              <Field label="Tipo">
                <Controller
                  control={form.control}
                  name="requestType"
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("requestType");
                      }}
                    >
                      <option value="normal">Normal</option>
                      <option value="emergency">Emergencial</option>
                    </SelectField>
                  )}
                />
                <FieldError message={form.formState.errors.requestType?.message} />
              </Field>
              <Field label="Prioridade">
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <SelectField
                      name={field.name}
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("priority");
                      }}
                    >
                      <option value="low">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="critical">Crítica</option>
                    </SelectField>
                  )}
                />
                <FieldError message={form.formState.errors.priority?.message} />
              </Field>
              <Field label="Data desejada">
                <TextInput type="date" {...form.register("desiredDate")} />
                <FieldError message={form.formState.errors.desiredDate?.message} />
              </Field>
                <Field label="O que precisa ser comprado?" className="lg:col-span-2">
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <TextArea
                      rows={4}
                      placeholder="Ex.: 10 lâmpadas LED para corredores do 2º andar"
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("description");
                      }}
                      data-testid="solicitacao-descricao"
                    />
                  )}
                />
                <FieldError message={form.formState.errors.description?.message} />
              </Field>
                <Field label="Por que essa compra é necessária?" className="lg:col-span-2">
                <Controller
                  control={form.control}
                  name="justification"
                  render={({ field }) => (
                    <TextArea
                      rows={4}
                      placeholder="Ex.: reposição necessária por lâmpadas queimadas e reclamações de hóspedes"
                      value={field.value ?? ""}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        form.clearErrors("justification");
                      }}
                      data-testid="solicitacao-justificativa"
                    />
                  )}
                />
                <FieldError message={form.formState.errors.justification?.message} />
              </Field>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Itens da solicitação</h3>
                  <p className="text-xs text-muted-foreground">Inclua um ou mais itens com quantidade e unidade de medida.</p>
                </div>
                <Button type="button" variant="outline" onClick={addItem}>
                  <CirclePlus className="h-4 w-4" />
                  Adicionar item
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="rounded-md border bg-background p-3">
                    <div className="grid gap-3 lg:grid-cols-12">
                      <Field label="Descrição" className="lg:col-span-4">
                        <Controller
                          control={form.control}
                          name={`items.${index}.description`}
                          render={({ field }) => (
                            <TextInput
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                form.clearErrors(`items.${index}.description`);
                              }}
                              data-testid={`solicitacao-item-${index}-descricao`}
                            />
                          )}
                        />
                        <FieldError message={form.formState.errors.items?.[index]?.description?.message} />
                      </Field>
                      <Field label="Quantidade" className="lg:col-span-2">
                        <Controller
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <TextInput
                              type="text"
                              inputMode="decimal"
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                form.clearErrors(`items.${index}.quantity`);
                              }}
                              data-testid={`solicitacao-item-${index}-quantidade`}
                            />
                          )}
                        />
                        <FieldError message={form.formState.errors.items?.[index]?.quantity?.message} />
                      </Field>
                      <Field label="Unidade de medida" className="lg:col-span-3">
                        <Controller
                          control={form.control}
                          name={`items.${index}.unitOfMeasure`}
                          render={({ field }) => (
                            <SelectField
                              name={field.name}
                              value={field.value ?? ""}
                              onBlur={field.onBlur}
                              onChange={(event) => {
                                field.onChange(event.target.value);
                                form.clearErrors(`items.${index}.unitOfMeasure`);
                              }}
                              data-testid={`solicitacao-item-${index}-unidade-medida`}
                            >
                              <option value="">Selecione</option>
                              {purchaseUnitOfMeasureOptions.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.label}
                                </option>
                              ))}
                            </SelectField>
                          )}
                        />
                        <FieldError message={form.formState.errors.items?.[index]?.unitOfMeasure?.message} />
                      </Field>
                      <Field label="Observações" className="lg:col-span-3">
                        <TextArea rows={2} {...form.register(`items.${index}.notes`)} />
                        <FieldError message={form.formState.errors.items?.[index]?.notes?.message} />
                      </Field>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button type="button" variant="danger" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">Valor será definido na cotação pelo setor de Compras.</p>
                <p className="font-semibold text-foreground">Valor será definido na cotação.</p>
              </div>
            </div>

            {form.watch("requestType") === "emergency" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Compra emergencial continua exigindo justificativa clara. A análise de cotação reduzida será tratada em próxima etapa.
              </div>
            ) : null}

            <ErrorMessage message={error} />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">O valor será definido posteriormente pelo setor de Compras durante a cotação.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canManageRequests ? (
                    <Button type="button" variant="outline" onClick={() => submitForm("save")} disabled={saveMutation.isPending} data-testid="solicitacao-salvar">
                      <Pencil className="h-4 w-4" />
                      {isSubmittedEdit ? "Salvar alterações" : "Salvar rascunho"}
                    </Button>
                  ) : null}
                  {canManageRequests ? (
                    !isSubmittedEdit ? (
                    <Button type="button" onClick={() => submitForm("submit")} disabled={saveMutation.isPending} data-testid="solicitacao-enviar">
                      {submitAction === "submit" ? <Send className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      Enviar para análise
                    </Button>
                  ) : canCancelEditingRequest ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => editingId ? cancelMutation.mutate(editingId) : undefined}
                      disabled={cancelMutation.isPending}
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar solicitação
                    </Button>
                  ) : null
                  ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                    setEditingStatus(null);
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </form>
        </FormCard>
      ) : null}

      {purchasesQuery.isLoading ? <LoadingTable label="Carregando solicitações..." /> : null}
      {purchasesQuery.error ? (
        <ErrorMessage message={purchasesQuery.error instanceof Error ? purchasesQuery.error.message : "Erro ao carregar solicitações."} />
      ) : null}

      {!purchasesQuery.isLoading && !filteredRequests.length ? (
        <EmptyState
          title="Nenhuma solicitação de compra encontrada."
          description="Crie uma nova solicitação para iniciar o fluxo de compras."
        />
      ) : null}

      {filteredRequests.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Número</th>
                <th className="px-4 py-3 font-semibold">Título</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Departamento</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Valor estimado</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Solicitante</th>
                <th className="px-4 py-3 font-semibold">Criação</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRequests.map((request) => {
                const flowStatus = getPurchaseRequestFlowStatus(request);

                return (
                  <Fragment key={request.id}>
                    <tr className="hover:bg-muted/35">
                      <td className="px-4 py-3 font-medium">{request.requestNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{request.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{request.justification}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{buildUnitLabel(request)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{request.departmentCode ? `${request.departmentCode} - ${request.departmentName}` : request.departmentName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{request.priorityLabel}</td>
                      <td className="px-4 py-3 text-muted-foreground">{request.requestTypeLabel}</td>
                      <td className="px-4 py-3 font-medium">
                        {request.totalEstimatedAmount > 0 ? formatCurrency(request.totalEstimatedAmount) : "Valor será definido na cotação"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={flowStatus.tone} label={flowStatus.label} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{request.requestedByName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(request.createdAt).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setExpandedRequestId(expandedRequestId === request.id ? null : request.id)}>
                          <Eye className="h-4 w-4" />
                          Itens
                        </Button>
                        {canManageRequests && canEdit(request) ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(request)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        ) : null}
                        {canManageRequests && canCancelPurchaseRequest(request) ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => cancelMutation.mutate(request.id)} disabled={cancelMutation.isPending}>
                            <Ban className="h-4 w-4" />
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expandedRequestId === request.id ? (
                    <tr>
                      <td colSpan={11} className="bg-muted/25 px-4 py-4">
                        <div className="space-y-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold">Itens da solicitação</p>
                              <p className="text-xs text-muted-foreground">Detalhe dos itens cadastrados para esta solicitação.</p>
                            </div>
                            <div className="text-sm font-semibold">Valor será definido na cotação.</div>
                          </div>
                          <div className="max-w-full overflow-x-auto rounded-md border bg-background">
                            <table className="w-full text-left text-sm">
                              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Descrição</th>
                                  <th className="px-3 py-2 font-semibold">Qtd</th>
                                  <th className="px-3 py-2 font-semibold">Unidade de medida</th>
                                  <th className="px-3 py-2 font-semibold">Obs.</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {request.items.map((item) => (
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
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
