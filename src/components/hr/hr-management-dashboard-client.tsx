"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, BriefcaseBusiness, CalendarClock, ClipboardList, Inbox, ShieldAlert, TimerReset } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";

type AnalyticsResponse = {
  data: {
    volume?: { total_workflows?: number; active_workflows?: number; backlog_current?: number };
    efficiency?: { completion_rate?: number; rejection_rate?: number; cancellation_rate?: number; return_rate?: number };
    sla?: { sla_compliance_rate?: number; completed_on_time?: number; completed_late?: number; overdue_active?: number; average_delay_minutes?: number };
    time?: { average_completion_minutes?: number; median_completion_minutes?: number; average_step_completion_minutes?: number };
    status?: { count_by_status?: Record<string, number>; count_by_workflow_type?: Record<string, number>; count_by_sla_status?: Record<string, number> };
    steps?: { steps_waiting_approval?: number; steps_in_progress?: number; steps_returned?: number; steps_overdue?: number; average_step_time_by_status?: Record<string, number> };
    productivity?: { completed_workflows?: number; completed_steps?: number; active_backlog?: number };
    generated_at?: string;
  };
};

type DashboardResponse = {
  data: {
    workflows?: { active?: number; overdue?: number; waiting_approval?: number };
    sla?: { overdue?: number; warning?: number; on_time?: number };
    escalation?: { eligible?: number; overdue?: number };
    notifications?: { failed?: number; pending?: number };
    steps?: { overdue?: number; returned?: number; waiting_approval?: number };
  };
};

type JobsResponse = {
  data: Array<{ id: string; status: string; priority: string; job_type: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel carregar os dados de RH.");
  return payload as T;
}

function buildUrl(path: string, unitId?: string) {
  return unitId ? `${path}?unit_id=${unitId}` : path;
}

function formatMinutes(value: number | undefined) {
  if (!value) return "-";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = value / 60;
  return hours < 24 ? `${hours.toFixed(1).replace(".", ",")} h` : `${(hours / 24).toFixed(1).replace(".", ",")} dias`;
}

function topEntries(values: Record<string, number> | undefined, limit = 6) {
  return Object.entries(values ?? {}).sort((left, right) => right[1] - left[1]).slice(0, limit);
}

function workflowTypeLabel(type: string) {
  const labels: Record<string, string> = {
    admission: "Admissao",
    termination: "Desligamento",
    transfer: "Transferencia",
    promotion: "Promocao",
    job_position_change: "Mudanca de cargo",
    training: "Treinamento",
    vacation: "Ferias",
    absence: "Ausencia ou afastamento",
    warning: "Advertencia",
    equipment_delivery: "Entrega de equipamento",
    general_note: "Nota administrativa"
  };
  return labels[type] ?? type;
}

function RankingPanel({ title, description, entries, labelFn = (value: string) => value }: { title: string; description: string; entries: Array<[string, number]>; labelFn?: (value: string) => string }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
              <span className="break-words font-medium">{labelFn(key)}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sem dados no periodo" description="O endpoint nao retornou distribuicao suficiente para este bloco." />
      )}
    </Card>
  );
}

