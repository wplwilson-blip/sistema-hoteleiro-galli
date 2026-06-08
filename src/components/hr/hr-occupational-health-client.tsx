"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, Download, FileCheck2, Filter, HeartPulse, Plus, RefreshCw, Save, ShieldAlert, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OccupationalRecord = {
  id: string;
  unit: { id: string; code: string; name: string; label: string } | null;
  employeeId: string;
  employeeName: string;
  recordType: string;
  recordTypeLabel: string;
  status: string;
  statusLabel: string;
  examDate: string;
  expiresAt: string;
  providerName: string;
  doctorName: string;
  hasAttachment: boolean;
  restrictionNotes: string;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
  };
};

type NrCertification = {
  id: string;
  unit: { id: string; code: string; name: string; label: string } | null;
  employeeId: string;
  employeeName: string;
  nrCode: string;
  trainingName: string;
  issuedAt: string;
  expiresAt: string;
  status: string;
  statusLabel: string;
  hasCertificate: boolean;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
  };
};

type EmployeeOption = { id: string; fullName: string; preferredName: string };
type UnitOption = { id: string; code: string; name: string };
type RecordsResponse = { ok: true; data: OccupationalRecord[] };
type NrResponse = { ok: true; data: NrCertification[] };
type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: UnitOption[] };
type ProcessExpirationsResponse = {
  ok: true;
  data: {
    processedCount: number;
    asoExpiringCount: number;
    asoExpiredCount: number;
    nrExpiringCount: number;
    nrExpiredCount: number;
    restrictionCount: number;
  };
};

type RecordForm = {
  id: string;
  employeeId: string;
  recordType: string;
  status: string;
  examDate: string;
  expiresAt: string;
  providerName: string;
  doctorName: string;
  certificateNumber: string;
  restrictionNotes: string;
};

type NrForm = {
  id: string;
  employeeId: string;
  nrCode: string;
  trainingName: string;
  issuedAt: string;
  expiresAt: string;
  status: string;
};

type OccupationalReportRow = {
  id: string;
  source: "ASO/Exame" | "NR";
  unitLabel: string;
  employeeName: string;
  typeLabel: string;
  statusLabel: string;
  dueDate: string;
  alertLabel: string;
  priority: "critical" | "warning" | "info" | "normal";
};

const recordTypes = [
  ["aso_admission", "ASO admissional"],
  ["aso_periodic", "ASO periodico"],
  ["aso_return", "ASO retorno ao trabalho"],
  ["aso_role_change", "ASO mudanca de funcao"],
  ["aso_termination", "ASO demissional"],
  ["occupational_exam", "Exame ocupacional"],
  ["occupational_restriction", "Restricao ocupacional"],
  ["nr_certification", "Certificacao NR"]
];

const statuses = [
  ["valid", "Valido"],
  ["expiring", "A vencer"],
  ["expired", "Vencido"],
  ["cancelled", "Cancelado"]
];

const nrCodes = ["NR-05", "NR-06", "NR-10", "NR-12", "NR-17", "NR-23", "NR-35"];
const quickFilters = [
  ["", "Todas as pendencias"],
  ["expired", "Vencidos"],
  ["expiring", "A vencer"],
  ["aso", "ASO"],
  ["nr", "NR"],
  ["restrictions", "Restricoes"]
];
const emptyRecordForm: RecordForm = { id: "", employeeId: "", recordType: "aso_periodic", status: "valid", examDate: "", expiresAt: "", providerName: "", doctorName: "", certificateNumber: "", restrictionNotes: "" };
const emptyNrForm: NrForm = { id: "", employeeId: "", nrCode: "NR-06", trainingName: "", issuedAt: "", expiresAt: "", status: "valid" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel processar Saude Ocupacional.");
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
  if (status === "valid") return "success" as const;
  if (status === "expiring") return "warning" as const;
  if (status === "expired" || status === "cancelled") return "danger" as const;
  return "visual" as const;
}

