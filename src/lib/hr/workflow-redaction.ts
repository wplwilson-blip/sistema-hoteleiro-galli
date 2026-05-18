import {
  getCurrentWorkflowStep,
  type HrWorkflowActorSummary,
  type HrWorkflowEmployeeSummary,
  type HrWorkflowEventRow,
  type HrWorkflowRow,
  type HrWorkflowStepRow
} from "@/lib/hr/workflow-data";
import { isWorkflowTypeSensitive, type HrWorkflowType } from "@/lib/hr/workflow-types";

type MetadataField = {
  key: string;
  sensitive?: boolean;
};

const metadataSchemas: Record<HrWorkflowType, MetadataField[]> = {
  training: [
    { key: "training_name" },
    { key: "provider" },
    { key: "planned_date" },
    { key: "completed_date" },
    { key: "certificate_required" },
    { key: "training_category" }
  ],
  equipment_delivery: [
    { key: "equipment_type" },
    { key: "asset_tag" },
    { key: "delivery_date" },
    { key: "return_required" },
    { key: "condition" }
  ],
  admission: [
    { key: "admission_date" },
    { key: "job_position" },
    { key: "department" },
    { key: "contract_type" },
    { key: "notes", sensitive: true }
  ],
  termination: [
    { key: "effective_date" },
    { key: "termination_type", sensitive: true },
    { key: "reason_summary", sensitive: true },
    { key: "requires_director_approval" }
  ],
  transfer: [
    { key: "from_unit_id" },
    { key: "to_unit_id" },
    { key: "effective_date" },
    { key: "new_department" },
    { key: "reason_summary", sensitive: true }
  ],
  promotion: [
    { key: "current_position" },
    { key: "proposed_position" },
    { key: "effective_date" },
    { key: "justification", sensitive: true },
    { key: "requires_director_approval" }
  ],
  job_position_change: [
    { key: "current_position" },
    { key: "new_position" },
    { key: "effective_date" },
    { key: "change_reason" },
    { key: "notes", sensitive: true }
  ],
  vacation: [
    { key: "start_date" },
    { key: "end_date" },
    { key: "days" },
    { key: "coverage_notes", sensitive: true },
    { key: "manager_approval_required" }
  ],
  absence: [
    { key: "absence_start" },
    { key: "absence_end" },
    { key: "absence_type", sensitive: true },
    { key: "requires_document_review" },
    { key: "reason_summary", sensitive: true }
  ],
  warning: [
    { key: "warning_date" },
    { key: "warning_type", sensitive: true },
    { key: "reason_summary", sensitive: true },
    { key: "policy_reference", sensitive: true },
    { key: "formal_acknowledgement_required" }
  ],
  general_note: [
    { key: "note_category" },
    { key: "summary", sensitive: true },
    { key: "requires_follow_up" }
  ]
};

const eventPayloadKeys = new Set([
  "workflow_type",
  "workflow_id",
  "step_id",
  "step_code",
  "completion_kind",
  "reason_code",
  "from_status",
  "to_status",
  "title",
  "summary",
  "comment",
  "note",
  "rejected_step_id",
  "rejection_kind",
  "returned_step_id",
  "return_kind",
  "reopen_kind",
  "current_step_id",
  "workflow_status",
  "reason_present",
  "notes_present"
]);

export function isWorkflowSensitive(workflow: Pick<HrWorkflowRow, "workflow_type" | "is_sensitive">) {
  return workflow.is_sensitive || isWorkflowTypeSensitive(workflow.workflow_type);
}

