"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Filter, MessageSquareText, Plus, Save, ShieldAlert, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { HrOperationalModal } from "@/components/hr/hr-operational-modal";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

type ConductRecord = {
  id: string;
  unit: { id: string; label: string } | null;
  employeeId: string;
  employeeName: string;
  conductType: string;
  conductTypeLabel: string;
  status: string;
  statusLabel: string;
  occurrenceDate: string;
  title: string;
  description: string;
  actionTaken: string;
  severity: string;
  attachmentId: string;
  hasAttachment: boolean;
  evidenceCount: number;
  evidenceRequired: boolean;
  isSensitive: boolean;
  redacted: boolean;
  reviews: Array<{
    id: string;
    action: string;
    actionLabel: string;
    comments: string;
    actorUserId: string;
    createdAt: string;
  }>;
};

type EmployeeOption = { id: string; fullName: string; preferredName: string };
type UnitOption = { id: string; code: string; name: string };
type ConductResponse = { ok: true; data: ConductRecord[] };
type ConductMutationResponse = { ok: true; data: ConductRecord };
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };
type DocumentTypeOption = { id: string; code: string; name: string; category: string };
type DocumentTypesResponse = { ok: true; data: DocumentTypeOption[] };
type ConductDocumentTypeSelection = { documentType: DocumentTypeOption | null; isFallback: boolean };

type ConductForm = {
  id: string;
  employeeId: string;
  conductType: string;
  occurrenceDate: string;
  title: string;
  description: string;
  actionTaken: string;
  status: string;
  severity: string;
  isSensitive: string;
};

type ConductAttachmentForm = {
  file: File | null;
  status: "idle" | "uploading" | "uploaded" | "error";
  message: string;
  attachmentId: string;
  documentId: string;
  linkId: string;
};

const conductTypes = [
  ["warning", "Advertência"],
  ["suspension", "Suspensão"],
  ["complaint", "Reclamação"],
  ["compliment", "Elogio"],
  ["formal_guidance", "Orientação formal"],
  ["formal_conversation", "Conversa formal"]
];
const statuses = [["draft", "Rascunho"], ["pending_review", "Aguardando revisão"], ["reviewed", "Revisado"], ["rejected", "Rejeitado"], ["cancelled", "Cancelado"]];
const severities = [["info", "Info"], ["notice", "Aviso"], ["warning", "Alerta"], ["critical", "Crítico"]];
const sensitiveConductTypes = new Set(["warning", "suspension", "complaint", "formal_conversation"]);
const conductEvidenceRequiredTypes = new Set(["warning", "suspension"]);
const emptyForm: ConductForm = {
  id: "",
  employeeId: "",
  conductType: "warning",
  occurrenceDate: new Date().toISOString().slice(0, 10),
  title: "",
  description: "",
  actionTaken: "",
  status: "draft",
  severity: "",
  isSensitive: "true"
};
const emptyConductAttachmentForm: ConductAttachmentForm = {
  file: null,
  status: "idle",
  message: "",
  attachmentId: "",
  documentId: "",
  linkId: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível processar conduta.");
  return payload as T;
}