function expirationState(value: string | null | undefined, status: string) {
  const date = value ? new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return { isExpired: status === "expired", expiresSoon: false };
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(today.getDate() + 30);
  return {
    isExpired: status === "expired" || date.getTime() < today.getTime(),
    expiresSoon: status !== "expired" && status !== "cancelled" && date.getTime() >= today.getTime() && date.getTime() <= limit.getTime()
  };
}

function recordExpiration(record: OccupationalRecord) {
  return record.expiration ?? expirationState(record.expiresAt, record.status);
}

function nrExpiration(nr: NrCertification) {
  return nr.expiration ?? expirationState(nr.expiresAt, nr.status);
}

function unitLabel(unit: OccupationalRecord["unit"] | NrCertification["unit"]) {
  return unit?.label || [unit?.code, unit?.name].filter(Boolean).join(" - ") || "Sem unidade";
}

function reportPriorityTone(priority: OccupationalReportRow["priority"]) {
  if (priority === "critical") return "danger" as const;
  if (priority === "warning") return "warning" as const;
  if (priority === "info") return "info" as const;
  return "visual" as const;
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: OccupationalReportRow[]) {
  const header = ["Origem", "Unidade", "Colaborador", "Tipo", "Status", "Validade", "Alerta"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) => [row.source, row.unitLabel, row.employeeName, row.typeLabel, row.statusLabel, row.dueDate, row.alertLabel].map(csvCell).join(","))
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function recordPayload(form: RecordForm) {
  return {
    employeeId: form.employeeId,
    recordType: form.recordType,
    status: form.status,
    examDate: form.examDate,
    expiresAt: form.expiresAt,
    providerName: form.providerName,
    doctorName: form.doctorName,
    certificateNumber: form.certificateNumber,
    restrictionNotes: form.restrictionNotes
  };
}

function nrPayload(form: NrForm) {
  return {
    employeeId: form.employeeId,
    nrCode: form.nrCode,
    trainingName: form.trainingName,
    issuedAt: form.issuedAt,
    expiresAt: form.expiresAt,
    status: form.status
  };
}

