import "server-only";

import type { z } from "zod";
import { HrAuthorizationError, assertCanAccessHrEmployee, assertUnitInHrScope, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent, type EmployeeFunctionalEventType } from "@/lib/hr/employee-functional-events";
import type { employeeTerminationChecklistPayloadSchema, employeeTerminationPayloadSchema } from "@/lib/hr/schemas";

type TerminationPayload = z.infer<typeof employeeTerminationPayloadSchema>;
type ChecklistPayload = z.infer<typeof employeeTerminationChecklistPayloadSchema>;
type MetaRow = { id: string; code: string | null; name: string | null } | null;

export type EmployeeTerminationStatus = "draft" | "pending_review" | "approved" | "implemented" | "cancelled";
export type EmployeeTerminationType = "voluntary" | "involuntary" | "mutual" | "retirement" | "end_of_contract" | "other";

export type EmployeeTerminationChecklistRow = {
  id: string;
  termination_id: string;
  item_name: string;
  is_required: boolean;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeTerminationRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  status: EmployeeTerminationStatus;
  termination_type: EmployeeTerminationType;
  termination_reason: string;
  requested_at: string;
  effective_date: string | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  implemented_by: string | null;
  implemented_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  units?: MetaRow;
  employee_termination_checklists?: EmployeeTerminationChecklistRow[];
};

export const terminationSelect = [
  "id",
  "organization_id",
  "unit_id",
  "employee_id",
  "status",
  "termination_type",
  "termination_reason",
  "requested_at",
  "effective_date",
  "requested_by",
  "approved_by",
  "approved_at",
  "implemented_by",
  "implemented_at",
  "cancelled_by",
  "cancelled_at",
  "notes",
  "is_sensitive",
  "visibility_scope",
  "created_at",
  "updated_at"
].join(", ");

export const terminationListSelect = `${terminationSelect}, employees(id, full_name, preferred_name), units(id, code, name), employee_termination_checklists(id, termination_id, item_name, is_required, is_completed, completed_at, completed_by, notes, created_at, updated_at)`;

export const terminationTypeLabels: Record<EmployeeTerminationType, string> = {
  voluntary: "Pedido de demissao",
  involuntary: "Desligamento pela empresa",
  mutual: "Acordo mutuo",
  retirement: "Aposentadoria",
  end_of_contract: "Fim de contrato",
  other: "Outro"
};

export const terminationStatusLabels: Record<EmployeeTerminationStatus, string> = {
  draft: "Rascunho",
  pending_review: "Aguardando revisao",
  approved: "Aprovado",
  implemented: "Efetivado",
  cancelled: "Cancelado"
};

const defaultChecklistItems = [
  "Devolucao de uniforme",
  "Devolucao de cracha",
  "Devolucao de chave",
  "Devolucao de equipamento",
  "Encerramento de acessos",
  "Documentos rescisorios",
  "Entrevista de desligamento"
];

function meta(row?: MetaRow) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "",
    label: [row.code, row.name].filter(Boolean).join(" - ") || row.name || row.code || ""
  };
}

function employeeName(row?: { full_name: string | null; preferred_name: string | null } | null) {
  return row?.preferred_name || row?.full_name || "";
}

