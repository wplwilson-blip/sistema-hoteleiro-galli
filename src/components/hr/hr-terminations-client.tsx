"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ExternalLink, Filter, LogOut, Plus, Save, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { HrOperationalModal } from "@/components/hr/hr-operational-modal";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ChecklistItem = {
  id: string;
  itemName: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string;
  notes: string;
};

type TerminationRecord = {
  id: string;
  unit: { id: string; label: string } | null;
  employeeId: string;
  employeeName: string;
  status: string;
  statusLabel: string;
  terminationType: string;
  terminationTypeLabel: string;
  terminationReason: string;
  requestedAt: string;
  effectiveDate: string;
  notes: string;
  checklist: ChecklistItem[];
  pendingCount: number;
  checklistCount: number;
  checklistCompletedCount: number;
  isSensitive: boolean;
  redacted: boolean;
};

type EmployeeOption = { id: string; fullName: string; preferredName: string };
type UnitOption = { id: string; code: string; name: string };
type TerminationsResponse = { ok: true; data: TerminationRecord[] };
type TerminationMutationResponse = { ok: true; data: TerminationRecord };
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };
type DocumentTypeOption = { id: string; code: string; name: string; category: string };
type DocumentTypesResponse = { ok: true; data: DocumentTypeOption[] };
type DocumentTypeSelection = { documentType: DocumentTypeOption | null; isFallback: boolean };
type DocumentLinksResponse = {
  ok: true;
  data: Array<{
    id: string;
    sourceEntityId: string;
    documentRole: string;
    requirementStatus: string;
    attachment: { id: string; fileName: string } | null;
    document: { id: string } | null;
  }>;
};

type TerminationForm = {
  id: string;
  employeeId: string;
  terminationType: string;
  status: string;
  terminationReason: string;
  effectiveDate: string;
  notes: string;
};

type TerminationAttachmentForm = {
  file: File | null;
  status: "idle" | "uploading" | "uploaded" | "error";
  message: string;
  attachmentId: string;
  documentId: string;
  linkId: string;
};

const terminationTypes = [
  ["voluntary", "Pedido de demissão"],
  ["involuntary", "Desligamento pela empresa"],
  ["mutual", "Acordo mútuo"],
  ["retirement", "Aposentadoria"],
  ["end_of_contract", "Fim de contrato"],
  ["other", "Outro"]
];

const statuses = [
  ["draft", "Rascunho"],
  ["pending_review", "Aguardando revisão"],
  ["approved", "Aprovado"],
  ["implemented", "Efetivado"],
  ["cancelled", "Cancelado"]
];

const emptyForm: TerminationForm = {
  id: "",
  employeeId: "",
  terminationType: "other",
  status: "draft",
  terminationReason: "",
  effectiveDate: "",
  notes: ""
};
const emptyTerminationAttachmentForm: TerminationAttachmentForm = { file: null, status: "idle", message: "", attachmentId: "", documentId: "", linkId: "" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível processar desligamento.");
  return payload as T;
}

