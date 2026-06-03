import "server-only";

import type { z } from "zod";
import { assertCanAccessHrEmployee, assertUnitInHrScope, HrAuthorizationError, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import type { employeeConductRecordPayloadSchema } from "@/lib/hr/schemas";

type ConductPayload = z.infer<typeof employeeConductRecordPayloadSchema>;
type MetaRow = { id: string; code: string | null; name: string | null } | null;

export type EmployeeConductRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  conduct_type: string;
  status: string;
  occurrence_date: string;
  title: string;
  description: string | null;
  action_taken: string | null;
  severity: string;
  attachment_id: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  units?: MetaRow;
  employee_conduct_reviews?: EmployeeConductReviewRow[];
};

export type EmployeeConductReviewRow = {
  id: string;
  conduct_record_id: string;
  action: string;
  comments: string | null;
  actor_user_id: string | null;
  created_at: string;
};

export const conductSelect =
  "id, organization_id, unit_id, employee_id, conduct_type, status, occurrence_date, title, description, action_taken, severity, attachment_id, is_sensitive, visibility_scope, created_at, updated_at";
export const conductListSelect = `${conductSelect}, employees(id, full_name, preferred_name), units(id, code, name), employee_conduct_reviews(id, conduct_record_id, action, comments, actor_user_id, created_at)`;

export const conductTypeLabels: Record<string, string> = {
  warning: "Advertencia",
  suspension: "Suspensao",
  complaint: "Reclamacao",
  compliment: "Elogio",
  formal_guidance: "Orientacao formal",
  formal_conversation: "Conversa formal"
};

export const conductStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  pending_review: "Aguardando revisao",
  reviewed: "Revisado",
  rejected: "Rejeitado",
  cancelled: "Cancelado"
};

export const conductReviewActionLabels: Record<string, string> = {
  submitted: "Enviado para revisao",
  approved: "Aprovado",
  rejected: "Rejeitado",
  cancelled: "Cancelado"
};

const conductEventTypes: Record<string, "warning_registered" | "suspension_registered" | "complaint_registered" | "compliment_registered" | "formal_guidance_registered" | "formal_conversation_registered"> = {
  warning: "warning_registered",
  suspension: "suspension_registered",
  complaint: "complaint_registered",
  compliment: "compliment_registered",
  formal_guidance: "formal_guidance_registered",
  formal_conversation: "formal_conversation_registered"
};

const conductEventTitles: Record<string, string> = {
  warning_registered: "Advertencia registrada",
  suspension_registered: "Suspensao registrada",
  complaint_registered: "Reclamacao registrada",
  compliment_registered: "Elogio registrado",
  formal_guidance_registered: "Orientacao formal registrada",
  formal_conversation_registered: "Conversa formal registrada"
};

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

function defaultSeverity(conductType: string) {
  if (conductType === "suspension") return "critical";
  if (conductType === "warning" || conductType === "complaint") return "warning";
  if (conductType === "compliment") return "info";
  return "notice";
}

function defaultSensitive(conductType: string, isSensitive?: boolean) {
  if (typeof isSensitive === "boolean") return isSensitive;
  return conductType !== "compliment";
}

export function redactEmployeeConduct(row: EmployeeConductRow, canViewSensitive: boolean) {
  const redacted = row.is_sensitive && !canViewSensitive;

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    employeeId: row.employee_id,
    employeeName: employeeName(row.employees),
    conductType: row.conduct_type,
    conductTypeLabel: conductTypeLabels[row.conduct_type] ?? row.conduct_type,
    status: row.status,
    statusLabel: conductStatusLabels[row.status] ?? row.status,
    occurrenceDate: row.occurrence_date,
    title: redacted ? "Registro restrito" : row.title,
    description: redacted ? "" : row.description ?? "",
    actionTaken: redacted ? "" : row.action_taken ?? "",
    severity: row.severity,
    attachmentId: redacted ? "" : row.attachment_id ?? "",
    hasAttachment: Boolean(row.attachment_id),
    evidenceCount: row.attachment_id ? 1 : 0,
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    reviews: (row.employee_conduct_reviews ?? []).map((review) => ({
      id: review.id,
      action: review.action,
      actionLabel: conductReviewActionLabels[review.action] ?? review.action,
      comments: redacted ? "" : review.comments ?? "",
      actorUserId: review.actor_user_id ?? "",
      createdAt: review.created_at
    })),
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function prepareEmployeeConductWrite(context: HrRequestContext, payload: ConductPayload, existing?: EmployeeConductRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) throw new HrAuthorizationError("Colaborador sem unidade valida para registro de conduta.", 422);
  const isSensitive = defaultSensitive(payload.conductType, payload.isSensitive);

  return {
    organization_id: existing?.organization_id ?? employee.organization_id,
    unit_id: existing?.unit_id ?? employee.unit_id,
    employee_id: employee.id,
    conduct_type: payload.conductType,
    status: payload.status,
    occurrence_date: payload.occurrenceDate,
    title: payload.title?.trim() || conductTypeLabels[payload.conductType] || "Registro de conduta",
    description: payload.description?.trim() || null,
    action_taken: payload.actionTaken?.trim() || null,
    severity: payload.severity ?? defaultSeverity(payload.conductType),
    attachment_id: payload.attachmentId ?? null,
    is_sensitive: isSensitive,
    visibility_scope: isSensitive ? "restricted" : "unit"
  };
}

