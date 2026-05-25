"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileCog,
  FileText,
  Inbox,
  Settings2,
  ShieldAlert,
  TimerReset
} from "lucide-react";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";

type AnalyticsResponse = {
  data: {
    volume?: { total_workflows?: number; active_workflows?: number; backlog_current?: number };
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

type SignalTone = "visual" | "warning" | "danger" | "success" | "info";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível carregar os dados de RH.");
  return payload as T;
}

function buildUrl(path: string, unitId?: string) {
  return unitId ? `${path}?unit_id=${unitId}` : path;
}

const managementLinks = [
  {
    title: "Indicadores do RH",
    description: "Resumo executivo da operação, prazos e pontos que pedem atenção.",
    href: "/rh/gestao",
    icon: BarChart3,
    badge: "Gestão"
  },
  {
    title: "Histórico e auditoria",
    description: "Registros e rastreabilidade das rotinas administrativas do RH.",
    href: "/rh/gestao/auditoria",
    icon: FileText,
    badge: "Rastreabilidade"
  },
  {
    title: "Rotinas automáticas",
    description: "Acompanhe rotinas internas e falhas que precisam de verificação.",
    href: "/rh/gestao/jobs",
    icon: TimerReset,
    badge: "Monitoramento"
  },
  {
    title: "Regras de documentos",
    description: "Obrigatoriedades documentais por unidade, departamento, cargo ou admissão.",
    href: "/rh/gestao/documentos",
    icon: FileCog,
    badge: "Configuração"
  },
  {
    title: "Planos de onboarding",
    description: "Checklists padrão para integração e liberação operacional.",
    href: "/rh/gestao/onboarding",
    icon: ClipboardCheck,
    badge: "Configuração"
  }
];

function ManagementHubCard({
  title,
  description,
  href,
  icon: Icon,
  badge
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof BarChart3;
  badge: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col justify-between rounded-md border bg-background p-3 shadow-sm shadow-primary/5 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <StatusBadge status="visual" label={badge} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-medium text-primary">
        Abrir
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function CompactSignal({
  title,
  value,
  description,
  tone = "visual"
}: {
  title: string;
  value: number;
  description: string;
  tone?: SignalTone;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
        </div>
        <StatusBadge status={tone} label={value ? "Acompanhar" : "Ok"} />
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export function HrManagementDashboardClient() {
  const activeUnit = useAppStore((state) => state.activeUnit);
  const activeUnitId = uuidPattern.test(activeUnit?.id ?? "") ? activeUnit.id : undefined;
  const analyticsQuery = useQuery({
    queryKey: ["hr", "management", "analytics", activeUnitId],
    queryFn: async () => requestJson<AnalyticsResponse>(buildUrl("/api/hr/analytics", activeUnitId))
  });
  const dashboardQuery = useQuery({
    queryKey: ["hr", "management", "dashboard", activeUnitId],
    queryFn: async () => requestJson<DashboardResponse>(buildUrl("/api/hr/dashboard", activeUnitId))
  });
  const jobsQuery = useQuery({
    queryKey: ["hr", "management", "jobs", activeUnitId],
    queryFn: async () => requestJson<JobsResponse>(buildUrl("/api/hr/background-jobs", activeUnitId))
  });

  const analytics = analyticsQuery.data?.data;
  const dashboard = dashboardQuery.data?.data;
  const jobs = jobsQuery.data?.data ?? [];
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const pendingJobs = jobs.filter((job) => job.status === "pending" || job.status === "scheduled" || job.status === "retrying").length;
  const activeWorkflows = analytics?.volume?.active_workflows ?? dashboard?.workflows?.active ?? 0;
  const overdueDeadlines = dashboard?.sla?.overdue ?? dashboard?.workflows?.overdue ?? 0;
  const deadlineAlerts = (dashboard?.escalation?.eligible ?? 0) + (dashboard?.escalation?.overdue ?? 0);
  const failedRoutines = failedJobs + (dashboard?.notifications?.failed ?? 0);
  const priorityItems: Array<{ label: string; value: number; tone: SignalTone; href: string }> = [
    {
      label: "Etapas atrasadas",
      value: dashboard?.steps?.overdue ?? 0,
      tone: (dashboard?.steps?.overdue ?? 0) ? "danger" : "success",
      href: "/rh/inbox"
    },
    {
      label: "Processos devolvidos",
      value: dashboard?.steps?.returned ?? 0,
      tone: (dashboard?.steps?.returned ?? 0) ? "warning" : "success",
      href: "/rh/inbox"
    },
    {
      label: "Aprovações aguardando decisão",
      value: dashboard?.steps?.waiting_approval ?? dashboard?.workflows?.waiting_approval ?? 0,
      tone: (dashboard?.steps?.waiting_approval ?? dashboard?.workflows?.waiting_approval ?? 0) ? "warning" : "success",
      href: "/rh/inbox"
    },
    {
      label: "Rotinas com falha",
      value: failedRoutines,
      tone: failedRoutines ? "danger" : "success",
      href: "/rh/gestao/jobs"
    }
  ];

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Gestão do RH</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Supervisão, auditoria e configurações do RH em uma visão compacta. A operação diária fica no menu principal.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh">
              Voltar ao painel
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {managementLinks.map((item) => (
            <ManagementHubCard key={item.href} {...item} />
          ))}
        </div>
      </Card>

      <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessíveis"} />
            {analytics?.generated_at ? <StatusBadge status="visual" label="Indicadores atualizados" /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href="/rh/inbox"><Inbox className="h-4 w-4" />Fila de RH</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/auditoria">Histórico e auditoria</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/jobs">Rotinas automáticas</Link></Button>
          </div>
        </div>
      </Card>

      {(analyticsQuery.isLoading || dashboardQuery.isLoading) ? <LoadingTable label="Carregando gestão do RH..." /> : null}
      {analyticsQuery.error ? <ErrorMessage message={analyticsQuery.error instanceof Error ? analyticsQuery.error.message : "Erro ao carregar indicadores."} /> : null}
      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar painel."} /> : null}

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Processos em andamento" value={String(activeWorkflows)} icon={TimerReset} tone={activeWorkflows ? "info" : "neutral"} />
        <StatCard title="Prazos vencidos" value={String(overdueDeadlines)} icon={AlertTriangle} tone={overdueDeadlines ? "danger" : "neutral"} />
        <StatCard title="Alertas de prazo" value={String(deadlineAlerts)} icon={ShieldAlert} tone={deadlineAlerts ? "warning" : "neutral"} />
        <StatCard title="Rotinas com falha" value={String(failedRoutines)} icon={AlertTriangle} tone={failedRoutines ? "danger" : "neutral"} />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Situação operacional</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Leitura rápida para supervisão do RH, sem detalhamento técnico.</p>
          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
            <CompactSignal title="Em andamento" value={activeWorkflows} description="Processos ativos na rotina do RH." tone={activeWorkflows ? "info" : "success"} />
            <CompactSignal title="Atrasados" value={overdueDeadlines} description="Prazos vencidos que pedem acompanhamento." tone={overdueDeadlines ? "danger" : "success"} />
            <CompactSignal title="Alertas" value={deadlineAlerts} description="Casos que podem exigir ação de gestão." tone={deadlineAlerts ? "warning" : "success"} />
            <CompactSignal title="Rotinas com falha" value={failedRoutines} description="Rotinas internas que precisam de verificação." tone={failedRoutines ? "danger" : "success"} />
          </div>
        </Card>

        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Pendências prioritárias</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Atalhos para pontos que normalmente exigem decisão ou correção.</p>
          <div className="mt-3 space-y-2">
            {priorityItems.map((item) => (
              <Link key={item.label} href={item.href} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted/30">
                <span className="min-w-0 truncate font-medium">{item.label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={item.tone} label={item.value ? String(item.value) : "Ok"} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <StatusBadge status={pendingJobs ? "warning" : "success"} label={`Rotinas pendentes: ${pendingJobs}`} />
            <StatusBadge status={(dashboard?.notifications?.pending ?? 0) ? "info" : "success"} label={`Avisos pendentes: ${dashboard?.notifications?.pending ?? 0}`} />
          </div>
        </Card>
      </div>
    </div>
  );
}
