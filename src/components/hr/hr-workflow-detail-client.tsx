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
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { HrOperationalModal } from "@/components/hr/hr-operational-modal";
import { HrCandidateAdmissionActionButton } from "@/components/hr/hr-candidate-admission-conversion-card";
import { HrJobRequirementPreview } from "@/components/hr/hr-job-requirement-preview";
import { HrRecruitmentBreadcrumb, HrRecruitmentGuidance } from "@/components/hr/hr-recruitment-navigation";
import { HrRecruitmentTimeline, type HrRecruitmentStageKey } from "@/components/hr/hr-recruitment-timeline";
import { candidateStatusLabel, candidateStatusTone, formatPhone, type Candidate, type CandidateSummary } from "@/components/hr/hr-candidate-shared";
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
  data: Candidate[];
  summary: CandidateSummary;
};

type AdmissionProcessForCandidate = {
  id: string;
  source_candidate_id: string | null;
  admission_workflow_id: string | null;
  status: string;
  current_step: string;
};

type AdmissionProcessesByJobOpeningResponse = {
  data: AdmissionProcessForCandidate[];
};

type AdmissionPersistentProcess = {
  id: string;
  status: string;
  current_step: string;
  documents_status: string;
  accounting_status: string;
  registration_status: string;
  occupational_health_status: string;
  uniform_status: string;
  onboarding_status: string;
  created_at: string;
  updated_at: string;
};

type AdmissionChecklistStatus =
  | "pending"
  | "requested"
  | "received"
  | "under_review"
  | "approved"
  | "rejected"
  | "waived"
  | "completed"
  | "not_applicable"
  | "cancelled";

type AdmissionPersistentLookupResponse = {
  data: {
    process: AdmissionPersistentProcess | null;
  };
};

type AdmissionPersistentChecklistItem = {
  id: string;
  item_type: string;
  item_key: string;
  title: string;
  status: AdmissionChecklistStatus;
  requirement_level: string;
  is_required: boolean;
  blocks_activation: boolean;
  notes: string | null;
};

type AdmissionPersistentDetailResponse = {
  data: {
    process: AdmissionPersistentProcess;
    checklist: AdmissionPersistentChecklistItem[];
    summary: {
      checklist: {
        total: number;
        pending: number;
        completed: number;
        blocked: number;
        waived: number;
        required: number;
        blocksActivation: number;
      };
    };
  };
};

type AdmissionChecklistUpdateForm = {
  status: AdmissionChecklistStatus | "";
  notes: string;
  waiverReason: string;
  rejectionReason: string;
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
  job_opening: "Solicitação de vaga"
};

const workflowStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting_approval: "Aguardando aprovação",
  returned: "Devolvido",
  completed: "Concluido",
  cancelled: "Cancelado",
  rejected: "Rejeitado"
};

const stepStatusLabels: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  waiting_approval: "Aguardando aprovação",
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
  workflow_submitted_for_approval: "Enviado para aprovação",
  workflow_approved: "Processo aprovado",
  workflow_returned: "Processo devolvido",
  workflow_rejected: "Processo rejeitado",
  workflow_completed: "Processo concluido",
  workflow_cancelled: "Processo cancelado",
  step_started: "Etapa iniciada",
  step_completed: "Etapa concluída",
  step_rejected: "Etapa rejeitada",
  step_returned: "Etapa devolvida",
  step_skipped: "Etapa ignorada",
  document_linked: "Documento vinculado",
  note_added: "Nota adicionada"
};

const actionLabels: Record<string, string> = {
  create_workflow: "Criação do processo",
  execute_step: "Execucao de etapa",
  approve_step: "Aprovação de etapa",
  reject_step: "Rejeicao de etapa",
  return_step: "Devolucao de etapa",
  cancel_workflow: "Cancelamento do processo"
};

const admissionProcessStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  documents_requested: "Documentos solicitados",
  documents_under_review: "Documentos em conferência",
  sent_to_accounting: "Enviado para contabilidade administrativa",
  registration_pending: "Registro pendente",
  registered: "Registro concluido",
  onboarding_ready: "Onboarding pronto",
  completed: "Concluido",
  cancelled: "Cancelado"
};

const admissionAuxiliaryStatusLabels: Record<string, string> = {
  not_started: "Não iniciado",
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluido",
  blocked: "Bloqueado",
  waived: "Dispensado",
  cancelled: "Cancelado"
};

const admissionChecklistStatusLabels: Record<string, string> = {
  pending: "Pendente",
  requested: "Solicitado",
  received: "Recebido",
  under_review: "Em conferência",
  approved: "Aprovado",
  rejected: "Rejeitado",
  waived: "Dispensado",
  completed: "Concluido",
  not_applicable: "Não aplicável",
  cancelled: "Cancelado"
};

const admissionChecklistAllowedStatuses: Record<string, AdmissionChecklistStatus[]> = {
  request_documents: ["requested", "completed", "waived"],
  review_documents: ["under_review", "approved", "rejected", "waived"],
  send_to_accounting: ["requested", "completed", "waived"],
  confirm_registration: ["completed", "waived"],
  occupational_health_aso: ["requested", "completed", "waived"],
  uniform_delivery: ["completed", "waived"],
  start_onboarding: ["completed", "waived"]
};

const admissionPersistentChecklistGroups: Array<{
  title: string;
  description: string;
  itemKeys: string[];
}> = [
  {
    title: "Documentos admissionais",
    description: "Controle operacional para solicitar e conferir documentos antes do registro. Ainda não cria documentos reais nesta etapa.",
    itemKeys: ["request_documents", "review_documents"]
  },
  {
    title: "Contabilidade e registro",
    description: "Controle administrativo interno de envio e retorno de registro. Não envolve folha, eSocial, cálculo ou valores.",
    itemKeys: ["send_to_accounting", "confirm_registration"]
  },
  {
    title: "Saúde ocupacional",
    description: "Acompanhamento visual do ASO admissional. Ainda não cria ASO real.",
    itemKeys: ["occupational_health_aso"]
  },
  {
    title: "Uniforme operacional",
    description: "Uniforme e obrigação operacional padrão, separado de EPI técnico.",
    itemKeys: ["uniform_delivery"]
  },
  {
    title: "Onboarding",
    description: "Preparação para início do onboarding após registro. Ainda não cria onboarding real.",
    itemKeys: ["start_onboarding"]
  }
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível carregar os dados de RH.");
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
    throw new Error(body?.message ?? body?.error?.message ?? "Não foi possível executar a ação do processo.");
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

function admissionProcessStatusLabel(status: string) {
  return admissionProcessStatusLabels[status] ?? status;
}

function admissionAuxiliaryStatusLabel(status: string) {
  return admissionAuxiliaryStatusLabels[status] ?? status;
}

function admissionChecklistStatusLabel(status: string) {
  return admissionChecklistStatusLabels[status] ?? status;
}

function stepStatusLabel(status: string) {
  return stepStatusLabels[status] ?? status;
}

function eventTypeLabel(type: string) {
  return eventTypeLabels[type] ?? type;
}

function operationalEventLabel(type: string, workflowType?: string) {
  if (workflowType !== "admission") return eventTypeLabel(type);

  const admissionLabels: Record<string, string> = {
    workflow_created: "Processo admissional criado",
    workflow_opened: "Checklist admissional aberto",
    step_started: "Etapa admissional iniciada",
    step_completed: "Etapa admissional concluída",
    workflow_approved: "Validação registrada",
    workflow_returned: "Processo devolvido para ajuste",
    workflow_completed: "Admissão concluída",
    workflow_cancelled: "Admissão cancelada"
  };

  return admissionLabels[type] ?? eventTypeLabel(type);
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

function riskLabel(risk: string) {
  const labels: Record<string, string> = {
    low: "Baixo",
    medium: "Medio",
    high: "Alto",
    critical: "Critico"
  };
  return labels[risk] ?? risk;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    workflow: "Processo",
    step: "Etapa",
    event: "Histórico",
    notification: "Notificação"
  };
  return labels[entity] ?? entity;
}

function slaLabel(sla: WorkflowSla | null | undefined) {
  const status = sla?.status ?? "";
  return slaStatusLabels[status] ?? sla?.label ?? "Prazo não informado";
}

function stringifySafeValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "Valor estruturado";
}