function sortedChecklist(row: EmployeeTerminationRow) {
  return [...(row.employee_termination_checklists ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function redactEmployeeTermination(row: EmployeeTerminationRow, canViewSensitive: boolean) {
  const redacted = row.is_sensitive && !canViewSensitive;
  const checklist = sortedChecklist(row);
  const required = checklist.filter((item) => item.is_required);
  const openRequired = required.filter((item) => !item.is_completed);

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    employeeId: row.employee_id,
    employeeName: employeeName(row.employees),
    status: row.status,
    statusLabel: terminationStatusLabels[row.status] ?? row.status,
    terminationType: row.termination_type,
    terminationTypeLabel: terminationTypeLabels[row.termination_type] ?? row.termination_type,
    terminationReason: redacted ? "Informacao restrita" : row.termination_reason,
    requestedAt: row.requested_at,
    effectiveDate: row.effective_date ?? "",
    requestedBy: row.requested_by ?? "",
    approvedBy: row.approved_by ?? "",
    approvedAt: row.approved_at ?? "",
    implementedBy: row.implemented_by ?? "",
    implementedAt: row.implemented_at ?? "",
    cancelledBy: row.cancelled_by ?? "",
    cancelledAt: row.cancelled_at ?? "",
    notes: redacted ? "" : row.notes ?? "",
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    checklist: checklist.map((item) => ({
      id: item.id,
      terminationId: item.termination_id,
      itemName: item.item_name,
      isRequired: item.is_required,
      isCompleted: item.is_completed,
      completedAt: item.completed_at ?? "",
      completedBy: item.completed_by ?? "",
      notes: redacted ? "" : item.notes ?? "",
      createdAt: item.created_at,
      updatedAt: item.updated_at
    })),
    pendingCount: openRequired.length,
    checklistCount: checklist.length,
    checklistCompletedCount: checklist.filter((item) => item.is_completed).length,
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function prepareEmployeeTerminationWrite(context: HrRequestContext, payload: TerminationPayload, existing?: EmployeeTerminationRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) {
    throw new HrAuthorizationError("Colaborador sem organizacao ou unidade valida para desligamento.", 422);
  }

  return {
    organization_id: existing?.organization_id ?? employee.organization_id,
    unit_id: existing?.unit_id ?? employee.unit_id,
    employee_id: employee.id,
    status: payload.status,
    termination_type: payload.terminationType,
    termination_reason: payload.terminationReason.trim(),
    effective_date: payload.effectiveDate ?? null,
    notes: payload.notes?.trim() || null,
    is_sensitive: true,
    visibility_scope: "restricted"
  };
}

export async function loadEmployeeTermination(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase
    .from("employee_terminations")
    .select(terminationListSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("terminations.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o desligamento.");
  }

  const row = (data?.[0] as unknown as EmployeeTerminationRow | undefined) ?? null;
  if (row) assertUnitInHrScope(context, row.unit_id);
  return row;
}

export function assertTerminationTransition(currentStatus: EmployeeTerminationStatus, action: "submit" | "approve" | "implement" | "cancel") {
  if (action === "submit" && currentStatus !== "draft") throw new HrAuthorizationError("Somente rascunhos podem ser enviados para revisao.", 422);
  if (action === "approve" && currentStatus !== "pending_review") throw new HrAuthorizationError("Somente desligamentos aguardando revisao podem ser aprovados.", 422);
  if (action === "implement" && currentStatus !== "approved") throw new HrAuthorizationError("Somente desligamentos aprovados podem ser efetivados.", 422);
  if (action === "cancel" && currentStatus === "implemented") throw new HrAuthorizationError("Desligamentos efetivados nao podem ser cancelados.", 422);
}

export async function transitionEmployeeTermination(input: {
  context: HrRequestContext;
  termination: EmployeeTerminationRow;
  action: "submit" | "approve" | "implement" | "cancel";
}) {
  assertTerminationTransition(input.termination.status, input.action);
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_by: input.context.session.user.id
  };

  if (input.action === "submit") updates.status = "pending_review";
  if (input.action === "approve") {
    updates.status = "approved";
    updates.approved_at = now;
    updates.approved_by = input.context.session.user.id;
  }
  if (input.action === "implement") {
    updates.status = "implemented";
    updates.implemented_at = now;
    updates.implemented_by = input.context.session.user.id;
  }
  if (input.action === "cancel") {
    updates.status = "cancelled";
    updates.cancelled_at = now;
    updates.cancelled_by = input.context.session.user.id;
  }

  const { data, error } = await input.context.supabase
    .from("employee_terminations")
    .update(updates)
    .eq("id", input.termination.id)
    .eq("status", input.termination.status)
    .is("deleted_at", null)
    .select(terminationListSelect)
    .single();

  if (error) {
    logHrApiError("terminations.transition_failed", error);
    throw new Error("Nao foi possivel atualizar o desligamento.");
  }

  return data as unknown as EmployeeTerminationRow;
}

async function publishTerminationEvent(input: {
  context: HrRequestContext;
  termination: EmployeeTerminationRow;
  eventType: EmployeeFunctionalEventType;
  title: string;
  description: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.termination.employee_id,
    eventType: input.eventType,
    eventDate: input.termination.effective_date ?? input.termination.requested_at,
    title: input.title,
    description: input.description,
    severity: "warning",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_termination",
    sourceEntityId: input.termination.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: input.dedupeKey,
    eventPayload: {
      termination_type: input.termination.termination_type,
      status: input.termination.status,
      effective_date: input.termination.effective_date,
      ...input.payload
    }
  });

  if (!result.ok) logHrApiError("terminations.functional_event_failed", { message: result.error.message, code: result.error.code });
}

export async function publishTerminationStarted(input: { context: HrRequestContext; termination: EmployeeTerminationRow }) {
  await publishTerminationEvent({
    context: input.context,
    termination: input.termination,
    eventType: "termination_started",
    title: "Desligamento iniciado",
    description: "Processo administrativo de desligamento iniciado.",
    dedupeKey: `termination:${input.termination.id}:started`
  });
}

export async function publishTerminationChecklistEvent(input: { context: HrRequestContext; termination: EmployeeTerminationRow; item?: EmployeeTerminationChecklistRow }) {
  await publishTerminationEvent({
    context: input.context,
    termination: input.termination,
    eventType: input.item?.is_required ? "termination_pending_item_registered" : "termination_checklist_created",
    title: input.item?.is_required ? "Pendencia de desligamento registrada" : "Checklist de desligamento criado",
    description: input.item?.is_required ? "Pendencia administrativa de desligamento registrada." : "Checklist administrativo de desligamento criado.",
    dedupeKey: input.item ? `termination-checklist:${input.item.id}:created` : `termination:${input.termination.id}:checklist-created`,
    payload: input.item
      ? {
          checklist_item: input.item.item_name,
          is_required: input.item.is_required
        }
      : undefined
  });
}

export async function publishTerminationImplemented(input: { context: HrRequestContext; termination: EmployeeTerminationRow; previous?: EmployeeTerminationRow | null }) {
  if (input.previous?.status === "implemented" || input.termination.status !== "implemented") return;
  await publishTerminationEvent({
    context: input.context,
    termination: input.termination,
    eventType: "termination_completed",
    title: "Desligamento concluido",
    description: "Processo administrativo de desligamento concluido.",
    dedupeKey: `termination:${input.termination.id}:completed`
  });
  await publishTerminationEvent({
    context: input.context,
    termination: input.termination,
    eventType: "employee_inactivated",
    title: "Colaborador inativado",
    description: "Colaborador marcado como inativo apos desligamento administrativo.",
    dedupeKey: `termination:${input.termination.id}:employee-inactivated`
  });
}

export async function createDefaultTerminationChecklist(context: HrRequestContext, termination: EmployeeTerminationRow) {
  const { data, error } = await context.supabase
    .from("employee_termination_checklists")
    .insert(defaultChecklistItems.map((itemName) => ({ termination_id: termination.id, item_name: itemName, is_required: true })))
    .select("id, termination_id, item_name, is_required, is_completed, completed_at, completed_by, notes, created_at, updated_at");

  if (error) {
    logHrApiError("terminations.default_checklist_failed", error);
    throw new Error("Nao foi possivel criar o checklist de desligamento.");
  }

  await publishTerminationChecklistEvent({ context, termination });
  return (data ?? []) as unknown as EmployeeTerminationChecklistRow[];
}

export async function createTerminationChecklistItem(context: HrRequestContext, termination: EmployeeTerminationRow, payload: ChecklistPayload) {
  const now = new Date().toISOString();
  const { data, error } = await context.supabase
    .from("employee_termination_checklists")
    .insert({
      termination_id: termination.id,
      item_name: payload.itemName,
      is_required: payload.isRequired,
      is_completed: payload.isCompleted,
      completed_at: payload.isCompleted ? now : null,
      completed_by: payload.isCompleted ? context.session.user.id : null,
      notes: payload.notes?.trim() || null
    })
    .select("id, termination_id, item_name, is_required, is_completed, completed_at, completed_by, notes, created_at, updated_at")
    .single();

  if (error) {
    logHrApiError("terminations.checklist_insert_failed", error);
    throw new Error("Nao foi possivel criar item do checklist.");
  }

  const item = data as unknown as EmployeeTerminationChecklistRow;
  if (item.is_required) await publishTerminationChecklistEvent({ context, termination, item });
  return item;
}
