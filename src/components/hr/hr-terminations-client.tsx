"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Filter, LogOut, Plus, Save } from "lucide-react";
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
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };

type TerminationForm = {
  id: string;
  employeeId: string;
  terminationType: string;
  status: string;
  terminationReason: string;
  effectiveDate: string;
  notes: string;
};

const terminationTypes = [
  ["voluntary", "Pedido de demissao"],
  ["involuntary", "Desligamento pela empresa"],
  ["mutual", "Acordo mutuo"],
  ["retirement", "Aposentadoria"],
  ["end_of_contract", "Fim de contrato"],
  ["other", "Outro"]
];

const statuses = [
  ["draft", "Rascunho"],
  ["pending_review", "Aguardando revisao"],
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel processar desligamento.");
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

function statusTone(status: string) {
  if (status === "implemented" || status === "approved") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  if (status === "cancelled") return "danger" as const;
  return "visual" as const;
}

function nextActionLabel(record: TerminationRecord) {
  if (record.status === "draft") return "Envie para revisao quando estiver pronto.";
  if (record.status === "pending_review") return "Aguardando aprovacao do responsavel.";
  if (record.status === "approved") return record.pendingCount > 0 ? "Conclua as pendencias antes de efetivar." : "Pronto para efetivacao.";
  if (record.status === "implemented") return "Processo concluido.";
  if (record.status === "cancelled") return "Processo cancelado.";
  return "Acompanhe o status do desligamento.";
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
  const [checklistName, setChecklistName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const terminationsQuery = useQuery({
    queryKey: ["hr", "terminations", filters],
    queryFn: async () => requestJson<TerminationsResponse>(buildUrl("/api/hr/terminations", { ...filters, pageSize: "100" }))
  });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "termination-options"], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "termination-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });

  const records = useMemo(() => terminationsQuery.data?.data ?? [], [terminationsQuery.data?.data]);
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
      requestJson(current.id ? `/api/hr/terminations/${current.id}` : "/api/hr/terminations", {
        method: current.id ? "PATCH" : "POST",
        body: JSON.stringify(payload(current))
      }),
    onSuccess: async () => {
      setShowForm(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "terminations"] });
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
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><LogOut className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Desligamentos</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">Crie o desligamento, conclua o checklist e efetive somente apos aprovacao.</p>
          </div>
          <Button size="sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}><Plus className="h-4 w-4" />Novo desligamento</Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <TerminationStat title="Em andamento" value={summary.ongoing} tone={summary.ongoing ? "warning" : "visual"} />
        <TerminationStat title="Aguardando revisao" value={summary.pendingReview} tone={summary.pendingReview ? "warning" : "visual"} />
        <TerminationStat title="Aprovados" value={summary.approved} tone="success" />
        <TerminationStat title="Efetivados" value={summary.implemented} tone="success" />
        <TerminationStat title="Cancelados" value={summary.cancelled} tone={summary.cancelled ? "warning" : "visual"} />
        <TerminationStat title="Pendencias abertas" value={summary.openPendencies} tone={summary.openPendencies ? "warning" : "success"} />
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
        description={form.id ? "Atualize o rascunho do desligamento sem alterar o fluxo de aprovacao." : "O desligamento nasce como rascunho. Depois, envie para revisao e efetive somente apos aprovacao."}
        onClose={() => setShowForm(false)}
      >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={form.terminationType} onChange={(event) => setForm((current) => ({ ...current, terminationType: event.target.value }))}>{terminationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Data efetiva"><Input type="date" value={form.effectiveDate} onChange={(event) => setForm((current) => ({ ...current, effectiveDate: event.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Status inicial: Rascunho</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">O status muda pelo fluxo: revisao, aprovacao e efetivacao.</p>
            </div>
            <Field label="Motivo"><TextArea value={form.terminationReason} onChange={(event) => setForm((current) => ({ ...current, terminationReason: event.target.value }))} /></Field>
            <Field label="Observacao"><TextArea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field>
          </div>
          {saveMutation.error ? <div className="mt-3"><ErrorMessage message={saveMutation.error instanceof Error ? saveMutation.error.message : "Nao foi possivel salvar o desligamento. Confira colaborador, tipo, motivo e data efetiva."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}><Save className="h-4 w-4" />Salvar</Button>
      </HrOperationalModal>

      {terminationsQuery.isLoading ? <LoadingTable label="Carregando desligamentos..." /> : null}
      {terminationsQuery.error ? <ErrorMessage message={terminationsQuery.error instanceof Error ? terminationsQuery.error.message : "Nao foi possivel carregar os desligamentos. Tente atualizar a pagina."} /> : null}
      {actionMutation.error ? <ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Nao foi possivel executar a acao. Confira o status do processo e tente novamente."} /> : null}
      {checklistMutation.error ? <ErrorMessage message={checklistMutation.error instanceof Error ? checklistMutation.error.message : "Nao foi possivel atualizar o checklist. Tente novamente."} /> : null}
      {addChecklistMutation.error ? <ErrorMessage message={addChecklistMutation.error instanceof Error ? addChecklistMutation.error.message : "Nao foi possivel adicionar a pendencia. Informe o nome do item e tente novamente."} /> : null}

      <TerminationTable
        records={records}
        checklistName={checklistName}
        onChecklistName={setChecklistName}
        onEdit={edit}
        onAction={(record, action) => actionMutation.mutate({ id: record.id, action })}
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
      {!records.length ? <EmptyState title="Nenhum desligamento em andamento" description="Use Novo desligamento para iniciar uma solicitacao administrativa com checklist e revisao." /> : null}
      {records.length ? (
        <div className="overflow-x-auto"><table className="min-w-[1280px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data efetiva</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Checklist</th><th className="px-4 py-3">Acoes</th></tr></thead><tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{record.employeeName || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.terminationTypeLabel} /><StatusBadge status="warning" label={record.redacted ? "Registro restrito" : "Informacao sensivel"} /></div></td><td className="px-4 py-3"><div className="space-y-1"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /><p className="max-w-[220px] text-xs leading-5 text-muted-foreground">{nextActionLabel(record)}</p></div></td><td className="px-4 py-3">{formatDate(record.effectiveDate)}</td><td className="px-4 py-3">{record.redacted ? "Informacao sensivel" : record.terminationReason}</td><td className="px-4 py-3"><TerminationChecklist record={record} checklistName={checklistName} onChecklistName={onChecklistName} onToggle={onToggleChecklist} onAdd={onAddChecklist} pending={pending} /></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Button variant="outline" size="sm" onClick={() => onEdit(record)} disabled={record.status !== "draft"}>Editar</Button>{record.status === "draft" ? <Button size="sm" onClick={() => onAction(record, "submit")} disabled={pending}>Enviar para revisao</Button> : null}{record.status === "pending_review" ? <Button size="sm" onClick={() => onAction(record, "approve")} disabled={pending}>Aprovar</Button> : null}{record.status === "approved" ? <Button size="sm" onClick={() => onAction(record, "implement")} disabled={pending || record.pendingCount > 0}>Efetivar</Button> : null}{record.status !== "implemented" && record.status !== "cancelled" ? <Button variant="outline" size="sm" onClick={() => onAction(record, "cancel")} disabled={pending}>Cancelar</Button> : null}</div></td></tr>)}</tbody></table></div>
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
        <StatusBadge status={record.pendingCount ? "warning" : "success"} label={`${record.checklistCompletedCount}/${record.checklistCount} concluido(s)`} />
        {record.pendingCount ? <StatusBadge status="warning" label={`${record.pendingCount} pendencia(s)`} /> : null}
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
          <Input value={checklistName} onChange={(event) => onChecklistName(event.target.value)} placeholder="Nova pendencia" className="h-8 text-xs" />
          <Button size="sm" variant="outline" onClick={() => onAdd(record)} disabled={pending || !checklistName.trim()}>Adicionar</Button>
        </div>
      ) : null}
    </div>
  );
}
