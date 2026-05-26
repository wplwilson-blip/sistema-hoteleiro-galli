import "server-only";

export type EmployeeDevelopmentPlanRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  evaluation_id: string | null;
  title: string;
  reason: string | null;
  status: string;
  opened_at: string;
  due_at: string | null;
  review_at: string | null;
  closed_at: string | null;
  responsible_user_id: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  units?: { id: string; code: string | null; name: string | null } | null;
  employee_development_plan_items?: EmployeeDevelopmentPlanItemRow[];
};

export type EmployeeDevelopmentPlanItemRow = {
  id: string;
  development_plan_id: string;
  title: string;
  description: string | null;
  action_type: string;
  due_at: string | null;
  responsible_user_id: string | null;
  status: string;
  completion_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const developmentPlanSelect =
  "id, organization_id, unit_id, employee_id, evaluation_id, title, reason, status, opened_at, due_at, review_at, closed_at, responsible_user_id, is_sensitive, visibility_scope, created_at, updated_at";

export const developmentPlanListSelect = `${developmentPlanSelect}, employees(id, full_name, preferred_name), units(id, code, name)`;

export const developmentPlanDetailSelect = `${developmentPlanListSelect}, employee_development_plan_items(id, development_plan_id, title, description, action_type, due_at, responsible_user_id, status, completion_notes, completed_at, created_at, updated_at)`;

export const developmentPlanItemSelect =
  "id, development_plan_id, title, description, action_type, due_at, responsible_user_id, status, completion_notes, completed_at, created_at, updated_at";

export function redactDevelopmentPlan(row: EmployeeDevelopmentPlanRow, canViewSensitive: boolean, includeItems = false) {
  const isRedacted = row.is_sensitive && !canViewSensitive;
  const base = {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    employeeId: row.employee_id,
    employeeName: row.employees?.preferred_name || row.employees?.full_name || "",
    evaluationId: row.evaluation_id,
    title: row.title,
    status: row.status,
    openedAt: row.opened_at,
    dueAt: row.due_at ?? "",
    reviewAt: row.review_at ?? "",
    closedAt: row.closed_at ?? "",
    responsibleUserId: row.responsible_user_id,
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    redacted: isRedacted
  };

  if (isRedacted) {
    return base;
  }

  return {
    ...base,
    reason: row.reason ?? "",
    ...(includeItems ? { items: (row.employee_development_plan_items ?? []).map(mapDevelopmentPlanItem) } : {})
  };
}

export function mapDevelopmentPlanItem(row: EmployeeDevelopmentPlanItemRow) {
  return {
    id: row.id,
    developmentPlanId: row.development_plan_id,
    title: row.title,
    description: row.description ?? "",
    actionType: row.action_type,
    dueAt: row.due_at ?? "",
    responsibleUserId: row.responsible_user_id,
    status: row.status,
    completionNotes: row.completion_notes ?? "",
    completedAt: row.completed_at ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
