"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CalendarClock, CheckCircle2, FileCheck2, Filter, Plus, Save, Search, ShieldAlert, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  redacted: boolean;
};

type EmployeeOption = { id: string; fullName: string; preferredName: string };
type UnitOption = { id: string; code: string; name: string };

type TrainingsResponse = { ok: true; data: Training[]; pagination: { total: number } };
type AssignmentsResponse = { ok: true; data: EmployeeTraining[] };
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };

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
  certificateAttachmentId: string;
  expiresAt: string;
  notes: string;
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
  ["waived", "Dispensado"],
  ["cancelled", "Cancelado"]
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
  certificateAttachmentId: "",
  expiresAt: "",
  notes: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel processar treinamentos.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "expired" || status === "cancelled") return "danger" as const;
  if (status === "assigned" || status === "scheduled" || status === "in_progress") return "warning" as const;
  return "visual" as const;
}

function buildUrl(path: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
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
  const [filters, setFilters] = useState({ status: "", trainingType: "", deliveryMode: "", mandatory: "", unitId: "", employeeId: "", expiresTo: "", search: "" });
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [verifyForm, setVerifyForm] = useState<VerifyForm>(emptyVerifyForm);
  const [trainingForm, setTrainingForm] = useState<TrainingForm>(emptyTrainingForm);
  const [assignForm, setAssignForm] = useState<AssignForm>(emptyAssignForm);

  const assignmentsQuery = useQuery({
    queryKey: ["hr", "training-assignments", filters],
    queryFn: async () => requestJson<AssignmentsResponse>(buildUrl("/api/hr/trainings/assignments", filters))
  });
  const catalogFilters = useMemo(
    () => ({
      unitId: filters.unitId,
      trainingType: filters.trainingType,
      deliveryMode: filters.deliveryMode,
      mandatory: filters.mandatory,
      search: filters.search,
      pageSize: "100"
    }),
    [filters.deliveryMode, filters.mandatory, filters.search, filters.trainingType, filters.unitId]
  );
  const trainingsQuery = useQuery({
    queryKey: ["hr", "trainings", catalogFilters],
    queryFn: async () => requestJson<TrainingsResponse>(buildUrl("/api/hr/trainings", catalogFilters))
  });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "training-options"], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "training-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });

  const trainings = useMemo(() => trainingsQuery.data?.data ?? [], [trainingsQuery.data?.data]);
  const assignments = useMemo(() => assignmentsQuery.data?.data ?? [], [assignmentsQuery.data?.data]);
  const summary = useMemo(
    () => ({
      totalTrainings: trainingsQuery.data?.pagination.total ?? trainings.length,
      mandatory: trainings.filter((training) => training.isMandatory).length,
      assigned: assignments.length,
      completed: assignments.filter((item) => item.status === "completed").length,
      expired: assignments.filter((item) => item.status === "expired").length,
      expiring: assignments.filter((item) => item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now() + 30 * 86400000).length,
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
          certificateAttachmentId: form.certificateAttachmentId,
          expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T12:00:00.000Z`).toISOString() : "",
          notes: form.notes
        })
      }),
    onSuccess: async () => {
      setVerifyForm(emptyVerifyForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "training-assignments"] });
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
      certificateAttachmentId: "",
      expiresAt: "",
      notes: ""
    });
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
            <p className="mt-1 text-sm text-muted-foreground">Catalogo, atribuicoes, presenca, certificados e validade sem criar modulo de saude ocupacional.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { setTrainingForm(emptyTrainingForm); setShowTrainingForm(true); }}><Plus className="h-4 w-4" />Novo treinamento</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAssignForm(true)}><Plus className="h-4 w-4" />Atribuir</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <TrainingStat title="Total" value={summary.totalTrainings} icon={Award} tone="info" />
        <TrainingStat title="Obrigatórios" value={summary.mandatory} icon={ShieldAlert} tone={summary.mandatory ? "warning" : "visual"} />
        <TrainingStat title="Atribuídos" value={summary.assigned} icon={CalendarClock} tone="info" />
        <TrainingStat title="Concluídos" value={summary.completed} icon={CheckCircle2} tone={summary.completed ? "success" : "visual"} />
        <TrainingStat title="Vencidos" value={summary.expired} icon={ShieldAlert} tone={summary.expired ? "danger" : "visual"} />
        <TrainingStat title="A vencer" value={summary.expiring} icon={CalendarClock} tone={summary.expiring ? "warning" : "visual"} />
        <TrainingStat title="Certificados pendentes" value={summary.certificatePending} icon={FileCheck2} tone={summary.certificatePending ? "warning" : "visual"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SelectField value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}>
            <option value="">Todas as unidades</option>
            {(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}
          </SelectField>
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
          <SelectField value={filters.mandatory} onChange={(event) => setFilters((current) => ({ ...current, mandatory: event.target.value }))}>
            <option value="">Obrigatorio?</option>
            <option value="true">Somente obrigatorios</option>
            <option value="false">Nao obrigatorios</option>
          </SelectField>
          <Input type="date" value={filters.expiresTo} onChange={(event) => setFilters((current) => ({ ...current, expiresTo: event.target.value }))} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar treinamento" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
          </div>
        </div>
      </Card>

      {showTrainingForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{trainingForm.id ? "Editar treinamento" : "Novo treinamento"}</h2><Button variant="outline" size="sm" onClick={() => setShowTrainingForm(false)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <Field label="Status"><SelectField value={trainingForm.status} onChange={(e) => setTrainingForm((f) => ({ ...f, status: e.target.value }))}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="archived">Arquivado</option></SelectField></Field>
            <Field label="Descrição"><TextArea value={trainingForm.description} onChange={(e) => setTrainingForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          </div>
          {trainingMutation.error ? <div className="mt-3"><ErrorMessage message={trainingMutation.error instanceof Error ? trainingMutation.error.message : "Erro ao salvar."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => trainingMutation.mutate(trainingForm)} disabled={trainingMutation.isPending}><Save className="h-4 w-4" />Salvar</Button>
        </Card>
      ) : null}

      {showAssignForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">Atribuir treinamento</h2><Button variant="outline" size="sm" onClick={() => setShowAssignForm(false)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={assignForm.employeeId} onChange={(e) => setAssignForm((f) => ({ ...f, employeeId: e.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Treinamento"><SelectField value={assignForm.trainingId} onChange={(e) => setAssignForm((f) => ({ ...f, trainingId: e.target.value }))}><option value="">Selecione</option>{trainings.map((training) => <option key={training.id} value={training.id}>{training.title}</option>)}</SelectField></Field>
            <Field label="Prazo"><Input type="date" value={assignForm.dueDate} onChange={(e) => setAssignForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
            <Field label="Observações"><Input value={assignForm.notes} onChange={(e) => setAssignForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          </div>
          {assignMutation.error ? <div className="mt-3"><ErrorMessage message={assignMutation.error instanceof Error ? assignMutation.error.message : "Erro ao atribuir."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => assignMutation.mutate(assignForm)} disabled={assignMutation.isPending}><Save className="h-4 w-4" />Atribuir</Button>
        </Card>
      ) : null}

      {verifyForm.employeeTrainingId ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">Concluir/validar treinamento</h2><Button variant="outline" size="sm" onClick={() => setVerifyForm(emptyVerifyForm)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Status"><SelectField value={verifyForm.status} onChange={(e) => setVerifyForm((f) => ({ ...f, status: e.target.value }))}>{employeeStatuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField></Field>
            <Field label="Presença confirmada"><SelectField value={verifyForm.attendanceConfirmed} onChange={(e) => setVerifyForm((f) => ({ ...f, attendanceConfirmed: e.target.value }))}><option value="true">Sim</option><option value="false">Não</option></SelectField></Field>
            <Field label="Data de conclusão"><Input type="date" value={verifyForm.completedAt} onChange={(e) => setVerifyForm((f) => ({ ...f, completedAt: e.target.value }))} /></Field>
            <Field label="Certificado/anexo"><Input value={verifyForm.certificateAttachmentId} onChange={(e) => setVerifyForm((f) => ({ ...f, certificateAttachmentId: e.target.value }))} placeholder="ID do anexo" /></Field>
            <Field label="Validade até"><Input type="date" value={verifyForm.expiresAt} onChange={(e) => setVerifyForm((f) => ({ ...f, expiresAt: e.target.value }))} /></Field>
            <Field label="Observação"><Input value={verifyForm.notes} onChange={(e) => setVerifyForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          </div>
          {verifyMutation.error ? <div className="mt-3"><ErrorMessage message={verifyMutation.error instanceof Error ? verifyMutation.error.message : "Erro ao validar."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => verifyMutation.mutate(verifyForm)} disabled={verifyMutation.isPending}><FileCheck2 className="h-4 w-4" />Salvar validação</Button>
        </Card>
      ) : null}

      {(trainingsQuery.isLoading || assignmentsQuery.isLoading) ? <LoadingTable label="Carregando treinamentos..." /> : null}
      {trainingsQuery.error ? <ErrorMessage message={trainingsQuery.error instanceof Error ? trainingsQuery.error.message : "Erro ao carregar catálogo."} /> : null}
      {assignmentsQuery.error ? <ErrorMessage message={assignmentsQuery.error instanceof Error ? assignmentsQuery.error.message : "Erro ao carregar atribuições."} /> : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4"><h2 className="text-sm font-semibold">Catálogo de treinamentos</h2></div>
          {!trainings.length && !trainingsQuery.isLoading ? <EmptyState title="Nenhum treinamento cadastrado" description="Crie treinamentos internos, externos ou obrigatórios para atribuir aos colaboradores." /> : null}
          {trainings.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Modalidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ação</th></tr></thead>
                <tbody className="divide-y">{trainings.map((training) => <tr key={training.id} className="align-top"><td className="px-4 py-3"><div className="font-medium">{training.title}</div>{training.isMandatory ? <StatusBadge status="warning" label="Obrigatório" /> : null}</td><td className="px-4 py-3">{training.trainingTypeLabel}</td><td className="px-4 py-3">{training.deliveryModeLabel}</td><td className="px-4 py-3"><StatusBadge status={training.status === "active" ? "success" : "visual"} label={training.status === "active" ? "Ativo" : training.status} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => startEdit(training)}>Editar</Button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4"><h2 className="text-sm font-semibold">Treinamentos atribuídos</h2></div>
          {!assignments.length && !assignmentsQuery.isLoading ? <EmptyState title="Nenhum treinamento atribuído" description="As atribuições de treinamento dos colaboradores aparecerão aqui." /> : null}
          {assignments.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Prazo</th><th className="px-4 py-3">Conclusão</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Certificado</th><th className="px-4 py-3">Ação</th></tr></thead>
                <tbody className="divide-y">{assignments.map((row) => <tr key={row.id} className="align-top"><td className="px-4 py-3">{row.employeeName || "-"}</td><td className="px-4 py-3"><div className="font-medium">{row.trainingTitle}</div>{row.isMandatory ? <StatusBadge status="warning" label="Obrigatório" /> : null}</td><td className="px-4 py-3"><StatusBadge status={statusTone(row.status)} label={row.statusLabel} /></td><td className="px-4 py-3">{formatDate(row.dueDate)}</td><td className="px-4 py-3">{formatDate(row.completedAt)}</td><td className="px-4 py-3">{formatDate(row.expiresAt)}</td><td className="px-4 py-3"><StatusBadge status={row.hasCertificate ? "success" : "visual"} label={row.hasCertificate ? "Anexado" : "Pendente"} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => startVerify(row)}>Validar</Button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>
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
