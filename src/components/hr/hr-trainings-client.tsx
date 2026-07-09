"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, ExternalLink, FileCheck2, Filter, Plus, RefreshCw, Save, Search, ShieldAlert, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { HrOperationalModal } from "@/components/hr/hr-operational-modal";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";
import { formatDate } from "@/lib/format";

type Training = {
  id: string;
  unitId: string | null;
  unit: { id: string; label: string } | null;
  title: string;
  description: string;
  trainingType: string;
  trainingTypeLabel: string;
  deliveryMode: string;
  deliveryModeLabel: string;
  providerName: string;
  workloadHours: number | null;
  isMandatory: boolean;
  requiresCertificate: boolean;
  hasExpiration: boolean;
  validityDays: number | null;
  status: string;
};

type EmployeeTraining = {
  id: string;
  employeeId: string;
  employeeName: string;
  trainingId: string;
  trainingTitle: string;
  trainingType: string;
  trainingTypeLabel: string;
  deliveryMode: string;
  deliveryModeLabel: string;
  isMandatory: boolean;
  requiresCertificate: boolean;
  hasExpiration: boolean;
  status: string;
  statusLabel: string;
  dueDate: string;
  completedAt: string;
  expiresAt: string;
  hasCertificate: boolean;
  certificateAttachmentId: string;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
    needsRetraining: boolean;
    mandatoryPending: boolean;
  };
};

type EmployeeOption = { id: string; fullName: string; preferredName: string };
type UnitOption = { id: string; code: string; name: string };

type TrainingsResponse = { ok: true; data: Training[]; pagination: { total: number } };
type AssignmentsResponse = { ok: true; data: EmployeeTraining[] };
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };
type DocumentTypeOption = { id: string; code: string; name: string; category: string };
type DocumentTypesResponse = { ok: true; data: DocumentTypeOption[] };

type TrainingForm = {
  id: string;
  unitId: string;
  title: string;
  description: string;
  trainingType: string;
  deliveryMode: string;
  providerName: string;
  workloadHours: string;
  isMandatory: string;
  requiresCertificate: string;
  hasExpiration: string;
  validityDays: string;
  status: string;
};

type AssignForm = {
  employeeId: string;
  trainingId: string;
  dueDate: string;
  notes: string;
};

type VerifyForm = {
  employeeId: string;
  employeeTrainingId: string;
  status: string;
  attendanceConfirmed: string;
  completedAt: string;
  expiresAt: string;
  notes: string;
};

type TrainingAttachmentForm = {
  file: File | null;
  documentRole: "training_certificate" | "attendance_list";
  status: "idle" | "uploading" | "uploaded" | "error";
  message: string;
  attachmentId: string;
  documentId: string;
  linkId: string;
};

const trainingTypes = [
  ["integration", "Integração"],
  ["operational", "Operacional"],
  ["mandatory", "Obrigatório"],
  ["safety", "Segurança"],
  ["leadership", "Liderança"],
  ["technical", "Técnico"],
  ["behavioral", "Comportamental"],
  ["recycling", "Reciclagem"],
  ["other", "Outro"]
];

const deliveryModes = [
  ["in_person", "Presencial"],
  ["online", "Online"],
  ["hybrid", "Híbrido"],
  ["external", "Externo"]
];

const employeeStatuses = [
  ["assigned", "Atribuído"],
  ["scheduled", "Agendado"],
  ["in_progress", "Em andamento"],
  ["completed", "Concluído"],
  ["expired", "Vencido"],
  ["retraining_required", "Reciclagem necessária"],
  ["waived", "Dispensado"],
  ["cancelled", "Cancelado"]
];

const quickFilters = [
  ["", "Todas as pendências"],
  ["expired", "Vencidos"],
  ["expiring", "A vencer"],
  ["retraining", "Reciclagem"],
  ["mandatory_pending", "Obrigatórios pendentes"],
  ["pending", "Pendentes"],
  ["completed", "Concluídos"]
];

const emptyTrainingForm: TrainingForm = {
  id: "",
  unitId: "",
  title: "",
  description: "",
  trainingType: "operational",
  deliveryMode: "in_person",
  providerName: "",
  workloadHours: "",
  isMandatory: "false",
  requiresCertificate: "false",
  hasExpiration: "false",
  validityDays: "",
  status: "active"
};