export function HrManagementDashboardClient() {
  const activeUnit = useAppStore((state) => state.activeUnit);
  const activeUnitId = uuidPattern.test(activeUnit?.id ?? "") ? activeUnit.id : undefined;
  const analyticsQuery = useQuery({ queryKey: ["hr", "management", "analytics", activeUnitId], queryFn: async () => requestJson<AnalyticsResponse>(buildUrl("/api/hr/analytics", activeUnitId)) });
  const dashboardQuery = useQuery({ queryKey: ["hr", "management", "dashboard", activeUnitId], queryFn: async () => requestJson<DashboardResponse>(buildUrl("/api/hr/dashboard", activeUnitId)) });
  const jobsQuery = useQuery({ queryKey: ["hr", "management", "jobs", activeUnitId], queryFn: async () => requestJson<JobsResponse>(buildUrl("/api/hr/background-jobs", activeUnitId)) });

  const analytics = analyticsQuery.data?.data;
  const dashboard = dashboardQuery.data?.data;
  const jobs = jobsQuery.data?.data ?? [];
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const pendingJobs = jobs.filter((job) => job.status === "pending" || job.status === "scheduled" || job.status === "retrying").length;
  const statusEntries = useMemo(() => topEntries(analytics?.status?.count_by_status), [analytics]);
  const typeEntries = useMemo(() => topEntries(analytics?.status?.count_by_workflow_type), [analytics]);
  const stepDelayEntries = useMemo(() => topEntries(analytics?.steps?.average_step_time_by_status), [analytics]);

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessiveis"} />
            {analytics?.generated_at ? <StatusBadge status="visual" label="Analytics atualizado" /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href="/rh/inbox"><Inbox className="h-4 w-4" />Inbox</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/auditoria">Auditoria</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/jobs">Processamentos</Link></Button>
          </div>
        </div>
      </Card>

      {(analyticsQuery.isLoading || dashboardQuery.isLoading) ? <LoadingTable label="Carregando gestao RH..." /> : null}
      {analyticsQuery.error ? <ErrorMessage message={analyticsQuery.error instanceof Error ? analyticsQuery.error.message : "Erro ao carregar analytics."} /> : null}
      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar dashboard."} /> : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total de workflows" value={String(analytics?.volume?.total_workflows ?? 0)} icon={ClipboardList} tone="info" />
        <StatCard title="Em andamento" value={String(analytics?.volume?.active_workflows ?? dashboard?.workflows?.active ?? 0)} icon={TimerReset} tone="info" />
        <StatCard title="SLA vencido" value={String(dashboard?.sla?.overdue ?? analytics?.sla?.overdue_active ?? 0)} icon={AlertTriangle} tone={(dashboard?.sla?.overdue ?? 0) ? "danger" : "neutral"} />
        <StatCard title="SLA vencendo" value={String(dashboard?.sla?.warning ?? 0)} icon={CalendarClock} tone={(dashboard?.sla?.warning ?? 0) ? "warning" : "neutral"} />
        <StatCard title="Tempo medio" value={formatMinutes(analytics?.time?.average_completion_minutes)} icon={BriefcaseBusiness} />
        <StatCard title="Escalations" value={String((dashboard?.escalation?.eligible ?? 0) + (dashboard?.escalation?.overdue ?? 0))} icon={ShieldAlert} tone={(dashboard?.escalation?.overdue ?? 0) ? "danger" : "warning"} />
        <StatCard title="Processamentos pendentes" value={String(pendingJobs)} icon={CalendarClock} tone={pendingJobs ? "warning" : "neutral"} />
        <StatCard title="Processamentos falhos" value={String(failedJobs + (dashboard?.notifications?.failed ?? 0))} icon={AlertTriangle} tone={failedJobs ? "danger" : "neutral"} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <RankingPanel title="Gargalos por status" description="Status mais recorrentes nos workflows." entries={statusEntries} />
        <RankingPanel title="Volume por tipo" description="Tipos de workflow com maior volume." entries={typeEntries} labelFn={workflowTypeLabel} />
        <RankingPanel title="Tempo medio por etapa" description="Tempo medio por status de etapa." entries={stepDelayEntries} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <h2 className="text-sm font-semibold">SLA</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {topEntries(analytics?.status?.count_by_sla_status).map(([status, value]) => <StatusBadge key={status} status={status === "overdue" ? "danger" : status === "warning" ? "warning" : "visual"} label={`${status}: ${value}`} />)}
            {!topEntries(analytics?.status?.count_by_sla_status).length ? <StatusBadge status="visual" label="Sem distribuicao de SLA" /> : null}
          </div>
        </Card>
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <h2 className="text-sm font-semibold">Saude operacional</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <StatusBadge status={(dashboard?.steps?.overdue ?? 0) ? "danger" : "success"} label={`Etapas vencidas: ${dashboard?.steps?.overdue ?? 0}`} />
            <StatusBadge status={(dashboard?.steps?.returned ?? 0) ? "warning" : "success"} label={`Etapas devolvidas: ${dashboard?.steps?.returned ?? 0}`} />
            <StatusBadge status={failedJobs ? "danger" : "success"} label={`Processamentos falhos: ${failedJobs}`} />
            <StatusBadge status={(dashboard?.notifications?.failed ?? 0) ? "warning" : "success"} label={`Notificacoes falhas: ${dashboard?.notifications?.failed ?? 0}`} />
          </div>
        </Card>
      </div>
    </div>
  );
}