async function uploadTerminationDocument(input: { record: Pick<TerminationRecord, "id" | "employeeId" | "terminationTypeLabel">; documentTypeId: string; file: File }) {
  const formData = new FormData();
  formData.set("employeeId", input.record.employeeId);
  formData.set("documentTypeId", input.documentTypeId);
  formData.set("sourceEntityType", "termination");
  formData.set("sourceEntityId", input.record.id);
  formData.set("documentRole", "termination_document");
  formData.set("sourceContextLabel", `Documento de saida - ${input.record.terminationTypeLabel}`);
  formData.set("notes", "Documento administrativo enviado pelo fluxo de Desligamentos.");
  formData.set("isRequired", "false");
  formData.set("isSensitive", "true");
  formData.set("visibilityScope", "restricted");
  formData.set("file", input.file);

  const response = await fetch("/api/hr/contextual-documents", {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel anexar documento de saida.");
  return payload as {
    ok: true;
    data: {
      document: { id: string };
      attachment: { id: string; fileName: string };
      link: { id: string };
    };
  };
}

function buildUrl(path: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

function employeeDocumentsHref(employeeId: string) {
  return `/rh/employees/${employeeId}?tab=documents`;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function selectTerminationDocumentType(documentTypes: DocumentTypeOption[]): DocumentTypeSelection {
  const preferred = documentTypes.find((item) => item.code === "DOCUMENTO_DESLIGAMENTO");
  if (preferred) return { documentType: preferred, isFallback: false };

  const semantic = documentTypes.find((item) => {
    const text = normalizeSearch(`${item.code} ${item.name} ${item.category}`);
    return text.includes("desligamento") || text.includes("saida") || text.includes("termination");
  });
  if (semantic) return { documentType: semantic, isFallback: false };

  const fallback =
    documentTypes.find((item) => item.category === "termination") ??
    documentTypes.find((item) => item.category === "internal") ??
    documentTypes.find((item) => item.category === "other") ??
    documentTypes[0] ??
    null;
  return { documentType: fallback, isFallback: Boolean(fallback) };
}

function terminationTypeLabel(value: string) {
  return terminationTypes.find(([type]) => type === value)?.[1] ?? "Desligamento";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function statusTone(status: string) {
  if (status === "implemented" || status === "approved") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  if (status === "cancelled") return "danger" as const;
  return "visual" as const;
}

function nextActionLabel(record: TerminationRecord) {
  if (record.status === "draft") return "Envie para revisão quando estiver pronto.";
  if (record.status === "pending_review") return "Aguardando aprovação do responsável.";
  if (record.status === "approved") return record.pendingCount > 0 ? "Conclua as pendências antes de efetivar." : "Pronto para efetivação.";
  if (record.status === "implemented") return "Processo concluído.";
  if (record.status === "cancelled") return "Processo cancelado.";
  return "Acompanhe o status do desligamento.";
}

function terminationActionMessage(record: TerminationRecord, action: "submit" | "approve" | "implement" | "cancel") {
  if (action === "submit") {
    return `Enviar este desligamento para revisão?\n\nConfira motivo, data efetiva, checklist e o documento de saída anexado no próprio processo antes de continuar.`;
  }

  if (action === "approve") {
    return `Aprovar este desligamento?\n\nO processo ficará pronto para efetivação quando as pendências forem concluídas. Confira com Andreia antes de aprovar.`;
  }

  if (action === "implement") {
    return `Efetivar desligamento?\n\nEsta ação registra o encerramento no prontuário e na Vida Funcional do colaborador.\n\nConfira o checklist obrigatório antes de continuar. O documento de saída é opcional nesta etapa.`;
  }

  if (action === "cancel") {
    return `Cancelar este desligamento?\n\nO histórico administrativo será mantido e o processo não deve ser tratado como ativo.`;
  }

  return `Executar ação no desligamento de ${record.employeeName || "colaborador"}?`;
}

function payload(form: TerminationForm) {
  return {
    employeeId: form.employeeId,
    terminationType: form.terminationType,
    status: form.status,
    terminationReason: form.terminationReason,
    effectiveDate: form.effectiveDate,
    notes: form.notes
  };
}

export function HrTerminationsClient() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ unitId: "", employeeId: "", terminationType: "", status: "", search: "" });
  const [form, setForm] = useState<TerminationForm>(emptyForm);
  const [terminationAttachmentForm, setTerminationAttachmentForm] = useState<TerminationAttachmentForm>(emptyTerminationAttachmentForm);
  const [checklistName, setChecklistName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const terminationsQuery = useQuery({
    queryKey: ["hr", "terminations", filters],
    queryFn: async () => requestJson<TerminationsResponse>(buildUrl("/api/hr/terminations", { ...filters, pageSize: "100" }))
  });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "termination-options"], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "termination-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const documentTypesQuery = useQuery({
    queryKey: ["hr", "document-types", "termination", "active"],
    queryFn: async () => requestJson<DocumentTypesResponse>("/api/hr/document-types?status=active")
  });

  const records = useMemo(() => terminationsQuery.data?.data ?? [], [terminationsQuery.data?.data]);
  const selectedTermination = useMemo(
    () =>
      records.find((item) => item.id === form.id) ??
      (form.id
        ? ({
            id: form.id,
            unit: null,
            employeeId: form.employeeId,
            employeeName: "",
            status: form.status,
            statusLabel: statuses.find(([value]) => value === form.status)?.[1] ?? form.status,
            terminationType: form.terminationType,
            terminationTypeLabel: terminationTypeLabel(form.terminationType),
            terminationReason: form.terminationReason,
            requestedAt: "",
            effectiveDate: form.effectiveDate,
            notes: form.notes,
            checklist: [],
            pendingCount: 0,
            checklistCount: 0,
            checklistCompletedCount: 0,
            isSensitive: true,
            redacted: false
          } as TerminationRecord)
        : null),
    [form.effectiveDate, form.employeeId, form.id, form.notes, form.status, form.terminationReason, form.terminationType, records]
  );
  const terminationDocumentTypeSelection = useMemo(() => selectTerminationDocumentType(documentTypesQuery.data?.data ?? []), [documentTypesQuery.data?.data]);
  const terminationDocumentLinksQuery = useQuery({
    queryKey: ["hr", "employees", form.employeeId, "document-links", "termination", form.id],
    enabled: Boolean(showForm && form.id && form.employeeId),
    queryFn: async () => requestJson<DocumentLinksResponse>(`/api/hr/employees/${form.employeeId}/document-links?source=termination&documentRole=termination_document&includeSensitive=true`)
  });
  const selectedTerminationDocumentLink = useMemo(
    () => (terminationDocumentLinksQuery.data?.data ?? []).find((link) => link.sourceEntityId === form.id && link.documentRole === "termination_document") ?? null,
    [form.id, terminationDocumentLinksQuery.data?.data]
  );
  const hasTerminationDocument = Boolean(selectedTerminationDocumentLink?.attachment?.id || terminationAttachmentForm.attachmentId);
  const summary = useMemo(
    () => ({
      ongoing: records.filter((item) => ["draft", "pending_review", "approved"].includes(item.status)).length,
      pendingReview: records.filter((item) => item.status === "pending_review").length,
      approved: records.filter((item) => item.status === "approved").length,
      implemented: records.filter((item) => item.status === "implemented").length,
      cancelled: records.filter((item) => item.status === "cancelled").length,
      openPendencies: records.reduce((total, item) => total + item.pendingCount, 0)
    }),
    [records]
  );

  const saveMutation = useMutation({
    mutationFn: async (current: TerminationForm) =>
      requestJson<TerminationMutationResponse>(current.id ? `/api/hr/terminations/${current.id}` : "/api/hr/terminations", {
        method: current.id ? "PATCH" : "POST",
        body: JSON.stringify(payload(current))
      }),
    onSuccess: async (result, submittedForm) => {
      const savedRecord = result.data;
      setForm({
        id: savedRecord.id,
        employeeId: savedRecord.employeeId,
        terminationType: savedRecord.terminationType,
        status: savedRecord.status,
        terminationReason: savedRecord.redacted ? "" : savedRecord.terminationReason,
        effectiveDate: savedRecord.effectiveDate,
        notes: savedRecord.redacted ? "" : savedRecord.notes
      });
      await queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] });
      if (submittedForm.id) {
        setShowForm(false);
        setForm(emptyForm);
        setTerminationAttachmentForm(emptyTerminationAttachmentForm);
      }
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "submit" | "approve" | "implement" | "cancel" }) =>
      requestJson(`/api/hr/terminations/${id}/${action}`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] });
    }
  });

  const checklistMutation = useMutation({
    mutationFn: async ({ terminationId, itemId, completed }: { terminationId: string; itemId: string; completed: boolean }) =>
      requestJson(`/api/hr/terminations/${terminationId}/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify({ isCompleted: completed }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] });
    }
  });

  const addChecklistMutation = useMutation({
    mutationFn: async (terminationId: string) =>
      requestJson(`/api/hr/terminations/${terminationId}/checklist`, {
        method: "POST",
        body: JSON.stringify({ itemName: checklistName, isRequired: true })
      }),
    onSuccess: async () => {
      setChecklistName("");
      await queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] });
    }
  });

  const terminationUploadMutation = useMutation({
    mutationFn: async (input: { record: TerminationRecord; file: File; documentTypeId: string }) =>
      uploadTerminationDocument({
        record: input.record,
        documentTypeId: input.documentTypeId,
        file: input.file
      }),
    onSuccess: async (payload) => {
      setTerminationAttachmentForm((current) => ({
        ...current,
        status: "uploaded",
        message: "Documento anexado",
        attachmentId: payload.data.attachment.id,
        documentId: payload.data.document.id,
        linkId: payload.data.link.id,
        file: null
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "employees"] })
      ]);
    },
    onError: (error) => {
      setTerminationAttachmentForm((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Erro no upload do documento de saída."
      }));
    }
  });

  function edit(record: TerminationRecord) {
    setForm({
      id: record.id,
      employeeId: record.employeeId,
      terminationType: record.terminationType,
      status: record.status,
      terminationReason: record.redacted ? "" : record.terminationReason,
      effectiveDate: record.effectiveDate,
      notes: record.redacted ? "" : record.notes
    });
    setTerminationAttachmentForm(emptyTerminationAttachmentForm);
    setShowForm(true);
  }

  function runTerminationAction(record: TerminationRecord, action: "submit" | "approve" | "implement" | "cancel") {
    if (!window.confirm(terminationActionMessage(record, action))) return;
    actionMutation.mutate({ id: record.id, action });
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><LogOut className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Desligamentos</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Crie o desligamento, conclua o checklist, anexe o documento de saída no próprio processo e efetive somente após aprovação.</p>
          </div>
          <Button size="sm" onClick={() => { setForm(emptyForm); setTerminationAttachmentForm(emptyTerminationAttachmentForm); setShowForm(true); }}><Plus className="h-4 w-4" />Novo desligamento</Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <TerminationStat title="Em andamento" value={summary.ongoing} tone={summary.ongoing ? "warning" : "visual"} />
        <TerminationStat title="Aguardando revisão" value={summary.pendingReview} tone={summary.pendingReview ? "warning" : "visual"} />
        <TerminationStat title="Aprovados" value={summary.approved} tone="success" />
        <TerminationStat title="Efetivados" value={summary.implemented} tone="success" />
        <TerminationStat title="Cancelados" value={summary.cancelled} tone={summary.cancelled ? "warning" : "visual"} />
        <TerminationStat title="Pendências abertas" value={summary.openPendencies} tone={summary.openPendencies ? "warning" : "success"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectField value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}><option value="">Todas as unidades</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}</SelectField>
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Todos os colaboradores</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField>
          <SelectField value={filters.terminationType} onChange={(event) => setFilters((current) => ({ ...current, terminationType: event.target.value }))}><option value="">Todos os tipos</option>{terminationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos os status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <Input placeholder="Buscar motivo" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </div>
      </Card>

      <HrOperationalModal
        open={showForm}
        title={form.id ? "Editar desligamento" : "Novo desligamento"}
        description={form.id ? "Atualize o rascunho e anexe o documento administrativo de saída sem alterar o fluxo de aprovação." : "O desligamento nasce como rascunho. Salve para liberar o anexo contextual de saída."}
        onClose={() => {
          setShowForm(false);
          setForm(emptyForm);
          setTerminationAttachmentForm(emptyTerminationAttachmentForm);
        }}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={form.terminationType} onChange={(event) => setForm((current) => ({ ...current, terminationType: event.target.value }))}>{terminationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Data efetiva"><Input type="date" value={form.effectiveDate} onChange={(event) => setForm((current) => ({ ...current, effectiveDate: event.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Status inicial: Rascunho</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">O status muda pelo fluxo: revisão, aprovação e efetivação.</p>
            </div>
            <Field label="Motivo"><TextArea value={form.terminationReason} onChange={(event) => setForm((current) => ({ ...current, terminationReason: event.target.value }))} /></Field>
            <Field label="Observação"><TextArea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-medium text-foreground">Anexar documento de saída</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Anexe aqui o documento administrativo de saída. O arquivo também ficará no dossiê do colaborador.</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Nesta etapa, o documento não substitui o checklist e não envolve folha, rescisão, eSocial ou cálculos.</p>
                </div>
                {form.employeeId ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={employeeDocumentsHref(form.employeeId)}><ExternalLink className="h-4 w-4" />Ver no dossiê</a>
                  </Button>
                ) : null}
              </div>
              {form.id && selectedTermination ? (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <Field label="Arquivo">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        disabled={terminationUploadMutation.isPending || hasTerminationDocument || !["draft", "pending_review", "approved"].includes(form.status)}
                        onChange={(event) => setTerminationAttachmentForm((current) => ({
                          ...current,
                          file: event.target.files?.[0] ?? null,
                          status: current.status === "error" ? "idle" : current.status,
                          message: current.status === "error" ? "" : current.message,
                        }))}
                      />
                    </Field>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        terminationUploadMutation.isPending ||
                        hasTerminationDocument ||
                        !terminationAttachmentForm.file ||
                        !terminationDocumentTypeSelection.documentType ||
                        !["draft", "pending_review", "approved"].includes(form.status)
                      }
                      onClick={() => {
                        if (!selectedTermination || !terminationAttachmentForm.file || !terminationDocumentTypeSelection.documentType) return;
                        setTerminationAttachmentForm((current) => ({ ...current, status: "uploading", message: "Enviando documento..." }));
                        terminationUploadMutation.mutate({
                          record: selectedTermination,
                          file: terminationAttachmentForm.file,
                          documentTypeId: terminationDocumentTypeSelection.documentType.id,
                        });
                      }}
                    >
                      <Upload className="h-4 w-4" />Anexar
                    </Button>
                  </div>
                  {!terminationDocumentTypeSelection.documentType && documentTypesQuery.isSuccess ? <p className="mt-2 text-xs font-medium text-destructive">Tipo documental ativo compatível com desligamento não encontrado.</p> : null}
                  {terminationDocumentTypeSelection.isFallback ? <p className="mt-2 text-xs text-muted-foreground">Até existir um tipo documental mais específico, este vínculo será identificado no dossiê pelo filtro Desligamento e pelo papel Documento de saída.</p> : null}
                  {hasTerminationDocument ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="success" label="Documento anexado" /><span className="text-xs text-muted-foreground">Disponível também no dossiê do colaborador.</span></div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="visual" label="Documento pendente" /><span className="text-xs text-muted-foreground">Opcional nesta etapa; a efetivação continua bloqueada apenas por checklist obrigatório pendente.</span></div>
                  )}
                  {terminationAttachmentForm.status === "uploading" ? <p className="mt-2 text-xs text-muted-foreground">{terminationAttachmentForm.message}</p> : null}
                  {terminationAttachmentForm.status === "error" ? <p className="mt-2 text-xs font-medium text-destructive">{terminationAttachmentForm.message}</p> : null}
                  {form.status === "implemented" || form.status === "cancelled" ? <p className="mt-2 text-xs text-muted-foreground">Processos efetivados ou cancelados permanecem disponíveis para consulta, sem novo upload nesta tela.</p> : null}
                </>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="warning" label="Documento pendente" /><span className="text-xs text-muted-foreground">Salve o desligamento para liberar o upload contextual.</span></div>
              )}
            </div>
          </div>
          {saveMutation.error ? <div className="mt-3"><ErrorMessage message={saveMutation.error instanceof Error ? saveMutation.error.message : "Não foi possível salvar o desligamento. Confira colaborador, tipo, motivo e data efetiva."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}><Save className="h-4 w-4" />Salvar</Button>
      </HrOperationalModal>

      {terminationsQuery.isLoading ? <LoadingTable label="Carregando desligamentos..." /> : null}
      {terminationsQuery.error ? <ErrorMessage message={terminationsQuery.error instanceof Error ? terminationsQuery.error.message : "Não foi possível carregar os desligamentos. Tente atualizar a página."} /> : null}
      {actionMutation.error ? <ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Não foi possível executar a ação. Confira o status do processo e tente novamente."} /> : null}
      {checklistMutation.error ? <ErrorMessage message={checklistMutation.error instanceof Error ? checklistMutation.error.message : "Não foi possível atualizar o checklist. Tente novamente."} /> : null}
      {addChecklistMutation.error ? <ErrorMessage message={addChecklistMutation.error instanceof Error ? addChecklistMutation.error.message : "Não foi possível adicionar a pendência. Informe o nome do item e tente novamente."} /> : null}

      <TerminationTable
        records={records}
        checklistName={checklistName}
        onChecklistName={setChecklistName}
        onEdit={edit}
        onAction={runTerminationAction}
        onToggleChecklist={(record, item, completed) => checklistMutation.mutate({ terminationId: record.id, itemId: item.id, completed })}
        onAddChecklist={(record) => addChecklistMutation.mutate(record.id)}
        pending={actionMutation.isPending || checklistMutation.isPending || addChecklistMutation.isPending}
      />
    </div>
  );
}

function TerminationStat({ title, value, tone }: { title: string; value: number; tone: "visual" | "warning" | "success" }) {
  return (
    <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><ClipboardList className="h-5 w-5 text-primary" /></div>
      <div className="mt-2"><StatusBadge status={tone} label={value ? "Acompanhar" : "Ok"} /></div>
    </Card>
  );
}

function TerminationTable({
  records,
  checklistName,
  onChecklistName,
  onEdit,
  onAction,
  onToggleChecklist,
  onAddChecklist,
  pending
}: {
  records: TerminationRecord[];
  checklistName: string;
  onChecklistName: (value: string) => void;
  onEdit: (record: TerminationRecord) => void;
  onAction: (record: TerminationRecord, action: "submit" | "approve" | "implement" | "cancel") => void;
  onToggleChecklist: (record: TerminationRecord, item: ChecklistItem, completed: boolean) => void;
  onAddChecklist: (record: TerminationRecord) => void;
  pending: boolean;
}) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">Processos de desligamento</h2></div>
      {!records.length ? <EmptyState title="Nenhum desligamento em andamento" description="Use Novo desligamento para iniciar uma solicitação administrativa com checklist e revisão." /> : null}
      {records.length ? (
        <div className="overflow-x-auto"><table className="min-w-[1280px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data efetiva</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Checklist</th><th className="px-4 py-3">Ações</th></tr></thead><tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{record.employeeName || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.terminationTypeLabel} /><StatusBadge status="warning" label={record.redacted ? "Registro restrito" : "Informação sensível"} /></div></td><td className="px-4 py-3"><div className="space-y-1"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /><p className="max-w-[220px] text-xs leading-5 text-muted-foreground">{nextActionLabel(record)}</p></div></td><td className="px-4 py-3">{formatDate(record.effectiveDate)}</td><td className="px-4 py-3">{record.redacted ? "Informação sensível" : record.terminationReason}</td><td className="px-4 py-3"><TerminationChecklist record={record} checklistName={checklistName} onChecklistName={onChecklistName} onToggle={onToggleChecklist} onAdd={onAddChecklist} pending={pending} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" onClick={() => onEdit(record)} disabled={record.status !== "draft"}>Editar</Button>{record.status === "draft" ? <Button size="sm" onClick={() => onAction(record, "submit")} disabled={pending}>Enviar para revisão</Button> : null}{record.status === "pending_review" ? <Button size="sm" onClick={() => onAction(record, "approve")} disabled={pending}>Aprovar</Button> : null}{record.status === "approved" ? <Button size="sm" onClick={() => onAction(record, "implement")} disabled={pending || record.pendingCount > 0}>Efetivar</Button> : null}{record.status !== "implemented" && record.status !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "cancel")} disabled={pending}>Cancelar</Button> : null}</div></td></tr>)}</tbody></table></div>
      ) : null}
    </Card>
  );
}

function TerminationChecklist({
  record,
  checklistName,
  onChecklistName,
  onToggle,
  onAdd,
  pending
}: {
  record: TerminationRecord;
  checklistName: string;
  onChecklistName: (value: string) => void;
  onToggle: (record: TerminationRecord, item: ChecklistItem, completed: boolean) => void;
  onAdd: (record: TerminationRecord) => void;
  pending: boolean;
}) {
  return (
    <div className="min-w-[320px] space-y-2">
      <div className="flex flex-wrap gap-1">
        <StatusBadge status={record.pendingCount ? "warning" : "success"} label={`${record.checklistCompletedCount}/${record.checklistCount} concluído(s)`} />
        {record.pendingCount ? <StatusBadge status="warning" label={`${record.pendingCount} pendência(s)`} /> : null}
      </div>
      <div className="space-y-1">
        {record.checklist.map((item) => (
          <label key={item.id} className="flex items-start gap-2 rounded-md border bg-muted/25 px-2 py-1 text-xs">
            <input type="checkbox" className="mt-0.5" checked={item.isCompleted} disabled={pending || record.status === "implemented" || record.status === "cancelled"} onChange={(event) => onToggle(record, item, event.target.checked)} />
            <span className={item.isCompleted ? "text-muted-foreground line-through" : ""}>{item.itemName}{item.isRequired ? " *" : ""}</span>
          </label>
        ))}
      </div>
      {record.status !== "implemented" && record.status !== "cancelled" ? (
        <div className="flex gap-2">
          <Input value={checklistName} onChange={(event) => onChecklistName(event.target.value)} placeholder="Nova pendência" className="h-8 text-xs" />
          <Button size="sm" variant="outline" onClick={() => onAdd(record)} disabled={pending || !checklistName.trim()}>Adicionar</Button>
        </div>
      ) : null}
    </div>
  );
}