const emptyAssignForm: AssignForm = { employeeId: "", trainingId: "", dueDate: "", notes: "" };
const emptyVerifyForm: VerifyForm = {
  employeeId: "",
  employeeTrainingId: "",
  status: "completed",
  attendanceConfirmed: "true",
  completedAt: "",
  expiresAt: "",
  notes: ""
};
const emptyTrainingAttachmentForm: TrainingAttachmentForm = {
  file: null,
  documentRole: "training_certificate",
  status: "idle",
  message: "",
  attachmentId: "",
  documentId: "",
  linkId: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível processar treinamentos.");
  return payload as T;
}

async function uploadTrainingDocument(input: {
  employeeId: string;
  employeeTrainingId: string;
  documentTypeId: string;
  documentRole: "training_certificate" | "attendance_list";
  sourceContextLabel: string;
  isRequired: boolean;
  file: File;
}) {
  const formData = new FormData();
  formData.set("employeeId", input.employeeId);
  formData.set("documentTypeId", input.documentTypeId);
  formData.set("sourceEntityType", "training");
  formData.set("sourceEntityId", input.employeeTrainingId);
  formData.set("documentRole", input.documentRole);
  formData.set("sourceContextLabel", input.sourceContextLabel);
  formData.set("notes", "Anexo enviado pelo fluxo de conclusão de treinamento.");
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
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível anexar certificado/lista.");
  return payload as {
    ok: true;
    data: {
      document: { id: string };
      attachment: { id: string; fileName: string };
      link: { id: string };
    };
  };
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "expired" || status === "cancelled") return "danger" as const;
  if (status === "retraining_required") return "warning" as const;
  if (status === "assigned" || status === "scheduled" || status === "in_progress") return "warning" as const;
  return "visual" as const;
}

function catalogStatusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  if (status === "archived") return "Arquivado";
  return status;
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

function trainingPayload(form: TrainingForm) {
  return {
    unitId: form.unitId,
    title: form.title,
    description: form.description,
    trainingType: form.trainingType,
    deliveryMode: form.deliveryMode,
    providerName: form.providerName,
    workloadHours: form.workloadHours,
    isMandatory: form.isMandatory === "true",
    requiresCertificate: form.requiresCertificate === "true",
    hasExpiration: form.hasExpiration === "true",
    validityDays: form.hasExpiration === "true" ? form.validityDays : "",
    status: form.status
  };
}

