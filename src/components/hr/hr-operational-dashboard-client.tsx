"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  Gauge,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type StatusTone = "visual" | "warning" | "danger" | "success" | "info";

type DashboardMetrics = {
  workflows: {
    total: number;
    active: number;
    overdue: number;
    waiting_approval: number;
    completed: number;
    rejected: number;
    cancelled: number;
    returned: number;
  };
  sla: {
    overdue: number;
    warning: number;
    on_time: number;
    completed_on_time: number;
    completed_late: number;
  };
  escalation: {
    eligible: number;
    overdue: number;
    level_counts: Record<string, number>;
  };
  notifications: {
    pending: number;
    failed: number;
    unread: number;
  };
  steps: {
    waiting_approval: number;
    in_progress: number;
    returned: number;
    overdue: number;
  };
  scope: {
    unit_count: number;
    unit_ids: string[];
  };
  generated_at: string;
};

type DashboardResponse = {
  data: DashboardMetrics;
};

type WorkflowEmployee = {
  id: string;
  name: string;
  unit_id: string | null;
  redacted: boolean;
} | null;

type WorkflowSla = {
  status?: string | null;
  due_at?: string | null;
  breached_at?: string | null;
  minutes?: number | null;
  label?: string | null;
};

type WorkflowEscalation = {
  enabled?: boolean;
  level?: number;
  count?: number;
  overdue?: boolean;
  eligible?: boolean;
  label?: string | null;
};

type WorkflowStep = {
  id: string;
  name: string;
  status: string;
  sequence: number;
  assigned_to: string | null;
  completed_at: string | null;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  redacted: boolean;
} | null;

type WorkflowListItem = {
  id: string;
  unit_id: string;
  workflow_type: string;
  status: string;
  employee: WorkflowEmployee;
  current_step: WorkflowStep;
  is_sensitive: boolean;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  created_at: string;
  updated_at: string;
};

type WorkflowListResponse = {
  data: WorkflowListItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

type AnalyticsResponse = {
  data: {
    volume?: {
      total_workflows?: number;
      active_workflows?: number;
      backlog_current?: number;
    };
    efficiency?: {
      completion_rate?: number;
      return_rate?: number;
    };
    sla?: {
      sla_compliance_rate?: number;
      overdue_active?: number;
      average_delay_minutes?: number;
    };
    time?: {
      average_completion_minutes?: number;
      average_step_completion_minutes?: number;
    };
    status?: {
      count_by_status?: Record<string, number>;
      count_by_workflow_type?: Record<string, number>;
      count_by_sla_status?: Record<string, number>;
    };
    steps?: {
      steps_waiting_approval?: number;
      steps_in_progress?: number;
      steps_returned?: number;
      steps_overdue?: number;
    };
  };
};

const emptyWorkflows: WorkflowListItem[] = [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const workflowTypeLabels: Record<string, string> = {
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

const workflowStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting_approval: "Aguardando aprovacao",
  returned: "Devolvido",
  completed: "Concluido",
  cancelled: "Cancelado",
  rejected: "Rejeitado"
};

const stepStatusLabels: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  waiting_approval: "Aguardando aprovacao",
  returned: "Devolvida",
  completed: "Concluida",
  skipped: "Ignorada",
  cancelled: "Cancelada"
};

const slaStatusLabels: Record<string, string> = {
  on_time: "No prazo",
  warning: "Vencendo",
  overdue: "Vencido",
  completed_on_time: "Concluido no prazo",
  completed_late: "Concluido com atraso",
  cancelled: "Cancelado"
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel carregar os dados de RH.");
  }

  return payload as T;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(value));
}

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMinutes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value < 60) return `${Math.round(value)} min`;

  const hours = value / 60;
  if (hours < 24) return `${hours.toFixed(1).replace(".", ",")} h`;

  return `${(hours / 24).toFixed(1).replace(".", ",")} dias`;
}

function workflowTypeLabel(type: string) {
  return workflowTypeLabels[type] ?? type;
}

function workflowStatusLabel(status: string) {
  return workflowStatusLabels[status] ?? status;
}

function stepStatusLabel(status: string) {
  return stepStatusLabels[status] ?? status;
}

function statusTone(status: string): StatusTone {
  if (status === "completed") return "success";
  if (status === "cancelled") return "visual";
  if (status === "rejected") return "danger";
  if (status === "returned") return "warning";
  if (status === "waiting_approval") return "info";
  return "visual";
}

