"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  History,
  LayoutDashboard,
  ListChecks,
  Lock,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SquareCheckBig,
  SquareX,
  Trash2,
  UserPlus,
  UsersRound,
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
  unit?: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
  manager_user?: {
    id: string;
    name: string | null;
  } | null;
  workflow_type: string;
  status: string;
  is_sensitive: boolean;
  employee: WorkflowEmployee;
  metadata: Record<string, unknown>;
  steps: WorkflowStep[];
  current_step_id: string | null;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  allowed_actions?: {
    view?: boolean;
    viewSensitive?: boolean;
    execute?: boolean;
    approve?: boolean;
    reject?: boolean;
    return?: boolean;
    cancel?: boolean;
  };
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

type CandidateSummaryResponse = {
  summary: {
    total: number;
    triagem: number;
    entrevista: number;
    aprovado: number;
    reprovado: number;
  };
};

type WorkflowMutationResponse = {
  data: WorkflowDetail;
  idempotency?: {
    status?: string;
    replayed?: boolean;
  };
};

type WorkflowActionKind = "execute" | "approve" | "reject" | "return" | "cancel";

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

const eventTypeLabels: Record<string, string> = {
  workflow_created: "Processo criado",
  workflow_opened: "Processo aberto",
  workflow_assigned: "Processo atribuido",
  workflow_status_changed: "Status alterado",
  workflow_due_date_changed: "Prazo alterado",
  workflow_submitted_for_approval: "Enviado para aprovacao",
  workflow_approved: "Processo aprovado",
  workflow_returned: "Processo devolvido",
  workflow_rejected: "Processo rejeitado",
  workflow_completed: "Processo concluido",
  workflow_cancelled: "Processo cancelado",
  step_started: "Etapa iniciada",
  step_completed: "Etapa concluida",
  step_rejected: "Etapa rejeitada",
  step_returned: "Etapa devolvida",
  step_skipped: "Etapa ignorada",
  document_linked: "Documento vinculado",
  note_added: "Nota adicionada"
};

const actionLabels: Record<string, string> = {
  create_workflow: "Criacao do processo",
  execute_step: "Execucao de etapa",
  approve_step: "Aprovacao de etapa",
  reject_step: "Rejeicao de etapa",
  return_step: "Devolucao de etapa",
  cancel_workflow: "Cancelamento do processo"
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel carregar os dados de RH.");
  }

  return payload as T;
}

function createIdempotencyKey(action: WorkflowActionKind, workflowId: string) {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `hr-${action}-${workflowId}-${randomPart}`;
}