export function HrOccupationalHealthClient() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ unitId: "", employeeId: "", recordType: "", status: "", search: "", quick: "" });
  const [recordForm, setRecordForm] = useState<RecordForm>(emptyRecordForm);
  const [nrForm, setNrForm] = useState<NrForm>(emptyNrForm);
  const [groupBy, setGroupBy] = useState<"unit" | "type" | "status">("unit");
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showNrForm, setShowNrForm] = useState(false);

  const recordsQuery = useQuery({ queryKey: ["hr", "occupational-records", filters], queryFn: async () => requestJson<RecordsResponse>(buildUrl("/api/hr/occupational-records", { unitId: filters.unitId, employeeId: filters.employeeId, recordType: filters.recordType, status: filters.status, search: filters.search, pageSize: "100" })) });
  const nrQuery = useQuery({ queryKey: ["hr", "nr-certifications", filters], queryFn: async () => requestJson<NrResponse>(buildUrl("/api/hr/nr-certifications", { unitId: filters.unitId, employeeId: filters.employeeId, status: filters.status, search: filters.search, pageSize: "100" })) });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "occupational-options"], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "occupational-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });

  const records = useMemo(() => recordsQuery.data?.data ?? [], [recordsQuery.data?.data]);
  const nrs = useMemo(() => nrQuery.data?.data ?? [], [nrQuery.data?.data]);
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const expiration = recordExpiration(record);
        if (filters.quick === "expired") return expiration.isExpired;
        if (filters.quick === "expiring") return expiration.expiresSoon;
        if (filters.quick === "aso") return record.recordType.startsWith("aso_");
        if (filters.quick === "nr") return false;
        if (filters.quick === "restrictions") return record.recordType === "occupational_restriction" && record.status !== "cancelled";
        return true;
      }),
    [filters.quick, records]
  );
  const filteredNrs = useMemo(
    () =>
      nrs.filter((nr) => {
        const expiration = nrExpiration(nr);
        if (filters.quick === "expired") return expiration.isExpired;
        if (filters.quick === "expiring") return expiration.expiresSoon;
        if (filters.quick === "aso") return false;
        if (filters.quick === "restrictions") return false;
        return true;
      }),
    [filters.quick, nrs]
  );
  const summary = useMemo(
    () => ({
      asoValid: records.filter((record) => record.recordType.startsWith("aso_") && record.status === "valid").length,
      asoExpired: records.filter((record) => record.recordType.startsWith("aso_") && recordExpiration(record).isExpired).length,
      asoExpiring: records.filter((record) => record.recordType.startsWith("aso_") && recordExpiration(record).expiresSoon).length,
      nrValid: nrs.filter((nr) => nr.status === "valid").length,
      nrExpired: nrs.filter((nr) => nrExpiration(nr).isExpired).length,
      nrExpiring: nrs.filter((nr) => nrExpiration(nr).expiresSoon).length,
      restrictions: records.filter((record) => record.recordType === "occupational_restriction" && record.status !== "cancelled").length
    }),
    [nrs, records]
  );
  const reportRows = useMemo<OccupationalReportRow[]>(() => {
    const recordRows = filteredRecords.map((record) => {
      const expiration = recordExpiration(record);
      const isRestriction = record.recordType === "occupational_restriction" && record.status !== "cancelled";
      const priority: OccupationalReportRow["priority"] = expiration.isExpired ? "critical" : expiration.expiresSoon || isRestriction ? "warning" : "normal";
      return {
        id: record.id,
        source: "ASO/Exame" as const,
        unitLabel: unitLabel(record.unit),
        employeeName: record.employeeName || "-",
        typeLabel: record.recordTypeLabel,
        statusLabel: record.statusLabel,
        dueDate: formatDate(record.expiresAt),
        alertLabel: expiration.isExpired ? "Vencido" : expiration.expiresSoon ? "A vencer" : isRestriction ? "Restricao ativa" : "Sem pendencia",
        priority
      };
    });

    const nrRows = filteredNrs.map((nr) => {
      const expiration = nrExpiration(nr);
      const priority: OccupationalReportRow["priority"] = expiration.isExpired ? "critical" : expiration.expiresSoon ? "warning" : "normal";
      return {
        id: nr.id,
        source: "NR" as const,
        unitLabel: unitLabel(nr.unit),
        employeeName: nr.employeeName || "-",
        typeLabel: nr.nrCode,
        statusLabel: nr.statusLabel,
        dueDate: formatDate(nr.expiresAt),
        alertLabel: expiration.isExpired ? "NR vencida" : expiration.expiresSoon ? "NR a vencer" : "Sem pendencia",
        priority
      };
    });

    return [...recordRows, ...nrRows].sort((a, b) => {
      const priorityOrder = { critical: 0, warning: 1, info: 2, normal: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || a.unitLabel.localeCompare(b.unitLabel) || a.employeeName.localeCompare(b.employeeName);
    });
  }, [filteredNrs, filteredRecords]);
  const pendingRows = useMemo(() => reportRows.filter((row) => row.priority !== "normal"), [reportRows]);
  const groupedReport = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; critical: number; warning: number; normal: number }>();

    for (const row of reportRows) {
      const label = groupBy === "unit" ? row.unitLabel : groupBy === "type" ? row.typeLabel : row.statusLabel;
      const current = groups.get(label) ?? { label, total: 0, critical: 0, warning: 0, normal: 0 };
      current.total += 1;
      if (row.priority === "critical") current.critical += 1;
      else if (row.priority === "warning") current.warning += 1;
      else current.normal += 1;
      groups.set(label, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.critical - a.critical || b.warning - a.warning || b.total - a.total || a.label.localeCompare(b.label));
  }, [groupBy, reportRows]);

  const recordMutation = useMutation({
    mutationFn: async (form: RecordForm) =>
      requestJson(form.id ? `/api/hr/occupational-records/${form.id}` : "/api/hr/occupational-records", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(recordPayload(form))
      }),
    onSuccess: async () => {
      setShowRecordForm(false);
      setRecordForm(emptyRecordForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "occupational-records"] });
    }
  });

  const nrMutation = useMutation({
    mutationFn: async (form: NrForm) =>
      requestJson(form.id ? `/api/hr/nr-certifications/${form.id}` : "/api/hr/nr-certifications", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(nrPayload(form))
      }),
    onSuccess: async () => {
      setShowNrForm(false);
      setNrForm(emptyNrForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "nr-certifications"] });
    }
  });

  const processMutation = useMutation({
    mutationFn: async () =>
      requestJson<ProcessExpirationsResponse>("/api/hr/occupational-records/process-expirations", {
        method: "POST",
        body: JSON.stringify({ unitId: filters.unitId })
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "occupational-records"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "nr-certifications"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "background-jobs"] })
      ]);
    }
  });

  function editRecord(record: OccupationalRecord) {
    setRecordForm({ id: record.id, employeeId: record.employeeId, recordType: record.recordType, status: record.status, examDate: record.examDate, expiresAt: record.expiresAt, providerName: record.providerName, doctorName: record.doctorName, certificateNumber: "", restrictionNotes: record.restrictionNotes });
    setShowRecordForm(true);
  }

  function editNr(row: NrCertification) {
    setNrForm({ id: row.id, employeeId: row.employeeId, nrCode: row.nrCode, trainingName: row.trainingName, issuedAt: row.issuedAt, expiresAt: row.expiresAt, status: row.status });
    setShowNrForm(true);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><HeartPulse className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Saude Ocupacional</h2></div>
            <p className="mt-1 text-sm text-muted-foreground">ASOs, exames ocupacionais, restricoes e certificacoes NR com dados restritos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCsv("pendencias-ocupacionais.csv", pendingRows)} disabled={!pendingRows.length}><Download className="h-4 w-4" />Exportar pendencias</Button>
            <Button size="sm" variant="outline" onClick={() => downloadCsv("relatorio-saude-ocupacional.csv", reportRows)} disabled={!reportRows.length}><Download className="h-4 w-4" />Exportar CSV</Button>
            <Button size="sm" variant="outline" onClick={() => processMutation.mutate()} disabled={processMutation.isPending}><RefreshCw className="h-4 w-4" />Atualizar vencimentos</Button>
            <Button size="sm" onClick={() => { setRecordForm(emptyRecordForm); setShowRecordForm(true); }}><Plus className="h-4 w-4" />Novo registro</Button>
            <Button size="sm" variant="outline" onClick={() => { setNrForm(emptyNrForm); setShowNrForm(true); }}><Plus className="h-4 w-4" />Nova NR</Button>
          </div>
        </div>
        {processMutation.data ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status="info" label={`${processMutation.data.data.processedCount} processado(s)`} />
            <StatusBadge status="warning" label={`ASOs a vencer: ${processMutation.data.data.asoExpiringCount}`} />
            <StatusBadge status={processMutation.data.data.asoExpiredCount ? "danger" : "visual"} label={`ASOs vencidos: ${processMutation.data.data.asoExpiredCount}`} />
            <StatusBadge status="warning" label={`NRs a vencer: ${processMutation.data.data.nrExpiringCount}`} />
            <StatusBadge status={processMutation.data.data.nrExpiredCount ? "danger" : "visual"} label={`NRs vencidas: ${processMutation.data.data.nrExpiredCount}`} />
          </div>
        ) : null}
        {processMutation.error ? <div className="mt-3"><ErrorMessage message={processMutation.error instanceof Error ? processMutation.error.message : "Erro ao atualizar vencimentos."} /></div> : null}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <OccupationalStat title="ASOs validos" value={summary.asoValid} icon={FileCheck2} tone="success" />
        <OccupationalStat title="ASOs a vencer" value={summary.asoExpiring} icon={Activity} tone={summary.asoExpiring ? "warning" : "visual"} />
        <OccupationalStat title="ASOs vencidos" value={summary.asoExpired} icon={ShieldAlert} tone={summary.asoExpired ? "danger" : "visual"} />
        <OccupationalStat title="NRs validas" value={summary.nrValid} icon={FileCheck2} tone="success" />
        <OccupationalStat title="NRs a vencer" value={summary.nrExpiring} icon={Activity} tone={summary.nrExpiring ? "warning" : "visual"} />
        <OccupationalStat title="NRs vencidas" value={summary.nrExpired} icon={ShieldAlert} tone={summary.nrExpired ? "danger" : "visual"} />
        <OccupationalStat title="Restricoes ativas" value={summary.restrictions} icon={ShieldAlert} tone={summary.restrictions ? "warning" : "visual"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros</h2></div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SelectField value={filters.quick} onChange={(event) => setFilters((current) => ({ ...current, quick: event.target.value }))}>{quickFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.unitId} onChange={(event) => setFilters((current) => ({ ...current, unitId: event.target.value }))}><option value="">Todas as unidades</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}</SelectField>
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Todos os colaboradores</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField>
          <SelectField value={filters.recordType} onChange={(event) => setFilters((current) => ({ ...current, recordType: event.target.value }))}><option value="">Todos os tipos</option>{recordTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos os status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <Input placeholder="Buscar fornecedor ou treinamento" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Relatorio operacional</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">Agrupamento das pendencias e registros ocupacionais conforme filtros atuais.</p>
            </div>
            <SelectField value={groupBy} onChange={(event) => setGroupBy(event.target.value as "unit" | "type" | "status")}>
              <option value="unit">Agrupar por unidade</option>
              <option value="type">Agrupar por tipo</option>
              <option value="status">Agrupar por status</option>
            </SelectField>
          </div>
          <div className="mt-4 space-y-2">
            {!groupedReport.length ? <EmptyState title="Nenhum agrupamento encontrado" description="Ajuste os filtros para consultar outros registros ocupacionais." /> : null}
            {groupedReport.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{group.label}</p>
                  <p className="text-xs text-muted-foreground">{group.total} registro(s) no recorte atual</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={group.critical ? "danger" : "visual"} label={`Vencidos: ${group.critical}`} />
                  <StatusBadge status={group.warning ? "warning" : "visual"} label={`Alertas: ${group.warning}`} />
                  <StatusBadge status="visual" label={`Ok: ${group.normal}`} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Pendencias ocupacionais</h2>
                <p className="mt-1 text-xs text-muted-foreground">ASOs vencidos, NRs vencidas, vencimentos proximos e restricoes ativas.</p>
              </div>
              <StatusBadge status={pendingRows.length ? "warning" : "success"} label={`${pendingRows.length} pendencia(s)`} />
            </div>
          </div>
          {!pendingRows.length ? <EmptyState title="Nenhuma pendencia no recorte" description="Nao ha vencimentos ou restricoes ativas nos filtros atuais." /> : null}
          {pendingRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[880px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-3">Alerta</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Validade</th></tr>
                </thead>
                <tbody className="divide-y">
                  {pendingRows.map((row) => (
                    <tr key={`${row.source}-${row.id}`} className="align-top">
                      <td className="px-4 py-3"><StatusBadge status={reportPriorityTone(row.priority)} label={row.alertLabel} /></td>
                      <td className="px-4 py-3">{row.employeeName}</td>
                      <td className="px-4 py-3">{row.unitLabel}</td>
                      <td className="px-4 py-3">{row.source}</td>
                      <td className="px-4 py-3">{row.typeLabel}</td>
                      <td className="px-4 py-3">{row.statusLabel}</td>
                      <td className="px-4 py-3">{row.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </div>

      {showRecordForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{recordForm.id ? "Editar registro ocupacional" : "Novo registro ocupacional"}</h2><Button variant="outline" size="sm" onClick={() => setShowRecordForm(false)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={recordForm.employeeId} onChange={(event) => setRecordForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="Tipo"><SelectField value={recordForm.recordType} onChange={(event) => setRecordForm((current) => ({ ...current, recordType: event.target.value }))}>{recordTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Status"><SelectField value={recordForm.status} onChange={(event) => setRecordForm((current) => ({ ...current, status: event.target.value }))}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <Field label="Data"><Input type="date" value={recordForm.examDate} onChange={(event) => setRecordForm((current) => ({ ...current, examDate: event.target.value }))} /></Field>
            <Field label="Validade"><Input type="date" value={recordForm.expiresAt} onChange={(event) => setRecordForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field>
            <Field label="Fornecedor"><Input value={recordForm.providerName} onChange={(event) => setRecordForm((current) => ({ ...current, providerName: event.target.value }))} /></Field>
            <Field label="Medico"><Input value={recordForm.doctorName} onChange={(event) => setRecordForm((current) => ({ ...current, doctorName: event.target.value }))} /></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Anexo medico</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Nenhum arquivo anexado. Documentos ocupacionais devem ser vinculados pelo fluxo seguro de documentos.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled>Vincular anexo</Button>
            </div>
            <Field label="Restricoes"><TextArea value={recordForm.restrictionNotes} onChange={(event) => setRecordForm((current) => ({ ...current, restrictionNotes: event.target.value }))} /></Field>
          </div>
          {recordMutation.error ? <div className="mt-3"><ErrorMessage message={recordMutation.error instanceof Error ? recordMutation.error.message : "Nao foi possivel salvar o registro ocupacional. Confira os campos obrigatorios."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => recordMutation.mutate(recordForm)} disabled={recordMutation.isPending}><Save className="h-4 w-4" />Salvar</Button>
        </Card>
      ) : null}

      {showNrForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{nrForm.id ? "Editar certificacao NR" : "Nova certificacao NR"}</h2><Button variant="outline" size="sm" onClick={() => setShowNrForm(false)}><X className="h-4 w-4" />Fechar</Button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Colaborador"><SelectField value={nrForm.employeeId} onChange={(event) => setNrForm((current) => ({ ...current, employeeId: event.target.value }))}><option value="">Selecione</option>{(employeesQuery.data?.data ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>)}</SelectField></Field>
            <Field label="NR"><SelectField value={nrForm.nrCode} onChange={(event) => setNrForm((current) => ({ ...current, nrCode: event.target.value }))}>{nrCodes.map((code) => <option key={code} value={code}>{code}</option>)}</SelectField></Field>
            <Field label="Treinamento"><Input value={nrForm.trainingName} onChange={(event) => setNrForm((current) => ({ ...current, trainingName: event.target.value }))} /></Field>
            <Field label="Emissao"><Input type="date" value={nrForm.issuedAt} onChange={(event) => setNrForm((current) => ({ ...current, issuedAt: event.target.value }))} /></Field>
            <Field label="Validade"><Input type="date" value={nrForm.expiresAt} onChange={(event) => setNrForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field>
            <Field label="Status"><SelectField value={nrForm.status} onChange={(event) => setNrForm((current) => ({ ...current, status: event.target.value }))}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-foreground">Certificado</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Nenhum arquivo anexado. O certificado deve ser vinculado pelo fluxo seguro de documentos.</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled>Vincular certificado</Button>
            </div>
          </div>
          {nrMutation.error ? <div className="mt-3"><ErrorMessage message={nrMutation.error instanceof Error ? nrMutation.error.message : "Nao foi possivel salvar a certificacao NR. Confira os campos obrigatorios."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => nrMutation.mutate(nrForm)} disabled={nrMutation.isPending}><Save className="h-4 w-4" />Salvar NR</Button>
        </Card>
      ) : null}

      {(recordsQuery.isLoading || nrQuery.isLoading) ? <LoadingTable label="Carregando Saude Ocupacional..." /> : null}
      {recordsQuery.error ? <ErrorMessage message={recordsQuery.error instanceof Error ? recordsQuery.error.message : "Nao foi possivel carregar os registros ocupacionais. Tente atualizar a pagina."} /> : null}
      {nrQuery.error ? <ErrorMessage message={nrQuery.error instanceof Error ? nrQuery.error.message : "Nao foi possivel carregar as certificacoes NR. Tente atualizar a pagina."} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <OccupationalRecordsTable records={filteredRecords} onEdit={editRecord} />
        <NrTable rows={filteredNrs} onEdit={editNr} />
      </div>
    </div>
  );
}

function OccupationalStat({ title, value, icon: Icon, tone }: { title: string; value: number; icon: typeof HeartPulse; tone: "visual" | "info" | "warning" | "success" | "danger" }) {
  return (
    <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><Icon className="h-5 w-5 text-primary" /></div>
      <div className="mt-2"><StatusBadge status={tone} label={value ? "Acompanhar" : "Ok"} /></div>
    </Card>
  );
}

function OccupationalRecordsTable({ records, onEdit }: { records: OccupationalRecord[]; onEdit: (record: OccupationalRecord) => void }) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">ASOs, exames e restricoes</h2></div>
      {!records.length ? <EmptyState title="Nenhum registro ocupacional" description="ASOs, exames e restricoes ocupacionais aparecerao aqui." /> : null}
      {records.length ? (
        <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Fornecedor</th><th className="px-4 py-3">Medico</th><th className="px-4 py-3">Restricoes</th><th className="px-4 py-3">Anexo</th><th className="px-4 py-3">Acao</th></tr></thead><tbody className="divide-y">{records.map((record) => { const expiration = recordExpiration(record); return <tr key={record.id} className="align-top"><td className="px-4 py-3">{record.employeeName || "-"}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><span>{record.recordTypeLabel}</span>{record.recordType === "occupational_restriction" && record.status !== "cancelled" ? <StatusBadge status="warning" label="Restricao ativa" /> : null}</div></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} />{expiration.isExpired ? <StatusBadge status="danger" label="Vencido" /> : null}{expiration.expiresSoon ? <StatusBadge status="warning" label="Vence em breve" /> : null}</div></td><td className="px-4 py-3">{formatDate(record.examDate)}</td><td className="px-4 py-3">{formatDate(record.expiresAt)}</td><td className="px-4 py-3">{record.redacted ? "Informacao restrita" : record.providerName || "-"}</td><td className="px-4 py-3">{record.redacted ? "Informacao restrita" : record.doctorName || "-"}</td><td className="px-4 py-3">{record.redacted ? "Informacao restrita" : record.restrictionNotes || "-"}</td><td className="px-4 py-3"><StatusBadge status={record.hasAttachment ? "success" : "visual"} label={record.hasAttachment ? "Anexado" : "Pendente"} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => onEdit(record)}>Editar</Button></td></tr>; })}</tbody></table></div>
      ) : null}
    </Card>
  );
}

function NrTable({ rows, onEdit }: { rows: NrCertification[]; onEdit: (row: NrCertification) => void }) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">Certificacoes NR</h2></div>
      {!rows.length ? <EmptyState title="Nenhuma NR registrada" description="Certificacoes obrigatorias e seus vencimentos aparecerao aqui." /> : null}
      {rows.length ? (
        <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">NR</th><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Emissao</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Certificado</th><th className="px-4 py-3">Acao</th></tr></thead><tbody className="divide-y">{rows.map((row) => { const expiration = nrExpiration(row); return <tr key={row.id} className="align-top"><td className="px-4 py-3">{row.employeeName || "-"}</td><td className="px-4 py-3">{row.nrCode}</td><td className="px-4 py-3">{row.trainingName}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status={statusTone(row.status)} label={row.statusLabel} />{expiration.isExpired ? <StatusBadge status="danger" label="NR vencida" /> : null}{expiration.expiresSoon ? <StatusBadge status="warning" label="NR a vencer" /> : null}</div></td><td className="px-4 py-3">{formatDate(row.issuedAt)}</td><td className="px-4 py-3">{formatDate(row.expiresAt)}</td><td className="px-4 py-3"><StatusBadge status={row.hasCertificate ? "success" : "visual"} label={row.hasCertificate ? "Anexado" : "Pendente"} /></td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => onEdit(row)}>Editar</Button></td></tr>; })}</tbody></table></div>
      ) : null}
    </Card>
  );
}
