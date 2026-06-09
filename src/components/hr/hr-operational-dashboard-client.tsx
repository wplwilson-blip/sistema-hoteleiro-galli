"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileWarning,
  Gauge,
  GraduationCap,
  HeartPulse,
  Inbox,
  LogOut,
  MessageSquareText,
  ShieldAlert,
  Shuffle,
  UserPlus,
  UserRound,
  type LucideIcon
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

type DocumentPendenciesSummaryResponse = {
  ok: true;
  data: {
    total: number;
    missingRequired: number;
    pending: number;
    awaitingReview: number;
    rejected: number;
    expired: number;
    expiringSoon: number;
  };
};

type OnboardingSummaryResponse = {
  ok: true;
  data: {
    totalInProgress: number;
    blocked: number;
    critical: number;
    overdue: number;
    waitingRh: number;
    waitingManager: number;
    waitingTi: number;
    almostDone: number;
  };
};

type EvaluationReportsSummaryResponse = {
  ok: true;
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

type DevelopmentPlanListItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  status: string;
  dueAt: string;
  reviewAt: string;
  redacted: boolean;
};

type DevelopmentPlansResponse = {
  ok: true;
  data: DevelopmentPlanListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

const emptyWorkflows: WorkflowListItem[] = [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const workflowTypeLabels: Record<string, string> = {
  admission: "Admissão",
  termination: "Desligamento",
  transfer: "Transferencia",
  promotion: "Promocao",
  job_position_change: "Mudanca de cargo",
  training: "Treinamento",
  vacation: "Ferias",
  absence: "Ausencia ou afastamento",
  warning: "Advertencia",
  equipment_delivery: "Entrega de equipamento",
  general_note: "Nota administrativa",
  job_opening: "Solicitacao de vaga"
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
    throw new Error(payload?.message ?? "Não foi possível carregar os dados de RH.");
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
  return slaStatusLabels[status] ?? sla?.label ?? "Prazo nao informado";
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

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isOpenDevelopmentPlan(status: string) {
  return status !== "completed" && status !== "cancelled";
}

function isDateBeforeToday(value: string | null | undefined) {
  if (!value) return false;
  return value.slice(0, 10) < dateOnly(new Date());
}

function isDateWithinNextDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const target = value.slice(0, 10);
  const today = new Date();
  return target >= dateOnly(today) && target <= dateOnly(addDays(today, days));
}

function MetricFallback({ label }: { label: string }) {
  return (
    <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">0</p>
          <p className="mt-1 text-xs text-muted-foreground">Não disponível</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Gauge className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function OperationalActionCard({
  title,
  value,
  description,
  href,
  icon: Icon,
  tone = "visual"
}: {
  title: string;
  value: number;
  description: string;
  href: string;
  icon: LucideIcon;
  tone?: StatusTone;
}) {
  const hasAction = value > 0;

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col justify-between rounded-md border bg-background p-3 transition-colors hover:bg-muted/40",
        hasAction && tone === "danger" && "border-red-200 bg-red-50/60",
        hasAction && tone === "warning" && "border-amber-200 bg-amber-50/60",
        hasAction && tone === "info" && "border-blue-200 bg-blue-50/60"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

function JourneyShortcutCard({
  group,
  title,
  description,
  href,
  icon: Icon
}: {
  group: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link href={href} className="group rounded-md border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
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
                    <span>Unidade: cadastrada no processo</span>
                    <span>Colaborador: {workflow.employee?.name ?? "Não vinculado"}</span>
                    {workflow.employee?.redacted ? <span>Dado redigido por permissao</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Etapa: {workflow.current_step?.name ?? "Sem etapa atual"}</span>
                    {workflow.current_step ? <span>Status da etapa: {stepStatusLabel(workflow.current_step.status)}</span> : null}
                    {workflow.escalation?.level ? <span>Atenção de prazo nível {workflow.escalation.level}</span> : null}
                  </div>
                </div>
                <div className="shrink-0 space-y-2 text-left text-xs text-muted-foreground lg:text-right">
                  <p>Atualizado em</p>
                  <p className="font-medium text-foreground">{formatDateTime(workflow.updated_at)}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/rh/workflows/${workflow.id}`}>
                      Ver detalhe
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
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
          <h2 className="text-sm font-semibold text-foreground">Indicadores do RH</h2>
          <p className="text-xs text-muted-foreground">Sinais seguros para acompanhamento da rotina.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Processos de RH</p>
          <p className="mt-1 text-xl font-semibold">{analytics?.volume?.total_workflows ?? totalFromStatus}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Backlog ativo</p>
          <p className="mt-1 text-xl font-semibold">{analytics?.volume?.backlog_current ?? analytics?.volume?.active_workflows ?? 0}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">Tempo médio de conclusão</p>
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
  const documentPendenciesUrl = buildUrl("/api/hr/document-pendencies/summary", { unitId: activeUnitId });
  const onboardingSummaryUrl = buildUrl("/api/hr/onboarding-dashboard/summary", { unitId: activeUnitId });
  const evaluationReportsUrl = buildUrl("/api/hr/employee-evaluations/reports", { unitId: activeUnitId });
  const developmentPlansUrl = buildUrl("/api/hr/development-plans", { page: 1, pageSize: 100, unitId: activeUnitId });
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

  const documentPendenciesQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "document-pendencies", activeUnitId],
    queryFn: async () => requestJson<DocumentPendenciesSummaryResponse>(documentPendenciesUrl)
  });

  const onboardingSummaryQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "onboarding-summary", activeUnitId],
    queryFn: async () => requestJson<OnboardingSummaryResponse>(onboardingSummaryUrl)
  });

  const evaluationReportsQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "evaluation-reports", activeUnitId],
    queryFn: async () => requestJson<EvaluationReportsSummaryResponse>(evaluationReportsUrl)
  });

  const developmentPlansQuery = useQuery({
    queryKey: ["hr", "operational-dashboard", "development-plans", activeUnitId],
    queryFn: async () => requestJson<DevelopmentPlansResponse>(developmentPlansUrl)
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
  const documentPendencies = documentPendenciesQuery.data?.data;
  const onboardingSummary = onboardingSummaryQuery.data?.data;
  const evaluationSummary = evaluationReportsQuery.data?.summary;
  const developmentPlans = developmentPlansQuery.data?.data ?? [];
  const openDevelopmentPlans = developmentPlans.filter((plan) => isOpenDevelopmentPlan(plan.status));
  const overdueDevelopmentPlans = openDevelopmentPlans.filter((plan) => isDateBeforeToday(plan.dueAt));
  const dueSoonDevelopmentPlans = openDevelopmentPlans.filter((plan) => isDateWithinNextDays(plan.dueAt, 7));
  const reviewDevelopmentPlans = openDevelopmentPlans.filter((plan) => plan.status === "under_review");
  const documentActionTotal =
    (documentPendencies?.awaitingReview ?? 0) + (documentPendencies?.rejected ?? 0) + (documentPendencies?.missingRequired ?? 0);
  const onboardingActionTotal = (onboardingSummary?.overdue ?? 0) + (onboardingSummary?.blocked ?? 0) + (onboardingSummary?.critical ?? 0);
  const evaluationActionTotal =
    (evaluationSummary?.waitingFeedback ?? 0) + (evaluationSummary?.waitingAcknowledgement ?? 0) + (evaluationSummary?.overdue ?? 0);
  const pdiActionTotal = overdueDevelopmentPlans.length + reviewDevelopmentPlans.length;
  const operationalSummaryLoading =
    documentPendenciesQuery.isLoading ||
    onboardingSummaryQuery.isLoading ||
    evaluationReportsQuery.isLoading ||
    developmentPlansQuery.isLoading;

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
              Visão rápida da rotina do RH: filas, documentos, onboarding e processos que pedem atenção.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/vagas/nova">
                <BriefcaseBusiness className="h-4 w-4" />
                Nova Vaga
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/admissoes/nova">
                <UserPlus className="h-4 w-4" />
                Nova Admissão
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/rh/inbox">
                <Inbox className="h-4 w-4" />
                Abrir fila
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/pendencias-documentais">
                <FileWarning className="h-4 w-4" />
                Documentos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/onboarding">
                <ClipboardCheck className="h-4 w-4" />
                Onboarding
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/employees">
                <UserRound className="h-4 w-4" />
                Colaboradores
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Jornada do colaborador</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Atalhos organizados na ordem em que o RH normalmente acompanha uma pessoa no hotel.</p>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <JourneyShortcutCard group="Admissão" title="Vagas e documentos" description="Abrir vaga, revisar documentos e acompanhar onboarding." href="/rh/vagas" icon={BriefcaseBusiness} />
          <JourneyShortcutCard group="Desenvolvimento" title="Avaliações, PDI e treinamentos" description="Acompanhar desempenho, ações de desenvolvimento e capacitação." href="/rh/gestao/avaliacoes" icon={GraduationCap} />
          <JourneyShortcutCard group="Vida Funcional" title="Movimentações e saúde ocupacional" description="Ver mudanças de carreira, ASOs, NRs e vencimentos ocupacionais." href="/rh/gestao/movimentacoes" icon={Shuffle} />
          <JourneyShortcutCard group="Conduta" title="Conduta" description="Registrar e revisar ocorrências formais do colaborador." href="/rh/gestao/conduta" icon={MessageSquareText} />
          <JourneyShortcutCard group="Desligamento" title="Desligamentos" description="Acompanhar solicitação, checklist, aprovação e efetivação." href="/rh/gestao/desligamentos" icon={LogOut} />
          <JourneyShortcutCard group="Gestão RH" title="Painel, fila e relatórios" description="Acessar fila RH, dashboard executivo e exportações consolidadas." href="/rh/gestao" icon={BarChart3} />
        </div>
      </Card>

      {isInitialLoading ? <LoadingTable label="Carregando dashboard operacional de RH..." /> : null}

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Pendencias de hoje</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Atalhos para o que normalmente pede acao do RH: documentos, onboarding, avaliacoes e PDI.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/gestao">
              Abrir gestao do RH
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {operationalSummaryLoading ? <LoadingTable label="Carregando pendencias operacionais..." /> : null}
        {!operationalSummaryLoading ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OperationalActionCard
              title="Documentos para agir"
              value={documentActionTotal}
              description="Conferir anexos, rejeitados e obrigatorios sem arquivo."
              href="/rh/pendencias-documentais"
              icon={FileWarning}
              tone={documentActionTotal ? "warning" : "visual"}
            />
            <OperationalActionCard
              title="Onboarding em atencao"
              value={onboardingActionTotal}
              description="Ver bloqueios, itens criticos e etapas atrasadas."
              href="/rh/onboarding"
              icon={ClipboardCheck}
              tone={onboardingActionTotal ? "danger" : "visual"}
            />
            <OperationalActionCard
              title="Avaliacoes pendentes"
              value={evaluationActionTotal}
              description="Resolver devolutiva, ciencia ou avaliacao atrasada."
              href="/rh/gestao/avaliacoes/relatorios"
              icon={CheckCircle2}
              tone={evaluationActionTotal ? "warning" : "visual"}
            />
            <OperationalActionCard
              title="PDI para acompanhar"
              value={pdiActionTotal}
              description="Acompanhar acoes atrasadas ou planos em revisao."
              href="/rh/employees"
              icon={ClipboardList}
              tone={pdiActionTotal ? "danger" : "visual"}
            />
          </div>
        ) : null}
      </Card>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {dashboardQuery.error ? (
          <>
            <MetricFallback label="Minhas pendências" />
            <MetricFallback label="Aprovações pendentes" />
            <MetricFallback label="Processos em atenção" />
            <MetricFallback label="Prazos vencendo" />
            <MetricFallback label="Prazos vencidos" />
            <MetricFallback label="Avisos pendentes" />
          </>
        ) : (
          <>
            <StatCard title="Minhas pendências" value={String(myTasksTotal)} icon={ClipboardList} tone={myTasksTotal ? "warning" : "neutral"} />
            <StatCard title="Aprovações pendentes" value={String(metrics?.steps.waiting_approval ?? 0)} icon={CheckCircle2} tone={(metrics?.steps.waiting_approval ?? 0) ? "warning" : "neutral"} />
            <StatCard title="Processos em atenção" value={String(criticalCount)} icon={ShieldAlert} tone={criticalCount ? "danger" : "neutral"} />
            <StatCard title="Prazos vencendo" value={String(metrics?.sla.warning ?? 0)} icon={CalendarClock} tone={(metrics?.sla.warning ?? 0) ? "warning" : "neutral"} />
            <StatCard title="Prazos vencidos" value={String(metrics?.sla.overdue ?? 0)} icon={AlertTriangle} tone={(metrics?.sla.overdue ?? 0) ? "danger" : "neutral"} />
            <StatCard title="Avisos pendentes" value={String(metrics?.notifications.pending ?? 0)} icon={Bell} tone={(metrics?.notifications.pending ?? 0) ? "info" : "neutral"} />
          </>
        )}
      </div>

      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar metricas do dashboard."} /> : null}
      {!userId ? <ErrorMessage message="Não foi possível calcular minhas pendências com os dados da sessão atual." /> : null}

      {documentPendenciesQuery.error ? (
        <ErrorMessage message={documentPendenciesQuery.error instanceof Error ? documentPendenciesQuery.error.message : "Erro ao carregar pendências documentais."} />
      ) : null}

      {onboardingSummaryQuery.error ? (
        <ErrorMessage message={onboardingSummaryQuery.error instanceof Error ? onboardingSummaryQuery.error.message : "Erro ao carregar onboarding operacional."} />
      ) : null}

      {evaluationReportsQuery.error ? (
        <ErrorMessage message={evaluationReportsQuery.error instanceof Error ? evaluationReportsQuery.error.message : "Erro ao carregar avaliacoes operacionais."} />
      ) : null}

      {developmentPlansQuery.error ? (
        <ErrorMessage message={developmentPlansQuery.error instanceof Error ? developmentPlansQuery.error.message : "Erro ao carregar PDI operacional."} />
      ) : null}

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Documentos</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pendências e vencimentos do dossiê documental dos colaboradores.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/pendencias-documentais">
              Abrir fila documental
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {documentPendenciesQuery.isLoading ? <LoadingTable label="Carregando pendências documentais..." /> : null}
        {!documentPendenciesQuery.isLoading && !documentPendenciesQuery.error ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={cn("rounded-md border bg-background p-3", (documentPendencies?.total ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
              <p className="text-xs text-muted-foreground">Documentos pendentes</p>
              <p className="mt-1 text-xl font-semibold">{documentPendencies?.total ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (documentPendencies?.expired ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
              <p className="text-xs text-muted-foreground">Vencidos</p>
              <p className="mt-1 text-xl font-semibold">{documentPendencies?.expired ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (documentPendencies?.expiringSoon ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
              <p className="text-xs text-muted-foreground">Vencendo em breve</p>
              <p className="mt-1 text-xl font-semibold">{documentPendencies?.expiringSoon ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (documentPendencies?.awaitingReview ?? 0) > 0 && "border-blue-200 bg-blue-50/60")}>
              <p className="text-xs text-muted-foreground">Aguardando conferência</p>
              <p className="mt-1 text-xl font-semibold">{documentPendencies?.awaitingReview ?? 0}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Onboarding</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Liberações, bloqueios e pendências críticas de integração.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/onboarding">
              Abrir fila de onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        {onboardingSummaryQuery.isLoading ? <LoadingTable label="Carregando onboarding operacional..." /> : null}
        {!onboardingSummaryQuery.isLoading && !onboardingSummaryQuery.error ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={cn("rounded-md border bg-background p-3", (onboardingSummary?.totalInProgress ?? 0) > 0 && "border-blue-200 bg-blue-50/60")}>
              <p className="text-xs text-muted-foreground">Em andamento</p>
              <p className="mt-1 text-xl font-semibold">{onboardingSummary?.totalInProgress ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (onboardingSummary?.blocked ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
              <p className="text-xs text-muted-foreground">Bloqueados</p>
              <p className="mt-1 text-xl font-semibold">{onboardingSummary?.blocked ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (onboardingSummary?.critical ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
              <p className="text-xs text-muted-foreground">Críticos</p>
              <p className="mt-1 text-xl font-semibold">{onboardingSummary?.critical ?? 0}</p>
            </div>
            <div className={cn("rounded-md border bg-background p-3", (onboardingSummary?.overdue ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
              <p className="text-xs text-muted-foreground">Atrasados</p>
              <p className="mt-1 text-xl font-semibold">{onboardingSummary?.overdue ?? 0}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Avaliacoes</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Devolutiva, ciencia e pontos de atencao do ciclo de avaliacao.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/gestao/avaliacoes/relatorios">
                Abrir relatorio
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {evaluationReportsQuery.isLoading ? <LoadingTable label="Carregando avaliacoes operacionais..." /> : null}
          {!evaluationReportsQuery.isLoading && !evaluationReportsQuery.error ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <div className={cn("rounded-md border bg-background p-3", (evaluationSummary?.waitingFeedback ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
                <p className="text-xs text-muted-foreground">Aguardando devolutiva</p>
                <p className="mt-1 text-xl font-semibold">{evaluationSummary?.waitingFeedback ?? 0}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", (evaluationSummary?.waitingAcknowledgement ?? 0) > 0 && "border-blue-200 bg-blue-50/60")}>
                <p className="text-xs text-muted-foreground">Aguardando ciencia</p>
                <p className="mt-1 text-xl font-semibold">{evaluationSummary?.waitingAcknowledgement ?? 0}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", (evaluationSummary?.overdue ?? 0) > 0 && "border-red-200 bg-red-50/60")}>
                <p className="text-xs text-muted-foreground">Avaliacoes atrasadas</p>
                <p className="mt-1 text-xl font-semibold">{evaluationSummary?.overdue ?? 0}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", ((evaluationSummary?.lowScore ?? 0) + (evaluationSummary?.withCritical ?? 0)) > 0 && "border-amber-200 bg-amber-50/60")}>
                <p className="text-xs text-muted-foreground">Nota ou criterio de atencao</p>
                <p className="mt-1 text-xl font-semibold">{(evaluationSummary?.lowScore ?? 0) + (evaluationSummary?.withCritical ?? 0)}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">PDI</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Planos abertos, revisoes e prazos de desenvolvimento dos colaboradores.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/employees">
                Abrir colaboradores
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {developmentPlansQuery.isLoading ? <LoadingTable label="Carregando PDI operacional..." /> : null}
          {!developmentPlansQuery.isLoading && !developmentPlansQuery.error ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <div className={cn("rounded-md border bg-background p-3", openDevelopmentPlans.length > 0 && "border-blue-200 bg-blue-50/60")}>
                <p className="text-xs text-muted-foreground">Planos abertos</p>
                <p className="mt-1 text-xl font-semibold">{openDevelopmentPlans.length}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", overdueDevelopmentPlans.length > 0 && "border-red-200 bg-red-50/60")}>
                <p className="text-xs text-muted-foreground">PDIs atrasados</p>
                <p className="mt-1 text-xl font-semibold">{overdueDevelopmentPlans.length}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", dueSoonDevelopmentPlans.length > 0 && "border-amber-200 bg-amber-50/60")}>
                <p className="text-xs text-muted-foreground">Vencem em 7 dias</p>
                <p className="mt-1 text-xl font-semibold">{dueSoonDevelopmentPlans.length}</p>
              </div>
              <div className={cn("rounded-md border bg-background p-3", reviewDevelopmentPlans.length > 0 && "border-blue-200 bg-blue-50/60")}>
                <p className="text-xs text-muted-foreground">Em revisao</p>
                <p className="mt-1 text-xl font-semibold">{reviewDevelopmentPlans.length}</p>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {myTasksQuery.isLoading ? <LoadingTable label="Carregando minhas pendencias..." /> : null}
          {myTasksQuery.error ? <ErrorMessage message={myTasksQuery.error instanceof Error ? myTasksQuery.error.message : "Erro ao carregar minhas pendencias."} /> : null}
          {!myTasksQuery.isLoading && !myTasksQuery.error ? (
            <WorkflowList
              title="Minhas tarefas e pendencias"
              description="Processos com etapas atribuidas ao usuario atual."
              workflows={myTasks}
              emptyTitle="Nenhuma pendencia atribuida"
              emptyDescription="Quando houver etapas atribuidas ao seu usuario, elas aparecerao aqui para acompanhamento."
            />
          ) : null}
        </div>

        <div className="space-y-3">
          {criticalQuery.isLoading ? <LoadingTable label="Carregando processos em atencao..." /> : null}
          {criticalQuery.error ? <ErrorMessage message={criticalQuery.error instanceof Error ? criticalQuery.error.message : "Erro ao carregar processos em atencao."} /> : null}
          {!criticalQuery.isLoading && !criticalQuery.error ? (
            <WorkflowList
              title="Processos em atencao"
              description="Priorizacao por prazo vencido, prazo vencendo, alertas e situacoes que pedem decisao."
              workflows={criticalWorkflows}
              emptyTitle="Nenhum processo em atencao"
              emptyDescription="Não há processos recentes com sinais críticos nos filtros atuais."
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
            <p className="text-xs text-muted-foreground">Alertas vencidos</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.escalation.overdue ?? 0}</p>
          </div>
          <div className={cn("rounded-md border bg-background p-3", (metrics?.notifications.failed ?? 0) > 0 && "border-amber-200 bg-amber-50/60")}>
            <p className="text-xs text-muted-foreground">Avisos com falha</p>
            <p className="mt-1 text-xl font-semibold">{metrics?.notifications.failed ?? 0}</p>
          </div>
        </div>
      </Card>

      {analyticsQuery.isLoading ? <LoadingTable label="Carregando indicadores de RH..." /> : null}
      {analyticsQuery.error ? <ErrorMessage message={analyticsQuery.error instanceof Error ? analyticsQuery.error.message : "Erro ao carregar analytics de RH."} /> : null}
      {!analyticsQuery.isLoading && !analyticsQuery.error ? <AnalyticsQuickPanel analytics={analyticsQuery.data?.data} /> : null}

      {recentQuery.isLoading ? <LoadingTable label="Carregando processos recentes..." /> : null}
      {recentQuery.error ? <ErrorMessage message={recentQuery.error instanceof Error ? recentQuery.error.message : "Erro ao carregar processos recentes."} /> : null}
      {!recentQuery.isLoading && !recentQuery.error ? (
        <WorkflowList
          title="Processos recentes"
          description="Ultimos processos acessiveis na unidade atual."
          workflows={recentWorkflows}
          emptyTitle="Nenhum processo encontrado"
          emptyDescription="Ainda nao ha processos de RH nas unidades acessiveis para este usuario."
        />
      ) : null}
    </div>
  );
}
