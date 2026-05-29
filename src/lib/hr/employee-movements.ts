import "server-only";

import type { z } from "zod";
import { HrAuthorizationError, assertCanAccessHrEmployee, assertUnitInHrScope, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent, type EmployeeFunctionalEventType } from "@/lib/hr/employee-functional-events";
import type { hrMovementPayloadSchema } from "@/lib/hr/schemas";

type MovementPayload = z.infer<typeof hrMovementPayloadSchema>;
export type EmployeeMovementApprovalAction = "submitted" | "approved" | "rejected" | "implemented";

type RelatedMetaRow = { id: string; code: string | null; name: string | null } | null;

export type EmployeeMovementRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  movement_type: EmployeeMovementType;
  status: EmployeeMovementStatus;
  effective_date: string;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  implemented_at: string | null;
  requested_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
  implemented_by: string | null;
  old_unit_id: string | null;
  new_unit_id: string | null;
  old_department_id: string | null;
  new_department_id: string | null;
  old_job_position_id: string | null;
  new_job_position_id: string | null;
  old_salary: number | null;
  new_salary: number | null;
  reason: string;
  notes: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employee_movement_approvals?: EmployeeMovementApprovalRow[];
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  unit?: RelatedMetaRow;
  old_unit?: RelatedMetaRow;
  new_unit?: RelatedMetaRow;
  old_department?: RelatedMetaRow;
  new_department?: RelatedMetaRow;
  old_job_position?: RelatedMetaRow;
  new_job_position?: RelatedMetaRow;
};

export type EmployeeMovementApprovalRow = {
  id: string;
  movement_id: string;
  action: EmployeeMovementApprovalAction;
  comments: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export type EmployeeMovementType =
  | "promotion"
  | "transfer"
  | "job_position_change"
  | "department_change"
  | "unit_change"
  | "salary_change";

export type EmployeeMovementStatus = "draft" | "pending_approval" | "approved" | "rejected" | "implemented";

export const movementSelect = [
  "id",
  "organization_id",
  "unit_id",
  "employee_id",
  "movement_type",
  "status",
  "effective_date",
  "requested_at",
  "approved_at",
  "rejected_at",
  "implemented_at",
  "requested_by",
  "approved_by",
  "rejected_by",
  "implemented_by",
  "old_unit_id",
  "new_unit_id",
  "old_department_id",
  "new_department_id",
  "old_job_position_id",
  "new_job_position_id",
  "old_salary",
  "new_salary",
  "reason",
  "notes",
  "is_sensitive",
  "visibility_scope",
  "created_at",
  "updated_at"
].join(", ");

export const movementListSelect = `${movementSelect}, employees(id, full_name, preferred_name), unit:units!employee_movements_unit_id_fkey(id, code, name), old_unit:units!employee_movements_old_unit_id_fkey(id, code, name), new_unit:units!employee_movements_new_unit_id_fkey(id, code, name), old_department:departments!employee_movements_old_department_id_fkey(id, code, name), new_department:departments!employee_movements_new_department_id_fkey(id, code, name), old_job_position:job_positions!employee_movements_old_job_position_id_fkey(id, code, name), new_job_position:job_positions!employee_movements_new_job_position_id_fkey(id, code, name), employee_movement_approvals(id, movement_id, action, comments, actor_user_id, created_at)`;

export const movementTypeLabels: Record<EmployeeMovementType, string> = {
  promotion: "Promocao",
  transfer: "Transferencia",
  job_position_change: "Mudanca de cargo",
  department_change: "Mudanca de departamento",
  unit_change: "Mudanca de unidade",
  salary_change: "Mudanca salarial"
};

export const movementStatusLabels: Record<EmployeeMovementStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovacao",
  approved: "Aprovada",
  rejected: "Rejeitada",
  implemented: "Efetivada"
};

export const movementApprovalActionLabels: Record<EmployeeMovementApprovalAction | "created", string> = {
  created: "Criado",
  submitted: "Enviado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  implemented: "Efetivado"
};