function technicalLabel(key: string) {
  const labels: Record<string, string> = {
    actor_user_id: "usuário responsável",
    workflow_id: "processo",
    step_id: "etapa",
    event_id: "histórico",
    request_id: "rastreio",
    correlation_id: "correlação",
    workflow_type: "tipo de processo",
    workflow_status: "situação do processo",
    from_status: "situação anterior",
    to_status: "nova situação"
  };
  return labels[key] ?? key.replace(/_/g, " ");
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

function admissionCandidateName(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "candidate_name") || workflow.employee?.name || "Candidato registrado";
}

function admissionJobPosition(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "job_position") || "Cargo a confirmar";
}

function admissionDepartment(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "department") || "Departamento a confirmar";
}

function sourceJobOpeningWorkflowId(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "source_job_opening_workflow_id");
}

function sourceCandidateId(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "source_candidate_id");
}

function admissionDate(workflow: WorkflowDetail) {
  return metadataText(workflow.metadata, "admission_date");
}

type JobOpeningNextActionInfo = {
  title: string;
  description: string;
  tone: StatusTone;
};

function normalizeActionText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function jobOpeningNextActionInfo(
  workflow: WorkflowDetail,
  currentStep: WorkflowStep | null,
  summary: CandidateSummary | null | undefined
): JobOpeningNextActionInfo {
  const stepName = normalizeActionText(currentStep?.name);
  const stepStatus = currentStep?.status ?? "";
  const allowedActions = workflow.allowed_actions ?? {};
  const approvedCount = summary?.aprovado ?? 0;
  const candidateCount = summary?.total ?? 0;

  if (workflow.status === "completed") {
    return {
      title: "Vaga finalizada",
      description: "Consulte candidatos, histórico e admissão vinculada quando precisar revisar o processo.",
      tone: "success"
    };
  }

  if (workflow.status === "cancelled" || workflow.status === "rejected") {
    return {
      title: "Processo encerrado",
      description: "Esta vaga não possui ação operacional ativa neste momento.",
      tone: "danger"
    };
  }

  if (approvedCount > 0 || stepName.includes("admiss")) {
    return {
      title: approvedCount > 0 ? "Acompanhar admissão do candidato aprovado" : "Preparar etapa admissional",
      description: "Abra ou acompanhe a admissão do candidato aprovado e finalize a vaga quando a contratação estiver encaminhada.",
      tone: "success"
    };
  }

  if (workflow.status === "waiting_approval" || stepStatus === "waiting_approval" || allowedActions.approve || stepName.includes("aprov")) {
    return {
      title: allowedActions.approve ? "Aprovar abertura da vaga" : "Aguardar aprovação da vaga",
      description: allowedActions.approve
        ? "Revise a solicitação e aprove, devolva ou reprove conforme a alçada desta etapa."
        : "A solicitação já foi encaminhada e aguarda aprovação da etapa atual.",
      tone: "warning"
    };
  }

  if (candidateCount > 0 || stepName.includes("candidat") || stepName.includes("entrevista")) {
    return {
      title: "Acompanhar candidatos vinculados",
      description: "Continue triagem, entrevistas e parecer humano até registrar a decisão do candidato nesta vaga.",
      tone: "info"
    };
  }

  if (workflow.status === "open" || workflow.status === "in_progress" || stepName.includes("recrut") || stepName.includes("vaga aprovada")) {
    return {
      title: "Iniciar recrutamento",
      description: "Cadastre candidatos, registre origem e avance para avaliação humana quando houver interessados.",
      tone: "info"
    };
  }

  if (allowedActions.execute || stepName.includes("valid")) {
    return {
      title: "Validar solicitação pelo RH",
      description: "Confira cargo, departamento, quantidade, gestor e prioridade antes de encaminhar a vaga.",
      tone: "warning"
    };
  }

  return {
    title: currentStep ? "Avancar etapa atual" : "Acompanhar solicitação da vaga",
    description: currentStep
      ? "Use as ações disponíveis desta etapa para manter a vaga em movimento."
      : "A vaga ainda não possui etapa ativa exibida para o seu perfil.",
    tone: "visual"
  };
}

function jobOpeningNextAction(workflow: WorkflowDetail, currentStep: WorkflowStep | null, summary?: CandidateSummary | null) {
  const action = jobOpeningNextActionInfo(workflow, currentStep, summary);
  return `${action.title}: ${action.description}`;
}

function workflowReturnLink(workflow: WorkflowDetail, isJobOpening: boolean, isAdmission: boolean) {
  if (isJobOpening) return { href: "/rh/vagas", label: "Voltar para Vagas" };
  if (isAdmission) {
    const sourceWorkflowId = sourceJobOpeningWorkflowId(workflow);
    const candidateId = sourceCandidateId(workflow);
    if (sourceWorkflowId && candidateId) {
      return { href: `/rh/vagas/${sourceWorkflowId}/candidatos/${candidateId}`, label: "Voltar para candidato" };
    }
    if (sourceWorkflowId) return { href: `/rh/vagas/${sourceWorkflowId}/candidatos`, label: "Voltar para candidatos" };
    return { href: "/rh/vagas", label: "Voltar para Vagas" };
  }
  return { href: "/rh/inbox", label: "Voltar para fila" };
}

