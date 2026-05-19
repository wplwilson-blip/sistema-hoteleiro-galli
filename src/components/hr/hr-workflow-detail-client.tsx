"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  History,
  LayoutDashboard,
  ListChecks,
  Lock,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatusTone = "visual" | "warning" | "danger" | "success" | "info";

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
  step_key?: string;
  name: string;
  status: string;
  sequence: number;
  assigned_to: string | null;
  completed_at: string | null;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  redacted: boolean;
};

type WorkflowDetail = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_type: string;
  status: string;
  is_sensitive: boolean;
  employee: WorkflowEmployee;
  metadata: Record<string, unknown>;
  steps: WorkflowStep[];
  current_step_id: string | null;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  created_at: string;
  updated_at: string;
};

type WorkflowDetailResponse = {
  data: WorkflowDetail;
};

type TimelineEvent = {
  id: string;
  event_type: string;
  workflow_id: string;
  step_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  summary: string;
  is_sensitive: boolean;
  payload: Record<string, unknown>;
  created_at: string;
};

type TimelineResponse = {
  data: TimelineEvent[];
};

type AuditLog = {
  id: string;
  unit_id: string;
  workflow_id: string | null;
  step_id: string | null;
  event_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  risk_level: string;
  ip_address: string | null;
  request_id: string | null;
  correlation_id: string | null;
  created_at: string;
};

