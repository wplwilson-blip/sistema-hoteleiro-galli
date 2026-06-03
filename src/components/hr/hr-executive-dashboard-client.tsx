"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Building2, Download, FileText, Filter, ShieldAlert, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type IndicatorData = {
  headcountTotal: number;
  activeEmployees: number;
  inactiveEmployees: number;
  admissions: number;
  terminations: number;
  turnoverSimple: number;
  evaluationsPending: number;
  developmentPlansPending: number;
  trainingsExpired: number;
  trainingsExpiring: number;
  asoExpired: number;
  asoExpiring: number;
  nrExpired: number;
  nrExpiring: number;
  movementsInProgress: number;
  conductOpen: number;
  terminationsInProgress: number;
};

type UnitRow = {
  unitId: string;
  unitLabel: string;
  employees: number;
  trainingsExpired: number;
  asoExpired: number;
  nrExpired: number;
  evaluationsPending: number;
  terminations: number;
  warnings: number;
  movements: number;
};

type DashboardResponse = {
  ok: true;
  data: {
    generatedAt: string;
    indicators: IndicatorData;
    byUnit: UnitRow[];
  };
};

type Pendency = {
  id: string;
  type: string;
  typeLabel: string;
  employeeName: string;
  unitLabel: string;
  priority: "critical" | "high" | "medium" | "low";
  date: string;
  origin: string;
  href: string;
};

