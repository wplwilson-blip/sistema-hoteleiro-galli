import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";

export const HR_WORKFLOW_ANALYTICS_WORKFLOW_SELECT =
  "organization_id, unit_id, workflow_id, workflow_type, status, priority, sla_status, sla_due_at, sla_minutes, escalation_enabled, escalation_level, escalation_max_level, created_at, started_at, completed_at, cancelled_at, is_active, is_overdue_active, completion_minutes, delay_minutes";

export const HR_WORKFLOW_ANALYTICS_STEP_SELECT =
  "organization_id, unit_id, workflow_id, step_id, step_code, step_order, status, requires_approval, sla_status, sla_due_at, sla_minutes, created_at, started_at, completed_at, returned_at, is_overdue, completion_minutes, delay_minutes";

export type HrWorkflowAnalyticsWorkflowFact = {
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  workflow_type: string;
  status: string;
  priority: string;
  sla_status: string | null;
  sla_due_at: string | null;
  sla_minutes: number | string | null;
  escalation_enabled: boolean;
  escalation_level: number | string | null;
  escalation_max_level: number | string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  is_active: boolean;
  is_overdue_active: boolean;
  completion_minutes: number | string | null;
  delay_minutes: number | string | null;
};

export type HrWorkflowAnalyticsStepFact = {
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  step_id: string;
  step_code: string | null;
  step_order: number | string;
  status: string;
  requires_approval: boolean;
  sla_status: string | null;
  sla_due_at: string | null;
  sla_minutes: number | string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  returned_at: string | null;
  is_overdue: boolean;
  completion_minutes: number | string | null;
  delay_minutes: number | string | null;
};

