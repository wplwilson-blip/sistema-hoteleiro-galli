import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";
import type { HrWorkflowEventType, HrWorkflowStatus, HrWorkflowStepStatus, HrWorkflowType } from "@/lib/hr/workflow-types";

export const HR_WORKFLOW_SELECT =
  "id, organization_id, unit_id, employee_id, workflow_number, workflow_type, title, description, status, priority, visibility_scope, is_sensitive, initiated_by, responsible_user_id, due_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by, cancellation_reason, metadata, created_at, updated_at, created_by, updated_by";

export const HR_WORKFLOW_STEP_SELECT =
  "id, organization_id, unit_id, workflow_id, employee_id, step_order, step_code, title, description, status, requires_approval, visibility_scope, is_sensitive, assigned_to_user_id, assigned_at, due_at, started_at, completed_at, completed_by, approved_at, approved_by, returned_at, returned_by, return_reason, metadata, created_at, updated_at";

export const HR_WORKFLOW_EVENT_SELECT =
  "id, organization_id, unit_id, workflow_id, workflow_step_id, employee_id, event_scope, event_type, from_status, to_status, summary, details, visibility_scope, is_sensitive, actor_user_id, occurred_at, event_payload, status, created_at, updated_at";

export type HrWorkflowRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string | null;
  workflow_number: string | null;
  workflow_type: HrWorkflowType;
  title: string;
  description: string | null;
  status: HrWorkflowStatus;
  priority: string;
  visibility_scope: string;
  is_sensitive: boolean;
  initiated_by: string | null;
  responsible_user_id: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type HrWorkflowStepRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  employee_id: string | null;
  step_order: number;
  step_code: string | null;
  title: string;
  description: string | null;
  status: HrWorkflowStepStatus;
  requires_approval: boolean;
  visibility_scope: string;
  is_sensitive: boolean;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
  return_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HrWorkflowEventRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  workflow_step_id: string | null;
  employee_id: string | null;
  event_scope: string;
  event_type: HrWorkflowEventType;
  from_status: string | null;
  to_status: string | null;
  summary: string;
  details: string | null;
  visibility_scope: string;
  is_sensitive: boolean;
  actor_user_id: string | null;
  occurred_at: string;
  event_payload: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type HrWorkflowEmployeeSummary = {
  id: string;
  full_name: string;
  unit_id: string | null;
};

export type HrWorkflowActorSummary = {
  id: string;
  display_name: string | null;
  username: string | null;
};

export function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export function toStartOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

export function toEndOfDay(value: string) {
  return `${value}T23:59:59.999Z`;
}

export async function loadWorkflowSteps(supabase: SupabaseAdmin, workflowIds: string[]) {
  if (!workflowIds.length) {
    return new Map<string, HrWorkflowStepRow[]>();
  }

  const { data, error } = await supabase
    .from("hr_workflow_steps")
    .select(HR_WORKFLOW_STEP_SELECT)
    .in("workflow_id", workflowIds)
    .is("deleted_at", null)
    .order("step_order", { ascending: true });

  if (error) {
    logHrApiError("workflows.steps_lookup_failed", error);
    throw new Error("Nao foi possivel carregar as etapas dos workflows.");
  }

  return groupStepsByWorkflow((data ?? []) as HrWorkflowStepRow[]);
}

export async function loadWorkflowEmployees(supabase: SupabaseAdmin, employeeIds: string[]) {
  if (!employeeIds.length) {
    return new Map<string, HrWorkflowEmployeeSummary>();
  }

  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, unit_id")
    .in("id", employeeIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("workflows.employees_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os colaboradores dos workflows.");
  }

  return new Map(((data ?? []) as HrWorkflowEmployeeSummary[]).map((employee) => [employee.id, employee]));
}

export async function loadWorkflowActors(supabase: SupabaseAdmin, userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, HrWorkflowActorSummary>();
  }

  const { data, error } = await supabase
    .from("app_users")
    .select("id, display_name, username")
    .in("id", userIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("workflows.actors_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os atores dos eventos.");
  }

  return new Map(((data ?? []) as HrWorkflowActorSummary[]).map((actor) => [actor.id, actor]));
}

export function groupStepsByWorkflow(steps: HrWorkflowStepRow[]) {
  const grouped = new Map<string, HrWorkflowStepRow[]>();

  for (const step of steps) {
    const current = grouped.get(step.workflow_id) ?? [];
    current.push(step);
    grouped.set(step.workflow_id, current);
  }

  return grouped;
}

export function getCurrentWorkflowStep(steps: HrWorkflowStepRow[]) {
  const activeStep = steps.find((step) => step.status === "in_progress" || step.status === "waiting_approval");
  if (activeStep) return activeStep;

  const returnedStep = steps.find((step) => step.status === "returned");
  if (returnedStep) return returnedStep;

  const pendingStep = steps.find((step) => step.status === "pending");
  if (pendingStep) return pendingStep;

  return steps
    .slice()
    .reverse()
    .find((step) => step.status === "completed" || step.status === "cancelled" || step.status === "skipped");
}