function jobOpeningTimelineStage(
  workflow: WorkflowDetail,
  currentStep: WorkflowStep | null,
  summary: CandidateSummaryResponse["summary"] | null | undefined
): HrRecruitmentStageKey {
  const stepName = currentStep?.name.toLowerCase() ?? "";
  if (stepName.includes("admiss")) return "admission";
  if ((summary?.aprovado ?? 0) > 0) return "candidate_approved";
  if ((summary?.total ?? 0) > 0 || stepName.includes("candidat") || stepName.includes("entrevista")) return "candidates";
  if (workflow.status === "waiting_approval" || currentStep?.status === "waiting_approval" || stepName.includes("aprov")) return "approval";
  if (workflow.status === "open" || workflow.status === "in_progress" || stepName.includes("recrut")) return "opening";
  return "request";
}

function admissionTimelineStage(workflow: WorkflowDetail, currentStep: WorkflowStep | null): HrRecruitmentStageKey {
  const stepName = currentStep?.name.toLowerCase() ?? "";
  if (workflow.status === "completed") return "active";
  if (stepName.includes("onboard")) return "onboarding";
  if (stepName.includes("registr")) return "registration";
  if (stepName.includes("contab")) return "accounting";
  if (stepName.includes("document") || stepName.includes("confer")) return "documents";
  return "admission";
}

function workflowProgress(steps: WorkflowStep[]) {
  if (!steps.length) return 0;
  return Math.round((steps.filter((step) => step.status === "completed").length / steps.length) * 100);
}

function stepHelperText(step: WorkflowStep | null) {
  if (!step) return "Nenhuma etapa ativa no momento.";
  if (step.status === "waiting_approval") return "Aguardando validação humana.";
  if (step.status === "returned") return "Etapa devolvida para ajuste.";
  if (step.status === "in_progress") return "Aguardando execução pelo responsável.";
  if (step.status === "pending") return "Etapa ainda não iniciada.";
  return "Etapa registrada no processo.";
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
      <SectionHeader title="Prazo para conclusão" description="Situação operacional do prazo principal do processo." icon={CalendarClock} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <InfoTile label="Status" value={slaLabel(sla)} icon={CalendarClock} />
        <InfoTile label="Vencimento" value={formatDueDate(sla?.due_at)} icon={FileClock} />
        <InfoTile label="Prazo restante" value={formatRelativeSla(sla)} icon={History} />
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
            <span className="block text-sm font-semibold text-foreground">Informações internas do processo</span>
            <span className="block text-xs text-muted-foreground">Dados internos de apoio, ocultos por padrão para a operação.</span>
          </span>
        </summary>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {entries.map(([key, value]) => (
            <StatusBadge key={key} status={String(value) === "redacted" ? "visual" : "info"} label={`${technicalLabel(key)}: ${stringifySafeValue(value)}`} />
          ))}
        </div>
      </details>
    </Card>
  );
}

