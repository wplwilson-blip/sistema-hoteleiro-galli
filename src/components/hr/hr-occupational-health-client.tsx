"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, FileCheck2, Filter, HeartPulse, Plus, RefreshCw, Save, ShieldAlert, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type OccupationalRecord = {
  id: string;
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
  attachmentId: string;
};

type NrForm = {
  id: string;
  employeeId: string;
  nrCode: string;
  trainingName: string;
  issuedAt: string;
  expiresAt: string;
  certificateAttachmentId: string;
  status: string;
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
const emptyRecordForm: RecordForm = { id: "", employeeId: "", recordType: "aso_periodic", status: "valid", examDate: "", expiresAt: "", providerName: "", doctorName: "", certificateNumber: "", restrictionNotes: "", attachmentId: "" };
const emptyNrForm: NrForm = { id: "", employeeId: "", nrCode: "NR-06", trainingName: "", issuedAt: "", expiresAt: "", certificateAttachmentId: "", status: "valid" };

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
    restrictionNotes: form.restrictionNotes,
    attachmentId: form.attachmentId
  };
}

function nrPayload(form: NrForm) {
  return {
    employeeId: form.employeeId,
    nrCode: form.nrCode,
    trainingName: form.trainingName,
    issuedAt: form.issuedAt,
    expiresAt: form.expiresAt,
    certificateAttachmentId: form.certificateAttachmentId,
    status: form.status
  };
}

export function HrOccupationalHealthClient() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ unitId: "", employeeId: "", recordType: "", status: "", search: "", quick: "" });
  const [recordForm, setRecordForm] = useState<RecordForm>(emptyRecordForm);
  const [nrForm, setNrForm] = useState<NrForm>(emptyNrForm);
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
    setRecordForm({ id: record.id, employeeId: record.employeeId, recordType: record.recordType, status: record.status, examDate: record.examDate, expiresAt: record.expiresAt, providerName: record.providerName, doctorName: record.doctorName, certificateNumber: "", restrictionNotes: record.restrictionNotes, attachmentId: "" });
    setShowRecordForm(true);
  }

  function editNr(row: NrCertification) {
    setNrForm({ id: row.id, employeeId: row.employeeId, nrCode: row.nrCode, trainingName: row.trainingName, issuedAt: row.issuedAt, expiresAt: row.expiresAt, certificateAttachmentId: "", status: row.status });
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
            <Field label="Anexo"><Input value={recordForm.attachmentId} onChange={(event) => setRecordForm((current) => ({ ...current, attachmentId: event.target.value }))} placeholder="ID do anexo" /></Field>
            <Field label="Restricoes"><TextArea value={recordForm.restrictionNotes} onChange={(event) => setRecordForm((current) => ({ ...current, restrictionNotes: event.target.value }))} /></Field>
          </div>
          {recordMutation.error ? <div className="mt-3"><ErrorMessage message={recordMutation.error instanceof Error ? recordMutation.error.message : "Erro ao salvar."} /></div> : null}
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
            <Field label="Certificado"><Input value={nrForm.certificateAttachmentId} onChange={(event) => setNrForm((current) => ({ ...current, certificateAttachmentId: event.target.value }))} placeholder="ID do anexo" /></Field>
          </div>
          {nrMutation.error ? <div className="mt-3"><ErrorMessage message={nrMutation.error instanceof Error ? nrMutation.error.message : "Erro ao salvar NR."} /></div> : null}
          <Button className="mt-4" size="sm" onClick={() => nrMutation.mutate(nrForm)} disabled={nrMutation.isPending}><Save className="h-4 w-4" />Salvar NR</Button>
        </Card>
      ) : null}

      {(recordsQuery.isLoading || nrQuery.isLoading) ? <LoadingTable label="Carregando Saude Ocupacional..." /> : null}
      {recordsQuery.error ? <ErrorMessage message={recordsQuery.error instanceof Error ? recordsQuery.error.message : "Erro ao carregar registros."} /> : null}
      {nrQuery.error ? <ErrorMessage message={nrQuery.error instanceof Error ? nrQuery.error.message : "Erro ao carregar NRs."} /> : null}

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