async function uploadConductEvidence(input: { record: ConductRecord; documentTypeId: string; isRequired: boolean; file: File }) {
  const formData = new FormData();
  formData.set("employeeId", input.record.employeeId);
  formData.set("documentTypeId", input.documentTypeId);
  formData.set("sourceEntityType", "conduct");
  formData.set("sourceEntityId", input.record.id);
  formData.set("documentRole", "evidence");
  formData.set("sourceContextLabel", `Evidencia de conduta - ${input.record.conductTypeLabel}`);
  formData.set("notes", "Anexo enviado pelo fluxo de Conduta.");
  formData.set("isRequired", String(input.isRequired));
  formData.set("isSensitive", "true");
  formData.set("visibilityScope", "restricted");
  formData.set("file", input.file);

  const response = await fetch("/api/hr/contextual-documents", {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel anexar evidencia.");
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function severityTone(severity: string) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "notice") return "info" as const;
  return "visual" as const;
}

function statusTone(status: string) {
  if (status === "cancelled") return "danger" as const;
  if (status === "reviewed") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "visual" as const;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function conductEvidenceIsRequired(record: Pick<ConductRecord, "conductType" | "severity" | "evidenceRequired">) {
  return record.evidenceRequired || conductEvidenceRequiredTypes.has(record.conductType) || (record.conductType === "complaint" && record.severity === "critical");
}

function selectConductDocumentType(documentTypes: DocumentTypeOption[]): ConductDocumentTypeSelection {
  const preferredCodes = [
    "EVIDENCIA_CONDUTA",
    "EVIDENCIA_OCORRENCIA_CONDUTA",
    "DOCUMENTO_CONDUTA",
    "REGISTRO_CONDUTA",
    "OCORRENCIA_CONDUTA"
  ];
  const preferred = documentTypes.find((item) => preferredCodes.includes(item.code));
  if (preferred) return { documentType: preferred, isFallback: false };

  const scored = documentTypes
    .map((item) => {
      const text = normalizeSearch(`${item.code} ${item.name} ${item.category}`);
      let score = 0;
      if (text.includes("conduta")) score += 4;
      if (text.includes("evidencia") || text.includes("evidence")) score += 3;
      if (text.includes("ocorrencia") || text.includes("advertencia") || text.includes("suspensao")) score += 2;
      if (item.category === "internal") score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  const semanticMatch = scored.find((entry) => entry.score >= 2)?.item ?? null;
  if (semanticMatch) return { documentType: semanticMatch, isFallback: false };

  // Fallback temporario ate existir tipo documental dedicado para evidencia de conduta.
  const fallback =
    documentTypes.find((item) => item.code === "TERMO_RESPONSABILIDADE") ??
    documentTypes.find((item) => item.category === "internal") ??
    documentTypes.find((item) => item.category === "other") ??
    documentTypes[0] ??
    null;
  return { documentType: fallback, isFallback: Boolean(fallback) };
}

function nextActionLabel(status: string) {
  if (status === "draft") return "Envie para revisão quando estiver pronto.";
  if (status === "pending_review") return "Aguardando aprovação do responsável.";
  if (status === "reviewed") return "Registro revisado e publicado na Vida Funcional.";
  if (status === "rejected") return "Registro rejeitado. Revise antes de qualquer nova ação.";
  if (status === "cancelled") return "Registro cancelado.";
  return "Acompanhe o status do registro.";
}

function conductTypeLabel(value: string) {
  return conductTypes.find(([type]) => type === value)?.[1] ?? "Ocorrência";
}

function conductActionMessage(record: ConductRecord, action: "submit" | "approve" | "reject" | "cancel") {
  if (action === "submit") {
    return `Enviar esta ocorrência para revisão?\n\nEla ficará aguardando análise do responsável. Confira se as evidências foram incluídas pelo atalho Anexar evidência no dossiê antes de continuar.`;
  }

  if (action === "approve") {
    return `Aprovar esta ocorrência?\n\nEla poderá aparecer no prontuário e na Vida Funcional conforme a visibilidade definida.\n\nConfira com Andreia antes de aprovar ocorrência sensível.`;
  }

  if (action === "reject") {
    return `Rejeitar esta ocorrência?\n\nRegistre o motivo no campo Comentário da próxima ação para manter a auditoria clara.`;
  }

  if (action === "cancel") {
    return `Cancelar esta ocorrência?\n\nO histórico de revisão será mantido e o registro não deve ser tratado como ocorrência ativa.`;
  }

  return `Executar ação em ${record.conductTypeLabel || "ocorrência"}?`;
}

function payload(form: ConductForm) {
  return {
    employeeId: form.employeeId,
    conductType: form.conductType,
    occurrenceDate: form.occurrenceDate,
    title: form.title,
    description: form.description,
    actionTaken: form.actionTaken,
    status: form.status,
    severity: form.severity || undefined,
    isSensitive: form.isSensitive === "true"
  };
}

export function HrConductClient() {
  const queryClient = useQueryClient();
  // Unidade ativa (header) e a fonte unica de escopo; sem filtro manual de unidade na lista.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  const [filters, setFilters] = useState({ employeeId: "", conductType: "", status: "", severity: "", search: "" });
  const [form, setForm] = useState<ConductForm>(emptyForm);
  const [conductAttachmentForm, setConductAttachmentForm] = useState<ConductAttachmentForm>(emptyConductAttachmentForm);
  const [actionComments, setActionComments] = useState("");
  const [showForm, setShowForm] = useState(false);

  const conductQuery = useQuery({ queryKey: ["hr", "conduct", activeUnitId, filters], queryFn: async () => requestJson<ConductResponse>(buildUrl("/api/hr/conduct", { ...filters, pageSize: "100" })) });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "conduct-options", activeUnitId], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const documentTypesQuery = useQuery({
    queryKey: ["hr", "document-types", "conduct", "active"],
    queryFn: async () => requestJson<DocumentTypesResponse>("/api/hr/document-types?status=active")
  });

  const records = useMemo(() => conductQuery.data?.data ?? [], [conductQuery.data?.data]);
  const selectedConductRecord = useMemo(
    () =>
      records.find((item) => item.id === form.id) ??
      (form.id
        ? ({
            id: form.id,
            employeeId: form.employeeId,
            conductType: form.conductType,
            conductTypeLabel: conductTypeLabel(form.conductType),
            severity: form.severity || (form.conductType === "suspension" ? "critical" : form.conductType === "warning" || form.conductType === "complaint" ? "warning" : "notice"),
            attachmentId: conductAttachmentForm.attachmentId,
            hasAttachment: Boolean(conductAttachmentForm.attachmentId),
            evidenceCount: conductAttachmentForm.attachmentId ? 1 : 0,
            evidenceRequired: conductEvidenceRequiredTypes.has(form.conductType) || (form.conductType === "complaint" && form.severity === "critical")
          } as ConductRecord)
        : null),
    [conductAttachmentForm.attachmentId, form.conductType, form.employeeId, form.id, form.severity, records]
  );
  const conductDocumentTypeSelection = useMemo(() => selectConductDocumentType(documentTypesQuery.data?.data ?? []), [documentTypesQuery.data?.data]);
  const conductDocumentType = conductDocumentTypeSelection.documentType;
  const summary = useMemo(
    () => ({
      total: records.length,
      negative: records.filter((item) => ["warning", "suspension", "complaint"].includes(item.conductType)).length,
      positive: records.filter((item) => item.conductType === "compliment").length,
      formal: records.filter((item) => ["formal_guidance", "formal_conversation"].includes(item.conductType)).length,
      pendingReview: records.filter((item) => item.status === "pending_review").length,
      criticalPending: records.filter((item) => item.status === "pending_review" && item.severity === "critical").length,
      reviewed: records.filter((item) => item.status === "reviewed").length,
      rejected: records.filter((item) => item.status === "rejected").length,
      cancelled: records.filter((item) => item.status === "cancelled").length,
      sensitive: records.filter((item) => item.isSensitive).length
    }),
    [records]
  );

  const mutation = useMutation({
    mutationFn: async (current: ConductForm) =>
      requestJson<ConductMutationResponse>(current.id ? `/api/hr/conduct/${current.id}` : "/api/hr/conduct", {
        method: current.id ? "PATCH" : "POST",
        body: JSON.stringify(payload(current))
      }),
    onSuccess: async (result, submittedForm) => {
      const savedRecord = result.data;
      setForm({
        id: savedRecord.id,
        employeeId: savedRecord.employeeId,
        conductType: savedRecord.conductType,
        occurrenceDate: savedRecord.occurrenceDate,
        title: savedRecord.redacted ? "" : savedRecord.title,
        description: savedRecord.redacted ? "" : savedRecord.description,
        actionTaken: savedRecord.redacted ? "" : savedRecord.actionTaken,
        status: savedRecord.status,
        severity: savedRecord.severity,
        isSensitive: String(savedRecord.isSensitive)
      });
      setConductAttachmentForm((current) => ({
        ...current,
        status: savedRecord.hasAttachment ? "uploaded" : current.status === "uploaded" ? "uploaded" : "idle",
        message: savedRecord.hasAttachment ? "Evidencia anexada" : "",
        attachmentId: savedRecord.attachmentId ?? current.attachmentId
      }));
      await queryClient.invalidateQueries({ queryKey: ["hr", "conduct"] });
      if (submittedForm.id) {
        setShowForm(false);
        setForm(emptyForm);
        setConductAttachmentForm(emptyConductAttachmentForm);
      }
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action, comments }: { id: string; action: "submit" | "approve" | "reject" | "cancel"; comments: string }) =>
      requestJson(`/api/hr/conduct/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ comments })
      }),
    onSuccess: async () => {
      setActionComments("");
      await queryClient.invalidateQueries({ queryKey: ["hr", "conduct"] });
    }
  });

  const contextualUploadMutation = useMutation({
    mutationFn: async (input: { record: ConductRecord; file: File; documentTypeId: string }) =>
      uploadConductEvidence({
        record: input.record,
        documentTypeId: input.documentTypeId,
        isRequired: conductEvidenceIsRequired(input.record),
        file: input.file
      }),
    onSuccess: async (payload) => {
      setConductAttachmentForm((current) => ({
        ...current,
        status: "uploaded",
        message: "Evidencia anexada",
        attachmentId: payload.data.attachment.id,
        documentId: payload.data.document.id,
        linkId: payload.data.link.id,
        file: null
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "conduct"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "employees"] })
      ]);
    },
    onError: (error) => {
      setConductAttachmentForm((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Erro no upload da evidencia."
      }));
    }
  });

  function saveConductRecord() {
    if (!form.id && sensitiveConductTypes.has(form.conductType)) {
      const confirmed = window.confirm(
        `Salvar ${conductTypeLabel(form.conductType).toLowerCase()} como rascunho?\n\nEste registro é sensível. Use Anexar evidência no dossiê e confira com Andreia antes da aprovação.`
      );
      if (!confirmed) return;
    }

    mutation.mutate(form);
  }

  function runAction(record: ConductRecord, action: "submit" | "approve" | "reject" | "cancel") {
    if (action === "approve" && conductEvidenceIsRequired(record) && !record.hasAttachment) {
      window.alert("Esta ocorrencia exige evidencia anexada antes da aprovacao. Anexe a evidencia no fluxo de Conduta e tente novamente.");
      return;
    }
    if (!window.confirm(conductActionMessage(record, action))) return;
    actionMutation.mutate({ id: record.id, action, comments: actionComments });
  }

  function edit(record: ConductRecord) {
    setForm({
      id: record.id,
      employeeId: record.employeeId,
      conductType: record.conductType,
      occurrenceDate: record.occurrenceDate,
      title: record.redacted ? "" : record.title,
      description: record.redacted ? "" : record.description,
      actionTaken: record.redacted ? "" : record.actionTaken,
      status: record.status,
      severity: record.severity,
      isSensitive: String(record.isSensitive)
    });
    setConductAttachmentForm({
      ...emptyConductAttachmentForm,
      status: record.hasAttachment ? "uploaded" : "idle",
      message: record.hasAttachment ? "Evidencia anexada" : "",
      attachmentId: record.attachmentId ?? ""
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Conduta e Ocorrências</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Registre ocorrências como rascunho, use Anexar evidência no dossiê e envie para revisão antes de entrar na Vida Funcional.</p>
          </div>
          <Button size="sm" onClick={() => { setForm(emptyForm); setConductAttachmentForm(emptyConductAttachmentForm); setShowForm(true); }}><Plus className="h-4 w-4" />Novo registro</Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ConductStat title="Pendentes de revisão" value={summary.pendingReview} tone={summary.pendingReview ? "warning" : "visual"} />
        <ConductStat title="Aprovados" value={summary.reviewed} tone="success" />
        <ConductStat title="Rejeitados" value={summary.rejected} tone={summary.rejected ? "warning" : "visual"} />
        <ConductStat title="Cancelados" value={summary.cancelled} tone={summary.cancelled ? "warning" : "visual"} />
        <ConductStat title="Críticos aguardando análise" value={summary.criticalPending} tone={summary.criticalPending ? "warning" : "visual"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Todos os colaboradores</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField>
          <SelectField value={filters.conductType} onChange={(event) => setFilters((current) => ({ ...current, conductType: event.target.value }))}><option value="">Todos os tipos</option>{conductTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos os status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.severity} onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}><option value="">Todas as severidades</option>{severities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <Input placeholder="Buscar titulo" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </div>
      </Card>

      <HrOperationalModal
        open={showForm}
        title={form.id ? "Editar registro de conduta" : "Novo registro de conduta"}
        description={form.id ? "Atualize o registro sem mudar o fluxo de revisão. Evidências ficam vinculadas à ocorrência e também aparecem no dossiê do colaborador." : "O registro nasce como rascunho. Salve para liberar o anexo contextual de evidência."}
        onClose={() => { setShowForm(false); setForm(emptyForm); setConductAttachmentForm(emptyConductAttachmentForm); }}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={form.conductType} onChange={(event) => setForm((current) => ({ ...current, conductType: event.target.value }))}>{conductTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Data"><Input type="date" value={form.occurrenceDate} onChange={(event) => setForm((current) => ({ ...current, occurrenceDate: event.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Status inicial: Rascunho</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Depois de salvar, use Enviar para revisão para continuar o fluxo.</p>
            </div>
            <Field label="Severidade"><SelectField value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}><option value="">Padrao do tipo</option>{severities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Visibilidade"><SelectField value={form.isSensitive} onChange={(event) => setForm((current) => ({ ...current, isSensitive: event.target.value }))}><option value="true">Restrito</option><option value="false">Operacional</option></SelectField></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-medium text-foreground">Anexar evidência</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Anexe aqui evidências da ocorrência. O arquivo também ficará no dossiê do colaborador.</p>
                  {selectedConductRecord && conductEvidenceIsRequired(selectedConductRecord) ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Evidência obrigatória para aprovar esta ocorrência.</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Evidência opcional para conversa formal ou elogio.</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">No fluxo de Conduta, este anexo será tratado como Evidência de conduta.</p>
                </div>
                {form.employeeId ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={employeeDocumentsHref(form.employeeId)}><ExternalLink className="h-4 w-4" />Ver no dossiê</a>
                  </Button>
                ) : null}
              </div>
              {form.id ? (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <Field label="Arquivo">
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        disabled={contextualUploadMutation.isPending || Boolean(selectedConductRecord?.hasAttachment || conductAttachmentForm.attachmentId)}
                        onChange={(event) => setConductAttachmentForm((current) => ({ ...current, file: event.target.files?.[0] ?? null, status: current.status === "error" ? "idle" : current.status, message: current.status === "error" ? "" : current.message }))}
                      />
                    </Field>
                    <Button
                      type="button"
                      size="sm"
                      disabled={contextualUploadMutation.isPending || !selectedConductRecord || !conductDocumentType || !conductAttachmentForm.file || Boolean(selectedConductRecord?.hasAttachment || conductAttachmentForm.attachmentId)}
                      onClick={() => {
                        if (!selectedConductRecord || !conductDocumentType || !conductAttachmentForm.file) return;
                        setConductAttachmentForm((current) => ({ ...current, status: "uploading", message: "Enviando evidência..." }));
                        contextualUploadMutation.mutate({ record: selectedConductRecord, file: conductAttachmentForm.file, documentTypeId: conductDocumentType.id });
                      }}
                    >
                      <Upload className="h-4 w-4" />Anexar
                    </Button>
                  </div>
                  {!conductDocumentType && documentTypesQuery.isSuccess ? <p className="mt-2 text-xs font-medium text-destructive">Tipo documental ativo compatível com evidência de conduta não encontrado.</p> : null}
                  {conductDocumentTypeSelection.isFallback ? <p className="mt-2 text-xs text-muted-foreground">Até existir um tipo documental dedicado, o vínculo no dossiê será identificado pelo filtro Conduta e pelo papel Evidência de conduta.</p> : null}
                  {selectedConductRecord?.hasAttachment || conductAttachmentForm.status === "uploaded" || conductAttachmentForm.attachmentId ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="success" label="Evidência anexada" /><span className="text-xs text-muted-foreground">Disponível também no dossiê do colaborador.</span></div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={selectedConductRecord && conductEvidenceIsRequired(selectedConductRecord) ? "warning" : "visual"} label="Evidência pendente" /><span className="text-xs text-muted-foreground">{selectedConductRecord && conductEvidenceIsRequired(selectedConductRecord) ? "Obrigatória para aprovar." : "Opcional para este tipo de ocorrência."}</span></div>
                  )}
                  {conductAttachmentForm.status === "uploading" ? <p className="mt-2 text-xs text-muted-foreground">{conductAttachmentForm.message}</p> : null}
                  {conductAttachmentForm.status === "error" ? <p className="mt-2 text-xs font-medium text-destructive">{conductAttachmentForm.message}</p> : null}
                </>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="warning" label="Evidência pendente" /><span className="text-xs text-muted-foreground">Salve o rascunho para liberar o upload contextual.</span></div>
              )}
            </div>
            <Field label="Título"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Descrição"><TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            <Field label="Ação tomada"><TextArea value={form.actionTaken} onChange={(event) => setForm((current) => ({ ...current, actionTaken: event.target.value }))} /></Field>
          </div>
          {mutation.error ? <div className="mt-3"><ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível salvar o registro de conduta. Confira os campos obrigatórios."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={saveConductRecord} disabled={mutation.isPending}><Save className="h-4 w-4" />Salvar rascunho</Button>
      </HrOperationalModal>

      {conductQuery.isLoading ? <LoadingTable label="Carregando conduta..." /> : null}
      {conductQuery.error ? <ErrorMessage message={conductQuery.error instanceof Error ? conductQuery.error.message : "Não foi possível carregar os registros de conduta. Tente atualizar a página."} /> : null}
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <Field label="Comentário da próxima ação"><TextArea value={actionComments} onChange={(event) => setActionComments(event.target.value)} /></Field>
        {actionMutation.error ? <div className="mt-3"><ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Não foi possível executar a ação. Confira o status do registro e tente novamente."} /></div> : null}
      </Card>
      <ConductTable records={records} onEdit={edit} onAction={runAction} actionPending={actionMutation.isPending} />
    </div>
  );
}

function ConductStat({ title, value, tone }: { title: string; value: number; tone: "visual" | "info" | "warning" | "success" }) {
  return (
    <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><MessageSquareText className="h-5 w-5 text-primary" /></div>
      <div className="mt-2"><StatusBadge status={tone} label={value ? "Acompanhar" : "Ok"} /></div>
    </Card>
  );
}

function ConductTable({ records, onEdit, onAction, actionPending }: { records: ConductRecord[]; onEdit: (record: ConductRecord) => void; onAction: (record: ConductRecord, action: "submit" | "approve" | "reject" | "cancel") => void; actionPending: boolean }) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">Registros de conduta</h2></div>
      {!records.length ? <EmptyState title="Nenhuma ocorrência de conduta registrada" description="Use Novo registro para registrar advertências, suspensões, reclamações, elogios ou conversas formais." /> : null}
      {records.length ? (
        <div className="overflow-x-auto"><table className="min-w-[1240px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Severidade</th><th className="px-4 py-3">Título</th><th className="px-4 py-3">Evidências</th><th className="px-4 py-3">Timeline</th><th className="px-4 py-3">Ações</th></tr></thead><tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{formatDate(record.occurrenceDate)}</td><td className="px-4 py-3">{record.employeeName || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.conductTypeLabel} />{record.isSensitive ? <StatusBadge status="warning" label={record.redacted ? "Registro restrito" : "Informação sensível"} /> : null}</div></td><td className="px-4 py-3"><div className="space-y-1"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /><p className="max-w-[220px] text-xs leading-5 text-muted-foreground">{nextActionLabel(record.status)}</p></div></td><td className="px-4 py-3"><StatusBadge status={severityTone(record.severity)} label={record.severity} /></td><td className="px-4 py-3">{record.title}</td><td className="px-4 py-3"><StatusBadge status={record.evidenceCount ? "success" : "visual"} label={`${record.evidenceCount ?? 0} evidência(s)`} /></td><td className="px-4 py-3"><ConductTimeline reviews={record.reviews} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" onClick={() => onEdit(record)}>Editar</Button>{record.status === "draft" ? <Button size="sm" onClick={() => onAction(record, "submit")} disabled={actionPending}>Enviar para revisão</Button> : null}{record.status === "pending_review" ? <Button size="sm" onClick={() => onAction(record, "approve")} disabled={actionPending}>Aprovar</Button> : null}{record.status === "pending_review" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "reject")} disabled={actionPending}>Rejeitar</Button> : null}{record.status !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "cancel")} disabled={actionPending}>Cancelar</Button> : null}</div></td></tr>)}</tbody></table></div>
      ) : null}
    </Card>
  );
}

function ConductTimeline({ reviews }: { reviews: ConductRecord["reviews"] }) {
  const steps = reviews.length ? reviews : [];
  return (
    <div className="min-w-48 space-y-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Criado</p>
      {steps.map((review) => (
        <p key={review.id}>{review.actionLabel} - {formatDate(review.createdAt)}</p>
      ))}
    </div>
  );
}
