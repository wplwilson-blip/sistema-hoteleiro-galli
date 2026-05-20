export const HR_WORKFLOW_TYPES = [
  "admission",
  "termination",
  "transfer",
  "promotion",
  "job_position_change",
  "training",
  "vacation",
  "absence",
  "warning",
  "equipment_delivery",
  "general_note",
  "job_opening"
] as const;

export type HrWorkflowType = (typeof HR_WORKFLOW_TYPES)[number];

export const HR_WORKFLOW_STATUSES = [
  "draft",
  "open",
  "in_progress",
  "waiting_approval",
  "returned",
  "completed",
  "cancelled",
  "rejected"
] as const;

export type HrWorkflowStatus = (typeof HR_WORKFLOW_STATUSES)[number];

export const HR_WORKFLOW_STEP_STATUSES = [
  "pending",
  "in_progress",
  "waiting_approval",
  "returned",
  "completed",
  "skipped",
  "cancelled"
] as const;

export type HrWorkflowStepStatus = (typeof HR_WORKFLOW_STEP_STATUSES)[number];

export const HR_WORKFLOW_SLA_STATUSES = ["on_time", "warning", "overdue", "completed_on_time", "completed_late", "cancelled"] as const;

export type HrWorkflowSlaStatus = (typeof HR_WORKFLOW_SLA_STATUSES)[number];

export const HR_WORKFLOW_EVENT_TYPES = [
  "workflow_created",
  "workflow_opened",
  "workflow_assigned",
  "workflow_status_changed",
  "workflow_due_date_changed",
  "workflow_submitted_for_approval",
  "workflow_approved",
  "workflow_returned",
  "workflow_rejected",
  "workflow_completed",
  "workflow_cancelled",
  "step_started",
  "step_completed",
  "step_rejected",
  "step_returned",
  "step_skipped",
  "document_linked",
  "note_added"
] as const;

export type HrWorkflowEventType = (typeof HR_WORKFLOW_EVENT_TYPES)[number];

export type HrWorkflowTypeConfig = {
  type: HrWorkflowType;
  label: string;
  is_sensitive: boolean;
  enabled: boolean;
  requires_employee: boolean;
  supports_functional_event: boolean;
};

const functionalEventTypes = new Set<HrWorkflowType>([
  "admission",
  "termination",
  "transfer",
  "promotion",
  "job_position_change",
  "training",
  "vacation",
  "absence",
  "warning"
]);

const sensitiveTypes = new Set<HrWorkflowType>(["termination", "absence", "warning"]);

export const HR_WORKFLOW_TYPE_CONFIGS: HrWorkflowTypeConfig[] = [
  { type: "admission", label: "Admissao", is_sensitive: false, enabled: true, requires_employee: false, supports_functional_event: true },
  { type: "termination", label: "Desligamento", is_sensitive: true, enabled: true, requires_employee: true, supports_functional_event: true },
  { type: "transfer", label: "Transferencia", is_sensitive: false, enabled: true, requires_employee: true, supports_functional_event: true },
  { type: "promotion", label: "Promocao", is_sensitive: false, enabled: true, requires_employee: true, supports_functional_event: true },
  {
    type: "job_position_change",
    label: "Mudanca de cargo",
    is_sensitive: false,
    enabled: true,
    requires_employee: true,
    supports_functional_event: true
  },
  { type: "training", label: "Treinamento", is_sensitive: false, enabled: true, requires_employee: false, supports_functional_event: true },
  { type: "vacation", label: "Ferias", is_sensitive: false, enabled: true, requires_employee: true, supports_functional_event: true },
  { type: "absence", label: "Ausencia ou afastamento", is_sensitive: true, enabled: true, requires_employee: true, supports_functional_event: true },
  { type: "warning", label: "Advertencia", is_sensitive: true, enabled: true, requires_employee: true, supports_functional_event: true },
  {
    type: "equipment_delivery",
    label: "Entrega de equipamento",
    is_sensitive: false,
    enabled: true,
    requires_employee: true,
    supports_functional_event: false
  },
  { type: "general_note", label: "Nota administrativa", is_sensitive: false, enabled: true, requires_employee: false, supports_functional_event: false },
  { type: "job_opening", label: "Solicitacao de vaga", is_sensitive: false, enabled: true, requires_employee: false, supports_functional_event: false }
];

export function isWorkflowTypeSensitive(type: HrWorkflowType) {
  return sensitiveTypes.has(type);
}

export function supportsFunctionalEvent(type: HrWorkflowType) {
  return functionalEventTypes.has(type);
}
