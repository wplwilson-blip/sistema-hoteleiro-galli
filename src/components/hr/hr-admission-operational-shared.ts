"use client";

import type { StatusBadge } from "@/components/common/status-badge";

export type AdmissionProcessStatus =
  | "draft"
  | "documents_requested"
  | "documents_under_review"
  | "sent_to_accounting"
  | "registration_pending"
  | "registered"
  | "onboarding_ready"
  | "completed"
  | "cancelled";

export type AdmissionAuxiliaryStatus = "not_started" | "pending" | "in_progress" | "completed" | "blocked" | "waived" | "cancelled";

export type AdmissionChecklistStatus =
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

export type AdmissionProcess = {
  id: string;
  unit_id: string;
  source_job_opening_workflow_id: string | null;
  source_candidate_id: string | null;
  admission_workflow_id: string | null;
  employee_id: string | null;
  job_title: string | null;
  cbo_code: string | null;
  department_name: string | null;
  status: AdmissionProcessStatus;
  current_step: string | null;
  expected_start_date: string | null;
  documents_status: AdmissionAuxiliaryStatus;
  accounting_status: AdmissionAuxiliaryStatus;
  registration_status: AdmissionAuxiliaryStatus;
  occupational_health_status: AdmissionAuxiliaryStatus;
  uniform_status: AdmissionAuxiliaryStatus;
  onboarding_status: AdmissionAuxiliaryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdmissionChecklistItem = {
  id: string;
  admission_process_id: string;
  item_type: string;
  item_key: string;
  title: string;
  description: string | null;
  requirement_level: "required" | "recommended" | "confirm_with_sst" | "conditional";
  status: AdmissionChecklistStatus;
  is_required: boolean;
  blocks_activation: boolean;
  due_at: string | null;
  completed_at: string | null;
  waiver_reason: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AdmissionWorkflowStep = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  step_order?: number | null;
  due_at?: string | null;
  completed_at?: string | null;
  assigned_to_user_id?: string | null;
};

export type AdmissionWorkflow = {
  id: string;
  title: string;
  description: string | null;
  workflow_type: string;
  status: string;
  priority?: string | null;
  unit_id: string;
  employee_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  due_date?: string | null;
  unit?: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
  steps?: AdmissionWorkflowStep[];
};

export type AdmissionStatusTone = Parameters<typeof StatusBadge>[0]["status"];

export type AdmissionStatusView = {
  label: string;
  tone: AdmissionStatusTone;
};

export const ADMISSION_BLOCKS = [
  {
    key: "documents",
    title: "Documentos",
    description: "Solicitação, recebimento e conferência dos documentos admissionais.",
    itemKeys: ["request_documents", "review_documents"]
  },
  {
    key: "occupational",
    title: "ASO",
    description: "Acompanhamento administrativo do exame admissional.",
    itemKeys: ["occupational_health_aso"]
  },
  {
    key: "internal_checks",
    title: "Checagens admissionais internas",
    description: "Validações internas antes da liberação para início.",
    itemKeys: ["sst_confirmation", "internal_review", "admission_review"]
  },
  {
    key: "accounting",
    title: "Contabilidade",
    description: "Envio administrativo das informações necessárias para registro.",
    itemKeys: ["send_to_accounting"]
  },
  {
    key: "registration",
    title: "Liberação para início",
    description: "Confirmação de registro concluído antes do início.",
    itemKeys: ["confirm_registration"]
  },
  {
    key: "uniform",
    title: "Uniforme operacional",
    description: "Entrega de uniforme padrão da unidade, separada de EPI técnico.",
    itemKeys: ["uniform_delivery"]
  },
  {
    key: "onboarding",
    title: "Onboarding",
    description: "Preparação para integração e primeiros passos do colaborador.",
    itemKeys: ["start_onboarding"]
  }
] as const;

const processStatusLabels: Record<AdmissionProcessStatus, AdmissionStatusView> = {
  draft: { label: "Preparando admissão", tone: "visual" },
  documents_requested: { label: "Documentos solicitados", tone: "info" },
  documents_under_review: { label: "Documentos em conferência", tone: "warning" },
  sent_to_accounting: { label: "Enviado para contabilidade", tone: "info" },
  registration_pending: { label: "Aguardando registro", tone: "warning" },
  registered: { label: "Registro concluído", tone: "success" },
  onboarding_ready: { label: "Pronto para onboarding", tone: "success" },
  completed: { label: "Admissão concluída", tone: "success" },
  cancelled: { label: "Admissão cancelada", tone: "danger" }
};

const workflowStatusLabels: Record<string, AdmissionStatusView> = {
  draft: { label: "Rascunho", tone: "visual" },
  open: { label: "Aberto", tone: "info" },
  in_progress: { label: "Em andamento", tone: "info" },
  waiting_approval: { label: "Aguardando aprovação", tone: "warning" },
  returned: { label: "Ajustes solicitados", tone: "warning" },
  completed: { label: "Concluído", tone: "success" },
  cancelled: { label: "Cancelado", tone: "danger" },
  rejected: { label: "Reprovado", tone: "danger" }
};

const auxiliaryStatusLabels: Record<AdmissionAuxiliaryStatus, AdmissionStatusView> = {
  not_started: { label: "Não iniciado", tone: "visual" },
  pending: { label: "Pendente", tone: "warning" },
  in_progress: { label: "Em andamento", tone: "info" },
  completed: { label: "Concluído", tone: "success" },
  blocked: { label: "Bloqueado", tone: "danger" },
  waived: { label: "Dispensado", tone: "visual" },
  cancelled: { label: "Cancelado", tone: "danger" }
};

const checklistStatusLabels: Record<AdmissionChecklistStatus, AdmissionStatusView> = {
  pending: { label: "Pendente", tone: "warning" },
  requested: { label: "Solicitado", tone: "info" },
  received: { label: "Recebido", tone: "info" },
  under_review: { label: "Em conferência", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Rejeitado", tone: "danger" },
  waived: { label: "Dispensado", tone: "visual" },
  completed: { label: "Concluído", tone: "success" },
  not_applicable: { label: "Não aplicável", tone: "visual" },
  cancelled: { label: "Cancelado", tone: "danger" }
};

const nextActionByProcessStatus: Record<AdmissionProcessStatus, string> = {
  draft: "Conferir dados da admissão e solicitar documentos admissionais.",
  documents_requested: "Acompanhar o recebimento dos documentos solicitados.",
  documents_under_review: "Conferir documentos recebidos e registrar pendências, se houver.",
  sent_to_accounting: "Acompanhar retorno administrativo da contabilidade.",
  registration_pending: "Confirmar conclusão do registro antes do início.",
  registered: "Confirmar uniforme operacional e preparar onboarding.",
  onboarding_ready: "Iniciar onboarding do colaborador.",
  completed: "Admissão concluída. Acompanhar rotina do colaborador quando necessário.",
  cancelled: "Admissão cancelada. Revisar histórico se necessário."
};

const auxiliaryByBlock: Record<string, keyof AdmissionProcess> = {
  documents: "documents_status",
  occupational: "occupational_health_status",
  accounting: "accounting_status",
  registration: "registration_status",
  uniform: "uniform_status",
  onboarding: "onboarding_status"
};

export function getAdmissionProcessStatusView(status?: AdmissionProcessStatus | null): AdmissionStatusView {
  return status ? processStatusLabels[status] ?? { label: "Status indefinido", tone: "visual" } : { label: "Sem processo admissional", tone: "visual" };
}

export function getAdmissionWorkflowStatusView(status?: string | null): AdmissionStatusView {
  return status ? workflowStatusLabels[status] ?? { label: "Em acompanhamento", tone: "info" } : { label: "Sem status", tone: "visual" };
}

export function getAdmissionChecklistStatusView(status?: AdmissionChecklistStatus | null): AdmissionStatusView {
  return status ? checklistStatusLabels[status] ?? { label: "Em acompanhamento", tone: "info" } : { label: "Pendente", tone: "warning" };
}

export function getAdmissionAuxiliaryStatusView(status?: AdmissionAuxiliaryStatus | null): AdmissionStatusView {
  return status ? auxiliaryStatusLabels[status] ?? { label: "Em acompanhamento", tone: "info" } : { label: "Não iniciado", tone: "visual" };
}

export function getBlockStatus(blockKey: string, process: AdmissionProcess | null, items: AdmissionChecklistItem[]): AdmissionStatusView {
  const activeItem = items.find((item) => !["completed", "approved", "waived", "not_applicable", "cancelled"].includes(item.status));
  if (activeItem) return getAdmissionChecklistStatusView(activeItem.status);

  if (items.length > 0) {
    const hasRejected = items.some((item) => item.status === "rejected");
    if (hasRejected) return checklistStatusLabels.rejected;
    const hasCompleted = items.some((item) => ["completed", "approved"].includes(item.status));
    return hasCompleted ? { label: "Concluído", tone: "success" } : getAdmissionChecklistStatusView(items[0]?.status);
  }

  const processField = auxiliaryByBlock[blockKey];
  const status = processField && process ? process[processField] : null;
  return typeof status === "string" ? getAdmissionAuxiliaryStatusView(status as AdmissionAuxiliaryStatus) : { label: "A acompanhar", tone: "visual" };
}

export function getMetadataText(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!metadata) return null;

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

export function getCandidateName(workflow?: AdmissionWorkflow | null) {
  const fromMetadata = getMetadataText(workflow?.metadata, ["candidate_name", "candidateName", "name"]);
  if (fromMetadata) return fromMetadata;

  const descriptionMatch = workflow?.description?.match(/Candidato:\s*([^\n\r]+)/i);
  if (descriptionMatch?.[1]?.trim()) return descriptionMatch[1].trim();

  const title = workflow?.title?.replace(/^Admiss[aã]o\s*[-–]\s*/i, "").trim();
  return title || "Candidato não identificado";
}

export function getJobTitle(process?: AdmissionProcess | null, workflow?: AdmissionWorkflow | null) {
  return process?.job_title || getMetadataText(workflow?.metadata, ["job_position", "jobTitle", "job_title"]) || "Cargo a confirmar";
}

export function getDepartment(process?: AdmissionProcess | null, workflow?: AdmissionWorkflow | null) {
  return process?.department_name || getMetadataText(workflow?.metadata, ["department", "department_name", "sector"]) || "Setor a confirmar";
}

export function getUnitLabel(workflow?: AdmissionWorkflow | null) {
  if (!workflow?.unit) return "Unidade a confirmar";
  return workflow.unit.name || workflow.unit.code || "Unidade a confirmar";
}

export function formatAdmissionDate(value?: string | null) {
  if (!value) return "A definir";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "A definir";

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export function getExpectedStartDate(process?: AdmissionProcess | null, workflow?: AdmissionWorkflow | null) {
  return process?.expected_start_date || getMetadataText(workflow?.metadata, ["admission_date", "expected_start_date", "startDate"]) || workflow?.due_date || null;
}

export function getNextAdmissionAction(process: AdmissionProcess | null, checklist: AdmissionChecklistItem[], workflow?: AdmissionWorkflow | null) {
  const pendingItem = checklist
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((item) => !["completed", "approved", "waived", "not_applicable", "cancelled"].includes(item.status));

  if (pendingItem) return pendingItem.title;
  if (process?.status) return nextActionByProcessStatus[process.status] ?? "Revisar andamento da admissão.";
  if (process?.current_step) return process.current_step;

  const currentStep = workflow?.steps?.find((step) => ["pending", "in_progress", "waiting_approval", "returned"].includes(step.status));
  return currentStep?.title ?? "Revisar andamento da admissão";
}

export function filterChecklistItemsForBlock(block: (typeof ADMISSION_BLOCKS)[number], checklist: AdmissionChecklistItem[]) {
  return checklist.filter((item) => block.itemKeys.includes(item.item_key as never) || (block.key === "internal_checks" && item.item_type === "sst_confirmation"));
}
