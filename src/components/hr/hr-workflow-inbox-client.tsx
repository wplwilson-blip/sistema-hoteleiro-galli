"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarClock,
  ClipboardList,
  Filter,
  ListChecks,
  Search,
  ShieldAlert,
  TimerReset,
  UserPlus,
  UserRound,
  X
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type StatusTone = "visual" | "warning" | "danger" | "success" | "info";
type SlaFilter = "all" | "overdue" | "warning" | "on_time";

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

type DashboardResponse = {
  data: {
    workflows?: {
      active?: number;
      waiting_approval?: number;
    };
    sla?: {
      overdue?: number;
      warning?: number;
    };
    escalation?: {
      eligible?: number;
      overdue?: number;
    };
    steps?: {
      in_progress?: number;
      waiting_approval?: number;
      overdue?: number;
    };
    generated_at?: string;
  };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyWorkflows: WorkflowListItem[] = [];

const workflowTypeOptions = [
  { value: "admission", label: "Admissao" },
  { value: "termination", label: "Desligamento" },
  { value: "transfer", label: "Transferencia" },
  { value: "promotion", label: "Promocao" },
  { value: "job_position_change", label: "Mudanca de cargo" },
  { value: "training", label: "Treinamento" },
  { value: "vacation", label: "Ferias" },
  { value: "absence", label: "Ausencia ou afastamento" },
  { value: "warning", label: "Advertencia" },
  { value: "equipment_delivery", label: "Entrega de equipamento" },
  { value: "general_note", label: "Nota administrativa" }
];

const workflowStatusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "open", label: "Aberto" },
  { value: "in_progress", label: "Em andamento" },
  { value: "waiting_approval", label: "Aguardando aprovacao" },
  { value: "returned", label: "Devolvido" },
  { value: "completed", label: "Concluido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "rejected", label: "Rejeitado" }
];

const workflowTypeLabels = Object.fromEntries(workflowTypeOptions.map((option) => [option.value, option.label]));
const workflowStatusLabels = Object.fromEntries(workflowStatusOptions.map((option) => [option.value, option.label]));

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

function formatDueDate(value: string | null | undefined) {
  if (!value) return "Sem vencimento";
  return formatDateTime(value);
}

function formatDelay(sla: WorkflowSla | null | undefined) {
  if (sla?.status !== "overdue") return "-";
  if (!sla.due_at) return "Vencido";

  const dueAt = new Date(sla.due_at).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - dueAt) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const hours = diffMinutes / 60;
  if (hours < 24) return `${hours.toFixed(1).replace(".", ",")} h`;

  return `${(hours / 24).toFixed(1).replace(".", ",")} dias`;
}

function workflowTypeLabel(type: string) {
  return workflowTypeLabels[type] ?? type;
}

function workflowStatusLabel(status: string) {
  return workflowStatusLabels[status] ?? status;
}

