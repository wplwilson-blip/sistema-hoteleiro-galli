import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";

export const HR_WORKFLOW_DASHBOARD_SELECT =
  "organization_id, unit_id, workflows_total, workflows_active, workflows_overdue, workflows_waiting_approval, workflows_completed, workflows_rejected, workflows_cancelled, workflows_returned, sla_overdue, sla_warning, sla_on_time, sla_completed_on_time, sla_completed_late, escalation_eligible, escalation_overdue, escalation_level_counts, notifications_pending, notifications_failed, notifications_unread, steps_waiting_approval, steps_in_progress, steps_returned, steps_overdue, generated_at";

export type HrWorkflowDashboardMetricRow = {
  organization_id: string;
  unit_id: string;
  workflows_total: number | string | null;
  workflows_active: number | string | null;
  workflows_overdue: number | string | null;
  workflows_waiting_approval: number | string | null;
  workflows_completed: number | string | null;
  workflows_rejected: number | string | null;
  workflows_cancelled: number | string | null;
  workflows_returned: number | string | null;
  sla_overdue: number | string | null;
  sla_warning: number | string | null;
  sla_on_time: number | string | null;
  sla_completed_on_time: number | string | null;
  sla_completed_late: number | string | null;
  escalation_eligible: number | string | null;
  escalation_overdue: number | string | null;
  escalation_level_counts: Record<string, unknown> | null;
  notifications_pending: number | string | null;
  notifications_failed: number | string | null;
  notifications_unread: number | string | null;
  steps_waiting_approval: number | string | null;
  steps_in_progress: number | string | null;
  steps_returned: number | string | null;
  steps_overdue: number | string | null;
  generated_at: string;
};

export type HrWorkflowDashboardScope = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  unitId?: string;
};

function toCount(value: number | string | null | undefined) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function emptyMetrics() {
  return {
    workflows: {
      total: 0,
      active: 0,
      overdue: 0,
      waiting_approval: 0,
      completed: 0,
      rejected: 0,
      cancelled: 0,
      returned: 0
    },
    sla: {
      overdue: 0,
      warning: 0,
      on_time: 0,
      completed_on_time: 0,
      completed_late: 0
    },
    escalation: {
      eligible: 0,
      overdue: 0,
      level_counts: {} as Record<string, number>
    },
    notifications: {
      pending: 0,
      failed: 0,
      unread: 0
    },
    steps: {
      waiting_approval: 0,
      in_progress: 0,
      returned: 0,
      overdue: 0
    }
  };
}

function addLevelCounts(target: Record<string, number>, source: Record<string, unknown> | null) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return;
  }

  for (const [level, rawCount] of Object.entries(source)) {
    if (!/^\d+$/.test(level)) {
      continue;
    }

    target[level] = (target[level] ?? 0) + toCount(rawCount as number | string | null);
  }
}

export function redactWorkflowDashboard(rows: HrWorkflowDashboardMetricRow[]) {
  const metrics = emptyMetrics();
  let generatedAt: string | null = null;
  const unitIds = new Set<string>();

  for (const row of rows) {
    unitIds.add(row.unit_id);
    if (!generatedAt || generatedAt < row.generated_at) {
      generatedAt = row.generated_at;
    }

    metrics.workflows.total += toCount(row.workflows_total);
    metrics.workflows.active += toCount(row.workflows_active);
    metrics.workflows.overdue += toCount(row.workflows_overdue);
    metrics.workflows.waiting_approval += toCount(row.workflows_waiting_approval);
    metrics.workflows.completed += toCount(row.workflows_completed);
    metrics.workflows.rejected += toCount(row.workflows_rejected);
    metrics.workflows.cancelled += toCount(row.workflows_cancelled);
    metrics.workflows.returned += toCount(row.workflows_returned);

    metrics.sla.overdue += toCount(row.sla_overdue);
    metrics.sla.warning += toCount(row.sla_warning);
    metrics.sla.on_time += toCount(row.sla_on_time);
    metrics.sla.completed_on_time += toCount(row.sla_completed_on_time);
    metrics.sla.completed_late += toCount(row.sla_completed_late);

    metrics.escalation.eligible += toCount(row.escalation_eligible);
    metrics.escalation.overdue += toCount(row.escalation_overdue);
    addLevelCounts(metrics.escalation.level_counts, row.escalation_level_counts);

    metrics.notifications.pending += toCount(row.notifications_pending);
    metrics.notifications.failed += toCount(row.notifications_failed);
    metrics.notifications.unread += toCount(row.notifications_unread);

    metrics.steps.waiting_approval += toCount(row.steps_waiting_approval);
    metrics.steps.in_progress += toCount(row.steps_in_progress);
    metrics.steps.returned += toCount(row.steps_returned);
    metrics.steps.overdue += toCount(row.steps_overdue);
  }

  return {
    ...metrics,
    scope: {
      unit_count: unitIds.size,
      unit_ids: Array.from(unitIds).sort()
    },
    generated_at: generatedAt ?? new Date().toISOString()
  };
}

export async function loadWorkflowDashboardMetrics(input: {
  supabase: SupabaseAdmin;
  scope: HrWorkflowDashboardScope;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return [];
  }

  let query = input.supabase
    .from("hr_workflow_dashboard_unit_metrics")
    .select(HR_WORKFLOW_DASHBOARD_SELECT);

  if (input.scope.unitId) {
    query = query.eq("unit_id", input.scope.unitId);
  } else if (!input.scope.isSuperAdmin) {
    query = query.in("unit_id", input.scope.accessibleUnitIds);
  }

  const { data, error } = await query;

  if (error) {
    logHrApiError("workflow_dashboard.metrics_lookup_failed", error);
    throw new Error("Nao foi possivel carregar o dashboard operacional de RH.");
  }

  return (data ?? []) as HrWorkflowDashboardMetricRow[];
}