function slaTone(status: string | null | undefined): StatusTone {
  if (status === "overdue" || status === "completed_late") return "danger";
  if (status === "warning") return "warning";
  if (status === "on_time" || status === "completed_on_time") return "success";
  return "visual";
}

function slaLabel(sla: WorkflowSla | null | undefined) {
  const status = sla?.status ?? "";
  return slaStatusLabels[status] ?? sla?.label ?? "SLA nao informado";
}

function getWorkflowPriorityScore(workflow: WorkflowListItem) {
  const slaStatus = workflow.sla?.status;
  const stepSlaStatus = workflow.current_step?.sla?.status;
  const escalation = workflow.escalation;

  let score = 0;
  if (slaStatus === "overdue" || stepSlaStatus === "overdue") score += 100;
  if (slaStatus === "warning" || stepSlaStatus === "warning") score += 50;
  if (workflow.status === "waiting_approval") score += 35;
  if (workflow.status === "returned") score += 25;
  if (escalation?.overdue) score += 40;
  if (escalation?.eligible) score += 20;
  score += escalation?.level ? escalation.level * 5 : 0;

  return score;
}

function isWorkflowCritical(workflow: WorkflowListItem) {
  return getWorkflowPriorityScore(workflow) >= 50;
}

function countTotal(values: Record<string, number> | undefined) {
  return Object.values(values ?? {}).reduce((total, value) => total + Number(value ?? 0), 0);
}