function JobOpeningSummaryPanel({ workflow }: { workflow: WorkflowDetail }) {
  const metadata = workflow.metadata ?? {};
  const department = metadataText(metadata, "department") || "Não informado";
  const jobPosition = metadataText(metadata, "job_position") || "Não informado";
  const quantity = formatQuantity(metadataText(metadata, "requested_quantity"));
  const urgency = metadataText(metadata, "urgency");
  const requestedStartDate = metadataText(metadata, "requested_start_date");
  const managerUserId = metadataText(metadata, "manager_user_id");
  const managerName = workflow.manager_user?.name || (managerUserId ? "Gestor registrado" : "Não informado");
  const reason = metadataText(metadata, "reason");
  const justification = metadataText(metadata, "justification");
  const notes = metadataText(metadata, "notes");

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader title="Painel da solicitação de vaga" description="Dados principais para RH e gestores acompanharem a abertura da vaga." icon={BriefcaseBusiness} />
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
        <InfoTile label="Prazo" value={slaLabel(workflow.sla)} icon={FileClock} />
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
              <p className="text-xs font-semibold uppercase text-muted-foreground">Observações operacionais</p>
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
  candidates,
  isLoading,
  error
}: {
  workflowId: string;
  summary: CandidateSummaryResponse["summary"] | null;
  candidates: Candidate[];
  isLoading: boolean;
  error: unknown;
}) {
  const values = summary ?? { total: 0, triagem: 0, entrevista: 0, aprovado: 0, reprovado: 0 };
  const admissionProcessesQuery = useQuery({
    queryKey: ["hr", "admission-processes", "job-opening", workflowId],
    queryFn: async () => requestJson<AdmissionProcessesByJobOpeningResponse>(`/api/hr/admission-processes?jobOpeningWorkflowId=${workflowId}&pageSize=100`),
    enabled: values.aprovado > 0
  });
  const admissionProcesses = admissionProcessesQuery.data?.data;
  const admissionByCandidateId = useMemo(() => {
    const map = new Map<string, AdmissionProcessForCandidate>();
    for (const process of admissionProcesses ?? []) {
      if (process.source_candidate_id) map.set(process.source_candidate_id, process);
    }
    return map;
  }, [admissionProcesses]);
  const previewCandidates = useMemo(() => {
    const approved = candidates.filter((candidate) => candidate.status === "aprovado");
    const active = candidates.filter((candidate) => candidate.status !== "aprovado");
    return [...approved, ...active].slice(0, 4);
  }, [candidates]);

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SectionHeader title="Candidatos" description="Acompanhamento leve da vaga, sem ranking automático ou decisão por sistema." icon={UsersRound} />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/rh/vagas/${workflowId}/candidatos`}>
              <UsersRound className="h-4 w-4" />
              Ver candidatos
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
      {!isLoading && !error && previewCandidates.length ? (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Candidatos vinculados</p>
            {values.aprovado > 0 ? <StatusBadge status="success" label="Aprovado com ação admissional" /> : null}
          </div>
          <div className="grid gap-2 xl:grid-cols-2">
            {previewCandidates.map((candidate) => {
              const admissionWorkflowId = admissionByCandidateId.get(candidate.id)?.admission_workflow_id ?? null;
              return (
                <article key={candidate.id} className={cn("rounded-md border bg-background p-3", candidate.status === "aprovado" && "border-emerald-200 bg-emerald-50/60")}>
                  <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={candidateStatusTone(candidate.status)} label={candidateStatusLabel(candidate.status)} />
                        {candidate.status === "aprovado" && admissionWorkflowId ? <StatusBadge status="success" label="Admissão aberta" /> : null}
                      </div>
                      <p className="mt-2 break-words text-sm font-semibold text-foreground">{candidate.full_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.source} | {candidate.phone_redacted ? "Telefone restrito" : formatPhone(candidate.phone)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Parecer: {candidate.human_opinion || "sem parecer"}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                      {candidate.status === "aprovado" ? (
                        <HrCandidateAdmissionActionButton workflowId={workflowId} candidate={candidate} admissionWorkflowId={admissionWorkflowId} className="whitespace-nowrap" />
                      ) : (
                        <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                          <Link href={`/rh/vagas/${workflowId}/candidatos/${candidate.id}`}>Abrir candidato</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function hasEscalationAlert(escalation: WorkflowEscalation | null | undefined) {
  return Boolean(escalation?.overdue || escalation?.eligible || escalation?.level || escalation?.count);
}

function JobOpeningNextActionPanel({
  workflow,
  currentStep,
  summary
}: {
  workflow: WorkflowDetail;
  currentStep: WorkflowStep | null;
  summary: CandidateSummary | null;
}) {
  const action = jobOpeningNextActionInfo(workflow, currentStep, summary);
  const details = [
    currentStep?.name ? { label: "Etapa atual", value: currentStep.name, icon: ListChecks } : null,
    currentStep?.assigned_to ? { label: "Responsavel atual", value: currentStep.assigned_to, icon: UserRound } : null,
    { label: "Status", value: workflowStatusLabel(workflow.status), icon: CheckCircle2 },
    workflow.sla?.due_at ? { label: "Prazo", value: formatRelativeSla(workflow.sla), icon: CalendarClock } : null
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof ClipboardList }>;

  return (
    <Card className="min-w-0 border-primary/30 bg-primary/5 p-4 shadow-sm shadow-primary/10">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <SquareCheckBig className="h-5 w-5 shrink-0 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Próxima ação</h2>
            <StatusBadge status={action.tone} label="Ação operacional" />
          </div>
          <p className="break-words text-lg font-semibold text-foreground">{action.title}</p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{action.description}</p>
        </div>
        {details.length ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[440px]">
            {details.map((detail) => (
              <InfoTile key={detail.label} label={detail.label} value={detail.value} icon={detail.icon} />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function EscalationPanel({ escalation, hideWhenQuiet = false }: { escalation: WorkflowEscalation | null | undefined; hideWhenQuiet?: boolean }) {
  const isEscalated = hasEscalationAlert(escalation);

  if (hideWhenQuiet && !isEscalated) return null;

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Prioridade e atrasos" description="Acompanhamento do prazo e dos sinais que pedem atenção." icon={ShieldAlert} />
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <InfoTile label="Estado" value={isEscalated ? "Requer acompanhamento" : "Sem alerta"} icon={ShieldAlert} />
        <InfoTile label="Atenção" value={escalation?.level ? `Nível ${escalation.level}` : "-"} icon={ListChecks} />
        <InfoTile label="Ocorrências" value={String(escalation?.count ?? 0)} icon={History} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={escalation?.overdue ? "danger" : isEscalated ? "warning" : "visual"} label={escalation?.label ?? (isEscalated ? "Acompanhar prazo" : "Sem alerta de prazo")} />
      </div>
    </Card>
  );
}

function AdmissionSummaryPanel({ workflow, currentStep }: { workflow: WorkflowDetail; currentStep: WorkflowStep | null }) {
  const progress = workflowProgress(workflow.steps);

  return (
    <Card className="min-w-0 border-border/80 bg-muted/10 p-4 shadow-sm shadow-primary/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={statusTone(workflow.status)} label={workflowStatusLabel(workflow.status)} />
            <StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} />
            <StatusBadge status="visual" label={`${progress}% do checklist`} />
          </div>
          <h2 className="mt-3 break-words text-xl font-semibold text-foreground">Admissão de {admissionCandidateName(workflow)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {admissionJobPosition(workflow)} | {admissionDepartment(workflow)} | {unitDisplayName(workflow)}
          </p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:w-[430px]">
          <InfoTile label="Etapa atual" value={currentStep?.name ?? "Sem etapa atual"} icon={ListChecks} />
          <InfoTile label="Prazo" value={formatRelativeSla(workflow.sla)} icon={CalendarClock} />
          <InfoTile label="Data prevista" value={formatDate(admissionDate(workflow))} icon={FileClock} />
          <InfoTile label="Responsável" value={currentStep?.assigned_to ?? "Não informado"} icon={UserRound} />
        </div>
      </div>
    </Card>
  );
}

function AdmissionNextStepCard({ currentStep }: { currentStep: WorkflowStep | null }) {
  return (
    <Card className="min-w-0 border-primary/30 bg-primary/5 p-4 shadow-sm shadow-primary/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <SquareCheckBig className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Próxima etapa</h2>
          </div>
          <p className="break-words text-xl font-semibold text-foreground">{currentStep?.name ?? "Nenhuma etapa ativa"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{stepHelperText(currentStep)}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
          <InfoTile label="Status" value={currentStep ? stepStatusLabel(currentStep.status) : "-"} icon={CheckCircle2} />
          <InfoTile label="Prazo" value={currentStep?.sla?.due_at ? formatRelativeSla(currentStep.sla) : "Sem prazo"} icon={CalendarClock} />
        </div>
      </div>
    </Card>
  );
}

function AdmissionPersistentPanel({
  lookup,
  detail,
  isLoading,
  isError
}: {
  lookup: AdmissionPersistentLookupResponse | undefined;
  detail: AdmissionPersistentDetailResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const queryClient = useQueryClient();
  const process = detail?.data.process ?? lookup?.data.process ?? null;
  const checklistTotal = detail?.data.summary.checklist.total ?? 0;
  const checklistItems = detail?.data.checklist ?? [];
  const completedChecklistItems = checklistItems.filter((item) => item.status === "completed" || item.status === "approved").length;
  const pendingChecklistItems = checklistItems.filter((item) => item.status === "pending" || item.status === "requested" || item.status === "received" || item.status === "under_review").length;
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<AdmissionPersistentChecklistItem | null>(null);
  const [checklistForm, setChecklistForm] = useState<AdmissionChecklistUpdateForm>({
    status: "",
    notes: "",
    waiverReason: "",
    rejectionReason: ""
  });
  const [checklistFeedback, setChecklistFeedback] = useState<string | null>(null);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const groupedChecklistItems = admissionPersistentChecklistGroups.map((group) => ({
    ...group,
    items: group.itemKeys
      .map((itemKey) => checklistItems.find((item) => item.item_key === itemKey))
      .filter((item): item is AdmissionPersistentChecklistItem => Boolean(item))
  }));
  const selectedAllowedStatuses = selectedChecklistItem ? admissionChecklistAllowedStatuses[selectedChecklistItem.item_key] ?? [] : [];
  const requiresWaiverReason = checklistForm.status === "waived";
  const requiresRejectionReason = checklistForm.status === "rejected";
  const checklistMutation = useMutation({
    mutationFn: async (input: {
      processId: string;
      itemId: string;
      status: AdmissionChecklistStatus;
      notes?: string;
      waiverReason?: string;
      rejectionReason?: string;
    }) => {
      const response = await fetch(`/api/hr/admission-processes/${input.processId}/checklist/${input.itemId}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: input.status,
          notes: input.notes,
          waiverReason: input.waiverReason,
          rejectionReason: input.rejectionReason
        })
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Você não tem permissão para atualizar este item.");
        }

        if (response.status === 422) {
          throw new Error(body?.message ?? "Revise o status, motivo ou observação informada.");
        }

        throw new Error(body?.message ?? "Não foi possível atualizar o item do checklist admissional.");
      }

      return body as { data: AdmissionPersistentChecklistItem };
    },
    onSuccess: () => {
      setChecklistFeedback("Status do item atualizado com sucesso.");
      setChecklistError(null);
      setSelectedChecklistItem(null);
      setChecklistForm({ status: "", notes: "", waiverReason: "", rejectionReason: "" });

      if (process?.id) {
        void queryClient.invalidateQueries({ queryKey: ["hr", "admission-process", process.id] });
      }
    },
    onError: (error) => {
      setChecklistFeedback(null);
      setChecklistError(error instanceof Error ? error.message : "Não foi possível atualizar o item do checklist admissional.");
    }
  });

  function openChecklistUpdate(item: AdmissionPersistentChecklistItem) {
    const allowedStatuses = admissionChecklistAllowedStatuses[item.item_key] ?? [];

    setSelectedChecklistItem(item);
    setChecklistFeedback(null);
    setChecklistError(null);
    setChecklistForm({
      status: allowedStatuses.includes(item.status) ? item.status : allowedStatuses[0] ?? "",
      notes: item.notes ?? "",
      waiverReason: "",
      rejectionReason: ""
    });
  }

  function closeChecklistUpdate() {
    if (checklistMutation.isPending) return;
    setSelectedChecklistItem(null);
    setChecklistError(null);
  }

  function submitChecklistUpdate() {
    if (!process?.id || !selectedChecklistItem || !checklistForm.status) return;

    if (requiresWaiverReason && checklistForm.waiverReason.trim().length < 3) {
      setChecklistError("Informe o motivo da dispensa antes de salvar.");
      return;
    }

    if (requiresRejectionReason && checklistForm.rejectionReason.trim().length < 3) {
      setChecklistError("Informe o motivo da reprovação antes de salvar.");
      return;
    }

    setChecklistError(null);
    checklistMutation.mutate({
      processId: process.id,
      itemId: selectedChecklistItem.id,
      status: checklistForm.status,
      notes: checklistForm.notes.trim() || undefined,
      waiverReason: checklistForm.waiverReason.trim() || undefined,
      rejectionReason: checklistForm.rejectionReason.trim() || undefined
    });
  }

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader
        title="Admissão persistente"
        description="Esta área acompanha manualmente o checklist admissional persistente. Atualizar um item não cria documentos, ASO, uniforme, onboarding, folha ou eSocial."
        icon={ClipboardList}
      />

      {isError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Não foi possível carregar a admissão persistente agora.
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 rounded-md border bg-background p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando leitura persistente...
        </div>
      ) : process ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={statusTone(process.status)} label={admissionProcessStatusLabel(process.status)} />
            <StatusBadge status="info" label="Atualização manual" />
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Status do processo" value={admissionProcessStatusLabel(process.status)} icon={CheckCircle2} />
            <InfoTile label="Etapa atual" value={admissionProcessStatusLabel(process.current_step)} icon={ListChecks} />
            <InfoTile label="Documentos" value={admissionAuxiliaryStatusLabel(process.documents_status)} icon={ClipboardList} />
            <InfoTile label="Contabilidade adm." value={admissionAuxiliaryStatusLabel(process.accounting_status)} icon={FileClock} />
            <InfoTile label="Registro" value={admissionAuxiliaryStatusLabel(process.registration_status)} icon={SquareCheckBig} />
            <InfoTile label="Saúde ocupacional" value={admissionAuxiliaryStatusLabel(process.occupational_health_status)} icon={ShieldAlert} />
            <InfoTile label="Uniforme" value={admissionAuxiliaryStatusLabel(process.uniform_status)} icon={UsersRound} />
            <InfoTile label="Onboarding" value={admissionAuxiliaryStatusLabel(process.onboarding_status)} icon={UserPlus} />
            <InfoTile label="Checklist persistente" value={`${checklistTotal} ${checklistTotal === 1 ? "item" : "itens"}`} icon={ListChecks} />
          </div>
          <p className="text-xs text-muted-foreground">
            Esta leitura vem da foundation persistente e não altera o workflow visual atual.
          </p>
          {checklistFeedback ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{checklistFeedback}</div> : null}
          {checklistItems.length ? (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status="info" label="Checklist operacional" />
                    <StatusBadge status="visual" label="Não gera pendências reais" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Checklist persistente criado para acompanhamento operacional. Nesta etapa, atualizar status não gera documentos, ASO, uniforme, onboarding, folha ou eSocial.
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2 sm:min-w-[360px]">
                  <InfoTile label="Total" value={String(checklistItems.length)} icon={ListChecks} />
                  <InfoTile label="Concluidos" value={String(completedChecklistItems)} icon={CheckCircle2} />
                  <InfoTile label="Pendentes" value={String(pendingChecklistItems)} icon={FileClock} />
                </div>
              </div>
              <div className="space-y-3">
                {groupedChecklistItems.map((group) => (
                  <section key={group.title} className="rounded-md border bg-background p-3">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                    </div>
                    {group.items.length ? (
                      <div className="space-y-2">
                        {group.items.map((item) => (
                          <article key={item.id} className="rounded-md border bg-muted/20 p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="break-words text-sm font-semibold text-foreground">{item.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Atualização manual do item. Ainda não executa geração real nesta etapa.</p>
                                {item.notes ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                              </div>
                              <div className="flex shrink-0 flex-wrap items-start gap-1.5">
                                <StatusBadge status={statusTone(item.status)} label={admissionChecklistStatusLabel(item.status)} />
                                {item.blocks_activation ? <StatusBadge status="warning" label="Bloqueia ativação futura" /> : null}
                                <Button type="button" variant="outline" size="sm" onClick={() => openChecklistUpdate(item)} disabled={checklistMutation.isPending}>
                                  Atualizar status
                                </Button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">Nenhum item vinculado a este grupo.</p>
                    )}
                  </section>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="visual" label="Somente leitura" />
            <StatusBadge status="info" label="Foundation pronta" />
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <InfoTile label="Processo admissional persistente" value="Ainda não criado" icon={ClipboardList} />
            <InfoTile label="Checklist persistente" value="0 itens" icon={ListChecks} />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>A foundation já esta pronta, mas esta etapa ainda não gera pendências reais.</p>
            <p className="mt-1">O fluxo atual continua usando o workflow visual.</p>
            <p className="mt-1">O checklist será criado quando a admissão persistente for inicializada pelo fluxo de conversão.</p>
          </div>
        </div>
      )}

      <HrOperationalModal
        open={Boolean(selectedChecklistItem)}
        title={selectedChecklistItem ? `Atualizar status - ${selectedChecklistItem.title}` : "Atualizar status"}
        description="Esta ação atualiza apenas o checklist admissional. Ela não gera documento, ASO, uniforme, onboarding, folha ou eSocial."
        onClose={closeChecklistUpdate}
        size="lg"
      >
        {selectedChecklistItem ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoTile label="Status atual" value={admissionChecklistStatusLabel(selectedChecklistItem.status)} icon={CheckCircle2} />
              <InfoTile label="Tipo" value={selectedChecklistItem.item_type.replace(/_/g, " ")} icon={ClipboardList} />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              <p>Esta atualização e operacional e manual.</p>
              <p className="mt-1">Documentos admissionais: não cria documentos reais.</p>
              <p className="mt-1">Contabilidade e registro: não envolve folha, eSocial, cálculo ou valores.</p>
              <p className="mt-1">Saúde ocupacional: não cria ASO real.</p>
              <p className="mt-1">Uniforme operacional: separado de EPI técnico.</p>
              <p className="mt-1">Onboarding: não cria onboarding real.</p>
            </div>

            <Field label="Novo status">
              <SelectField
                value={checklistForm.status}
                onChange={(event) =>
                  setChecklistForm((current) => ({
                    ...current,
                    status: event.target.value as AdmissionChecklistStatus,
                    waiverReason: event.target.value === "waived" ? current.waiverReason : "",
                    rejectionReason: event.target.value === "rejected" ? current.rejectionReason : ""
                  }))
                }
                disabled={checklistMutation.isPending}
              >
                {selectedAllowedStatuses.map((status) => (
                  <option key={status} value={status}>
                    {admissionChecklistStatusLabel(status)}
                  </option>
                ))}
              </SelectField>
            </Field>

            <Field label="Observação operacional">
              <TextArea
                value={checklistForm.notes}
                onChange={(event) => setChecklistForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Use apenas contexto operacional necessário. Não informe CPF, salário, folha, eSocial ou dados bancários."
                disabled={checklistMutation.isPending}
              />
            </Field>

            {requiresWaiverReason ? (
              <Field label="Motivo da dispensa">
                <TextArea
                  value={checklistForm.waiverReason}
                  onChange={(event) => setChecklistForm((current) => ({ ...current, waiverReason: event.target.value }))}
                  placeholder="Informe o motivo administrativo da dispensa"
                  disabled={checklistMutation.isPending}
                />
              </Field>
            ) : null}

            {requiresRejectionReason ? (
              <Field label="Motivo da reprovação">
                <TextArea
                  value={checklistForm.rejectionReason}
                  onChange={(event) => setChecklistForm((current) => ({ ...current, rejectionReason: event.target.value }))}
                  placeholder="Informe o motivo administrativo da reprovação"
                  disabled={checklistMutation.isPending}
                />
              </Field>
            ) : null}

            {checklistError ? <ErrorMessage message={checklistError} /> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeChecklistUpdate} disabled={checklistMutation.isPending}>
                Cancelar
              </Button>
              <Button type="button" onClick={submitChecklistUpdate} disabled={checklistMutation.isPending || !checklistForm.status}>
                {checklistMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SquareCheckBig className="h-4 w-4" />}
                Salvar status
              </Button>
            </div>
          </div>
        ) : null}
      </HrOperationalModal>
    </Card>
  );
}

function AdmissionChecklistPanel({ workflow }: { workflow: WorkflowDetail }) {
  const currentStepId = workflow.current_step_id;

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Checklist admissional" description="Etapas operacionais para acompanhar a admissão até o cadastro funcional futuro." icon={ListChecks} />
      {workflow.steps.length ? (
        <div className="space-y-3">
          {workflow.steps.map((step) => {
            const isCurrent = step.id === currentStepId;
            const isDone = step.status === "completed";

            return (
              <article key={step.id} className={cn("rounded-md border bg-background p-3", isCurrent && "border-primary/40 bg-primary/5")}>
                <div className="flex gap-3">
                  <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", isDone ? "border-emerald-300 bg-emerald-50 text-emerald-700" : isCurrent ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : step.sequence}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-foreground">{step.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{stepHelperText(step)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {isCurrent ? <StatusBadge status="info" label="Etapa atual" /> : null}
                        <StatusBadge status={statusTone(step.status)} label={stepStatusLabel(step.status)} />
                        <StatusBadge status={slaTone(step.sla?.status)} label={slaLabel(step.sla)} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <p>Responsável: {step.assigned_to ?? "Não informado"}</p>
                      <p>Prazo: {step.sla?.due_at ? formatRelativeSla(step.sla) : "Sem prazo"}</p>
                      <p>Conclusao: {formatDateTime(step.completed_at)}</p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Sem checklist" description="O sistema não retornou etapas para esta admissão." />
      )}
    </Card>
  );
}

function StepsPanel({ workflow, collapsed = false }: { workflow: WorkflowDetail; collapsed?: boolean }) {
  const currentStepId = workflow.current_step_id;

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <details open={!collapsed}>
        <summary className="cursor-pointer list-none p-4">
          <SectionHeader title="Etapas do processo" description={collapsed ? "Sequência técnica recolhida para não dominar a operação diária." : "Sequência operacional das etapas protegidas pelo sistema."} icon={ListChecks} />
        </summary>
        {workflow.steps.length ? (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-y bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Ordem</th>
                <th className="px-4 py-3 font-semibold">Etapa</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Responsavel</th>
                <th className="px-4 py-3 font-semibold">Prazo</th>
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
                  <td className="px-4 py-3 text-muted-foreground">{step.assigned_to ?? "Não informado"}</td>
                  <td className="px-4 py-3"><StatusBadge status={slaTone(step.sla?.status)} label={slaLabel(step.sla)} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(step.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 pt-0">
          <EmptyState title="Sem etapas disponíveis" description="O sistema não retornou etapas para este processo." />
        </div>
      )}
      </details>
    </Card>
  );
}

function TimelinePanel({
  events,
  isLoading,
  error,
  workflowType
}: {
  events: TimelineEvent[];
  isLoading: boolean;
  error: unknown;
  workflowType?: string;
}) {
  const isAdmission = workflowType === "admission";

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <details>
        <summary className="cursor-pointer list-none">
          <SectionHeader
            title={isAdmission ? "Histórico operacional" : "Histórico do processo"}
            description={isAdmission ? "Movimentações registradas durante a admissão." : "Movimentações registradas durante o processo."}
            icon={History}
          />
        </summary>
        <div className="mt-4">
          {isLoading ? <LoadingTable label="Carregando histórico do processo..." /> : null}
          {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar histórico."} /> : null}
          {!isLoading && !error && !events.length ? <EmptyState title="Histórico vazio" description="Nenhum evento ativo foi retornado para este processo." /> : null}
          {events.length ? (
            <div className="space-y-3">
              {events.map((event) => (
                <article key={event.id} className="rounded-md border border-l-4 border-l-primary/50 bg-background p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{operationalEventLabel(event.event_type, workflowType)}</p>
                        {event.is_sensitive ? <StatusBadge status="warning" label="Sensivel" /> : null}
                      </div>
                      <p className="break-words text-sm text-muted-foreground">{event.summary}</p>
                      <p className="text-xs text-muted-foreground">Ator: {event.actor_name || (event.actor_user_id ? "Usuário registrado" : "Não informado")}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                  </div>
                  {technicalEntries(event.payload).length ? (
                    <details className="mt-3 rounded-md border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Rastreio técnico do evento</summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {technicalEntries(event.payload).map(([key, value]) => (
                          <StatusBadge key={key} status="visual" label={`${technicalLabel(key)}: ${stringifySafeValue(value)}`} />
                        ))}
                        {event.actor_user_id ? <StatusBadge status="visual" label={`usuário responsável: ${event.actor_user_id}`} /> : null}
                        {event.step_id ? <StatusBadge status="visual" label={`etapa: ${event.step_id}`} /> : null}
                        <StatusBadge status="visual" label={`processo: ${event.workflow_id}`} />
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
    <Card className="min-w-0 border-border/60 bg-muted/10 p-4 shadow-sm shadow-primary/5">
      <details>
        <summary className="cursor-pointer list-none">
          <SectionHeader title="Auditoria e rastreabilidade" description="Registros internos recolhidos por padrão para preservar a leitura operacional." icon={Lock} />
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
                        <StatusBadge status={riskTone(log.risk_level)} label={riskLabel(log.risk_level)} />
                        <StatusBadge status="visual" label={entityLabel(log.entity_type)} />
                      </div>
                      <p className="break-words text-xs text-muted-foreground">Usuário: {log.actor_user_id ? "Usuário registrado" : "Não informado"}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                  </div>
                  <details className="mt-3 rounded-md border bg-muted/20 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Rastreio técnico da auditoria</summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {log.actor_user_id ? <StatusBadge status="visual" label={`usuário responsável: ${log.actor_user_id}`} /> : null}
                      {log.workflow_id ? <StatusBadge status="visual" label={`processo: ${log.workflow_id}`} /> : null}
                      {log.step_id ? <StatusBadge status="visual" label={`etapa: ${log.step_id}`} /> : null}
                      {log.event_id ? <StatusBadge status="visual" label={`histórico: ${log.event_id}`} /> : null}
                      {log.request_id ? <StatusBadge status="visual" label={`rastreio: ${log.request_id}`} /> : null}
                      {log.correlation_id ? <StatusBadge status="visual" label={`correlação: ${log.correlation_id}`} /> : null}
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
  if (!isLoading && !error && !notifications.length) return null;

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <SectionHeader title="Notificações" description="Avisos relacionados ao processo, quando disponíveis." icon={Bell} />
      {isLoading ? <LoadingTable label="Carregando notificações do processo..." /> : null}
      {error ? <ErrorMessage message={error instanceof Error ? error.message : "Erro ao carregar notificações."} /> : null}
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
      const replayed = response.idempotency?.replayed ? " A ação já havia sido registrada e foi reaproveitada com segurança." : "";
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
      setLocalError(error instanceof Error ? error.message : "Não foi possível executar a ação.");
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
      <SectionHeader title="Ações operacionais" description="Ações registradas com segurança para dar continuidade ao processo." icon={SquareCheckBig} />

      {!allowedActions.length ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Nenhuma ação operacional foi liberada pelo sistema para este processo no estado atual.
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
                Observação opcional
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Sem dados sensíveis; use apenas contexto operacional necessário"
                  disabled={mutation.isPending}
                />
              </label>

              {!stepIsValid ? <ErrorMessage message="Não há etapa atual disponível para esta ação." /> : null}
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
    label: "Concluir etapa",
    success: "Etapa concluída com sucesso.",
    confirmTitle: "Confirmar conclusão da etapa",
    confirmDescription: "A etapa atual será concluída no fluxo operacional.",
    icon: SquareCheckBig,
    variant: "default"
  },
  approve: {
    label: "Aprovar",
    success: "Etapa aprovada com sucesso.",
    confirmTitle: "Confirmar aprovação",
    confirmDescription: "A aprovação será registrada com auditoria e histórico.",
    icon: CheckCircle2,
    variant: "default"
  },
  reject: {
    label: "Rejeitar",
    success: "Etapa rejeitada com sucesso.",
    confirmTitle: "Confirmar rejeição",
    confirmDescription: "A rejeição exige motivo e será registrada na auditoria.",
    icon: SquareX,
    variant: "danger"
  },
  return: {
    label: "Devolver",
    success: "Etapa devolvida com sucesso.",
    confirmTitle: "Confirmar devolução",
    confirmDescription: "A devolução exige motivo para rastreabilidade.",
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
    queryFn: async () => requestJson<CandidateSummaryResponse>(`/api/hr/workflows/${workflowId}/candidates?page_size=8`),
    enabled: workflow?.workflow_type === "job_opening"
  });
  const persistentAdmissionQuery = useQuery({
    queryKey: ["hr", "admission-process", "workflow", workflowId],
    queryFn: async () => requestJson<AdmissionPersistentLookupResponse>(`/api/hr/admission-processes?workflowId=${workflowId}`),
    enabled: workflow?.workflow_type === "admission"
  });
  const persistentAdmissionProcessId = persistentAdmissionQuery.data?.data.process?.id ?? null;
  const persistentAdmissionDetailQuery = useQuery({
    queryKey: ["hr", "admission-process", persistentAdmissionProcessId],
    queryFn: async () => requestJson<AdmissionPersistentDetailResponse>(`/api/hr/admission-processes/${persistentAdmissionProcessId}`),
    enabled: workflow?.workflow_type === "admission" && Boolean(persistentAdmissionProcessId)
  });

  if (detailQuery.isLoading) {
    return <LoadingTable label="Carregando detalhe do processo RH..." />;
  }

  if (detailQuery.error) {
    return <ErrorMessage message={detailQuery.error instanceof Error ? detailQuery.error.message : "Erro ao carregar processo de RH."} />;
  }

  if (!workflow) {
    return <EmptyState title="Processo não encontrado" description="O processo não existe ou esta fora das unidades permitidas para o seu perfil." />;
  }

  const isJobOpening = workflow.workflow_type === "job_opening";
  const isAdmission = workflow.workflow_type === "admission";
  const returnLink = workflowReturnLink(workflow, isJobOpening, isAdmission);
  const candidateSummary = candidateSummaryQuery.data?.summary ?? null;

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 bg-card/95 p-4 shadow-sm shadow-primary/5 backdrop-blur">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            {isJobOpening ? (
              <HrRecruitmentBreadcrumb items={[{ label: "Vagas", href: "/rh/vagas" }, { label: "Detalhe da vaga" }]} />
            ) : isAdmission ? (
              <HrRecruitmentBreadcrumb items={[{ label: "Admissão" }]} />
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Link href="/rh" className="font-medium text-primary hover:underline">RH</Link>
                <span>/</span>
                <Link href="/rh/inbox" className="font-medium text-primary hover:underline">Fila de RH</Link>
                <span>/</span>
                <span>Resumo operacional</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-lg font-semibold text-foreground">{isAdmission ? "Processo admissional" : workflowTypeLabel(workflow.workflow_type)}</h2>
              <StatusBadge status={statusTone(workflow.status)} label={workflowStatusLabel(workflow.status)} />
              <StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} />
              {workflow.is_sensitive ? <StatusBadge status="warning" label="Restrito" /> : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Unidade: {unitDisplayName(workflow)}</span>
              <span>{isAdmission ? `Candidato: ${admissionCandidateName(workflow)}` : `Colaborador: ${isJobOpening ? "Não aplicável" : workflow.employee?.name ?? "Não vinculado"}`}</span>
              {workflow.employee?.redacted ? <span>Dado redigido por permissão</span> : null}
              <span>Criado em {formatDateTime(workflow.created_at)}</span>
              <span>Atualizado em {formatDateTime(workflow.updated_at)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/rh">
                <LayoutDashboard className="h-4 w-4" />
                Painel
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={returnLink.href}>
                <ArrowLeft className="h-4 w-4" />
                {returnLink.label}
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {isJobOpening ? (
        <HrRecruitmentGuidance
          where="Você esta no processo de abertura/recrutamento desta vaga."
          next={jobOpeningNextAction(workflow, currentStep, candidateSummary)}
        />
      ) : null}

      {isJobOpening ? <JobOpeningNextActionPanel workflow={workflow} currentStep={currentStep} summary={candidateSummary} /> : null}

      {isJobOpening ? (
        <HrRecruitmentTimeline
          mode="job_opening"
          currentStage={jobOpeningTimelineStage(workflow, currentStep, candidateSummary)}
          title="Linha do tempo da vaga"
          description="Acompanhe a vaga desde a solicitação até o início da admissão."
        />
      ) : null}

      {isAdmission ? (
        <HrRecruitmentGuidance
          where="Você esta no processo admissional. Aqui ficam as etapas antes do colaborador ficar ativo."
          next="Solicite documentos, acompanhe conferência, contabilidade, registro e onboarding sem gerar pendências automáticas novas nesta etapa."
        />
      ) : null}

      {isAdmission ? (
        <HrRecruitmentTimeline
          mode="admission"
          currentStage={admissionTimelineStage(workflow, currentStep)}
          title="Linha do tempo admissional"
          description="Visão visual da admissão, do processo iniciado até o colaborador ativo."
          note="Nesta fase, o RH acompanha documentos, conferência, envio para contabilidade, registro e início do onboarding. O controle detalhado de documentos admissionais será estruturado em etapa futura."
        />
      ) : null}

      {isAdmission ? (
        <>
          <AdmissionSummaryPanel workflow={workflow} currentStep={currentStep} />
          <AdmissionPersistentPanel
            lookup={persistentAdmissionQuery.data}
            detail={persistentAdmissionDetailQuery.data}
            isLoading={persistentAdmissionQuery.isLoading || persistentAdmissionDetailQuery.isLoading}
            isError={persistentAdmissionQuery.isError || persistentAdmissionDetailQuery.isError}
          />
          <HrJobRequirementPreview
            title="Regras sugeridas para admissão"
            description="Estas regras indicam o que poderá ser gerado na admissão deste colaborador. Nesta etapa ainda nada será criado automaticamente."
            jobTitle={metadataText(workflow.metadata, "job_position")}
            sector={metadataText(workflow.metadata, "department")}
            department={metadataText(workflow.metadata, "department")}
          />
          <AdmissionNextStepCard currentStep={currentStep} />
        </>
      ) : null}

      {isJobOpening ? <JobOpeningSummaryPanel workflow={workflow} /> : null}
      {isJobOpening ? (
        <CandidateSummaryPanel
          workflowId={workflow.id}
          summary={candidateSummaryQuery.data?.summary ?? null}
          candidates={candidateSummaryQuery.data?.data ?? []}
          isLoading={candidateSummaryQuery.isLoading}
          error={candidateSummaryQuery.error}
        />
      ) : null}

      {!isJobOpening && !isAdmission ? (
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <SectionHeader title="Resumo operacional" description="Dados principais do processo para acompanhamento do RH." icon={ClipboardList} />
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Tipo" value={workflowTypeLabel(workflow.workflow_type)} icon={ClipboardList} />
            <InfoTile label="Status" value={workflowStatusLabel(workflow.status)} icon={CheckCircle2} />
            <InfoTile label="Unidade" value={unitDisplayName(workflow)} icon={ListChecks} />
            <InfoTile label="Colaborador" value={workflow.employee?.name ?? "Não vinculado"} icon={UserRound} />
            <InfoTile label="Etapa atual" value={currentStep?.name ?? "Sem etapa atual"} icon={ListChecks} />
            <InfoTile label="Responsável atual" value={currentStep?.assigned_to ?? "Não informado"} icon={UserRound} />
            <InfoTile label="Criado em" value={formatDateTime(workflow.created_at)} icon={CalendarClock} />
            <InfoTile label="Atualizado em" value={formatDateTime(workflow.updated_at)} icon={History} />
          </div>
        </Card>
      ) : null}

      <WorkflowActionPanel workflow={workflow} currentStep={currentStep} onSuccess={() => undefined} />

      {isJobOpening ? (
        <EscalationPanel escalation={workflow.escalation} hideWhenQuiet />
      ) : isAdmission ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <SlaPanel sla={workflow.sla} />
          <EscalationPanel escalation={workflow.escalation} />
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <SlaPanel sla={workflow.sla} />
          <EscalationPanel escalation={workflow.escalation} />
        </div>
      )}

      {isAdmission ? <AdmissionChecklistPanel workflow={workflow} /> : !isJobOpening ? <StepsPanel workflow={workflow} /> : null}

      {!isJobOpening ? (
        <>
          <TimelinePanel
            events={timelineQuery.data?.data ?? []}
            isLoading={timelineQuery.isLoading}
            error={timelineQuery.error}
            workflowType={workflow.workflow_type}
          />

          <AuditPanel
            logs={auditQuery.data?.data ?? []}
            total={auditQuery.data?.pagination.total ?? 0}
            isLoading={auditQuery.isLoading}
            error={auditQuery.error}
          />

          <TechnicalMetadataPanel metadata={workflow.metadata} />
        </>
      ) : null}

      <NotificationsPanel
        notifications={notificationsQuery.data?.data ?? []}
        isLoading={notificationsQuery.isLoading}
        error={notificationsQuery.error}
      />
    </div>
  );
}