async function postWorkflowAction(input: {
  workflowId: string;
  action: WorkflowActionKind;
  stepId?: string;
  reason?: string;
  notes?: string;
}) {
  const endpointByAction: Record<WorkflowActionKind, string> = {
    execute: "execute",
    approve: "approve",
    reject: "reject",
    return: "return",
    cancel: "cancel"
  };
  const payload: Record<string, string> = {};

  if (input.stepId) payload.step_id = input.stepId;
  if (input.reason?.trim()) payload.reason = input.reason.trim();
  if (input.notes?.trim()) payload.notes = input.notes.trim();

  const response = await fetch(`/api/hr/workflows/${input.workflowId}/${endpointByAction[input.action]}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey(input.action, input.workflowId)
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.message ?? body?.error?.message ?? "Nao foi possivel executar a acao do processo.");
  }

  return body as WorkflowMutationResponse;
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
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

function metadataText(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" && value.trim().toLowerCase() === "redacted") return "Redigido";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function formatQuantity(value: string) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return value || "-";
  return quantity === 1 ? "1 vaga" : `${quantity} vagas`;
}

function shortIdentifier(value: string | null | undefined) {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

const urgencyLabels: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Critica"
};

function urgencyLabel(value: string) {
  return urgencyLabels[value] ?? (value || "-");
}

function priorityTone(priority: string): StatusTone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  return "visual";
}

function technicalEntries(record: Record<string, unknown> | null | undefined) {
  return Object.entries(record ?? {}).filter(([, value]) => value !== undefined);
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

function unitDisplayName(workflow: WorkflowDetail) {
  if (workflow.unit?.name) return workflow.unit.name;
  if (workflow.unit?.code) return workflow.unit.code;
  return "Unidade registrada";
}

function SlaPanel({ sla }: { sla: WorkflowSla | null | undefined }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="SLA" description="Leitura operacional do prazo principal do processo." icon={CalendarClock} />
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

function TechnicalMetadataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = technicalEntries(metadata);
  if (!entries.length) return null;

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-semibold text-foreground">Informacoes tecnicas</span>
            <span className="block text-xs text-muted-foreground">Dados de apoio do processo, ocultos por padrao para a operacao.</span>
          </span>
        </summary>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {entries.map(([key, value]) => (
            <StatusBadge key={key} status={String(value) === "redacted" ? "visual" : "info"} label={`${key}: ${stringifySafeValue(value)}`} />
          ))}
        </div>
      </details>
    </Card>
  );
}

function JobOpeningSummaryPanel({ workflow }: { workflow: WorkflowDetail }) {
  const metadata = workflow.metadata ?? {};
  const department = metadataText(metadata, "department") || "Nao informado";
  const jobPosition = metadataText(metadata, "job_position") || "Nao informado";
  const quantity = formatQuantity(metadataText(metadata, "requested_quantity"));
  const urgency = metadataText(metadata, "urgency");
  const requestedStartDate = metadataText(metadata, "requested_start_date");
  const managerUserId = metadataText(metadata, "manager_user_id");
  const managerName = workflow.manager_user?.name || (managerUserId ? "Registrado no workflow" : "Nao informado");
  const reason = metadataText(metadata, "reason");
  const justification = metadataText(metadata, "justification");
  const notes = metadataText(metadata, "notes");

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader title="Painel da solicitacao de vaga" description="Dados principais para RH e gestores acompanharem a abertura da vaga." icon={BriefcaseBusiness} />
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={priorityTone(urgency)} label={`Urgencia: ${urgencyLabel(urgency)}`} />
          <StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} />
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="Departamento" value={department} icon={Building2} />
        <InfoTile label="Cargo" value={jobPosition} icon={BriefcaseBusiness} />
        <InfoTile label="Quantidade" value={quantity} icon={UsersRound} />
        <InfoTile label="Urgencia" value={urgencyLabel(urgency)} icon={ShieldAlert} />
        <InfoTile label="Data desejada" value={formatDate(requestedStartDate)} icon={CalendarClock} />
        <InfoTile label="Gestor solicitante" value={managerName} icon={UserRound} />
        <InfoTile label="Unidade" value={unitDisplayName(workflow)} icon={ListChecks} />
        <InfoTile label="SLA" value={slaLabel(workflow.sla)} icon={FileClock} />
      </div>

      {reason || justification || notes ? (
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-3">
          {reason ? (
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Motivo da vaga</p>
              <p className="mt-2 break-words text-sm text-foreground">{reason}</p>
            </div>
          ) : null}
          {justification ? (
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Justificativa</p>
              <p className="mt-2 break-words text-sm text-foreground">{justification}</p>
            </div>
          ) : null}
          {notes ? (
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Observacoes operacionais</p>
              <p className="mt-2 break-words text-sm text-foreground">{notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function CandidateSummaryPanel({
  workflowId,
  summary,
  isLoading,
  error
}: {
  workflowId: string;
  summary: CandidateSummaryResponse["summary"] | null;
  isLoading: boolean;
  error: unknown;
}) {
  const values = summary ?? { total: 0, triagem: 0, entrevista: 0, aprovado: 0, reprovado: 0 };

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeader title="Candidatos" description="Acompanhamento leve da vaga, sem ranking automatico ou decisao por sistema." icon={UsersRound} />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/rh/vagas/${workflowId}/candidatos`}>
              <UsersRound className="h-4 w-4" />
              Candidatos
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/rh/vagas/${workflowId}/candidatos/novo`}>
              <UserPlus className="h-4 w-4" />
              Novo Candidato
            </Link>
          </Button>
        </div>
      </div>
      {isLoading ? <LoadingTable label="Carregando resumo de candidatos..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar resumo de candidatos."} /> : null}
      {!isLoading && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <InfoTile label="Total" value={String(values.total)} icon={UsersRound} />
          <InfoTile label="Em triagem" value={String(values.triagem)} icon={ClipboardList} />
          <InfoTile label="Em entrevista" value={String(values.entrevista)} icon={CalendarClock} />
          <InfoTile label="Aprovados" value={String(values.aprovado)} icon={CheckCircle2} />
          <InfoTile label="Reprovados" value={String(values.reprovado)} icon={SquareX} />
        </div>
      ) : null}
    </Card>
  );
}

function EscalationPanel({ escalation }: { escalation: WorkflowEscalation | null | undefined }) {
  const isEscalated = Boolean(escalation?.overdue || escalation?.eligible || escalation?.level || escalation?.count);

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Escalonamento" description="Acompanhamento de atrasos e prioridades calculadas pelo RH." icon={ShieldAlert} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <InfoTile label="Estado" value={isEscalated ? "Escalado ou elegivel" : "Nao escalado"} icon={ShieldAlert} />
        <InfoTile label="Nivel" value={escalation?.level ? `Nivel ${escalation.level}` : "-"} icon={ListChecks} />
        <InfoTile label="Ocorrencias" value={String(escalation?.count ?? 0)} icon={History} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={escalation?.overdue ? "danger" : isEscalated ? "warning" : "visual"} label={escalation?.label ?? (isEscalated ? "Escalonamento ativo" : "Sem escalonamento")} />
      </div>
    </Card>
  );
}

function StepsPanel({ workflow }: { workflow: WorkflowDetail }) {
  const currentStepId = workflow.current_step_id;

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="p-4">
        <SectionHeader title="Etapas do processo" description="Sequencia operacional das etapas protegidas pelo sistema." icon={ListChecks} />
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
          <EmptyState title="Sem etapas disponiveis" description="O sistema nao retornou etapas para este processo." />
        </div>
      )}
    </Card>
  );
}

function TimelinePanel({ events, isLoading, error }: { events: TimelineEvent[]; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <details>
        <summary className="cursor-pointer list-none">
          <SectionHeader title="Historico do workflow" description="Eventos registrados automaticamente pelo sistema." icon={History} />
        </summary>
        <div className="mt-4">
          {isLoading ? <LoadingTable label="Carregando historico do processo..." /> : null}
          {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar historico."} /> : null}
          {!isLoading && !error && !events.length ? <EmptyState title="Historico vazio" description="Nenhum evento ativo foi retornado para este processo." /> : null}
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
                      <p className="text-xs text-muted-foreground">Ator: {event.actor_name || (event.actor_user_id ? "Usuario registrado" : "Nao informado")}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                  </div>
                  {technicalEntries(event.payload).length ? (
                    <details className="mt-3 rounded-md border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Dados tecnicos do evento</summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {technicalEntries(event.payload).map(([key, value]) => (
                          <StatusBadge key={key} status="visual" label={`${key}: ${stringifySafeValue(value)}`} />
                        ))}
                        {event.actor_user_id ? <StatusBadge status="visual" label={`actor_user_id: ${event.actor_user_id}`} /> : null}
                        {event.step_id ? <StatusBadge status="visual" label={`step_id: ${event.step_id}`} /> : null}
                        <StatusBadge status="visual" label={`workflow_id: ${event.workflow_id}`} />
                      </div>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </Card>
  );
}

function AuditPanel({ logs, total, isLoading, error }: { logs: AuditLog[]; total: number; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <details>
        <summary className="cursor-pointer list-none">
          <SectionHeader title="Auditoria tecnica" description="Registros internos para rastreabilidade e compliance." icon={Lock} />
        </summary>
        <div className="mt-4">
          {isLoading ? <LoadingTable label="Carregando auditoria do processo..." /> : null}
          {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar auditoria."} /> : null}
          {!isLoading && !error && !logs.length ? <EmptyState title="Auditoria sem registros" description="Nenhum registro de auditoria foi retornado para este processo." /> : null}
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
                      <p className="break-words text-xs text-muted-foreground">Usuario: {log.actor_user_id ? "Usuario registrado" : "Nao informado"}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                  <details className="mt-3 rounded-md border bg-muted/20 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Dados tecnicos da auditoria</summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {log.actor_user_id ? <StatusBadge status="visual" label={`actor_user_id: ${log.actor_user_id}`} /> : null}
                      {log.workflow_id ? <StatusBadge status="visual" label={`workflow_id: ${log.workflow_id}`} /> : null}
                      {log.step_id ? <StatusBadge status="visual" label={`step_id: ${log.step_id}`} /> : null}
                      {log.event_id ? <StatusBadge status="visual" label={`event_id: ${log.event_id}`} /> : null}
                      {log.request_id ? <StatusBadge status="visual" label={`request_id: ${log.request_id}`} /> : null}
                      {log.correlation_id ? <StatusBadge status="visual" label={`correlation_id: ${log.correlation_id}`} /> : null}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </Card>
  );
}

function NotificationsPanel({ notifications, isLoading, error }: { notifications: WorkflowNotification[]; isLoading: boolean; error: unknown }) {
  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Notificacoes" description="Notificacoes relacionadas ao processo, quando disponiveis." icon={Bell} />
      {isLoading ? <LoadingTable label="Carregando notificacoes do processo..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar notificacoes."} /> : null}
      {!isLoading && !error && !notifications.length ? <EmptyState title="Sem notificacoes" description="Nenhuma notificacao foi retornada para este processo." /> : null}
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

function WorkflowActionPanel({
  workflow,
  currentStep,
  onSuccess
}: {
  workflow: WorkflowDetail;
  currentStep: WorkflowStep | null;
  onSuccess: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<WorkflowActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lockedAfterSuccess, setLockedAfterSuccess] = useState(false);

  useEffect(() => {
    setLockedAfterSuccess(false);
  }, [workflow.status, workflow.updated_at, workflow.current_step_id]);

  const mutation = useMutation({
    mutationFn: postWorkflowAction,
    onSuccess: async (response, variables) => {
      const replayed = response.idempotency?.replayed ? " Requisicao idempotente reaproveitada." : "";
      const message = `${actionLabelsForUi[variables.action].success}${replayed}`;
      setFeedback(message);
      setLocalError(null);
      setSelectedAction(null);
      setReason("");
      setNotes("");
      setLockedAfterSuccess(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "workflow-detail", workflow.id] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "workflow-detail", workflow.id, "timeline"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "workflow-detail", workflow.id, "audit"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "workflow-detail", workflow.id, "notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "workflow-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "operational-dashboard"] })
      ]);
      onSuccess(message);
    },
    onError: (error) => {
      setFeedback(null);
      setLocalError(error instanceof Error ? error.message : "Nao foi possivel executar a acao.");
    }
  });

  const allowed = workflow.allowed_actions ?? {};
  const allowedActions = [
    allowed.execute ? "execute" : null,
    allowed.approve ? "approve" : null,
    allowed.reject ? "reject" : null,
    allowed.return ? "return" : null,
    allowed.cancel ? "cancel" : null
  ].filter((action): action is WorkflowActionKind => Boolean(action));
  const selectedActionMeta = selectedAction ? actionLabelsForUi[selectedAction] : null;
  const SelectedActionIcon = selectedActionMeta?.icon;
  const requiresReason = selectedAction === "reject" || selectedAction === "return" || selectedAction === "cancel";
  const requiresStep = selectedAction === "execute" || selectedAction === "approve" || selectedAction === "reject" || selectedAction === "return";
  const reasonIsValid = !requiresReason || reason.trim().length >= 3;
  const stepIsValid = !requiresStep || Boolean(currentStep?.id);
  const canSubmit = Boolean(selectedAction && reasonIsValid && stepIsValid && !mutation.isPending && !lockedAfterSuccess);

  function submitSelectedAction() {
    if (!selectedAction || !canSubmit) return;

    mutation.mutate({
      workflowId: workflow.id,
      action: selectedAction,
      stepId: requiresStep ? currentStep?.id : undefined,
      reason,
      notes
    });
  }

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Acoes operacionais" description="Acoes registradas com seguranca. O sistema continua sendo a autoridade final." icon={SquareCheckBig} />

      {!allowedActions.length ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Nenhuma acao operacional foi liberada pelo sistema para este processo no estado atual.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {allowedActions.map((action) => {
              const meta = actionLabelsForUi[action];
              const Icon = meta.icon;

              return (
                <Button
                  key={action}
                  type="button"
                  variant={meta.variant}
                  size="sm"
                  onClick={() => {
                    setSelectedAction(action);
                    setFeedback(null);
                    setLocalError(null);
                  }}
                  disabled={mutation.isPending || lockedAfterSuccess}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </Button>
              );
            })}
          </div>

          {selectedAction && selectedActionMeta ? (
            <div className="rounded-md border bg-background p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selectedActionMeta.confirmTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedActionMeta.confirmDescription}</p>
                  {requiresStep ? <p className="mt-1 text-xs text-muted-foreground">Etapa alvo: {currentStep?.name ?? "sem etapa atual"}</p> : null}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedAction(null)} disabled={mutation.isPending}>
                  Fechar
                </Button>
              </div>

              {requiresReason ? (
                <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                  Motivo
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Informe o motivo administrativo"
                    disabled={mutation.isPending}
                  />
                </label>
              ) : null}

              <label className="mt-3 block space-y-1 text-xs font-medium text-muted-foreground">
                Observacao opcional
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Sem dados sensiveis; use apenas contexto operacional necessario"
                  disabled={mutation.isPending}
                />
              </label>

              {!stepIsValid ? <ErrorMessage message="Nao ha etapa atual disponivel para esta acao." /> : null}
              {requiresReason && !reasonIsValid ? <p className="mt-2 text-xs text-muted-foreground">Informe ao menos 3 caracteres no motivo.</p> : null}

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedAction(null)} disabled={mutation.isPending}>
                  Cancelar
                </Button>
                <Button type="button" variant={selectedActionMeta.variant} size="sm" onClick={submitSelectedAction} disabled={!canSubmit}>
                  {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : SelectedActionIcon ? <SelectedActionIcon className="h-4 w-4" /> : null}
                  Confirmar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {feedback ? <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{feedback} Atualizando os dados do processo.</div> : null}
      {localError ? <div className="mt-3"><ErrorMessage message={localError} /></div> : null}
    </Card>
  );
}

const actionLabelsForUi: Record<
  WorkflowActionKind,
  {
    label: string;
    success: string;
    confirmTitle: string;
    confirmDescription: string;
    icon: typeof SquareCheckBig;
    variant: "default" | "outline" | "danger";
  }
> = {
  execute: {
    label: "Executar etapa",
    success: "Etapa executada com sucesso.",
    confirmTitle: "Confirmar execucao da etapa",
    confirmDescription: "A etapa atual sera executada pelo fluxo do processo.",
    icon: SquareCheckBig,
    variant: "default"
  },
  approve: {
    label: "Aprovar",
    success: "Etapa aprovada com sucesso.",
    confirmTitle: "Confirmar aprovacao",
    confirmDescription: "A aprovacao sera registrada com auditoria e historico.",
    icon: CheckCircle2,
    variant: "default"
  },
  reject: {
    label: "Rejeitar",
    success: "Etapa rejeitada com sucesso.",
    confirmTitle: "Confirmar rejeicao",
    confirmDescription: "A rejeicao exige motivo e sera registrada na auditoria.",
    icon: SquareX,
    variant: "danger"
  },
  return: {
    label: "Devolver",
    success: "Etapa devolvida com sucesso.",
    confirmTitle: "Confirmar devolucao",
    confirmDescription: "A devolucao exige motivo para rastreabilidade.",
    icon: RotateCcw,
    variant: "outline"
  },
  cancel: {
    label: "Cancelar processo",
    success: "Processo cancelado com sucesso.",
    confirmTitle: "Confirmar cancelamento do processo",
    confirmDescription: "Cancelamento encerra o processo e exige motivo administrativo.",
    icon: Trash2,
    variant: "danger"
  }
};

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
  const candidateSummaryQuery = useQuery({
    queryKey: ["hr", "job-opening-candidates-summary", workflowId],
    queryFn: async () => requestJson<CandidateSummaryResponse>(`/api/hr/workflows/${workflowId}/candidates?page_size=1`),
    enabled: workflow?.workflow_type === "job_opening"
  });

  if (detailQuery.isLoading) {
    return <LoadingTable label="Carregando detalhe do processo RH..." />;
  }

  if (detailQuery.error) {
    return <ErrorMessage message={detailQuery.error instanceof Error ? detailQuery.error.message : "Erro ao carregar processo de RH."} />;
  }

  if (!workflow) {
    return <EmptyState title="Processo nao encontrado" description="O processo nao existe ou esta fora das unidades permitidas para o seu perfil." />;
  }

  const isJobOpening = workflow.workflow_type === "job_opening";

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
              <span>Unidade: {unitDisplayName(workflow)}</span>
              <span>Colaborador: {isJobOpening ? "Nao aplicavel" : workflow.employee?.name ?? "Nao vinculado"}</span>
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

      {isJobOpening ? <JobOpeningSummaryPanel workflow={workflow} /> : null}
      {isJobOpening ? (
        <CandidateSummaryPanel
          workflowId={workflow.id}
          summary={candidateSummaryQuery.data?.summary ?? null}
          isLoading={candidateSummaryQuery.isLoading}
          error={candidateSummaryQuery.error}
        />
      ) : null}

      {!isJobOpening ? (
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <SectionHeader title="Resumo operacional" description="Dados principais retornados pelo endpoint redigido de detalhe." icon={ClipboardList} />
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Tipo" value={workflowTypeLabel(workflow.workflow_type)} icon={ClipboardList} />
            <InfoTile label="Status" value={workflowStatusLabel(workflow.status)} icon={CheckCircle2} />
            <InfoTile label="Unidade" value={unitDisplayName(workflow)} icon={ListChecks} />
            <InfoTile label="Colaborador" value={workflow.employee?.name ?? "Nao vinculado"} icon={UserRound} />
            <InfoTile label="Etapa atual" value={currentStep?.name ?? "Sem etapa atual"} icon={ListChecks} />
            <InfoTile label="Responsavel atual" value={currentStep?.assigned_to ?? "Nao informado"} icon={UserRound} />
            <InfoTile label="Criado em" value={formatDateTime(workflow.created_at)} icon={CalendarClock} />
            <InfoTile label="Atualizado em" value={formatDateTime(workflow.updated_at)} icon={History} />
          </div>
        </Card>
      ) : null}

      <WorkflowActionPanel workflow={workflow} currentStep={currentStep} onSuccess={() => undefined} />

      {isJobOpening ? (
        <EscalationPanel escalation={workflow.escalation} />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <SlaPanel sla={workflow.sla} />
          <EscalationPanel escalation={workflow.escalation} />
        </div>
      )}

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

      <TechnicalMetadataPanel metadata={workflow.metadata} />

      <NotificationsPanel
        notifications={notificationsQuery.data?.data ?? []}
        isLoading={notificationsQuery.isLoading}
        error={notificationsQuery.error}
      />
    </div>
  );
}
