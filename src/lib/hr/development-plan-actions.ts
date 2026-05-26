import "server-only";

import { HrAuthorizationError, assertCanAccessHrEmployee, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { developmentPlanDetailSelect, developmentPlanSelect, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { employeeEvaluationSelect } from "@/lib/hr/evaluations";
import type { developmentPlanItemPayloadSchema, developmentPlanPayloadSchema } from "@/lib/hr/evaluation-validation";
import type { z } from "zod";

type DevelopmentPlanPayload = z.infer<typeof developmentPlanPayloadSchema>;
type DevelopmentPlanItemPayload = z.infer<typeof developmentPlanItemPayloadSchema>;

export async function loadDevelopmentPlan(context: HrRequestContext, id: string, withItems = false) {
  const { data, error } = await context.supabase
    .from("employee_development_plans")
    .select(withItems ? developmentPlanDetailSelect : developmentPlanSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("development_plans.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o PDI.");
  }

  const plan = (data?.[0] as unknown as EmployeeDevelopmentPlanRow | undefined) ?? null;
  if (plan) assertCanAccessDevelopmentPlan(context, plan);
  return plan;
}

export function assertCanAccessDevelopmentPlan(context: HrRequestContext, plan: Pick<EmployeeDevelopmentPlanRow, "unit_id">) {
  if (context.isSuperAdmin) return;
  if (!plan.unit_id || !context.accessibleUnitIds.includes(plan.unit_id)) {
    throw new HrAuthorizationError("PDI nao encontrado.", 404);
  }
}

export async function prepareDevelopmentPlanWrite(context: HrRequestContext, payload: DevelopmentPlanPayload, existing?: EmployeeDevelopmentPlanRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) {
    throw new HrAuthorizationError("Colaborador sem organizacao ou unidade valida para PDI.", 422);
  }

  if (payload.evaluationId) {
    const { data, error } = await context.supabase
      .from("employee_evaluations")
      .select(employeeEvaluationSelect)
      .eq("id", payload.evaluationId)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      logHrApiError("development_plans.evaluation_lookup_failed", error);
      throw new Error("Nao foi possivel validar a avaliacao vinculada.");
    }
    if (!data?.[0]) throw new HrAuthorizationError("Avaliacao vinculada nao encontrada para o colaborador.", 404);
  }

  const status = payload.status;
  const openedAt = payload.openedAt ?? existing?.opened_at ?? new Date().toISOString();
  const closedAt = payload.closedAt ?? (status === "completed" && !existing?.closed_at ? new Date().toISOString() : existing?.closed_at ?? null);

  return {
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    evaluation_id: payload.evaluationId ?? existing?.evaluation_id ?? null,
    title: payload.title.trim(),
    reason: payload.reason?.trim() || null,
    status,
    opened_at: openedAt,
    due_at: payload.dueAt ?? null,
    review_at: payload.reviewAt ?? null,
    closed_at: closedAt,
    responsible_user_id: payload.responsibleUserId ?? null,
    is_sensitive: payload.isSensitive,
    visibility_scope: payload.visibilityScope,
    metadata: {}
  };
}

export function prepareDevelopmentPlanItemWrite(plan: EmployeeDevelopmentPlanRow, payload: DevelopmentPlanItemPayload) {
  const completedAt = payload.completedAt ?? (payload.status === "completed" && !payload.completedAt ? new Date().toISOString() : null);

  return {
    development_plan_id: plan.id,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    action_type: payload.actionType,
    due_at: payload.dueAt ?? null,
    responsible_user_id: payload.responsibleUserId ?? null,
    status: payload.status,
    completion_notes: payload.completionNotes?.trim() || null,
    completed_at: completedAt
  };
}
