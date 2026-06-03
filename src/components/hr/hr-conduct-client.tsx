"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, MessageSquareText, Plus, Save, ShieldAlert, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  hasAttachment: boolean;
  evidenceCount: number;
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
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };

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
  attachmentId: string;
  isSensitive: string;
};

const conductTypes = [
  ["warning", "Advertencia"],
  ["suspension", "Suspensao"],
  ["complaint", "Reclamacao"],
  ["compliment", "Elogio"],
  ["formal_guidance", "Orientacao formal"],
  ["formal_conversation", "Conversa formal"]
];
const statuses = [["draft", "Rascunho"], ["pending_review", "Aguardando revisao"], ["reviewed", "Revisado"], ["rejected", "Rejeitado"], ["cancelled", "Cancelado"]];
const severities = [["info", "Info"], ["notice", "Aviso"], ["warning", "Alerta"], ["critical", "Critico"]];
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
  attachmentId: "",
  isSensitive: "true"
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel processar conduta.");
  return payload as T;
}

function buildUrl(path: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
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
    attachmentId: form.attachmentId,
    isSensitive: form.isSensitive === "true"
  };
}

export function HrConductClient() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ unitId: "", employeeId: "", conductType: "", status: "", severity: "", search: "" });
  const [form, setForm] = useState<ConductForm>(emptyForm);
  const [actionComments, setActionComments] = useState("");
  const [showForm, setShowForm] = useState(false);

  const conductQuery = useQuery({ queryKey: ["hr", "conduct", filters], queryFn: async () => requestJson<ConductResponse>(buildUrl("/api/hr/conduct", { ...filters, pageSize: "100" })) });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "conduct-options"], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "conduct-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });

  const records = useMemo(() => conductQuery.data?.data ?? [], [conductQuery.data?.data]);
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
      requestJson(current.id ? `/api/hr/conduct/${current.id}` : "/api/hr/conduct", {
        method: current.id ? "PATCH" : "POST",
        body: JSON.stringify(payload(current))
      }),
    onSuccess: async () => {
      setShowForm(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "conduct"] });
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

  function runAction(record: ConductRecord, action: "submit" | "approve" | "reject" | "cancel") {
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
      attachmentId: "",
      isSensitive: String(record.isSensitive)
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Conduta e Ocorrencias</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Advertencias, suspensoes, reclamacoes, elogios, orientacoes e conversas formais.</p>
          </div>
          <Button size="sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}><Plus className="h-4 w-4" />Novo registro</Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ConductStat title="Pendentes de revisao" value={summary.pendingReview} tone={summary.pendingReview ? "warning" : "visual"} />
        <ConductStat title="Aprovados" value={summary.reviewed} tone="success" />
        <ConductStat title="Rejeitados" value={summary.rejected} tone={summary.rejected ? "warning" : "visual"} />
        <ConductStat title="Cancelados" value={summary.cancelled} tone={summary.cancelled ? "warning" : "visual"} />
        <ConductStat title="Criticos aguardando analise" value={summary.criticalPending} tone={summary.criticalPending ? "warning" : "visual"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SelectField value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}><option value="">Todas as unidades</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}</SelectField>
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Todos os colaboradores</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField>
          <SelectField value={filters.conductType} onChange={(event) => setFilters((current) => ({ ...current, conductType: event.target.value }))}><option value="">Todos os tipos</option>{conductTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos os status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.severity} onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}><option value="">Todas as severidades</option>{severities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <Input placeholder="Buscar titulo" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </div>
      </Card>

      {showForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{form.id ? "Editar registro de conduta" : "Novo registro de conduta"}</h2><Button variant="outline" size="sm" onClick={() => setShowForm(false)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={form.conductType} onChange={(event) => setForm((current) => ({ ...current, conductType: event.target.value }))}>{conductTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Data"><Input type="date" value={form.occurrenceDate} onChange={(event) => setForm((current) => ({ ...current, occurrenceDate: event.target.value }))} /></Field>
            <Field label="Status"><SelectField value={form.status} disabled><option value="draft">Rascunho</option></SelectField></Field>
            <Field label="Severidade"><SelectField value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}><option value="">Padrao do tipo</option>{severities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Restrito?"><SelectField value={form.isSensitive} onChange={(event) => setForm((current) => ({ ...current, isSensitive: event.target.value }))}><option value="true">Sim</option><option value="false">Nao</option></SelectField></Field>
            <Field label="Anexo"><Input value={form.attachmentId} onChange={(event) => setForm((current) => ({ ...current, attachmentId: event.target.value }))} placeholder="ID do anexo" /></Field>
            <Field label="Titulo"><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Descricao"><TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            <Field label="Acao tomada"><TextArea value={form.actionTaken} onChange={(event) => setForm((current) => ({ ...current, actionTaken: event.target.value }))} /></Field>
          </div>
          {mutation.error ? <div className="mt-3"><ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Erro ao salvar conduta."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}><Save className="h-4 w-4" />Salvar</Button>
        </Card>
      ) : null}

      {conductQuery.isLoading ? <LoadingTable label="Carregando conduta..." /> : null}
      {conductQuery.error ? <ErrorMessage message={conductQuery.error instanceof Error ? conductQuery.error.message : "Erro ao carregar conduta."} /> : null}
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <Field label="Comentario da proxima acao"><TextArea value={actionComments} onChange={(event) => setActionComments(event.target.value)} /></Field>
        {actionMutation.error ? <div className="mt-3"><ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Erro ao executar acao."} /></div> : null}
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
      {!records.length ? <EmptyState title="Nenhum registro de conduta" description="Advertencias, elogios e conversas formais aparecerao aqui." /> : null}
      {records.length ? (
        <div className="overflow-x-auto"><table className="min-w-[1240px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Severidade</th><th className="px-4 py-3">Titulo</th><th className="px-4 py-3">Evidencias</th><th className="px-4 py-3">Timeline</th><th className="px-4 py-3">Acoes</th></tr></thead><tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{formatDate(record.occurrenceDate)}</td><td className="px-4 py-3">{record.employeeName || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.conductTypeLabel} />{record.isSensitive ? <StatusBadge status="warning" label={record.redacted ? "Restrito" : "Sensivel"} /> : null}</div></td><td className="px-4 py-3"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /></td><td className="px-4 py-3"><StatusBadge status={severityTone(record.severity)} label={record.severity} /></td><td className="px-4 py-3">{record.title}</td><td className="px-4 py-3"><StatusBadge status={record.evidenceCount ? "success" : "visual"} label={`${record.evidenceCount ?? 0} evidencia(s)`} /></td><td className="px-4 py-3"><ConductTimeline reviews={record.reviews} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" onClick={() => onEdit(record)}>Editar</Button>{record.status === "draft" ? <Button size="sm" onClick={() => onAction(record, "submit")} disabled={actionPending}>Enviar</Button> : null}{record.status === "pending_review" ? <Button size="sm" onClick={() => onAction(record, "approve")} disabled={actionPending}>Aprovar</Button> : null}{record.status === "pending_review" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "reject")} disabled={actionPending}>Rejeitar</Button> : null}{record.status !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "cancel")} disabled={actionPending}>Cancelar</Button> : null}</div></td></tr>)}</tbody></table></div>
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