export async function loadEmployeeConduct(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase.from("employee_conduct_records").select(conductListSelect).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("conduct.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o registro de conduta.");
  }
  const row = (data?.[0] as unknown as EmployeeConductRow | undefined) ?? null;
  if (row) assertUnitInHrScope(context, row.unit_id);
  return row;
}

export async function publishEmployeeConductEvent(input: { context: HrRequestContext; conduct: EmployeeConductRow; previous?: EmployeeConductRow | null; created?: boolean }) {
  const eventType = conductEventTypes[input.conduct.conduct_type];
  if (!eventType) return;

  try {
    const result = await createEmployeeFunctionalEvent(input.context.supabase, {
      employeeId: input.conduct.employee_id,
      eventType,
      title: conductEventTitles[eventType],
      description: input.conduct.is_sensitive ? conductTypeLabels[input.conduct.conduct_type] ?? "Registro de conduta" : input.conduct.title,
      severity: input.conduct.severity as "info" | "notice" | "warning" | "critical",
      visibilityScope: input.conduct.visibility_scope as "restricted" | "unit" | "organization",
      isSensitive: input.conduct.is_sensitive,
      sourceModule: "hr",
      sourceEntityType: "employee_conduct_record",
      sourceEntityId: input.conduct.id,
      relatedAttachmentId: input.conduct.attachment_id,
      actorUserId: input.context.session.user.id,
      dedupeKey: `employee-conduct:${input.conduct.id}:approved`,
      eventPayload: {
        conduct_type: input.conduct.conduct_type,
        occurrence_date: input.conduct.occurrence_date,
        previous_status: input.previous?.status,
        new_status: input.conduct.status
      }
    });
    if (!result.ok) logHrApiError("conduct.functional_event_failed", { message: result.error.message, code: result.error.code });
  } catch (error) {
    logHrApiError("conduct.functional_event_failed", error instanceof Error ? error : { message: "Erro desconhecido ao publicar evento de conduta." });
  }
}

export function assertConductTransition(currentStatus: string, nextAction: "submitted" | "approved" | "rejected" | "cancelled") {
  if (nextAction === "submitted" && currentStatus !== "draft") throw new HrAuthorizationError("Somente rascunhos podem ser enviados para revisao.", 422);
  if ((nextAction === "approved" || nextAction === "rejected") && currentStatus !== "pending_review") {
    throw new HrAuthorizationError("Somente registros aguardando revisao podem ser aprovados ou rejeitados.", 422);
  }
}

export function statusForConductAction(action: "submitted" | "approved" | "rejected" | "cancelled") {
  if (action === "submitted") return "pending_review";
  if (action === "approved") return "reviewed";
  if (action === "rejected") return "rejected";
  return "cancelled";
}

export async function registerConductReview(input: {
  context: HrRequestContext;
  conduct: EmployeeConductRow;
  action: "submitted" | "approved" | "rejected" | "cancelled";
  comments?: string;
}) {
  const { error } = await input.context.supabase.from("employee_conduct_reviews").insert({
    conduct_record_id: input.conduct.id,
    action: input.action,
    comments: input.comments?.trim() || null,
    actor_user_id: input.context.session.user.id
  });

  if (error) {
    logHrApiError("conduct.review_insert_failed", error);
    throw new Error("Nao foi possivel registrar a revisao da conduta.");
  }
}
