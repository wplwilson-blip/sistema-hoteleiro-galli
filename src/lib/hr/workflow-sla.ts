import type { HrWorkflowRow, HrWorkflowStepRow } from "@/lib/hr/workflow-data";
import type { HrWorkflowSlaStatus } from "@/lib/hr/workflow-types";

const warningThresholdRatio = 0.8;
const terminalCancelledWorkflowStatuses = new Set(["cancelled", "rejected"]);
const terminalCancelledStepStatuses = new Set(["cancelled", "skipped"]);

type SlaSubject = {
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at?: string | null;
  sla_due_at: string | null;
  sla_breached_at: string | null;
  sla_minutes: number | null;
};

function toTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function minutesBetween(left: number, right: number) {
  return Math.trunc((right - left) / 60000);
}

function resolveDueTime(subject: SlaSubject) {
  const persistedDue = toTime(subject.sla_due_at);
  if (persistedDue !== null) return persistedDue;

  if (!subject.sla_minutes) return null;

  const base = toTime(subject.started_at) ?? toTime(subject.created_at);
  return base === null ? null : base + subject.sla_minutes * 60000;
}

function computeActiveStatus(input: { subject: SlaSubject; now: number; dueTime: number }) {
  if (input.now > input.dueTime) {
    return "overdue" satisfies HrWorkflowSlaStatus;
  }

  const startTime = toTime(input.subject.started_at) ?? toTime(input.subject.created_at);
  if (startTime === null || input.dueTime <= startTime) {
    return "on_time" satisfies HrWorkflowSlaStatus;
  }

  const consumedRatio = (input.now - startTime) / (input.dueTime - startTime);
  return consumedRatio >= warningThresholdRatio ? "warning" : "on_time";
}

export function computeWorkflowSla(workflow: HrWorkflowRow, now = new Date()) {
  return computeSlaPayload({
    subject: workflow,
    now,
    cancelled: terminalCancelledWorkflowStatuses.has(workflow.status)
  });
}

export function computeStepSla(step: HrWorkflowStepRow, now = new Date()) {
  return computeSlaPayload({
    subject: step,
    now,
    cancelled: terminalCancelledStepStatuses.has(step.status)
  });
}

function computeSlaPayload(input: { subject: SlaSubject; now: Date; cancelled: boolean }) {
  if (!input.subject.sla_due_at && !input.subject.sla_minutes) {
    return null;
  }

  const nowTime = input.now.getTime();
  const dueTime = resolveDueTime(input.subject);
  const completedTime = toTime(input.subject.completed_at);
  const cancelledTime = toTime(input.subject.cancelled_at);
  const effectiveTime = completedTime ?? cancelledTime ?? nowTime;
  const status: HrWorkflowSlaStatus =
    input.cancelled
      ? "cancelled"
      : completedTime !== null && dueTime !== null
        ? completedTime <= dueTime
          ? "completed_on_time"
          : "completed_late"
        : dueTime !== null
          ? computeActiveStatus({ subject: input.subject, now: nowTime, dueTime })
          : "on_time";
  const minutesRemaining = dueTime === null || effectiveTime > dueTime ? null : minutesBetween(effectiveTime, dueTime);
  const minutesOverdue = dueTime !== null && effectiveTime > dueTime ? minutesBetween(dueTime, effectiveTime) : 0;
  const dueAt = dueTime === null ? null : new Date(dueTime).toISOString();

  return {
    status,
    due_at: dueAt,
    breached_at: minutesOverdue > 0 ? input.subject.sla_breached_at ?? dueAt : input.subject.sla_breached_at,
    minutes: input.subject.sla_minutes,
    minutes_remaining: minutesRemaining,
    minutes_overdue: minutesOverdue,
    is_overdue: status === "overdue" || status === "completed_late"
  };
}