function meta(row: RelatedMetaRow) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "",
    label: [row.code, row.name].filter(Boolean).join(" - ") || row.name || row.code || ""
  };
}

function shouldRedactMovement(row: Pick<EmployeeMovementRow, "is_sensitive" | "visibility_scope">, canViewSensitive: boolean) {
  return row.is_sensitive && !canViewSensitive;
}

function mapApprovals(row: EmployeeMovementRow, redacted: boolean) {
  const approvals = (row.employee_movement_approvals ?? [])
    .map((approval) => ({
      id: approval.id,
      movementId: approval.movement_id,
      action: approval.action,
      actionLabel: movementApprovalActionLabels[approval.action],
      comments: redacted ? "" : approval.comments ?? "",
      actorUserId: approval.actor_user_id ?? "",
      createdAt: approval.created_at
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return [
    {
      id: `${row.id}:created`,
      movementId: row.id,
      action: "created",
      actionLabel: movementApprovalActionLabels.created,
      comments: redacted ? "" : "Movimentacao criada.",
      actorUserId: row.requested_by ?? "",
      createdAt: row.created_at
    },
    ...approvals
  ];
}

export function redactEmployeeMovement(row: EmployeeMovementRow, canViewSensitive: boolean) {
  const redacted = shouldRedactMovement(row, canViewSensitive);

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    employeeId: row.employee_id,
    employeeName: row.employees?.preferred_name || row.employees?.full_name || "",
    movementType: row.movement_type,
    movementTypeLabel: movementTypeLabels[row.movement_type],
    status: row.status,
    statusLabel: movementStatusLabels[row.status],
    effectiveDate: row.effective_date,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at ?? "",
    rejectedAt: row.rejected_at ?? "",
    implementedAt: row.implemented_at ?? "",
    requestedBy: row.requested_by ?? "",
    approvedBy: row.approved_by ?? "",
    rejectedBy: row.rejected_by ?? "",
    implementedBy: row.implemented_by ?? "",
    oldUnit: meta(row.old_unit ?? null),
    newUnit: meta(row.new_unit ?? null),
    oldDepartment: meta(row.old_department ?? null),
    newDepartment: meta(row.new_department ?? null),
    oldJobPosition: meta(row.old_job_position ?? null),
    newJobPosition: meta(row.new_job_position ?? null),
    currentUnit: meta(row.unit ?? null),
    oldSalary: redacted ? null : row.old_salary,
    newSalary: redacted ? null : row.new_salary,
    reason: redacted ? "" : row.reason,
    notes: redacted ? "" : row.notes ?? "",
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    approvals: mapApprovals(row, redacted),
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function assertRelatedUnit(context: HrRequestContext, unitId: string | null | undefined) {
  if (!unitId) return;
  assertUnitInHrScope(context, unitId);
  const { data, error } = await context.supabase.from("units").select("id").eq("id", unitId).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("movements.unit_lookup_failed", error);
    throw new Error("Nao foi possivel validar a unidade da movimentacao.");
  }
  if (!data?.[0]) throw new HrAuthorizationError("Unidade da movimentacao nao encontrada.", 404);
}

async function assertOptionalRecord(context: HrRequestContext, table: "departments" | "job_positions", id: string | null | undefined) {
  if (!id) return;
  const { data, error } = await context.supabase.from(table).select("id, unit_id").eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError(`movements.${table}_lookup_failed`, error);
    throw new Error("Nao foi possivel validar dados da movimentacao.");
  }
  const row = data?.[0] as { id: string; unit_id: string | null } | undefined;
  if (!row) throw new HrAuthorizationError("Registro vinculado a movimentacao nao encontrado.", 404);
  assertUnitInHrScope(context, row.unit_id);
}

export async function loadEmployeeMovement(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase
    .from("employee_movements")
    .select(movementListSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("movements.lookup_failed", error);
    throw new Error("Nao foi possivel localizar a movimentacao funcional.");
  }

  const movement = (data?.[0] as unknown as EmployeeMovementRow | undefined) ?? null;
  if (movement) assertUnitInHrScope(context, movement.unit_id);
  return movement;
}

export async function prepareEmployeeMovementWrite(context: HrRequestContext, payload: MovementPayload, existing?: EmployeeMovementRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) {
    throw new HrAuthorizationError("Colaborador sem organizacao ou unidade valida para movimentacao.", 422);
  }

  const oldUnitId = payload.oldUnitId ?? existing?.old_unit_id ?? employee.unit_id;
  const newUnitId = payload.newUnitId ?? existing?.new_unit_id ?? (payload.movementType === "unit_change" || payload.movementType === "transfer" ? undefined : oldUnitId);
  const oldDepartmentId = payload.oldDepartmentId ?? existing?.old_department_id ?? employee.department_id ?? undefined;
  const newDepartmentId =
    payload.newDepartmentId ?? existing?.new_department_id ?? (payload.movementType === "department_change" ? undefined : oldDepartmentId);
  const oldJobPositionId = payload.oldJobPositionId ?? existing?.old_job_position_id ?? employee.job_position_id ?? undefined;
  const newJobPositionId =
    payload.newJobPositionId ?? existing?.new_job_position_id ?? (payload.movementType === "job_position_change" || payload.movementType === "promotion" ? undefined : oldJobPositionId);

  await Promise.all([
    assertRelatedUnit(context, oldUnitId),
    assertRelatedUnit(context, newUnitId),
    assertOptionalRecord(context, "departments", oldDepartmentId),
    assertOptionalRecord(context, "departments", newDepartmentId),
    assertOptionalRecord(context, "job_positions", oldJobPositionId),
    assertOptionalRecord(context, "job_positions", newJobPositionId)
  ]);

  const status = payload.status;
  const now = new Date().toISOString();
  const isSalaryChange = payload.movementType === "salary_change";
  const isSensitive = payload.isSensitive ?? isSalaryChange;
  const visibilityScope = payload.visibilityScope ?? (isSensitive ? "restricted" : "unit");

  if (isSensitive && visibilityScope !== "restricted") {
    throw new HrAuthorizationError("Movimentacoes sensiveis devem ter visibilidade restrita.", 422);
  }

  return {
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    movement_type: payload.movementType,
    status,
    effective_date: payload.effectiveDate,
    old_unit_id: oldUnitId ?? null,
    new_unit_id: newUnitId ?? null,
    old_department_id: oldDepartmentId ?? null,
    new_department_id: newDepartmentId ?? null,
    old_job_position_id: oldJobPositionId ?? null,
    new_job_position_id: newJobPositionId ?? null,
    old_salary: payload.oldSalary ?? existing?.old_salary ?? null,
    new_salary: payload.newSalary ?? existing?.new_salary ?? null,
    reason: payload.reason.trim(),
    notes: payload.notes?.trim() || null,
    is_sensitive: isSensitive,
    visibility_scope: visibilityScope,
    requested_at: existing?.requested_at ?? now,
    requested_by: existing?.requested_by ?? context.session.user.id,
    approved_at: existing?.approved_at ?? null,
    approved_by: existing?.approved_by ?? null,
    rejected_at: existing?.rejected_at ?? null,
    rejected_by: existing?.rejected_by ?? null,
    implemented_at: existing?.implemented_at ?? null,
    implemented_by: existing?.implemented_by ?? null,
    metadata: {}
  };
}

export async function recordEmployeeMovementApproval(input: {
  context: HrRequestContext;
  movementId: string;
  action: EmployeeMovementApprovalAction;
  comments?: string | null;
}) {
  const { error } = await input.context.supabase.from("employee_movement_approvals").insert({
    movement_id: input.movementId,
    action: input.action,
    comments: input.comments?.trim() || null,
    actor_user_id: input.context.session.user.id
  });

  if (error) {
    logHrApiError("movements.approval_audit_failed", error);
    throw new Error("Nao foi possivel registrar a auditoria da movimentacao.");
  }
}

export async function transitionEmployeeMovement(input: {
  context: HrRequestContext;
  movement: EmployeeMovementRow;
  expectedStatus: EmployeeMovementStatus;
  nextStatus: EmployeeMovementStatus;
  action: EmployeeMovementApprovalAction;
  comments?: string | null;
}) {
  if (input.movement.status !== input.expectedStatus) {
    throw new HrAuthorizationError("Transicao de movimentacao funcional nao permitida para o status atual.", 422);
  }

  const now = new Date().toISOString();
  const auditColumns: Partial<EmployeeMovementRow> = {};
  if (input.action === "approved") {
    auditColumns.approved_at = now;
    auditColumns.approved_by = input.context.session.user.id;
  }
  if (input.action === "rejected") {
    auditColumns.rejected_at = now;
    auditColumns.rejected_by = input.context.session.user.id;
  }
  if (input.action === "implemented") {
    auditColumns.implemented_at = now;
    auditColumns.implemented_by = input.context.session.user.id;
  }

  const { data, error } = await input.context.supabase
    .from("employee_movements")
    .update({
      status: input.nextStatus,
      ...auditColumns,
      updated_by: input.context.session.user.id
    })
    .eq("id", input.movement.id)
    .eq("status", input.expectedStatus)
    .is("deleted_at", null)
    .select(movementListSelect)
    .single();

  if (error) {
    logHrApiError("movements.transition_failed", error);
    throw new Error("Nao foi possivel atualizar o status da movimentacao.");
  }

  await recordEmployeeMovementApproval({
    context: input.context,
    movementId: input.movement.id,
    action: input.action,
    comments: input.comments
  });

  return data as unknown as EmployeeMovementRow;
}

function movementFunctionalEventType(type: EmployeeMovementType): EmployeeFunctionalEventType {
  const map: Record<EmployeeMovementType, EmployeeFunctionalEventType> = {
    promotion: "promotion_registered",
    transfer: "transfer_registered",
    job_position_change: "job_position_changed",
    department_change: "department_changed",
    unit_change: "unit_changed",
    salary_change: "salary_changed"
  };

  return map[type];
}

function eventTitle(type: EmployeeMovementType) {
  const labels: Record<EmployeeMovementType, string> = {
    promotion: "Promocao registrada",
    transfer: "Transferencia registrada",
    job_position_change: "Cargo alterado",
    department_change: "Departamento alterado",
    unit_change: "Unidade alterada",
    salary_change: "Salario alterado"
  };
  return labels[type];
}

export async function publishEmployeeMovementFunctionalEvent(input: {
  context: HrRequestContext;
  previous?: EmployeeMovementRow | null;
  movement: EmployeeMovementRow;
}) {
  if (input.movement.status !== "implemented") return;
  if (input.previous && input.previous.status === input.movement.status) return;

  const eventType = movementFunctionalEventType(input.movement.movement_type);
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.movement.employee_id,
    eventType,
    eventDate: input.movement.effective_date,
    title: eventTitle(input.movement.movement_type),
    description: `${movementTypeLabels[input.movement.movement_type]} registrada para o colaborador.`,
    severity: input.movement.movement_type === "salary_change" ? "warning" : "notice",
    visibilityScope: input.movement.is_sensitive ? "restricted" : "unit",
    isSensitive: input.movement.is_sensitive,
    sourceModule: "hr",
    sourceEntityType: "employee_movement",
    sourceEntityId: input.movement.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `movement:${input.movement.id}:${eventType}`,
    eventPayload: {
      movement_type: input.movement.movement_type,
      status: input.movement.status,
      effective_date: input.movement.effective_date,
      old_unit_id: input.movement.old_unit_id,
      new_unit_id: input.movement.new_unit_id,
      old_department_id: input.movement.old_department_id,
      new_department_id: input.movement.new_department_id,
      old_job_position_id: input.movement.old_job_position_id,
      new_job_position_id: input.movement.new_job_position_id,
      salary_change_recorded: input.movement.movement_type === "salary_change"
    }
  });

  if (!result.ok) {
    logHrApiError("movements.functional_event_failed", { message: result.error.message, code: result.error.code });
  }
}
