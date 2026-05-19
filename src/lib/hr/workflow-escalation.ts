import type { HrWorkflowRow, HrWorkflowStepRow } from "@/lib/hr/workflow-data";
import { computeStepSla, computeWorkflowSla } from "@/lib/hr/workflow-sla";

const workflowEscalationActiveStatuses = new Set(["open", "in_progress", "waiting_approval", "returned"]);
const stepEscalationActiveStatuses = new Set(["pending", "in_progress", "waiting_approval", "returned"]);

export function getWorkflowEscalationState(workflow: HrWorkflowRow, now = new Date()) {
  const sla = computeWorkflowSla(workflow, now);
  const active = workflowEscalationActiveStatuses.has(workflow.status);
  const eligible =
    workflow.escalation_enabled &&
    active &&
    workflow.escalation_level < workflow.escalation_max_level &&
    sla?.status === "overdue";

  return {
    enabled: workflow.escalation_enabled,
    eligible,
    level: workflow.escalation_level,
    max_level: workflow.escalation_max_level,
    count: workflow.escalation_count,
    last_escalation_at: workflow.escalation_last_at,
    unit_id: workflow.unit_id,
    reason: eligible ? "sla_overdue" : null
  };
}

export function getStepEscalationState(step: HrWorkflowStepRow, now = new Date()) {
  const sla = computeStepSla(step, now);
  const active = stepEscalationActiveStatuses.has(step.status);
  const eligible = step.escalation_enabled && active && sla?.status === "overdue";

  return {
    enabled: step.escalation_enabled,
    eligible,
    level: step.escalation_level,
    last_escalation_at: step.escalation_last_at,
    unit_id: step.unit_id,
    reason: eligible ? "sla_overdue" : null
  };
}