export function HrTrainingsClient() {
  const queryClient = useQueryClient();
  // Unidade ativa escopa o CATALOGO de treinos (treinos de rede / NULL seguem visiveis).
  // A aba de atribuicoes (assignments) permanece de rede (aggregate) — sem activeUnit.id.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  const [filters, setFilters] = useState({ status: "", trainingType: "", deliveryMode: "", mandatory: "", employeeId: "", expiresTo: "", search: "", quick: "" });
  const [activeTrainingView, setActiveTrainingView] = useState<"assignments" | "catalog">("assignments");
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [verifyForm, setVerifyForm] = useState<VerifyForm>(emptyVerifyForm);
  const [trainingAttachmentForm, setTrainingAttachmentForm] = useState<TrainingAttachmentForm>(emptyTrainingAttachmentForm);
  const [trainingForm, setTrainingForm] = useState<TrainingForm>(emptyTrainingForm);
  const [assignForm, setAssignForm] = useState<AssignForm>(emptyAssignForm);

  const assignmentsQuery = useQuery({
    queryKey: ["hr", "training-assignments", filters],
    queryFn: async () => requestJson<AssignmentsResponse>(buildUrl("/api/hr/trainings/assignments", { ...filters, quick: "" }))
  });
  const catalogFilters = useMemo(
    () => ({
      trainingType: filters.trainingType,
      deliveryMode: filters.deliveryMode,
      mandatory: filters.mandatory,
      search: filters.search,
      pageSize: "100"
    }),
    [filters.deliveryMode, filters.mandatory, filters.search, filters.trainingType]
  );
  const trainingsQuery = useQuery({
    queryKey: ["hr", "trainings", activeUnitId, catalogFilters],
    queryFn: async () => requestJson<TrainingsResponse>(buildUrl("/api/hr/trainings", catalogFilters))
  });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "training-options", activeUnitId], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "training-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const documentTypesQuery = useQuery({
    queryKey: ["hr", "document-types", "training", "active"],
    queryFn: async () => requestJson<DocumentTypesResponse>("/api/hr/document-types?status=active&category=training")
  });

  const trainings = useMemo(() => trainingsQuery.data?.data ?? [], [trainingsQuery.data?.data]);
  const assignments = useMemo(() => assignmentsQuery.data?.data ?? [], [assignmentsQuery.data?.data]);
  const selectedTrainingAssignment = useMemo(
    () => assignments.find((item) => item.id === verifyForm.employeeTrainingId) ?? null,
    [assignments, verifyForm.employeeTrainingId]
  );
  const trainingDocumentType = useMemo(
    () => (documentTypesQuery.data?.data ?? []).find((item) => item.code === "CERTIFICADO_TREINAMENTO") ?? documentTypesQuery.data?.data?.[0] ?? null,
    [documentTypesQuery.data?.data]
  );
  const visibleAssignments = useMemo(() => {
    if (!filters.quick) return assignments;
    return assignments.filter((item) => {
      if (filters.quick === "expired") return Boolean(item.expiration?.isExpired || item.status === "expired");
      if (filters.quick === "expiring") return Boolean(item.expiration?.expiresSoon);
      if (filters.quick === "retraining") return Boolean(item.expiration?.needsRetraining || item.status === "retraining_required");
      if (filters.quick === "mandatory_pending") return Boolean(item.expiration?.mandatoryPending);
      if (filters.quick === "pending") return !["completed", "waived", "cancelled"].includes(item.status);
      if (filters.quick === "completed") return item.status === "completed";
      return true;
    });
  }, [assignments, filters.quick]);
  const summary = useMemo(
    () => ({
      totalTrainings: trainingsQuery.data?.pagination.total ?? trainings.length,
      mandatoryPending: assignments.filter((item) => item.expiration?.mandatoryPending).length,
      assigned: assignments.length,
      completed: assignments.filter((item) => item.status === "completed").length,
      expired: assignments.filter((item) => item.expiration?.isExpired || item.status === "expired").length,
      expiring: assignments.filter((item) => item.expiration?.expiresSoon).length,
      retraining: assignments.filter((item) => item.expiration?.needsRetraining || item.status === "retraining_required").length,
      certificatePending: assignments.filter((item) => item.requiresCertificate && item.status === "completed" && !item.hasCertificate).length
    }),
    [assignments, trainings, trainingsQuery.data?.pagination.total]
  );

  const trainingMutation = useMutation({
    mutationFn: async (form: TrainingForm) =>
      requestJson(form.id ? `/api/hr/trainings/${form.id}` : "/api/hr/trainings", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(trainingPayload(form))
      }),
    onSuccess: async () => {
      setShowTrainingForm(false);
      setTrainingForm(emptyTrainingForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "trainings"] });
    }
  });

  const assignMutation = useMutation({
    mutationFn: async (form: AssignForm) =>
      requestJson(`/api/hr/employees/${form.employeeId}/trainings`, {
        method: "POST",
        body: JSON.stringify({ trainingId: form.trainingId, dueDate: form.dueDate, notes: form.notes })
      }),
    onSuccess: async () => {
      setShowAssignForm(false);
      setAssignForm(emptyAssignForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "training-assignments"] });
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async (form: VerifyForm) =>
      requestJson(`/api/hr/employees/${form.employeeId}/trainings/${form.employeeTrainingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: form.status,
          attendanceConfirmed: form.attendanceConfirmed === "true",
          completedAt: form.completedAt ? new Date(`${form.completedAt}T12:00:00.000Z`).toISOString() : "",
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T12:00:00.000Z`).toISOString() : "",
          notes: form.notes
        })
      }),
    onSuccess: async () => {
      setVerifyForm(emptyVerifyForm);
      setTrainingAttachmentForm(emptyTrainingAttachmentForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "training-assignments"] });
    }
  });

  const contextualUploadMutation = useMutation({
    mutationFn: async (input: { assignment: EmployeeTraining; file: File; documentRole: "training_certificate" | "attendance_list"; documentTypeId: string }) =>
      uploadTrainingDocument({
        employeeId: input.assignment.employeeId,
        employeeTrainingId: input.assignment.id,
        documentTypeId: input.documentTypeId,
        documentRole: input.documentRole,
        sourceContextLabel:
          input.documentRole === "attendance_list"
            ? `Lista de presença - ${input.assignment.trainingTitle}`
            : `Certificado de treinamento - ${input.assignment.trainingTitle}`,
        isRequired: input.assignment.requiresCertificate,
        file: input.file
      }),
    onSuccess: async (payload) => {
      setTrainingAttachmentForm((current) => ({
        ...current,
        status: "uploaded",
        message: "Certificado/lista anexado",
        attachmentId: payload.data.attachment.id,
        documentId: payload.data.document.id,
        linkId: payload.data.link.id,
        file: null
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "training-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "employees"] })
      ]);
    },
    onError: (error) => {
      setTrainingAttachmentForm((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "Erro no upload do anexo."
      }));
    }
  });

  const processMutation = useMutation({
    mutationFn: async () =>
      // Varredura de vencimentos: roda em TODAS as unidades acessiveis (governanca de rede),
      // nao na unidade ativa. A rota trata unitId ausente como "todas as acessiveis".
      requestJson<{ ok: true; data: { processedCount: number; expiringCount: number; expiredCount: number; retrainingCount: number } }>("/api/hr/trainings/process-expirations", {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hr", "training-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "employees"] });
    }
  });

  function startEdit(training: Training) {
    setTrainingForm({
      id: training.id,
      unitId: training.unitId ?? "",
      title: training.title,
      description: training.description,
      trainingType: training.trainingType,
      deliveryMode: training.deliveryMode,
      providerName: training.providerName,
      workloadHours: training.workloadHours == null ? "" : String(training.workloadHours),
      isMandatory: String(training.isMandatory),
      requiresCertificate: String(training.requiresCertificate),
      hasExpiration: String(training.hasExpiration),
      validityDays: training.validityDays == null ? "" : String(training.validityDays),
      status: training.status
    });
    setShowTrainingForm(true);
  }

  function startVerify(row: EmployeeTraining) {
    setVerifyForm({
      employeeId: row.employeeId,
      employeeTrainingId: row.id,
      status: "completed",
      attendanceConfirmed: "true",
      completedAt: new Date().toISOString().slice(0, 10),
      expiresAt: "",
      notes: ""
    });
    setTrainingAttachmentForm({
      ...emptyTrainingAttachmentForm,
      status: row.hasCertificate ? "uploaded" : "idle",
      message: row.hasCertificate ? "Certificado/lista anexado" : "",
      attachmentId: row.certificateAttachmentId ?? ""
    });
  }

  function confirmProcessExpirations() {
    const confirmed = window.confirm(
      "Atualizar vencimentos de treinamentos?\n\nO sistema vai recalcular treinamentos vencidos, a vencer e reciclagens necessárias.\n\nEsta ação não cria certificados nem anexa arquivos; certificados e listas de presença continuam no dossiê oficial do RH."
    );
    if (confirmed) processMutation.mutate();
  }

  function confirmTrainingVerification() {
    const currentAssignment = assignments.find((item) => item.id === verifyForm.employeeTrainingId);
    const hasContextualAttachment = Boolean(currentAssignment?.hasCertificate || trainingAttachmentForm.status === "uploaded" || trainingAttachmentForm.attachmentId);

    if (verifyForm.status === "completed" && currentAssignment?.requiresCertificate && !hasContextualAttachment) {
      setTrainingAttachmentForm((current) => ({
        ...current,
        status: "error",
        message: "Este treinamento exige certificado ou lista de presença antes da conclusão."
      }));
      return;
    }

    const confirmed = window.confirm(
      "Confirmar conclusão deste treinamento?\n\nEsta ação registra presença/conclusão operacional e atualiza validade quando informada.\n\nConfira antes se certificado, lista de presença ou comprovante estão no dossiê oficial do RH, quando exigido."
    );
    if (confirmed) verifyMutation.mutate(verifyForm);
  }

  function closeVerifyModal() {
    setVerifyForm(emptyVerifyForm);
    setTrainingAttachmentForm(emptyTrainingAttachmentForm);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Gestão de treinamentos</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Use o catálogo para cadastrar treinamentos disponíveis. Use atribuições para acompanhar conclusão e validade. Use Anexar certificado/lista no dossiê para guardar o arquivo no dossiê oficial do RH.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { setTrainingForm(emptyTrainingForm); setShowTrainingForm(true); }}><Plus className="h-4 w-4" />Cadastrar treinamento</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignForm(true)}><Plus className="h-4 w-4" />Atribuir a colaborador</Button>
            <Button type="button" variant="outline" size="sm" onClick={confirmProcessExpirations} disabled={processMutation.isPending}><RefreshCw className="h-4 w-4" />Atualizar vencimentos</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Catálogo</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Treinamentos cadastrados para depois atribuir aos colaboradores.</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Atribuições</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Treinamentos vinculados aos colaboradores, com prazo para conclusão, validade e próxima ação.</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Certificados e presença</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Certificado e lista de presença ficam no dossiê oficial do RH. Aqui o RH confirma conclusão e validade.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <TrainingStat title="Total treinamentos" value={summary.totalTrainings} icon={Award} tone="info" />
        <TrainingStat title="Obrigatórios pendentes" value={summary.mandatoryPending} icon={ShieldAlert} tone={summary.mandatoryPending ? "warning" : "visual"} />
        <TrainingStat title="A vencer" value={summary.expiring} icon={CalendarClock} tone={summary.expiring ? "warning" : "visual"} />
        <TrainingStat title="Vencidos" value={summary.expired} icon={ShieldAlert} tone={summary.expired ? "danger" : "visual"} />
        <TrainingStat title="Reciclagem necessária" value={summary.retraining} icon={RefreshCw} tone={summary.retraining ? "warning" : "visual"} />
        <TrainingStat title="Certificados pendentes" value={summary.certificatePending} icon={FileCheck2} tone={summary.certificatePending ? "warning" : "visual"} />
        <TrainingStat title="Concluídos" value={summary.completed} icon={CheckCircle2} tone={summary.completed ? "success" : "visual"} />
      </div>
      {processMutation.error ? <ErrorMessage message={processMutation.error instanceof Error ? processMutation.error.message : "Erro ao atualizar vencimentos."} /> : null}
      {processMutation.data?.data ? (
        <Card className="border-border/80 p-3 text-sm shadow-sm shadow-primary/5">
          Processamento concluído: {processMutation.data.data.processedCount} registro(s) avaliados, {processMutation.data.data.expiredCount} vencido(s), {processMutation.data.data.expiringCount} a vencer e {processMutation.data.data.retrainingCount} com reciclagem necessária.
        </Card>
      ) : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}>
            <option value="">Todos os colaboradores</option>
            {(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}
          </SelectField>
          <SelectField value={filters.trainingType} onChange={(event) => setFilters((current) => ({ ...current, trainingType: event.target.value }))}>
            <option value="">Todos os tipos</option>
            {trainingTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField value={filters.deliveryMode} onChange={(event) => setFilters((current) => ({ ...current, deliveryMode: event.target.value }))}>
            <option value="">Todas as modalidades</option>
            {deliveryModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Todos os status</option>
            {employeeStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField value={filters.quick} onChange={(event) => setFilters((current) => ({ ...current, quick: event.target.value }))}>
            {quickFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField value={filters.mandatory} onChange={(event) => setFilters((current) => ({ ...current, mandatory: event.target.value }))}>
            <option value="">Obrigatório?</option>
            <option value="true">Somente obrigatórios</option>
            <option value="false">Não obrigatórios</option>
          </SelectField>
          <Input type="date" value={filters.expiresTo} onChange={(event) => setFilters((current) => ({ ...current, expiresTo: event.target.value }))} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar treinamento" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
          </div>
        </div>
      </Card>

      <HrOperationalModal
        open={showTrainingForm}
        title={trainingForm.id ? "Editar treinamento" : "Cadastrar treinamento"}
        description={trainingForm.id ? "Atualize os dados do treinamento sem alterar o histórico dos colaboradores." : "Cadastre o treinamento uma vez para depois atribuir aos colaboradores."}
        onClose={() => setShowTrainingForm(false)}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Título"><Input value={trainingForm.title} onChange={(e) => setTrainingForm((f) => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Unidade"><SelectField value={trainingForm.unitId} onChange={(e) => setTrainingForm((f) => ({ ...f, unitId: e.target.value }))}><option value="">Rede/todas</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={trainingForm.trainingType} onChange={(e) => setTrainingForm((f) => ({ ...f, trainingType: e.target.value }))}>{trainingTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></Field>
            <Field label="Modalidade"><SelectField value={trainingForm.deliveryMode} onChange={(e) => setTrainingForm((f) => ({ ...f, deliveryMode: e.target.value }))}>{deliveryModes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></Field>
            <Field label="Fornecedor/Instrutor"><Input value={trainingForm.providerName} onChange={(e) => setTrainingForm((f) => ({ ...f, providerName: e.target.value }))} /></Field>
            <Field label="Carga horária"><Input type="number" min="0" step="0.5" value={trainingForm.workloadHours} onChange={(e) => setTrainingForm((f) => ({ ...f, workloadHours: e.target.value }))} /></Field>
            <Field label="Obrigatório?"><SelectField value={trainingForm.isMandatory} onChange={(e) => setTrainingForm((f) => ({ ...f, isMandatory: e.target.value }))}><option value="false">Não</option><option value="true">Sim</option></SelectField></Field>
            <Field label="Exige certificado?"><SelectField value={trainingForm.requiresCertificate} onChange={(e) => setTrainingForm((f) => ({ ...f, requiresCertificate: e.target.value }))}><option value="false">Não</option><option value="true">Sim</option></SelectField></Field>
            <Field label="Possui validade?"><SelectField value={trainingForm.hasExpiration} onChange={(e) => setTrainingForm((f) => ({ ...f, hasExpiration: e.target.value }))}><option value="false">Não</option><option value="true">Sim</option></SelectField></Field>
            <Field label="Validade em dias"><Input type="number" min="1" value={trainingForm.validityDays} onChange={(e) => setTrainingForm((f) => ({ ...f, validityDays: e.target.value }))} disabled={trainingForm.hasExpiration !== "true"} /></Field>
            {trainingForm.id ? (
              <Field label="Status"><SelectField value={trainingForm.status} onChange={(e) => setTrainingForm((f) => ({ ...f, status: e.target.value }))}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="archived">Arquivado</option></SelectField></Field>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">Status inicial: Ativo</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Novos treinamentos ficam disponíveis para atribuição. O status pode ser alterado depois, se necessário.</p>
              </div>
            )}
            <Field label="Descrição"><TextArea value={trainingForm.description} onChange={(e) => setTrainingForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          </div>
          {trainingMutation.error ? <div className="mt-3"><ErrorMessage message={trainingMutation.error instanceof Error ? trainingMutation.error.message : "Não foi possível salvar o treinamento. Confira os campos obrigatórios."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => trainingMutation.mutate(trainingForm)} disabled={trainingMutation.isPending}><Save className="h-4 w-4" />Salvar treinamento</Button>
      </HrOperationalModal>

      <HrOperationalModal
        open={showAssignForm}
        title="Atribuir treinamento a colaborador"
        description="Escolha o colaborador, o treinamento e o prazo para conclusão. A validade do treinamento ou certificado será informada na confirmação da conclusão."
        onClose={() => setShowAssignForm(false)}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={assignForm.employeeId} onChange={(e) => setAssignForm((f) => ({ ...f, employeeId: e.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Treinamento"><SelectField value={assignForm.trainingId} onChange={(e) => setAssignForm((f) => ({ ...f, trainingId: e.target.value }))}><option value="">Selecione</option>{trainings.map((training) => <option key={training.id} value={training.id}>{training.title}</option>)}</SelectField></Field>
            <Field label="Prazo para conclusão">
              <Input type="date" value={assignForm.dueDate} onChange={(e) => setAssignForm((f) => ({ ...f, dueDate: e.target.value }))} />
              <p className="text-xs leading-5 text-muted-foreground">Data limite para o colaborador concluir este treinamento. Não é a validade do certificado.</p>
            </Field>
            <Field label="Observações"><Input value={assignForm.notes} onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          </div>
          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            A validade do treinamento ou certificado deve ser informada somente ao confirmar a conclusão. Certificado e lista de presença ficam no dossiê oficial do RH.
          </div>
          {assignMutation.error ? <div className="mt-3"><ErrorMessage message={assignMutation.error instanceof Error ? assignMutation.error.message : "Não foi possível atribuir o treinamento. Confira colaborador, treinamento e prazo para conclusão."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => assignMutation.mutate(assignForm)} disabled={assignMutation.isPending}><Save className="h-4 w-4" />Atribuir a colaborador</Button>
      </HrOperationalModal>

      <HrOperationalModal
        open={Boolean(verifyForm.employeeTrainingId)}
        title="Confirmar conclusão do treinamento"
        description="Confirme presença/conclusão operacional e informe a validade quando houver. Esta ação atualiza o controle do colaborador; certificados e listas de presença devem estar no dossiê oficial do RH."
        onClose={closeVerifyModal}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Status"><SelectField value={verifyForm.status} onChange={(e) => setVerifyForm((f) => ({ ...f, status: e.target.value }))}>{employeeStatuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></Field>
            <Field label="Presença confirmada"><SelectField value={verifyForm.attendanceConfirmed} onChange={(e) => setVerifyForm((f) => ({ ...f, attendanceConfirmed: e.target.value }))}><option value="true">Sim</option><option value="false">Não</option></SelectField></Field>
            <Field label="Data de conclusão"><Input type="date" value={verifyForm.completedAt} onChange={(e) => setVerifyForm((f) => ({ ...f, completedAt: e.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-medium text-foreground">Anexar certificado/lista de presença</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Anexe aqui o certificado ou lista de presença. O arquivo também ficará no dossiê do colaborador.</p>
                  {selectedTrainingAssignment?.requiresCertificate ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Este treinamento exige anexo para concluir.</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Anexo opcional para este treinamento.</p>
                  )}
                </div>
                {verifyForm.employeeId ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={employeeDocumentsHref(verifyForm.employeeId)}><ExternalLink className="h-4 w-4" />Ver no dossiê</a>
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
                <Field label="Tipo de anexo">
                  <SelectField
                    value={trainingAttachmentForm.documentRole}
                    onChange={(event) => setTrainingAttachmentForm((current) => ({ ...current, documentRole: event.target.value as TrainingAttachmentForm["documentRole"], status: current.status === "error" ? "idle" : current.status, message: current.status === "error" ? "" : current.message }))}
                    disabled={contextualUploadMutation.isPending || selectedTrainingAssignment?.hasCertificate}
                  >
                    <option value="training_certificate">Certificado</option>
                    <option value="attendance_list">Lista de presença</option>
                  </SelectField>
                </Field>
                <Field label="Arquivo">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    disabled={contextualUploadMutation.isPending || selectedTrainingAssignment?.hasCertificate}
                    onChange={(event) => setTrainingAttachmentForm((current) => ({ ...current, file: event.target.files?.[0] ?? null, status: current.status === "error" ? "idle" : current.status, message: current.status === "error" ? "" : current.message }))}
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  disabled={contextualUploadMutation.isPending || selectedTrainingAssignment?.hasCertificate || !selectedTrainingAssignment || !trainingDocumentType || !trainingAttachmentForm.file}
                  onClick={() => {
                    if (!selectedTrainingAssignment || !trainingDocumentType || !trainingAttachmentForm.file) return;
                    setTrainingAttachmentForm((current) => ({ ...current, status: "uploading", message: "Enviando anexo..." }));
                    contextualUploadMutation.mutate({ assignment: selectedTrainingAssignment, file: trainingAttachmentForm.file, documentRole: trainingAttachmentForm.documentRole, documentTypeId: trainingDocumentType.id });
                  }}
                >
                  <Upload className="h-4 w-4" />Anexar
                </Button>
              </div>
              {!trainingDocumentType && documentTypesQuery.isSuccess ? <p className="mt-2 text-xs font-medium text-destructive">Tipo documental de treinamento não encontrado.</p> : null}
              {trainingAttachmentForm.status === "uploaded" || selectedTrainingAssignment?.hasCertificate ? (
                <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status="success" label="Certificado/lista anexado" /><span className="text-xs text-muted-foreground">Disponível também no dossiê do colaborador.</span></div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2"><StatusBadge status={selectedTrainingAssignment?.requiresCertificate ? "warning" : "visual"} label="Anexo pendente" /><span className="text-xs text-muted-foreground">{selectedTrainingAssignment?.requiresCertificate ? "Obrigatório para concluir." : "Opcional para este treinamento."}</span></div>
              )}
              {trainingAttachmentForm.status === "uploading" ? <p className="mt-2 text-xs text-muted-foreground">{trainingAttachmentForm.message}</p> : null}
              {trainingAttachmentForm.status === "error" ? <p className="mt-2 text-xs font-medium text-destructive">{trainingAttachmentForm.message}</p> : null}
            </div>
            <div className="hidden rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Certificado/lista no dossiê</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Anexe certificado, lista de presença ou comprovante no dossiê oficial do RH, na aba Documentos do prontuário. Nesta tela registre apenas presença, conclusão e validade.</p>
              {verifyForm.employeeId ? (
                <Button asChild className="mt-3" variant="outline" size="sm">
                  <a href={employeeDocumentsHref(verifyForm.employeeId)}>Anexar certificado/lista no dossiê</a>
                </Button>
              ) : (
                <p className="mt-3 text-xs font-medium text-muted-foreground">Selecione o colaborador para abrir o dossiê com a aba Documentos.</p>
              )}
            </div>
            <Field label="Validade do treinamento/certificado">
              <Input type="date" value={verifyForm.expiresAt} onChange={(e) => setVerifyForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              <p className="text-xs leading-5 text-muted-foreground">Use este campo para a data de vencimento. Ele é diferente do prazo para conclusão.</p>
            </Field>
            <Field label="Observação"><Input value={verifyForm.notes} onChange={(e) => setVerifyForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          </div>
          {verifyMutation.error ? <div className="mt-3"><ErrorMessage message={verifyMutation.error instanceof Error ? verifyMutation.error.message : "Erro ao validar."} /></div> : null}
          <Button
            className="mt-4"
            size="sm"
            onClick={confirmTrainingVerification}
            disabled={
              verifyMutation.isPending ||
              contextualUploadMutation.isPending ||
              (verifyForm.status === "completed" &&
                Boolean(selectedTrainingAssignment?.requiresCertificate) &&
                !selectedTrainingAssignment?.hasCertificate &&
                trainingAttachmentForm.status !== "uploaded" &&
                !trainingAttachmentForm.attachmentId)
            }
          >
            <FileCheck2 className="h-4 w-4" />Confirmar conclusão
          </Button>
      </HrOperationalModal>

      {(trainingsQuery.isLoading || assignmentsQuery.isLoading) ? <LoadingTable label="Carregando treinamentos..." /> : null}
      {trainingsQuery.error ? <ErrorMessage message={trainingsQuery.error instanceof Error ? trainingsQuery.error.message : "Não foi possível carregar o catálogo de treinamentos. Tente atualizar a página."} /> : null}
      {assignmentsQuery.error ? <ErrorMessage message={assignmentsQuery.error instanceof Error ? assignmentsQuery.error.message : "Não foi possível carregar os treinamentos atribuídos. Tente atualizar a página."} /> : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Escolha a visão de trabalho</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Catálogo é cadastro. Atribuições são acompanhamentos de colaboradores.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={activeTrainingView === "assignments" ? "default" : "outline"} aria-pressed={activeTrainingView === "assignments"} onClick={() => setActiveTrainingView("assignments")}>
              <ClipboardCheck className="h-4 w-4" />
              Atribuições
            </Button>
            <Button type="button" size="sm" variant={activeTrainingView === "catalog" ? "default" : "outline"} aria-pressed={activeTrainingView === "catalog"} onClick={() => setActiveTrainingView("catalog")}>
              <BookOpen className="h-4 w-4" />
              Catálogo
            </Button>
          </div>
        </div>
      </Card>

      {activeTrainingView === "catalog" ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Catálogo de treinamentos</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Cadastre aqui os treinamentos disponíveis para depois atribuir aos colaboradores.</p>
          </div>
          {!trainings.length && !trainingsQuery.isLoading ? <EmptyState title="Nenhum treinamento cadastrado." description="Cadastre o primeiro treinamento para depois atribuir aos colaboradores." /> : null}
          {trainings.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Modalidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ação</th></tr></thead>
                <tbody className="divide-y">{trainings.map((training) => <tr key={training.id} className="align-top"><td className="px-4 py-3"><div className="font-medium">{training.title}</div>{training.isMandatory ? <StatusBadge status="warning" label="Obrigatório" /> : null}</td><td className="px-4 py-3">{training.trainingTypeLabel}</td><td className="px-4 py-3">{training.deliveryModeLabel}</td><td className="px-4 py-3"><StatusBadge status={training.status === "active" ? "success" : "visual"} label={catalogStatusLabel(training.status)} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => startEdit(training)}>Editar treinamento</Button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Treinamentos dos colaboradores</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Acompanhe treinamentos já atribuídos, prazo para conclusão, vencimentos e confirmações.</p>
          </div>
          {!visibleAssignments.length && !assignmentsQuery.isLoading ? <EmptyState title="Nenhum treinamento atribuído." description="Use o catálogo para cadastrar treinamentos e depois atribua aos colaboradores." /> : null}
          {visibleAssignments.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Prazo para conclusão</th><th className="px-4 py-3">Conclusão</th><th className="px-4 py-3">Validade do treinamento</th><th className="px-4 py-3">Certificado/lista</th><th className="px-4 py-3">Ação</th></tr></thead>
                <tbody className="divide-y">{visibleAssignments.map((row) => <tr key={row.id} className="align-top"><td className="px-4 py-3">{row.employeeName || "-"}</td><td className="px-4 py-3"><div className="font-medium">{row.trainingTitle}</div><div className="mt-1 flex flex-wrap gap-1">{row.isMandatory ? <StatusBadge status="warning" label="Obrigatório" /> : null}{row.expiration?.expiresSoon ? <StatusBadge status="warning" label="Vence em breve" /> : null}{row.expiration?.needsRetraining ? <StatusBadge status="warning" label="Reciclagem necessária" /> : null}</div></td><td className="px-4 py-3"><StatusBadge status={statusTone(row.status)} label={row.statusLabel} /></td><td className="px-4 py-3">{formatDate(row.dueDate)}</td><td className="px-4 py-3">{formatDate(row.completedAt)}</td><td className="px-4 py-3">{formatDate(row.expiresAt)}</td><td className="px-4 py-3"><StatusBadge status={row.hasCertificate ? "success" : row.requiresCertificate ? "warning" : "visual"} label={row.hasCertificate ? "Anexado" : row.requiresCertificate ? "Conferir Documentos" : "Não exigido"} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => startVerify(row)}>Confirmar conclusão</Button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function TrainingStat({ title, value, icon: Icon, tone }: { title: string; value: number; icon: typeof Award; tone: "visual" | "info" | "warning" | "success" | "danger" }) {
  return (
    <Card className="min-w-0 border-border/80 p-3 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-2"><StatusBadge status={tone} label={value ? "Acompanhar" : "Ok"} /></div>
    </Card>
  );
}