function topEntries(values: Record<string, number> | undefined, limit = 4) {
  return Object.entries(values ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function MetricFallback({ label }: { label: string }) {
  return (
    <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">0</p>
          <p className="mt-1 text-xs text-muted-foreground">Nao disponivel</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Gauge className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function WorkflowList({
  title,
  description,
  workflows,
  emptyTitle,
  emptyDescription
}: {
  title: string;
  description: string;
  workflows: WorkflowListItem[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {workflows.length ? (
        <div className="divide-y">
          {workflows.map((workflow) => (
            <article key={workflow.id} className="p-4 transition-colors hover:bg-muted/30">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-semibold text-foreground">{workflowTypeLabel(workflow.workflow_type)}</p>
                    <StatusBadge status={statusTone(workflow.status)} label={workflowStatusLabel(workflow.status)} />
                    <StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} />
                    {workflow.is_sensitive ? <StatusBadge status="warning" label="Restrito" /> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Unidade: {workflow.unit_id}</span>
                    <span>Colaborador: {workflow.employee?.name ?? "Nao vinculado"}</span>
                    {workflow.employee?.redacted ? <span>Dado redigido por permissao</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Etapa: {workflow.current_step?.name ?? "Sem etapa atual"}</span>
                    {workflow.current_step ? <span>Status da etapa: {stepStatusLabel(workflow.current_step.status)}</span> : null}
                    {workflow.escalation?.level ? <span>Escalonamento nivel {workflow.escalation.level}</span> : null}
                  </div>
                </div>
                <div className="shrink-0 text-left text-xs text-muted-foreground lg:text-right">
                  <p>Atualizado em</p>
                  <p className="font-medium text-foreground">{formatDateTime(workflow.updated_at)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}
    </Card>
  );
}

function AnalyticsQuickPanel({ analytics }: { analytics: AnalyticsResponse["data"] | undefined }) {
  const statusEntries = topEntries(analytics?.status?.count_by_status);
  const typeEntries = topEntries(analytics?.status?.count_by_workflow_type);
  const totalFromStatus = countTotal(analytics?.status?.count_by_status);

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Analytics rapidos</h2>
          <p className="text-xs text-muted-foreground">Indicadores seguros para acompanhamento operacional.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Total de workflows</p>
          <p className="mt-1 text-xl font-semibold">{analytics?.volume?.total_workflows ?? totalFromStatus}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Backlog ativo</p>
          <p className="mt-1 text-xl font-semibold">{analytics?.volume?.backlog_current ?? analytics?.volume?.active_workflows ?? 0}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Tempo medio de conclusao</p>
          <p className="mt-1 text-xl font-semibold">{formatMinutes(analytics?.time?.average_completion_minutes)}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Atraso medio</p>
          <p className="mt-1 text-xl font-semibold">{formatMinutes(analytics?.sla?.average_delay_minutes)}</p>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Por status</h3>
          {statusEntries.length ? (
            statusEntries.map(([status, total]) => (
              <div key={status} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                <StatusBadge status={statusTone(status)} label={workflowStatusLabel(status)} />
                <span className="font-semibold">{total}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sem distribuicao de status disponivel.</p>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Por tipo</h3>
          {typeEntries.length ? (
            typeEntries.map(([type, total]) => (
              <div key={type} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                <span className="break-words font-medium">{workflowTypeLabel(type)}</span>
                <span className="font-semibold">{total}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sem distribuicao por tipo disponivel.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function HrOperationalDashboardClient() {
  const { user, activeUnit } = useAppStore();
  const activeUnitId = isUuid(activeUnit?.id) ? activeUnit.id : undefined;
  const userId = isUuid(user?.id) ? user.id : undefined;

  const dashboardUrl = buildUrl("/api/hr/dashboard", { unit_id: activeUnitId });
  const analyticsUrl = buildUrl("/api/hr/analytics", { unit_id: activeUnitId });
  const recentUrl = buildUrl("/api/hr/workflows", { page: 1, page_size: 8, unit_id: activeUnitId });
  const criticalUrl = buildUrl("/api/hr/workflows", { page: 1, page_size: 30, unit_id: activeUnitId });
  const myTasksUrl = buildUrl("/api/hr/workflows", {
    page: 1,
    page_size: 6,
    unit_id: activeUnitId,
    assigned_to: userId
  });

  const dashboardQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "metrics", activeUnitId],
    queryFn: async () => requestJson<DashboardResponse>(dashboardUrl)
  });

  const analyticsQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "analytics", activeUnitId],
    queryFn: async () => requestJson<AnalyticsResponse>(analyticsUrl)
  });

  const recentQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "recent", activeUnitId],
    queryFn: async () => requestJson<WorkflowListResponse>(recentUrl)
  });

  const criticalQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "critical", activeUnitId],
    queryFn: async () => requestJson<WorkflowListResponse>(criticalUrl)
  });

  const myTasksQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "my-tasks", activeUnitId, userId],
    queryFn: async () => requestJson<WorkflowListResponse>(myTasksUrl),
    enabled: Boolean(userId)
  });

  const metrics = dashboardQuery.data?.data;
  const recentWorkflows = recentQuery.data?.data ?? emptyWorkflows;
  const myTasks = myTasksQuery.data?.data ?? emptyWorkflows;
  const criticalWorkflows = useMemo(
    () =>
      [...(criticalQuery.data?.data ?? emptyWorkflows)]
        .filter(isWorkflowCritical)
        .sort((left, right) => getWorkflowPriorityScore(right) - getWorkflowPriorityScore(left))
        .slice(0, 6),
    [criticalQuery.data?.data]
  );

  const isInitialLoading = dashboardQuery.isLoading && recentQuery.isLoading && analyticsQuery.isLoading;
  const criticalCount = metrics ? metrics.sla.overdue + metrics.sla.warning + metrics.escalation.overdue : criticalWorkflows.length;
  const myTasksTotal = userId ? myTasksQuery.data?.pagination.total ?? myTasks.length : 0;

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessiveis"} />
              {metrics?.generated_at ? <StatusBadge status="visual" label={`Atualizado em ${formatDateTime(metrics.generated_at)}`} /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Painel somente leitura. Acoes operacionais serao tratadas nas proximas etapas da fase 8A.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/employees">
              <UserRound className="h-4 w-4" />
              Colaboradores
            </Link>
          </Button>
        </div>
      </Card>

      {isInitialLoading ? <LoadingTable label="Carregando dashboard operacional de RH..." /> : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {dashboardQuery.error ? (
          <>
            <MetricFallback label="Minhas pendencias" />
            <MetricFallback label="Aprovacoes pendentes" />
            <MetricFallback label="Workflows criticos" />
            <MetricFallback label="SLA vencendo" />
            <MetricFallback label="SLA vencido" />
            <MetricFallback label="Notificacoes pendentes" />
          </>
        ) : (
          <>
            <StatCard title="Minhas pendencias" value={String(myTasksTotal)} icon={ClipboardList} tone={myTasksTotal ? "warning" : "neutral"} />
            <StatCard title="Aprovacoes pendentes" value={String(metrics?.steps.waiting_approval ?? 0)} icon={CheckCircle2} tone={(metrics?.steps.waiting_approval ?? 0) ? "warning" : "neutral"} />
            <StatCard title="Workflows criticos" value={String(criticalCount)} icon={ShieldAlert} tone={criticalCount ? "danger" : "neutral"} />
            <StatCard title="SLA vencendo" value={String(metrics?.sla.warning ?? 0)} icon={CalendarClock} tone={(metrics?.sla.warning ?? 0) ? "warning" : "neutral"} />
            <StatCard title="SLA vencido" value={String(metrics?.sla.overdue ?? 0)} icon={AlertTriangle} tone={(metrics?.sla.overdue ?? 0) ? "danger" : "neutral"} />
            <StatCard title="Notificacoes pendentes" value={String(metrics?.notifications.pending ?? 0)} icon={Bell} tone={(metrics?.notifications.pending ?? 0) ? "info" : "neutral"} />
          </>
        )}
      </div>

      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar metricas do dashboard."} /> : null}
      {!userId ? <ErrorMessage message="Nao foi possivel calcular minhas pendencias: usuario da sessao sem identificador UUID valido para o filtro do endpoint." /> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {myTasksQuery.isLoading ? <LoadingTable label="Carregando minhas pendencias..." /> : null}
          {myTasksQuery.error ? <ErrorMessage message={myTasksQuery.error instanceof Error ? myTasksQuery.error.message : "Erro ao carregar minhas pendencias."} /> : null}
          {!myTasksQuery.isLoading && !myTasksQuery.error ? (
            <WorkflowList
              title="Minhas tarefas e pendencias"
              description="Workflows com etapas atribuidas ao usuario atual, sem acoes mutativas nesta sprint."
              workflows={myTasks}
              emptyTitle="Nenhuma pendencia atribuida"
              emptyDescription="Quando houver etapas atribuidas ao seu usuario, elas aparecerao aqui para acompanhamento."
            />
          ) : null}
        </div>

        <div className="space-y-3">
          {criticalQuery.isLoading ? <LoadingTable label="Carregando workflows criticos..." /> : null}
          {criticalQuery.error ? <ErrorMessage message={criticalQuery.error instanceof Error ? criticalQuery.error.message : "Erro ao carregar workflows criticos."} /> : null}
          {!criticalQuery.isLoading && !criticalQuery.error ? (
            <WorkflowList
              title="Workflows criticos"
              description="Priorizacao por SLA vencido, SLA vencendo, escalonamento e status de atencao."
              workflows={criticalWorkflows}
              emptyTitle="Nenhum workflow critico"
              emptyDescription="Nao ha workflows recentes com sinais criticos nos filtros atuais."
            />
          ) : null}
        </div>
      </div>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Sinais operacionais</h2>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={cn("rounded-md border bg-background p-3", (metrics?.steps.overdue ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
            <p className="text-xs text-muted-foreground">Etapas vencidas</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.steps.overdue ?? 0}</p>
          </div>
          <div className={cn("rounded-md border bg-background p-3", (metrics?.steps.returned ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
            <p className="text-xs text-muted-foreground">Etapas devolvidas</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.steps.returned ?? 0}</p>
          </div>
          <div className={cn("rounded-md border bg-background p-3", (metrics?.escalation.overdue ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
            <p className="text-xs text-muted-foreground">Escalonamentos vencidos</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.escalation.overdue ?? 0}</p>
          </div>
          <div className={cn("rounded-md border bg-background p-3", (metrics?.notifications.failed ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
            <p className="text-xs text-muted-foreground">Notificacoes com falha</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.notifications.failed ?? 0}</p>
          </div>
        </div>
      </Card>

      {analyticsQuery.isLoading ? <LoadingTable label="Carregando analytics de RH..." /> : null}
      {analyticsQuery.error ? <ErrorMessage message={analyticsQuery.error instanceof Error ? analyticsQuery.error.message : "Erro ao carregar analytics de RH."} /> : null}
      {!analyticsQuery.isLoading && !analyticsQuery.error ? <AnalyticsQuickPanel analytics={analyticsQuery.data?.data} /> : null}

      {recentQuery.isLoading ? <LoadingTable label="Carregando workflows recentes..." /> : null}
      {recentQuery.error ? <ErrorMessage message={recentQuery.error instanceof Error ? recentQuery.error.message : "Erro ao carregar workflows recentes."} /> : null}
      {!recentQuery.isLoading && !recentQuery.error ? (
        <WorkflowList
          title="Workflows recentes"
          description="Ultimos workflows acessiveis no escopo de unidade atual."
          workflows={recentWorkflows}
          emptyTitle="Nenhum workflow encontrado"
          emptyDescription="Ainda nao ha workflows de RH nas unidades acessiveis para este usuario."
        />
      ) : null}
    </div>
  );
}
