"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Eye, Pencil, Send, Ban, CirclePlus } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, FormActions, FormCard, LoadingTable, SelectField, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/status-badge";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestStatusTone,
  getPurchaseRequestTypeLabel,
  purchasePrioritySchema,
  purchaseRequestTypeSchema,
  purchaseRequestWriteSchema
} from "@/lib/purchases/schemas";
import { cn } from "@/lib/utils";
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
  unitOfMeasure: string;
  estimatedUnitPrice: number;
  estimatedTotalPrice: number;
  approvedUnitPrice: number | null;
  approvedTotalPrice: number | null;
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
  unitOfMeasure: "",
  estimatedUnitPrice: 0,
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Nao foi possivel concluir a operacao.");
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
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [submitAction, setSubmitAction] = useState<"save" | "submit">("save");

  const purchasesQuery = useQuery({
    queryKey: ["purchases", "requests"],
    queryFn: async () => requestJson<PurchaseRequestsResponse>("/api/purchases/requests")
  });

  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues: emptyForm
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const selectedUnitId = useWatch({ control: form.control, name: "unitId" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  const units = useMemo(() => purchasesQuery.data?.units ?? [], [purchasesQuery.data?.units]);
  const departments = useMemo(() => purchasesQuery.data?.departments ?? [], [purchasesQuery.data?.departments]);
  const costCenters = useMemo(() => purchasesQuery.data?.costCenters ?? [], [purchasesQuery.data?.costCenters]);
  const requests = useMemo(() => purchasesQuery.data?.requests ?? [], [purchasesQuery.data?.requests]);
  const watchedItemsList = useMemo(() => watchedItems ?? [], [watchedItems]);

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

      const matchesStatus = !statusFilter || request.status === statusFilter;
      const matchesPriority = !priorityFilter || request.priority === priorityFilter;
      const matchesType = !typeFilter || request.requestType === typeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesType;
    });
  }, [requests, search, statusFilter, priorityFilter, typeFilter]);

  const estimatedTotal = useMemo(
    () => watchedItemsList.reduce((accumulator, item) => accumulator + Number(item?.quantity ?? 0) * Number(item?.estimatedUnitPrice ?? 0), 0),
    [watchedItemsList]
  );

  useEffect(() => {
    if (!selectedUnitId) {
      return;
    }

    const departmentIsValid = activeDepartments.some((department) => department.id === form.getValues("departmentId"));
    const costCenterIsValid = activeCostCenters.some((costCenter) => costCenter.id === form.getValues("costCenterId"));

    if (!departmentIsValid) {
      form.setValue("departmentId", "");
    }

    if (!costCenterIsValid) {
      form.setValue("costCenterId", "");
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
      form.reset(emptyForm);
      replace([emptyItem]);
      await queryClient.invalidateQueries({ queryKey: ["purchases", "requests"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar a solicitacao.")
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => requestJson(`/api/purchases/requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["purchases", "requests"] });
    }
  });

  function openNew() {
    const firstUnit = units[0]?.id ?? "";

    setEditingId(null);
    setExpandedRequestId(null);
    setError("");
    form.reset({
      ...emptyForm,
      unitId: firstUnit
    });
    replace([emptyItem]);
    setFormOpen(true);
  }

  function openEdit(request: PurchaseRequestRecord) {
    setEditingId(request.id);
    setExpandedRequestId(request.id);
    setError("");
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
            estimatedUnitPrice: item.estimatedUnitPrice,
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
            estimatedUnitPrice: item.estimatedUnitPrice,
            notes: item.notes
          }))
        : [emptyItem]
    );
    setFormOpen(true);
  }

  function submitForm(action: "save" | "submit") {
    setSubmitAction(action);
    void form.handleSubmit((values) => saveMutation.mutate({ ...values, action }))();
  }

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Numero, titulo, unidade, departamento ou solicitante" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="submitted">Enviada</option>
              <option value="under_review">Em analise</option>
              <option value="cancelled">Cancelada</option>
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <SelectField value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">Todas</option>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="critical">Critica</option>
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
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova solicitacao
        </Button>
      </div>

      {formOpen ? (
        <FormCard
          title={editingId ? "Editar solicitacao de compra" : "Nova solicitacao de compra"}
          onCancel={() => {
            setFormOpen(false);
            setEditingId(null);
            setError("");
          }}
        >
          <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Unidade">
                <SelectField {...form.register("unitId")}>
                  <option value="">Selecione</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name}
                    </option>
                  ))}
                </SelectField>
                <FieldError message={form.formState.errors.unitId?.message} />
              </Field>
              <Field label="Departamento">
                <SelectField {...form.register("departmentId")}>
                  <option value="">Selecione</option>
                  {activeDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </SelectField>
                <FieldError message={form.formState.errors.departmentId?.message} />
              </Field>
              <Field label="Centro de custo">
                <SelectField {...form.register("costCenterId")}>
                  <option value="">Sem centro de custo</option>
                  {activeCostCenters.map((costCenter) => (
                    <option key={costCenter.id} value={costCenter.id}>
                      {costCenter.code} - {costCenter.name}
                    </option>
                  ))}
                </SelectField>
                <FieldError message={form.formState.errors.costCenterId?.message} />
              </Field>
              <Field label="Titulo">
                <TextInput {...form.register("title")} />
                <FieldError message={form.formState.errors.title?.message} />
              </Field>
              <Field label="Tipo">
                <SelectField {...form.register("requestType")}>
                  <option value="normal">Normal</option>
                  <option value="emergency">Emergencial</option>
                </SelectField>
                <FieldError message={form.formState.errors.requestType?.message} />
              </Field>
              <Field label="Prioridade">
                <SelectField {...form.register("priority")}>
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="critical">Critica</option>
                </SelectField>
                <FieldError message={form.formState.errors.priority?.message} />
              </Field>
              <Field label="Data desejada">
                <TextInput type="date" {...form.register("desiredDate")} />
                <FieldError message={form.formState.errors.desiredDate?.message} />
              </Field>
              <Field label="Descricao / necessidade" className="lg:col-span-2">
                <TextArea rows={4} {...form.register("description")} />
                <FieldError message={form.formState.errors.description?.message} />
              </Field>
              <Field label="Justificativa" className="lg:col-span-2">
                <TextArea rows={4} {...form.register("justification")} />
                <FieldError message={form.formState.errors.justification?.message} />
              </Field>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Itens da solicitacao</h3>
                  <p className="text-xs text-muted-foreground">Inclua um ou mais itens com quantidade e valor estimado.</p>
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
                      <Field label="Descricao" className="lg:col-span-4">
                        <TextInput {...form.register(`items.${index}.description`)} />
                        <FieldError message={form.formState.errors.items?.[index]?.description?.message} />
                      </Field>
                      <Field label="Quantidade" className="lg:col-span-2">
                        <TextInput type="number" step="0.01" min="0.01" {...form.register(`items.${index}.quantity`, { valueAsNumber: true })} />
                        <FieldError message={form.formState.errors.items?.[index]?.quantity?.message} />
                      </Field>
                      <Field label="Unidade" className="lg:col-span-2">
                        <TextInput {...form.register(`items.${index}.unitOfMeasure`)} />
                        <FieldError message={form.formState.errors.items?.[index]?.unitOfMeasure?.message} />
                      </Field>
                      <Field label="Valor unitario" className="lg:col-span-2">
                        <TextInput type="number" step="0.01" min="0" {...form.register(`items.${index}.estimatedUnitPrice`, { valueAsNumber: true })} />
                        <FieldError message={form.formState.errors.items?.[index]?.estimatedUnitPrice?.message} />
                      </Field>
                      <Field label="Observacoes" className="lg:col-span-12">
                        <TextArea rows={2} {...form.register(`items.${index}.notes`)} />
                        <FieldError message={form.formState.errors.items?.[index]?.notes?.message} />
                      </Field>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">Total estimado calculado no cliente e recalculado no servidor.</p>
                <p className="font-semibold text-foreground">{formatCurrency(estimatedTotal)}</p>
              </div>
            </div>

            {form.watch("requestType") === "emergency" ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Compra emergencial continua exigindo justificativa clara. A analise de cotacao reduzida fica para uma sprint futura.
              </div>
            ) : null}

            <ErrorMessage message={error} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                A regra de alçada de R$ 200,00 é aplicada no servidor. Se o total ultrapassar esse valor, a solicitacao já sai com flags de aprovacao e cotacao.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => submitForm("save")} disabled={saveMutation.isPending}>
                  <Pencil className="h-4 w-4" />
                  Salvar rascunho
                </Button>
                <Button type="button" onClick={() => submitForm("submit")} disabled={saveMutation.isPending}>
                  {submitAction === "submit" ? <Send className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  Enviar para analise
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                  }}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </form>
        </FormCard>
      ) : null}

      {purchasesQuery.isLoading ? <LoadingTable label="Carregando solicitacoes..." /> : null}
      {purchasesQuery.error ? (
        <ErrorMessage message={purchasesQuery.error instanceof Error ? purchasesQuery.error.message : "Erro ao carregar solicitacoes."} />
      ) : null}

      {!purchasesQuery.isLoading && !filteredRequests.length ? (
        <EmptyState title="Nenhuma solicitacao encontrada" description="Crie a primeira solicitacao de compra para a unidade selecionada." />
      ) : null}

      {filteredRequests.length ? (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Numero</th>
                <th className="px-4 py-3 font-semibold">Titulo</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Departamento</th>
                <th className="px-4 py-3 font-semibold">Prioridade</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Valor estimado</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Solicitante</th>
                <th className="px-4 py-3 font-semibold">Criacao</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRequests.map((request) => (
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
                    <td className="px-4 py-3 font-medium">{formatCurrency(request.totalEstimatedAmount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={getPurchaseRequestStatusTone(request.status)} label={request.statusLabel} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{request.requestedByName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(request.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setExpandedRequestId(expandedRequestId === request.id ? null : request.id)}>
                          <Eye className="h-4 w-4" />
                          Itens
                        </Button>
                        {canEdit(request) ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(request)}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        ) : null}
                        {request.status === "draft" || request.status === "submitted" ? (
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
                              <p className="text-sm font-semibold">Itens da solicitacao</p>
                              <p className="text-xs text-muted-foreground">Detalhe dos itens cadastrados para esta solicitacao.</p>
                            </div>
                            <div className="text-sm font-semibold">{formatCurrency(request.totalEstimatedAmount)}</div>
                          </div>
                          <div className="overflow-hidden rounded-md border bg-background">
                            <table className="w-full text-left text-sm">
                              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Descricao</th>
                                  <th className="px-3 py-2 font-semibold">Qtd</th>
                                  <th className="px-3 py-2 font-semibold">Unidade</th>
                                  <th className="px-3 py-2 font-semibold">Valor unitario</th>
                                  <th className="px-3 py-2 font-semibold">Total</th>
                                  <th className="px-3 py-2 font-semibold">Obs.</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {request.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="px-3 py-2">{item.description}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{item.unitOfMeasure}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{formatCurrency(item.estimatedUnitPrice)}</td>
                                    <td className="px-3 py-2 font-medium">{formatCurrency(item.estimatedTotalPrice)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