type PendingResponse = {
  ok: true;
  data: Pendency[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
};

type UnitOption = { id: string; code: string; name: string };
type UnitsResponse = { ok: true; units: UnitOption[] };

const reportTypes = [
  ["colaboradores", "Colaboradores"],
  ["treinamentos", "Treinamentos"],
  ["saude_ocupacional", "Saude Ocupacional"],
  ["movimentacoes", "Movimentacoes"],
  ["conduta", "Conduta"],
  ["desligamentos", "Desligamentos"]
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel carregar consolidado do RH.");
  return payload as T;
}

function buildUrl(path: string, params: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function priorityTone(priority: string) {
  if (priority === "critical") return "danger" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "medium") return "info" as const;
  return "visual" as const;
}

function priorityLabel(priority: string) {
  if (priority === "critical") return "Critica";
  if (priority === "high") return "Alta";
  if (priority === "medium") return "Media";
  return "Baixa";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function HrExecutiveDashboardClient() {
  const [unitId, setUnitId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const params = { unitId };
  const dashboardQuery = useQuery({ queryKey: ["hr", "executive-dashboard", params], queryFn: async () => requestJson<DashboardResponse>(buildUrl("/api/hr/executive-dashboard", params)) });
  const pendingQuery = useQuery({ queryKey: ["hr", "pending-center", params], queryFn: async () => requestJson<PendingResponse>(buildUrl("/api/hr/pending-center", params)) });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "executive-dashboard"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const indicators = dashboardQuery.data?.data.indicators;
  const pendencies = useMemo(() => (pendingQuery.data?.data ?? []).filter((item) => !typeFilter || item.type === typeFilter), [pendingQuery.data?.data, typeFilter]);
  const byUnit = dashboardQuery.data?.data.byUnit ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Dashboard Executivo RH</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Visao consolidada de pessoas, pendencias, riscos e unidades sem criar novos modulos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectField value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Todas as unidades</option>
              {(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      {dashboardQuery.isLoading ? <LoadingTable label="Carregando dashboard executivo..." /> : null}
      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar dashboard executivo."} /> : null}

      {indicators ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Headcount total" value={String(indicators.headcountTotal)} icon={UsersRound} tone="info" />
          <StatCard title="Ativos" value={String(indicators.activeEmployees)} icon={UsersRound} tone="info" />
          <StatCard title="Inativos" value={String(indicators.inactiveEmployees)} icon={UsersRound} tone={indicators.inactiveEmployees ? "neutral" : "neutral"} />
          <StatCard title="Admissoes 30d" value={String(indicators.admissions)} icon={UsersRound} tone={indicators.admissions ? "info" : "neutral"} />
          <StatCard title="Desligamentos" value={String(indicators.terminations)} icon={ShieldAlert} tone={indicators.terminations ? "warning" : "neutral"} />
          <StatCard title="Turnover simples" value={`${indicators.turnoverSimple}%`} icon={BarChart3} tone={indicators.turnoverSimple ? "warning" : "neutral"} />
          <StatCard title="Avaliacoes pendentes" value={String(indicators.evaluationsPending)} icon={FileText} tone={indicators.evaluationsPending ? "warning" : "neutral"} />
          <StatCard title="PDIs pendentes" value={String(indicators.developmentPlansPending)} icon={FileText} tone={indicators.developmentPlansPending ? "warning" : "neutral"} />
          <StatCard title="Treinamentos vencidos" value={String(indicators.trainingsExpired)} icon={AlertTriangle} tone={indicators.trainingsExpired ? "danger" : "neutral"} />
          <StatCard title="Treinamentos a vencer" value={String(indicators.trainingsExpiring)} icon={AlertTriangle} tone={indicators.trainingsExpiring ? "warning" : "neutral"} />
          <StatCard title="ASOs vencidos" value={String(indicators.asoExpired)} icon={ShieldAlert} tone={indicators.asoExpired ? "danger" : "neutral"} />
          <StatCard title="ASOs a vencer" value={String(indicators.asoExpiring)} icon={ShieldAlert} tone={indicators.asoExpiring ? "warning" : "neutral"} />
          <StatCard title="NRs vencidas" value={String(indicators.nrExpired)} icon={ShieldAlert} tone={indicators.nrExpired ? "danger" : "neutral"} />
          <StatCard title="NRs a vencer" value={String(indicators.nrExpiring)} icon={ShieldAlert} tone={indicators.nrExpiring ? "warning" : "neutral"} />
          <StatCard title="Movimentacoes" value={String(indicators.movementsInProgress)} icon={BarChart3} tone={indicators.movementsInProgress ? "info" : "neutral"} />
          <StatCard title="Conduta aberta" value={String(indicators.conductOpen)} icon={ShieldAlert} tone={indicators.conductOpen ? "warning" : "neutral"} />
          <StatCard title="Desligamentos em andamento" value={String(indicators.terminationsInProgress)} icon={ShieldAlert} tone={indicators.terminationsInProgress ? "warning" : "neutral"} />
        </div>
      ) : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Central de Pendencias RH</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Fila unica com documentos, onboarding, avaliacoes, PDI, treinamentos, saude, movimentacoes, conduta e desligamentos.</p>
          </div>
          <SelectField value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Todas as origens</option>
            <option value="documents">Documentos</option>
            <option value="onboarding">Onboarding</option>
            <option value="evaluations">Avaliacoes</option>
            <option value="development">PDI</option>
            <option value="trainings">Treinamentos</option>
            <option value="occupational">Saude Ocupacional</option>
            <option value="movements">Movimentacoes</option>
            <option value="conduct">Conduta</option>
            <option value="terminations">Desligamentos</option>
          </SelectField>
        </div>
        {pendingQuery.isLoading ? <LoadingTable label="Carregando central de pendencias..." /> : null}
        {pendingQuery.error ? <ErrorMessage message={pendingQuery.error instanceof Error ? pendingQuery.error.message : "Erro ao carregar pendencias."} /> : null}
        {!pendingQuery.isLoading && !pendencies.length ? <EmptyState title="Nenhuma pendencia consolidada" description="Quando algum modulo gerar pendencia operacional, ela aparecera aqui." /> : null}
        {pendencies.length ? (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Acao</th></tr></thead>
              <tbody className="divide-y">{pendencies.slice(0, 50).map((item) => <tr key={`${item.type}:${item.id}`}><td className="px-4 py-3">{item.typeLabel}</td><td className="px-4 py-3">{item.employeeName}</td><td className="px-4 py-3">{item.unitLabel}</td><td className="px-4 py-3"><StatusBadge status={priorityTone(item.priority)} label={priorityLabel(item.priority)} /></td><td className="px-4 py-3">{formatDate(item.date)}</td><td className="px-4 py-3">{item.origin}</td><td className="px-4 py-3"><Button asChild variant="outline" size="sm"><Link href={item.href}>Abrir</Link></Button></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Indicadores por Unidade</h2></div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Colaboradores</th><th className="px-4 py-3">Trein. vencidos</th><th className="px-4 py-3">ASOs vencidos</th><th className="px-4 py-3">NRs vencidas</th><th className="px-4 py-3">Avaliacoes</th><th className="px-4 py-3">Deslig.</th><th className="px-4 py-3">Advert.</th><th className="px-4 py-3">Mov.</th></tr></thead>
              <tbody className="divide-y">{byUnit.map((unit) => <tr key={unit.unitId}><td className="px-4 py-3 font-medium">{unit.unitLabel}</td><td className="px-4 py-3">{unit.employees}</td><td className="px-4 py-3">{unit.trainingsExpired}</td><td className="px-4 py-3">{unit.asoExpired}</td><td className="px-4 py-3">{unit.nrExpired}</td><td className="px-4 py-3">{unit.evaluationsPending}</td><td className="px-4 py-3">{unit.terminations}</td><td className="px-4 py-3">{unit.warnings}</td><td className="px-4 py-3">{unit.movements}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>

        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2"><Download className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Relatorios CSV</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Exportacao simples dos dados consolidados da visao atual.</p>
          <div className="mt-3 grid gap-2">
            {reportTypes.map(([type, label]) => (
              <Button key={type} asChild variant="outline" size="sm">
                <a href={buildUrl("/api/hr/consolidated-reports", { type, unitId })}>
                  <Download className="h-4 w-4" />
                  Exportar {label}
                </a>
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