function isSafePayloadValue(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function redactWorkflowMetadata(input: {
  workflowType: HrWorkflowType;
  metadata: Record<string, unknown> | null | undefined;
  canViewSensitive: boolean;
}) {
  const source = safeRecord(input.metadata);
  const result: Record<string, unknown> = {};

  for (const field of metadataSchemas[input.workflowType] ?? []) {
    if (!(field.key in source)) {
      continue;
    }

    result[field.key] = field.sensitive && !input.canViewSensitive ? "redacted" : source[field.key];
  }

  return result;
}

export function buildWorkflowAllowedActions(canViewSensitive: boolean) {
  return {
    view: true,
    viewSensitive: canViewSensitive,
    execute: false,
    approve: false,
    return: false,
    cancel: false
  };
}

export function redactWorkflowEmployee(input: {
  workflow: HrWorkflowRow;
  employee?: HrWorkflowEmployeeSummary | null;
  canViewSensitive: boolean;
}) {
  if (!input.employee) {
    return null;
  }

  const shouldRedact = isWorkflowSensitive(input.workflow) && !input.canViewSensitive;

  return {
    id: input.employee.id,
    name: shouldRedact ? "Redigido" : input.employee.full_name,
    unit_id: input.employee.unit_id,
    redacted: shouldRedact
  };
}

export function mapWorkflowStep(input: {
  step: HrWorkflowStepRow | undefined;
  workflowIsSensitive: boolean;
  canViewSensitive: boolean;
}) {
  const { step } = input;

  if (!step) {
    return null;
  }

  const isRedacted = (input.workflowIsSensitive || step.is_sensitive) && !input.canViewSensitive;

  return {
    id: step.id,
    step_key: isRedacted ? "" : step.step_code ?? "",
    name: isRedacted ? "Etapa restrita" : step.title,
    status: step.status,
    sequence: step.step_order,
    assigned_to: step.assigned_to_user_id,
    completed_at: step.completed_at,
    redacted: isRedacted
  };
}

export function redactWorkflowListItem(input: {
  workflow: HrWorkflowRow;
  employee?: HrWorkflowEmployeeSummary | null;
  steps: HrWorkflowStepRow[];
  canViewSensitive: boolean;
}) {
  const currentStep = getCurrentWorkflowStep(input.steps);
  const workflowIsSensitive = isWorkflowSensitive(input.workflow);

  return {
    id: input.workflow.id,
    organization_id: input.workflow.organization_id,
    unit_id: input.workflow.unit_id,
    workflow_type: input.workflow.workflow_type,
    status: input.workflow.status,
    employee: redactWorkflowEmployee(input),
    current_step: mapWorkflowStep({
      step: currentStep,
      workflowIsSensitive,
      canViewSensitive: input.canViewSensitive
    }),
    is_sensitive: workflowIsSensitive,
    created_at: input.workflow.created_at,
    updated_at: input.workflow.updated_at,
    allowed_actions: buildWorkflowAllowedActions(input.canViewSensitive)
  };
}

export function redactWorkflowDetail(input: {
  workflow: HrWorkflowRow;
  employee?: HrWorkflowEmployeeSummary | null;
  steps: HrWorkflowStepRow[];
  canViewSensitive: boolean;
}) {
  const currentStep = getCurrentWorkflowStep(input.steps);
  const workflowIsSensitive = isWorkflowSensitive(input.workflow);

  return {
    id: input.workflow.id,
    organization_id: input.workflow.organization_id,
    unit_id: input.workflow.unit_id,
    workflow_type: input.workflow.workflow_type,
    status: input.workflow.status,
    is_sensitive: workflowIsSensitive,
    employee: redactWorkflowEmployee(input),
    metadata: redactWorkflowMetadata({
      workflowType: input.workflow.workflow_type,
      metadata: input.workflow.metadata,
      canViewSensitive: input.canViewSensitive
    }),
    steps: input.steps.map((step) =>
      mapWorkflowStep({
        step,
        workflowIsSensitive,
        canViewSensitive: input.canViewSensitive
      })
    ),
    current_step_id: currentStep?.id ?? null,
    allowed_actions: buildWorkflowAllowedActions(input.canViewSensitive),
    created_at: input.workflow.created_at,
    updated_at: input.workflow.updated_at
  };
}

export function redactWorkflowEventPayload(input: {
  payload: Record<string, unknown> | null | undefined;
  canViewSensitive: boolean;
  eventIsSensitive: boolean;
}) {
  if (input.eventIsSensitive && !input.canViewSensitive) {
    return { redacted: true };
  }

  const source = safeRecord(input.payload);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!eventPayloadKeys.has(key) || !isSafePayloadValue(value)) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function redactWorkflowEvent(input: {
  event: HrWorkflowEventRow;
  actor?: HrWorkflowActorSummary | null;
  canViewSensitive: boolean;
}) {
  const isRedacted = input.event.is_sensitive && !input.canViewSensitive;

  return {
    id: input.event.id,
    event_type: input.event.event_type,
    workflow_id: input.event.workflow_id,
    step_id: input.event.workflow_step_id,
    actor_user_id: input.event.actor_user_id,
    actor_name: input.actor?.display_name ?? input.actor?.username ?? "",
    summary: isRedacted ? "Evento sensivel" : input.event.summary,
    is_sensitive: input.event.is_sensitive,
    payload: redactWorkflowEventPayload({
      payload: input.event.event_payload,
      canViewSensitive: input.canViewSensitive,
      eventIsSensitive: input.event.is_sensitive
    }),
    created_at: input.event.occurred_at
  };
}
