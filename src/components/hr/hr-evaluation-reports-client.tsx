"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ClipboardList, Filter, ListChecks, MessageSquare, Search, ShieldAlert, Target, UserCheck } from "lucide-react";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

type ReportRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  unitName: string;
  departmentId: string;
  departmentName: string;
  templateId: string;
  templateName: string;
  status: string;
  statusLabel: string;
  weightedScore: number | null;
  totalScore: number | null;
  evaluationDate: string;
  periodStart: string;
  periodEnd: string;
  feedbackDate: string;
  acknowledgedAt: string;
  closedAt: string;
  isOverdue: boolean;
  hasLowScore: boolean;
  lowScoreCount: number;
  criticalCount: number;
  criticalLowScoreCount: number;
  hasCritical: boolean;
  hasPdi: boolean;
  pdiCount: number;
  openPdiCount: number;
  firstPdiId: string;
  redacted: boolean;
};

type ReportResponse = {
  ok: true;
  data: ReportRow[];
  summary: {
    total: number;
    inProgress: number;
    waitingFeedback: number;
    waitingAcknowledgement: number;
    closedThisMonth: number;
    lowScore: number;
    withCritical: number;
    withPdi: number;
    overdue: number;
  };
};

type Template = { id: string; name: string; status: string };
type TemplateResponse = { ok: true; data: Template[] };
type UnitResponse = { ok: true; units: Array<{ id: string; name: string; code: string }> };
type DepartmentResponse = { ok: true; departments: Array<{ id: string; name: string; code: string; unitId: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível carregar relatório de avaliações.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function formatScore(value: number | null | undefined) {
  return value == null ? "-" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function statusTone(status: string) {
  if (status === "closed" || status === "acknowledged") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  if (status === "submitted" || status === "reviewed" || status === "feedback_given") return "info" as const;
  return "warning" as const;
}

function scoreTone(row: ReportRow) {
  const score = row.weightedScore ?? row.totalScore;
  if (row.criticalLowScoreCount || row.hasLowScore) return "danger" as const;
  if (score == null) return "visual" as const;
  return score >= 3.5 ? "success" as const : "warning" as const;
}

function buildReportUrl(filters: Record<string, string | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value == null || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return `/api/hr/employee-evaluations/reports${query ? `?${query}` : ""}`;
}

function employeeEvaluationHref(row: Pick<ReportRow, "employeeId" | "id">) {
  return `/rh/employees/${row.employeeId}?tab=evaluations&evaluationId=${row.id}`;
}

export function HrEvaluationReportsClient() {
  const activeUnit = useAppStore((state) => state.activeUnit);
  const activeUnitId = uuidPattern.test(activeUnit?.id ?? "") ? activeUnit.id : "";
  const [filters, setFilters] = useState({
    unitId: activeUnitId,
    departmentId: "",
    status: "",
    templateId: "",
    periodFrom: "",
    periodTo: "",
    search: "",
    lowScoreOnly: false,
    pdiOnly: false
  });

  const reportQuery = useQuery({
    queryKey: ["hr", "evaluation-reports", filters],
    queryFn: async () => requestJson<ReportResponse>(buildReportUrl(filters))
  });
  const templatesQuery = useQuery({
    queryKey: ["hr", "evaluation-report-templates"],
    queryFn: async () => requestJson<TemplateResponse>("/api/hr/evaluation-templates")
  });
  const unitsQuery = useQuery({
    queryKey: ["base", "units", "evaluation-report"],
    queryFn: async () => requestJson<UnitResponse>("/api/base/units")
  });
  const departmentsQuery = useQuery({
    queryKey: ["base", "departments", "evaluation-report"],
    queryFn: async () => requestJson<DepartmentResponse>("/api/base/departments")
  });

  const rows = reportQuery.data?.data ?? [];
  const summary = reportQuery.data?.summary;
  const departments = useMemo(
    () => (departmentsQuery.data?.departments ?? []).filter((department) => !filters.unitId || department.unitId === filters.unitId),
    [departmentsQuery.data?.departments, filters.unitId]
  );

  function updateFilter(key: keyof typeof filters, value: string | boolean) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === "unitId" ? { departmentId: "" } : {}) }));
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Relatório operacional</h2>
              <StatusBadge status="visual" label="Sem ranking" />
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Acompanhe pendências, devolutivas, ciência, notas de atenção e PDIs vinculados. Média é apoio de acompanhamento, não competição.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/gestao/avaliacoes">
              Modelos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Card>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Em andamento" value={String(summary?.inProgress ?? 0)} icon={ClipboardList} tone={(summary?.inProgress ?? 0) ? "info" : "neutral"} />
        <StatCard title="Aguardando devolutiva" value={String(summary?.waitingFeedback ?? 0)} icon={MessageSquare} tone={(summary?.waitingFeedback ?? 0) ? "warning" : "neutral"} />
        <StatCard title="Aguardando ciência" value={String(summary?.waitingAcknowledgement ?? 0)} icon={UserCheck} tone={(summary?.waitingAcknowledgement ?? 0) ? "warning" : "neutral"} />
        <StatCard title="Concluídas no mês" value={String(summary?.closedThisMonth ?? 0)} icon={Target} tone="neutral" />
        <StatCard title="Nota de atenção" value={String(summary?.lowScore ?? 0)} icon={AlertTriangle} tone={(summary?.lowScore ?? 0) ? "danger" : "neutral"} />
        <StatCard title="Com critério crítico" value={String(summary?.withCritical ?? 0)} icon={ShieldAlert} tone={(summary?.withCritical ?? 0) ? "warning" : "neutral"} />
        <StatCard title="Com PDI" value={String(summary?.withPdi ?? 0)} icon={ListChecks} tone={(summary?.withPdi ?? 0) ? "info" : "neutral"} />
        <StatCard title="Atrasadas" value={String(summary?.overdue ?? 0)} icon={AlertTriangle} tone={(summary?.overdue ?? 0) ? "danger" : "neutral"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Filtros</h2>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SelectField value={filters.unitId} onChange={(event) => updateFilter("unitId", event.target.value)}>
            <option value="">Todas as unidades</option>
            {(unitsQuery.data?.units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {[unit.code, unit.name].filter(Boolean).join(" - ")}
              </option>
            ))}
          </SelectField>
          <SelectField value={filters.departmentId} onChange={(event) => updateFilter("departmentId", event.target.value)}>
            <option value="">Todos os departamentos</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {[department.code, department.name].filter(Boolean).join(" - ")}
              </option>
            ))}
          </SelectField>
          <SelectField value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="in_progress">Em andamento</option>
            <option value="submitted">Aguardando devolutiva</option>
            <option value="feedback_given">Aguardando ciência</option>
            <option value="acknowledged">Ciência registrada</option>
            <option value="closed">Concluída</option>
          </SelectField>
          <SelectField value={filters.templateId} onChange={(event) => updateFilter("templateId", event.target.value)}>
            <option value="">Todos os modelos</option>
            {(templatesQuery.data?.data ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </SelectField>
          <Input type="date" value={filters.periodFrom} onChange={(event) => updateFilter("periodFrom", event.target.value)} />
          <Input type="date" value={filters.periodTo} onChange={(event) => updateFilter("periodTo", event.target.value)} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar colaborador, unidade ou modelo" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={filters.lowScoreOnly} onChange={(event) => updateFilter("lowScoreOnly", event.target.checked)} />
              Nota de atenção
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={filters.pdiOnly} onChange={(event) => updateFilter("pdiOnly", event.target.checked)} />
              Com PDI
            </label>
          </div>
        </div>
      </Card>

      {reportQuery.isLoading ? <LoadingTable label="Carregando avaliações..." /> : null}
      {reportQuery.error ? <ErrorMessage message={reportQuery.error instanceof Error ? reportQuery.error.message : "Não foi possível carregar avaliações."} /> : null}

      <Card className="border-border/80 p-0 shadow-sm shadow-primary/5">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Avaliações encontradas</h2>
          <p className="mt-1 text-xs text-muted-foreground">{summary?.total ?? 0} registro(s) conforme filtros atuais.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Colaborador</th>
                <th className="px-3 py-2 font-medium">Unidade / setor</th>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Média</th>
                <th className="px-3 py-2 font-medium">Datas</th>
                <th className="px-3 py-2 font-medium">Atenção</th>
                <th className="px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.employeeName || "Colaborador protegido"}</p>
                    {row.redacted ? <p className="text-xs text-muted-foreground">Conteúdo sensível restrito</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <p>{row.unitName || "-"}</p>
                    <p className="text-xs text-muted-foreground">{row.departmentName || "Departamento não informado"}</p>
                  </td>
                  <td className="px-3 py-3">{row.templateName || "-"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={statusTone(row.status)} label={row.statusLabel} />
                    {row.isOverdue ? <div className="mt-1"><StatusBadge status="danger" label="Atrasada" /></div> : null}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={scoreTone(row)} label={formatScore(row.weightedScore ?? row.totalScore)} />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    <p>Avaliação: {formatDate(row.evaluationDate || row.periodEnd)}</p>
                    <p>Devolutiva: {formatDate(row.feedbackDate)}</p>
                    <p>Ciência: {formatDate(row.acknowledgedAt)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.criticalLowScoreCount ? <StatusBadge status="danger" label={`${row.criticalLowScoreCount} crítico(s) baixo`} /> : null}
                      {row.lowScoreCount ? <StatusBadge status="warning" label={`${row.lowScoreCount} nota(s) baixa(s)`} /> : null}
                      {row.hasPdi ? <StatusBadge status="info" label={`${row.openPdiCount || row.pdiCount} PDI`} /> : null}
                      {!row.criticalLowScoreCount && !row.lowScoreCount && !row.hasPdi ? <StatusBadge status="success" label="Sem alerta" /> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/rh/employees/${row.employeeId}`}>Abrir colaborador</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link href={employeeEvaluationHref(row)}>Abrir avaliação</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && !reportQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma avaliação encontrada para os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