type AuditResponse = {
  data: AuditLog[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

type WorkflowNotification = {
  id: string;
  notification_type: string;
  channel: string;
  status: string;
  priority: string;
  title: string;
  message: string;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  is_sensitive: boolean;
  redacted: boolean;
  created_at: string;
  updated_at: string;
};

type NotificationsResponse = {
  data: WorkflowNotification[];
};

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

const eventTypeLabels: Record<string, string> = {
  workflow_created: "Workflow criado",
  workflow_opened: "Workflow aberto",
  workflow_assigned: "Workflow atribuido",
  workflow_status_changed: "Status alterado",
  workflow_due_date_changed: "Prazo alterado",
  workflow_submitted_for_approval: "Enviado para aprovacao",
  workflow_approved: "Workflow aprovado",
  workflow_returned: "Workflow devolvido",
  workflow_rejected: "Workflow rejeitado",
  workflow_completed: "Workflow concluido",
  workflow_cancelled: "Workflow cancelado",
  step_started: "Etapa iniciada",
  step_completed: "Etapa concluida",
  step_rejected: "Etapa rejeitada",
  step_returned: "Etapa devolvida",
  step_skipped: "Etapa ignorada",
  document_linked: "Documento vinculado",
  note_added: "Nota adicionada"
};

const actionLabels: Record<string, string> = {
  create_workflow: "Criacao do workflow",
  execute_step: "Execucao de etapa",
  approve_step: "Aprovacao de etapa",
  reject_step: "Rejeicao de etapa",
  return_step: "Devolucao de etapa",
  cancel_workflow: "Cancelamento do workflow"
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel carregar os dados de RH.");
  }

  return payload as T;
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
  return value ? formatDateTime(value) : "Sem vencimento";
}

function formatRelativeSla(sla: WorkflowSla | null | undefined) {
  if (!sla?.due_at) return "-";
  const dueAt = new Date(sla.due_at).getTime();
  if (Number.isNaN(dueAt)) return "-";

  const diffMinutes = Math.round((dueAt - Date.now()) / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const label = absMinutes < 60 ? `${absMinutes} min` : absMinutes < 1440 ? `${(absMinutes / 60).toFixed(1).replace(".", ",")} h` : `${(absMinutes / 1440).toFixed(1).replace(".", ",")} dias`;

  if (diffMinutes < 0) return `Vencido ha ${label}`;
  return `Vence em ${label}`;
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

function eventTypeLabel(type: string) {
  return eventTypeLabels[type] ?? type;
}

function actionLabel(action: string) {
  return actionLabels[action] ?? action;
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

function riskTone(risk: string): StatusTone {
  if (risk === "critical" || risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "visual";
}

function slaLabel(sla: WorkflowSla | null | undefined) {
  const status = sla?.status ?? "";
  return slaStatusLabels[status] ?? sla?.label ?? "SLA nao informado";
}

function stringifySafeValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "Valor estruturado";
}

function safeEntries(record: Record<string, unknown> | null | undefined, limit = 6) {
  return Object.entries(record ?? {}).slice(0, limit);
}

function InfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ClipboardList }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SectionHeader({ title, description, icon: Icon }: { title: string; description: string; icon: typeof ClipboardList }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SlaPanel({ sla }: { sla: WorkflowSla | null | undefined }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="SLA" description="Leitura operacional do prazo principal do workflow." icon={CalendarClock} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <InfoTile label="Status" value={slaLabel(sla)} icon={CalendarClock} />
        <InfoTile label="Vencimento" value={formatDueDate(sla?.due_at)} icon={FileClock} />
        <InfoTile label="Referencia" value={formatRelativeSla(sla)} icon={History} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={slaTone(sla?.status)} label={slaLabel(sla)} />
        {sla?.breached_at ? <StatusBadge status="danger" label={`Violado em ${formatDateTime(sla.breached_at)}`} /> : null}
      </div>
    </Card>
  );
}

function EscalationPanel({ escalation }: { escalation: WorkflowEscalation | null | undefined }) {
  const isEscalated = Boolean(escalation?.overdue || escalation?.eligible || escalation?.level || escalation?.count);

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Escalation" description="Estado read-only de escalonamento calculado pela fundacao RH." icon={ShieldAlert} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <InfoTile label="Estado" value={isEscalated ? "Escalado ou elegivel" : "Nao escalado"} icon={ShieldAlert} />
        <InfoTile label="Nivel" value={escalation?.level ? `Nivel ${escalation.level}` : "-"} icon={ListChecks} />
        <InfoTile label="Ocorrencias" value={String(escalation?.count ?? 0)} icon={History} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={escalation?.overdue ? "danger" : isEscalated ? "warning" : "visual"} label={escalation?.label ?? (isEscalated ? "Escalation ativo" : "Sem escalation")} />
      </div>
    </Card>
  );
}

function StepsPanel({ workflow }: { workflow: WorkflowDetail }) {
  const currentStepId = workflow.current_step_id;

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="p-4">
        <SectionHeader title="Etapas do workflow" description="Sequencia read-only das etapas redigidas pelo backend." icon={ListChecks} />
      </div>
      {workflow.steps.length ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-y bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Ordem</th>
                <th className="px-4 py-3 font-semibold">Etapa</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Responsavel</th>
                <th className="px-4 py-3 font-semibold">SLA</th>
                <th className="px-4 py-3 font-semibold">Conclusao</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workflow.steps.map((step) => (
                <tr key={step.id} className={cn("align-top hover:bg-muted/30", step.id === currentStepId && "bg-primary/5")}>
                  <td className="px-4 py-3 font-medium">{step.sequence}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-72 space-y-1">
                      <p className="break-words font-medium text-foreground">{step.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {step.id === currentStepId ? <StatusBadge status="info" label="Etapa atual" /> : null}
                        {step.redacted ? <StatusBadge status="visual" label="Redigida" /> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={statusTone(step.status)} label={stepStatusLabel(step.status)} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{step.assigned_to ?? "Nao informado"}</td>
                  <td className="px-4 py-3"><StatusBadge status={slaTone(step.sla?.status)} label={slaLabel(step.sla)} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(step.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 pt-0">
          <EmptyState title="Sem etapas disponiveis" description="O endpoint nao retornou etapas para este workflow." />
        </div>
      )}
    </Card>
  );
}

function TimelinePanel({ events, isLoading, error }: { events: TimelineEvent[]; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Timeline" description="Eventos do workflow com payload seguro e redigido." icon={History} />
      {isLoading ? <LoadingTable label="Carregando timeline do workflow..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar timeline."} /> : null}
      {!isLoading && !error && !events.length ? <EmptyState title="Timeline vazia" description="Nenhum evento ativo foi retornado para este workflow." /> : null}
      {events.length ? (
        <div className="space-y-3">
          {events.map((event) => (
            <article key={event.id} className="rounded-md border border-l-4 border-l-primary/50 bg-background p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{eventTypeLabel(event.event_type)}</p>
                    {event.is_sensitive ? <StatusBadge status="warning" label="Sensivel" /> : null}
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{event.summary}</p>
                  <p className="text-xs text-muted-foreground">Ator: {event.actor_name || event.actor_user_id || "Nao informado"}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
              </div>
              {safeEntries(event.payload, 4).length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {safeEntries(event.payload, 4).map(([key, value]) => (
                    <StatusBadge key={key} status="visual" label={`${key}: ${stringifySafeValue(value)}`} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function AuditPanel({ logs, total, isLoading, error }: { logs: AuditLog[]; total: number; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Auditoria" description="Registros read-only de auditoria filtrados por workflow." icon={Lock} />
      {isLoading ? <LoadingTable label="Carregando auditoria do workflow..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar auditoria."} /> : null}
      {!isLoading && !error && !logs.length ? <EmptyState title="Auditoria sem registros" description="Nenhum registro de auditoria foi retornado para este workflow." /> : null}
      {logs.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Exibindo {logs.length} de {total} registros.</p>
          {logs.map((log) => (
            <article key={log.id} className="rounded-md border bg-background p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{actionLabel(log.action)}</p>
                    <StatusBadge status={riskTone(log.risk_level)} label={log.risk_level} />
                    <StatusBadge status="visual" label={log.entity_type} />
                  </div>
                  <p className="break-words text-xs text-muted-foreground">Usuario: {log.actor_user_id ?? "Nao informado"} | Request: {log.request_id ?? "-"}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function NotificationsPanel({ notifications, isLoading, error }: { notifications: WorkflowNotification[]; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Notificacoes" description="Notificacoes relacionadas ao workflow, quando disponiveis." icon={Bell} />
      {isLoading ? <LoadingTable label="Carregando notificacoes do workflow..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar notificacoes."} /> : null}
      {!isLoading && !error && !notifications.length ? <EmptyState title="Sem notificacoes" description="Nenhuma notificacao foi retornada para este workflow." /> : null}
      {notifications.length ? (
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          {notifications.map((notification) => (
            <article key={notification.id} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={notification.status === "failed" ? "danger" : notification.status === "read" || notification.status === "sent" ? "success" : "info"} label={notification.status} />
                <StatusBadge status={notification.priority === "critical" || notification.priority === "high" ? "warning" : "visual"} label={notification.priority} />
                {notification.redacted ? <StatusBadge status="visual" label="Redigida" /> : null}
              </div>
              <p className="mt-2 break-words text-sm font-semibold text-foreground">{notification.title}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{notification.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">Canal: {notification.channel} | Criada em {formatDateTime(notification.created_at)}</p>
            </article>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function HrWorkflowDetailClient({ workflowId }: { workflowId: string }) {
  const detailQuery = useQuery({
    queryKey: ["hr", "workflow-detail", workflowId],
    queryFn: async () => requestJson<WorkflowDetailResponse>(`/api/hr/workflows/${workflowId}`)
  });

  const timelineQuery = useQuery({
    queryKey: ["hr", "workflow-detail", workflowId, "timeline"],
    queryFn: async () => requestJson<TimelineResponse>(`/api/hr/workflows/${workflowId}/timeline`)
  });

  const auditQuery = useQuery({
    queryKey: ["hr", "workflow-detail", workflowId, "audit"],
    queryFn: async () => requestJson<AuditResponse>(`/api/hr/audit?workflow_id=${workflowId}&page=1&page_size=20`)
  });

  const notificationsQuery = useQuery({
    queryKey: ["hr", "workflow-detail", workflowId, "notifications"],
    queryFn: async () => requestJson<NotificationsResponse>(`/api/hr/workflows/${workflowId}/notifications`)
  });

  const workflow = detailQuery.data?.data ?? null;
  const currentStep = useMemo(() => workflow?.steps.find((step) => step.id === workflow.current_step_id) ?? null, [workflow]);

  if (detailQuery.isLoading) {
    return <LoadingTable label="Carregando detalhe do workflow RH..." />;
  }

  if (detailQuery.error) {
    return <ErrorMessage message={detailQuery.error instanceof Error ? detailQuery.error.message : "Erro ao carregar workflow de RH."} />;
  }

  if (!workflow) {
    return <EmptyState title="Workflow nao encontrado" description="O workflow nao existe ou esta fora das unidades permitidas para o seu perfil." />;
  }

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 bg-card/95 p-4 shadow-sm shadow-primary/5 backdrop-blur lg:sticky lg:top-0 lg:z-10">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link href="/rh" className="font-medium text-primary hover:underline">RH</Link>
              <span>/</span>
              <Link href="/rh/inbox" className="font-medium text-primary hover:underline">Inbox</Link>
              <span>/</span>
              <span>Dossie operacional</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-lg font-semibold text-foreground">{workflowTypeLabel(workflow.workflow_type)}</h2>
              <StatusBadge status={statusTone(workflow.status)} label={workflowStatusLabel(workflow.status)} />
              <StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} />
              {workflow.is_sensitive ? <StatusBadge status="warning" label="Restrito" /> : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Unidade: {workflow.unit_id}</span>
              <span>Colaborador: {workflow.employee?.name ?? "Nao vinculado"}</span>
              {workflow.employee?.redacted ? <span>Dado redigido por permissao</span> : null}
              <span>Criado em {formatDateTime(workflow.created_at)}</span>
              <span>Atualizado em {formatDateTime(workflow.updated_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/rh">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/rh/inbox">
                <ArrowLeft className="h-4 w-4" />
                Voltar para Inbox
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <SectionHeader title="Resumo operacional" description="Dados principais retornados pelo endpoint redigido de detalhe." icon={ClipboardList} />
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Tipo" value={workflowTypeLabel(workflow.workflow_type)} icon={ClipboardList} />
          <InfoTile label="Status" value={workflowStatusLabel(workflow.status)} icon={CheckCircle2} />
          <InfoTile label="Unidade" value={workflow.unit_id} icon={ListChecks} />
          <InfoTile label="Colaborador" value={workflow.employee?.name ?? "Nao vinculado"} icon={UserRound} />
          <InfoTile label="Etapa atual" value={currentStep?.name ?? "Sem etapa atual"} icon={ListChecks} />
          <InfoTile label="Responsavel atual" value={currentStep?.assigned_to ?? "Nao informado"} icon={UserRound} />
          <InfoTile label="Criado em" value={formatDateTime(workflow.created_at)} icon={CalendarClock} />
          <InfoTile label="Atualizado em" value={formatDateTime(workflow.updated_at)} icon={History} />
        </div>
        {safeEntries(workflow.metadata).length ? (
          <div className="mt-4 rounded-md border bg-background p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Metadados seguros</p>
            <div className="flex flex-wrap gap-1.5">
              {safeEntries(workflow.metadata).map(([key, value]) => (
                <StatusBadge key={key} status={String(value) === "redacted" ? "visual" : "info"} label={`${key}: ${stringifySafeValue(value)}`} />
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <SlaPanel sla={workflow.sla} />
        <EscalationPanel escalation={workflow.escalation} />
      </div>

      <StepsPanel workflow={workflow} />

      <TimelinePanel
        events={timelineQuery.data?.data ?? []}
        isLoading={timelineQuery.isLoading}
        error={timelineQuery.error}
      />

      <AuditPanel
        logs={auditQuery.data?.data ?? []}
        total={auditQuery.data?.pagination.total ?? 0}
        isLoading={auditQuery.isLoading}
        error={auditQuery.error}
      />

      <NotificationsPanel
        notifications={notificationsQuery.data?.data ?? []}
        isLoading={notificationsQuery.isLoading}
        error={notificationsQuery.error}
      />
    </div>
  );
}