export type HrWorkflowAnalyticsScope = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  unitId?: string;
  from?: string;
  to?: string;
  workflowType?: string;
  status?: string;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inPeriod(value: string | null | undefined, from?: string, to?: string) {
  if (!value) return false;
  const date = value.slice(0, 10);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function increment(target: Record<string, number>, key: string | null | undefined) {
  const safeKey = key || "none";
  target[safeKey] = (target[safeKey] ?? 0) + 1;
}

function buildAverageByStatus(steps: HrWorkflowAnalyticsStepFact[]) {
  const grouped = new Map<string, number[]>();

  for (const step of steps) {
    const value = step.completion_minutes === null ? null : toNumber(step.completion_minutes);
    if (value === null) continue;
    grouped.set(step.status, [...(grouped.get(step.status) ?? []), value]);
  }

  return Object.fromEntries(Array.from(grouped.entries()).map(([status, values]) => [status, average(values)]));
}

export function redactWorkflowAnalytics(input: {
  workflowFacts: HrWorkflowAnalyticsWorkflowFact[];
  stepFacts: HrWorkflowAnalyticsStepFact[];
  scope: HrWorkflowAnalyticsScope;
}) {
  const workflows = input.workflowFacts;
  const steps = input.stepFacts;
  const unitIds = new Set(workflows.map((workflow) => workflow.unit_id));
  steps.forEach((step) => unitIds.add(step.unit_id));

  const createdInPeriod = workflows.filter((workflow) => inPeriod(workflow.created_at, input.scope.from, input.scope.to));
  const completedInPeriod = workflows.filter(
    (workflow) => workflow.status === "completed" && inPeriod(workflow.completed_at, input.scope.from, input.scope.to)
  );
  const active = workflows.filter((workflow) => workflow.is_active);
  const completed = workflows.filter((workflow) => workflow.status === "completed");
  const rejected = workflows.filter((workflow) => workflow.status === "rejected");
  const cancelled = workflows.filter((workflow) => workflow.status === "cancelled");
  const returned = workflows.filter((workflow) => workflow.status === "returned");
  const completedOnTime = workflows.filter((workflow) => workflow.sla_status === "completed_on_time");
  const completedLate = workflows.filter((workflow) => workflow.sla_status === "completed_late");
  const overdueActive = workflows.filter((workflow) => workflow.is_overdue_active);
  const completedWithSla = completedOnTime.length + completedLate.length;
  const completionDurations = completed
    .map((workflow) => (workflow.completion_minutes === null ? null : toNumber(workflow.completion_minutes)))
    .filter((value): value is number => value !== null);
  const stepDurations = steps
    .map((step) => (step.completion_minutes === null ? null : toNumber(step.completion_minutes)))
    .filter((value): value is number => value !== null);
  const delayValues = workflows.map((workflow) => toNumber(workflow.delay_minutes)).filter((value) => value > 0);
  const countByStatus: Record<string, number> = {};
  const countByWorkflowType: Record<string, number> = {};
  const countBySlaStatus: Record<string, number> = {};

  workflows.forEach((workflow) => {
    increment(countByStatus, workflow.status);
    increment(countByWorkflowType, workflow.workflow_type);
    increment(countBySlaStatus, workflow.sla_status);
  });

  return {
    volume: {
      total_workflows: workflows.length,
      workflows_created_in_period: createdInPeriod.length,
      workflows_completed_in_period: completedInPeriod.length,
      active_workflows: active.length,
      backlog_current: active.length
    },
    efficiency: {
      completion_rate: percentage(completed.length, workflows.length),
      rejection_rate: percentage(rejected.length, workflows.length),
      cancellation_rate: percentage(cancelled.length, workflows.length),
      return_rate: percentage(returned.length, workflows.length)
    },
    sla: {
      sla_compliance_rate: percentage(completedOnTime.length, completedWithSla),
      completed_on_time: completedOnTime.length,
      completed_late: completedLate.length,
      overdue_active: overdueActive.length,
      average_delay_minutes: average(delayValues)
    },
    time: {
      average_completion_minutes: average(completionDurations),
      median_completion_minutes: median(completionDurations),
      average_step_completion_minutes: average(stepDurations)
    },
    status: {
      count_by_status: countByStatus,
      count_by_workflow_type: countByWorkflowType,
      count_by_sla_status: countBySlaStatus
    },
    steps: {
      steps_waiting_approval: steps.filter((step) => step.status === "waiting_approval").length,
      steps_in_progress: steps.filter((step) => step.status === "in_progress").length,
      steps_returned: steps.filter((step) => step.status === "returned").length,
      steps_overdue: steps.filter((step) => step.is_overdue).length,
      average_step_time_by_status: buildAverageByStatus(steps)
    },
    productivity: {
      completed_workflows: completed.length,
      completed_steps: steps.filter((step) => step.status === "completed").length,
      active_backlog: active.length
    },
    scope: {
      unit_count: unitIds.size,
      unit_ids: Array.from(unitIds).sort(),
      from: input.scope.from ?? null,
      to: input.scope.to ?? null,
      workflow_type: input.scope.workflowType ?? null,
      status: input.scope.status ?? null
    },
    generated_at: new Date().toISOString()
  };
}

export async function loadWorkflowAnalyticsFacts(input: {
  supabase: SupabaseAdmin;
  scope: HrWorkflowAnalyticsScope;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return { workflowFacts: [], stepFacts: [] };
  }

  let workflowQuery = input.supabase
    .from("hr_workflow_analytics_workflow_facts")
    .select(HR_WORKFLOW_ANALYTICS_WORKFLOW_SELECT);
  let stepQuery = input.supabase.from("hr_workflow_analytics_step_facts").select(HR_WORKFLOW_ANALYTICS_STEP_SELECT);

  if (input.scope.unitId) {
    workflowQuery = workflowQuery.eq("unit_id", input.scope.unitId);
    stepQuery = stepQuery.eq("unit_id", input.scope.unitId);
  } else if (!input.scope.isSuperAdmin) {
    workflowQuery = workflowQuery.in("unit_id", input.scope.accessibleUnitIds);
    stepQuery = stepQuery.in("unit_id", input.scope.accessibleUnitIds);
  }

  if (input.scope.workflowType) workflowQuery = workflowQuery.eq("workflow_type", input.scope.workflowType);
  if (input.scope.status) workflowQuery = workflowQuery.eq("status", input.scope.status);
  if (input.scope.from) workflowQuery = workflowQuery.gte("created_at", `${input.scope.from}T00:00:00.000Z`);
  if (input.scope.to) workflowQuery = workflowQuery.lte("created_at", `${input.scope.to}T23:59:59.999Z`);

  const [workflowResult, stepResult] = await Promise.all([workflowQuery, stepQuery]);

  if (workflowResult.error) {
    logHrApiError("workflow_analytics.workflow_facts_failed", workflowResult.error);
    throw new Error("Nao foi possivel carregar analytics de workflows.");
  }

  if (stepResult.error) {
    logHrApiError("workflow_analytics.step_facts_failed", stepResult.error);
    throw new Error("Nao foi possivel carregar analytics de etapas.");
  }

  const workflowIds = new Set((workflowResult.data ?? []).map((workflow) => workflow.workflow_id));
  const stepFacts = ((stepResult.data ?? []) as HrWorkflowAnalyticsStepFact[]).filter((step) => workflowIds.has(step.workflow_id));

  return {
    workflowFacts: (workflowResult.data ?? []) as HrWorkflowAnalyticsWorkflowFact[],
    stepFacts
  };
}