function stepStatusLabel(status: string | undefined) {
  return status ? stepStatusLabels[status] ?? status : "-";
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

function getSlaStatus(workflow: WorkflowListItem) {
  return workflow.current_step?.sla?.status ?? workflow.sla?.status ?? null;
}

function isEscalated(workflow: WorkflowListItem) {
  return Boolean(
    workflow.escalation?.overdue ||
      workflow.escalation?.eligible ||
      workflow.escalation?.level ||
      workflow.current_step?.escalation?.overdue ||
      workflow.current_step?.escalation?.eligible ||
      workflow.current_step?.escalation?.level
  );
}

function isCritical(workflow: WorkflowListItem) {
  const slaStatus = getSlaStatus(workflow);
  return slaStatus === "overdue" || slaStatus === "warning" || isEscalated(workflow) || workflow.status === "returned" || workflow.status === "waiting_approval";
}

function priorityScore(workflow: WorkflowListItem) {
  const slaStatus = getSlaStatus(workflow);
  let score = 0;

  if (slaStatus === "overdue") score += 100;
  if (slaStatus === "warning") score += 70;
  if (isEscalated(workflow)) score += 45;
  if (workflow.status === "waiting_approval") score += 35;
  if (workflow.status === "returned") score += 30;
  if (workflow.status === "in_progress") score += 10;

  return score;
}

function includesText(workflow: WorkflowListItem, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;

  return [
    workflowTypeLabel(workflow.workflow_type),
    workflowStatusLabel(workflow.status),
    workflow.unit_id,
    workflow.employee?.name,
    workflow.current_step?.name,
    stepStatusLabel(workflow.current_step?.status),
    slaLabel(workflow.sla)
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function workflowMatchesSla(workflow: WorkflowListItem, slaFilter: SlaFilter) {
  if (slaFilter === "all") return true;
  const status = getSlaStatus(workflow);

  if (slaFilter === "on_time") {
    return status === "on_time" || status === "completed_on_time";
  }

  return status === slaFilter;
}

function UnitFilterOptions({ activeUnitId }: { activeUnitId?: string }) {
  const units = useAppStore((state) => state.units);
  const validUnits = units.filter((unit) => isUuid(unit.id));

  if (!validUnits.length) {
    return <option value="">Unidade ativa ou todas acessiveis</option>;
  }

  return (
    <>
      <option value="">Todas as unidades acessiveis</option>
      {validUnits.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {[unit.code, unit.name].filter(Boolean).join(" - ") || unit.name}
          {unit.id === activeUnitId ? " (ativa)" : ""}
        </option>
      ))}
    </>
  );
}

export function HrWorkflowInboxClient() {
  const { user, activeUnit } = useAppStore();
  const activeUnitId = isUuid(activeUnit?.id) ? activeUnit.id : undefined;
  const userId = isUuid(user?.id) ? user.id : undefined;

  const [search, setSearch] = useState("");
  const [unitId, setUnitId] = useState(activeUnitId ?? "");
  const [status, setStatus] = useState("");
  const [workflowType, setWorkflowType] = useState("");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [escalatedOnly, setEscalatedOnly] = useState(false);

  const effectiveUnitId = unitId || undefined;
  const workflowsUrl = buildUrl("/api/hr/workflows", {
    page: 1,
    page_size: 100,
    q: search.trim() || undefined,
    unit_id: effectiveUnitId,
    status,
    workflow_type: workflowType,
    assigned_to: myTasksOnly && userId ? userId : undefined
  });
  const myTasksUrl = buildUrl("/api/hr/workflows", {
    page: 1,
    page_size: 1,
    unit_id: effectiveUnitId,
    assigned_to: userId
  });
  const dashboardUrl = buildUrl("/api/hr/dashboard", { unit_id: effectiveUnitId });

  const workflowsQuery = useQuery({
    queryKey: ["hr", "workflow-inbox", "workflows", workflowsUrl],
    queryFn: async () => requestJson<WorkflowListResponse>(workflowsUrl)
  });

  const myTasksQuery = useQuery({
    queryKey: ["hr", "workflow-inbox", "my-tasks-count", effectiveUnitId, userId],
    queryFn: async () => requestJson<WorkflowListResponse>(myTasksUrl),
    enabled: Boolean(userId)
  });

  const dashboardQuery = useQuery({
    queryKey: ["hr", "workflow-inbox", "dashboard", effectiveUnitId],
    queryFn: async () => requestJson<DashboardResponse>(dashboardUrl)
  });

  const workflows = workflowsQuery.data?.data ?? emptyWorkflows;
  const filteredWorkflows = useMemo(
    () =>
      workflows
        .filter((workflow) => includesText(workflow, search))
        .filter((workflow) => workflowMatchesSla(workflow, slaFilter))
        .filter((workflow) => (criticalOnly ? isCritical(workflow) : true))
        .filter((workflow) => (escalatedOnly ? isEscalated(workflow) : true))
        .sort((left, right) => {
          const priorityDiff = priorityScore(right) - priorityScore(left);
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        }),
    [criticalOnly, escalatedOnly, search, slaFilter, workflows]
  );

  const dashboard = dashboardQuery.data?.data;
  const totalInbox = workflowsQuery.data?.pagination.total ?? filteredWorkflows.length;
  const myTasksTotal = userId ? myTasksQuery.data?.pagination.total ?? 0 : 0;
  const overdueTotal = dashboard?.sla?.overdue ?? filteredWorkflows.filter((workflow) => getSlaStatus(workflow) === "overdue").length;
  const warningTotal = dashboard?.sla?.warning ?? filteredWorkflows.filter((workflow) => getSlaStatus(workflow) === "warning").length;
  const escalatedTotal = (dashboard?.escalation?.eligible ?? 0) + (dashboard?.escalation?.overdue ?? 0) || filteredWorkflows.filter(isEscalated).length;
  const inProgressTotal = dashboard?.steps?.in_progress ?? filteredWorkflows.filter((workflow) => workflow.status === "in_progress").length;

  const hasFilters = Boolean(search.trim() || unitId || status || workflowType || slaFilter !== "all" || criticalOnly || myTasksOnly || escalatedOnly);

  function clearFilters() {
    setSearch("");
    setUnitId(activeUnitId ?? "");
    setStatus("");
    setWorkflowType("");
    setSlaFilter("all");
    setCriticalOnly(false);
    setMyTasksOnly(false);
    setEscalatedOnly(false);
  }

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessiveis"} />
              {dashboard?.generated_at ? <StatusBadge status="visual" label={`Metricas atualizadas em ${formatDateTime(dashboard.generated_at)}`} /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Inbox somente leitura. Acoes operacionais entram em sprint propria com idempotencia.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="visual" label={`Exibindo ${filteredWorkflows.length} de ${totalInbox}`} />
            <Button asChild size="sm">
              <Link href="/rh/admissoes/nova">
                <UserPlus className="h-4 w-4" />
                Nova Admissao
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Total na Inbox" value={String(totalInbox)} icon={ClipboardList} tone={totalInbox ? "info" : "neutral"} />
        <StatCard title="Minhas tarefas" value={String(myTasksTotal)} icon={UserRound} tone={myTasksTotal ? "warning" : "neutral"} />
        <StatCard title="SLA vencido" value={String(overdueTotal)} icon={AlertTriangle} tone={overdueTotal ? "danger" : "neutral"} />
        <StatCard title="SLA vencendo" value={String(warningTotal)} icon={CalendarClock} tone={warningTotal ? "warning" : "neutral"} />
        <StatCard title="Escalados" value={String(escalatedTotal)} icon={ShieldAlert} tone={escalatedTotal ? "danger" : "neutral"} />
        <StatCard title="Em andamento" value={String(inProgressTotal)} icon={TimerReset} tone={inProgressTotal ? "info" : "neutral"} />
      </div>

      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar resumo da inbox."} /> : null}
      {!userId ? <ErrorMessage message="Filtro Minhas tarefas indisponivel: usuario da sessao sem identificador UUID valido para o endpoint." /> : null}

      <Card className="min-w-0 border-border/80 bg-card/95 p-4 shadow-sm shadow-primary/5 backdrop-blur lg:sticky lg:top-0 lg:z-10">
        <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Filtros operacionais</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Filtros aplicados sobre workflows acessiveis e dados ja redigidos pelo backend.</p>
          </div>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Limpar
            </Button>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Buscar" className="xl:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tipo, status, etapa ou colaborador" className="pl-9" />
            </div>
          </Field>

          <Field label="Unidade">
            <SelectField value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <UnitFilterOptions activeUnitId={activeUnitId} />
            </SelectField>
          </Field>

          <Field label="Status">
            <SelectField value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {workflowStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>
          </Field>

          <Field label="Tipo">
            <SelectField value={workflowType} onChange={(event) => setWorkflowType(event.target.value)}>
              <option value="">Todos</option>
              {workflowTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectField>
          </Field>

          <Field label="SLA">
            <SelectField value={slaFilter} onChange={(event) => setSlaFilter(event.target.value as SlaFilter)}>
              <option value="all">Todos</option>
              <option value="overdue">Vencido</option>
              <option value="warning">Vencendo</option>
              <option value="on_time">Em dia</option>
            </SelectField>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant={myTasksOnly ? "default" : "outline"} size="sm" onClick={() => setMyTasksOnly((current) => !current)} disabled={!userId}>
            <UserRound className="h-4 w-4" />
            Minhas tarefas
          </Button>
          <Button type="button" variant={criticalOnly ? "default" : "outline"} size="sm" onClick={() => setCriticalOnly((current) => !current)}>
            <ShieldAlert className="h-4 w-4" />
            Criticos
          </Button>
          <Button type="button" variant={escalatedOnly ? "default" : "outline"} size="sm" onClick={() => setEscalatedOnly((current) => !current)}>
            <BellRing className="h-4 w-4" />
            Escalados
          </Button>
        </div>
      </Card>

      {workflowsQuery.isLoading ? <LoadingTable label="Carregando inbox operacional de RH..." /> : null}
      {workflowsQuery.error ? <ErrorMessage message={workflowsQuery.error instanceof Error ? workflowsQuery.error.message : "Erro ao carregar inbox operacional."} /> : null}

      {!workflowsQuery.isLoading && !workflowsQuery.error && !filteredWorkflows.length ? (
        <EmptyState title="Nenhum workflow encontrado" description="Ajuste os filtros ou confirme se existem workflows de RH dentro das unidades permitidas para o seu perfil." />
      ) : null}

      {filteredWorkflows.length ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Fila operacional</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Ordenacao: SLA vencido, SLA vencendo, escalados, criticos e atualizados recentemente.</p>
              </div>
              <p className="text-xs text-muted-foreground">Limite de leitura: ate 100 workflows por consulta.</p>
            </div>
          </div>

          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b bg-muted text-xs uppercase text-muted-foreground shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Workflow</th>
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Etapa atual</th>
                  <th className="px-4 py-3 font-semibold">Responsavel</th>
                  <th className="px-4 py-3 font-semibold">SLA</th>
                  <th className="px-4 py-3 font-semibold">Vencimento</th>
                  <th className="px-4 py-3 font-semibold">Atraso</th>
                  <th className="px-4 py-3 font-semibold">Escalation</th>
                  <th className="px-4 py-3 font-semibold">Datas</th>
                  <th className="px-4 py-3 text-right font-semibold">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredWorkflows.map((workflow) => {
                  const sla = workflow.current_step?.sla ?? workflow.sla;
                  const escalationLevel = workflow.current_step?.escalation?.level ?? workflow.escalation?.level ?? 0;

                  return (
                    <tr key={workflow.id} className={cn("align-top transition-colors hover:bg-muted/30", isCritical(workflow) && "border-l-4 border-l-amber-400 bg-amber-50/30")}>
                      <td className="px-4 py-3">
                        <div className="max-w-48 space-y-1.5">
                          <p className="break-words font-medium text-foreground">{workflowTypeLabel(workflow.workflow_type)}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge status={statusTone(workflow.status)} label={workflowStatusLabel(workflow.status)} />
                            {workflow.is_sensitive ? <StatusBadge status="warning" label="Restrito" /> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-36 break-words text-muted-foreground">{workflow.unit_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-44 space-y-1">
                          <p className="break-words font-medium text-foreground">{workflow.employee?.name ?? "Nao vinculado"}</p>
                          {workflow.employee?.redacted ? <StatusBadge status="visual" label="Redigido" /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-48 space-y-1">
                          <p className="break-words text-foreground">{workflow.current_step?.name ?? "Sem etapa atual"}</p>
                          {workflow.current_step ? <StatusBadge status={statusTone(workflow.current_step.status)} label={stepStatusLabel(workflow.current_step.status)} /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-36 break-words text-muted-foreground">{workflow.current_step?.assigned_to ?? "Nao informado"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={slaTone(sla?.status)} label={slaLabel(sla)} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDueDate(sla?.due_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDelay(sla)}</td>
                      <td className="px-4 py-3">
                        {isEscalated(workflow) ? (
                          <StatusBadge status={workflow.escalation?.overdue || workflow.current_step?.escalation?.overdue ? "danger" : "warning"} label={escalationLevel ? `Nivel ${escalationLevel}` : "Escalado"} />
                        ) : (
                          <StatusBadge status="visual" label="Nao" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-40 text-xs text-muted-foreground">
                          <p>Criado: {formatDateTime(workflow.created_at)}</p>
                          <p>Atualizado: {formatDateTime(workflow.updated_at)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/rh/workflows/${workflow.id}`}>
                            Abrir
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
