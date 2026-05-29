import "server-only";

import type { z } from "zod";
import { HrAuthorizationError, assertCanAccessHrEmployee, assertUnitInHrScope, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import type { employeeTrainingAssignPayloadSchema, employeeTrainingUpdatePayloadSchema, hrTrainingPayloadSchema } from "@/lib/hr/schemas";

type TrainingPayload = z.infer<typeof hrTrainingPayloadSchema>;
type EmployeeTrainingAssignPayload = z.infer<typeof employeeTrainingAssignPayloadSchema>;
type EmployeeTrainingUpdatePayload = z.infer<typeof employeeTrainingUpdatePayloadSchema>;

type MetaRow = { id: string; code: string | null; name: string | null } | null;

export type HrTrainingRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  title: string;
  description: string | null;
  training_type: string;
  delivery_mode: string;
  provider_name: string | null;
  workload_hours: number | null;
  is_mandatory: boolean;
  requires_certificate: boolean;
  has_expiration: boolean;
  validity_days: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  units?: MetaRow;
};

export type EmployeeTrainingRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  training_id: string;
  status: string;
  assigned_at: string;
  due_date: string | null;
  completed_at: string | null;
  expires_at: string | null;
  certificate_attachment_id: string | null;
  attendance_confirmed: boolean;
  attendance_confirmed_at: string | null;
  notes: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  hr_trainings?: HrTrainingRow | null;
  units?: MetaRow;
};

export const trainingSelect =
  "id, organization_id, unit_id, title, description, training_type, delivery_mode, provider_name, workload_hours, is_mandatory, requires_certificate, has_expiration, validity_days, status, created_at, updated_at";
export const trainingListSelect = `${trainingSelect}, units(id, code, name)`;

export const employeeTrainingSelect =
  "id, organization_id, unit_id, employee_id, training_id, status, assigned_at, due_date, completed_at, expires_at, certificate_attachment_id, attendance_confirmed, attendance_confirmed_at, notes, is_sensitive, visibility_scope, created_at, updated_at";
export const employeeTrainingListSelect = `${employeeTrainingSelect}, employees(id, full_name, preferred_name), units(id, code, name), hr_trainings(${trainingSelect})`;

export const trainingTypeLabels: Record<string, string> = {
  integration: "Integração",
  operational: "Operacional",
  mandatory: "Obrigatório",
  safety: "Segurança",
  leadership: "Liderança",
  technical: "Técnico",
  behavioral: "Comportamental",
  recycling: "Reciclagem",
  other: "Outro"
};

export const deliveryModeLabels: Record<string, string> = {
  in_person: "Presencial",
  online: "Online",
  hybrid: "Híbrido",
  external: "Externo"
};

export const employeeTrainingStatusLabels: Record<string, string> = {
  assigned: "Atribuído",
  scheduled: "Agendado",
  in_progress: "Em andamento",
  completed: "Concluído",
  expired: "Vencido",
  waived: "Dispensado",
  cancelled: "Cancelado"
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

function addDaysIso(base: string, days: number) {
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function mapTraining(row: HrTrainingRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    title: row.title,
    description: row.description ?? "",
    trainingType: row.training_type,
    trainingTypeLabel: trainingTypeLabels[row.training_type] ?? row.training_type,
    deliveryMode: row.delivery_mode,
    deliveryModeLabel: deliveryModeLabels[row.delivery_mode] ?? row.delivery_mode,
    providerName: row.provider_name ?? "",
    workloadHours: row.workload_hours,
    isMandatory: row.is_mandatory,
    requiresCertificate: row.requires_certificate,
    hasExpiration: row.has_expiration,
    validityDays: row.validity_days,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function redactEmployeeTraining(row: EmployeeTrainingRow, canViewSensitive: boolean) {
  const redacted = row.is_sensitive && !canViewSensitive;
  const training = row.hr_trainings;

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    employeeId: row.employee_id,
    employeeName: row.employees?.preferred_name || row.employees?.full_name || "",
    trainingId: row.training_id,
    trainingTitle: training?.title ?? "",
    trainingType: training?.training_type ?? "",
    trainingTypeLabel: training ? trainingTypeLabels[training.training_type] ?? training.training_type : "",
    deliveryMode: training?.delivery_mode ?? "",
    deliveryModeLabel: training ? deliveryModeLabels[training.delivery_mode] ?? training.delivery_mode : "",
    isMandatory: Boolean(training?.is_mandatory),
    requiresCertificate: Boolean(training?.requires_certificate),
    hasExpiration: Boolean(training?.has_expiration),
    status: row.status,
    statusLabel: employeeTrainingStatusLabels[row.status] ?? row.status,
    assignedAt: row.assigned_at,
    dueDate: row.due_date ?? "",
    completedAt: row.completed_at ?? "",
    expiresAt: row.expires_at ?? "",
    hasCertificate: Boolean(row.certificate_attachment_id),
    certificateAttachmentId: redacted ? "" : row.certificate_attachment_id ?? "",
    attendanceConfirmed: row.attendance_confirmed,
    attendanceConfirmedAt: row.attendance_confirmed_at ?? "",
    notes: redacted ? "" : row.notes ?? "",
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getInitialOrganizationId(context: HrRequestContext) {
  const { data, error } = await context.supabase.from("organizations").select("id").eq("status", "active").is("deleted_at", null).limit(1);
  if (error || !data?.[0]?.id) {
    if (error) logHrApiError("trainings.organization_lookup_failed", error);
    throw new HrAuthorizationError("Nao foi possivel identificar a organizacao para o treinamento.", 422);
  }
  return data[0].id as string;
}

export async function prepareTrainingWrite(context: HrRequestContext, payload: TrainingPayload, existing?: HrTrainingRow) {
  if (payload.unitId) assertUnitInHrScope(context, payload.unitId);
  if (payload.hasExpiration && !payload.validityDays) throw new HrAuthorizationError("Informe a validade em dias para treinamentos com vencimento.", 422);

  const organizationId = existing?.organization_id ?? (await getInitialOrganizationId(context));

  return {
    organization_id: organizationId,
    unit_id: payload.unitId ?? existing?.unit_id ?? null,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    training_type: payload.trainingType,
    delivery_mode: payload.deliveryMode,
    provider_name: payload.providerName?.trim() || null,
    workload_hours: payload.workloadHours ?? null,
    is_mandatory: payload.isMandatory,
    requires_certificate: payload.requiresCertificate,
    has_expiration: payload.hasExpiration,
    validity_days: payload.hasExpiration ? payload.validityDays ?? null : null,
    status: payload.status
  };
}

export async function loadTraining(context: HrRequestContext, trainingId: string) {
  const { data, error } = await context.supabase.from("hr_trainings").select(trainingListSelect).eq("id", trainingId).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("trainings.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o treinamento.");
  }
  const training = (data?.[0] as unknown as HrTrainingRow | undefined) ?? null;
  if (training?.unit_id) assertUnitInHrScope(context, training.unit_id);
  return training;
}

export async function loadEmployeeTraining(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase.from("employee_trainings").select(employeeTrainingListSelect).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("employee_trainings.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o treinamento do colaborador.");
  }
  const row = (data?.[0] as unknown as EmployeeTrainingRow | undefined) ?? null;
  if (row) assertUnitInHrScope(context, row.unit_id);
  return row;
}

export async function prepareEmployeeTrainingAssign(context: HrRequestContext, employeeId: string, payload: EmployeeTrainingAssignPayload) {
  const employee = await assertCanAccessHrEmployee(context, employeeId);
  const training = await loadTraining(context, payload.trainingId);
  if (!training) throw new HrAuthorizationError("Treinamento nao encontrado.", 404);
  if (!employee.organization_id || !employee.unit_id) throw new HrAuthorizationError("Colaborador sem unidade valida para treinamento.", 422);

  return {
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    training_id: training.id,
    status: "assigned",
    due_date: payload.dueDate ?? null,
    notes: payload.notes?.trim() || null,
    is_sensitive: false,
    visibility_scope: "unit"
  };
}

export function prepareEmployeeTrainingUpdate(existing: EmployeeTrainingRow, payload: EmployeeTrainingUpdatePayload) {
  const training = existing.hr_trainings;
  const completedAt = payload.completedAt ?? existing.completed_at;
  const attendanceConfirmed = payload.attendanceConfirmed ?? existing.attendance_confirmed;
  const shouldComplete = payload.status === "completed";

  if (training?.requires_certificate && shouldComplete && !payload.certificateAttachmentId && !existing.certificate_attachment_id) {
    throw new HrAuthorizationError("Treinamento exige certificado para conclusao.", 422);
  }

  const expiresAt =
    payload.expiresAt ??
    (completedAt && training?.has_expiration && training.validity_days ? addDaysIso(completedAt, training.validity_days) : existing.expires_at);

  return {
    status: payload.status ?? existing.status,
    due_date: payload.dueDate ?? existing.due_date,
    completed_at: completedAt ?? null,
    expires_at: expiresAt ?? null,
    certificate_attachment_id: payload.certificateAttachmentId ?? existing.certificate_attachment_id,
    attendance_confirmed: attendanceConfirmed,
    attendance_confirmed_at: attendanceConfirmed ? existing.attendance_confirmed_at ?? new Date().toISOString() : null,
    notes: payload.notes?.trim() ?? existing.notes ?? null
  };
}

export async function publishEmployeeTrainingEvent(input: {
  context: HrRequestContext;
  eventType: "training_required" | "training_completed" | "training_certificate_uploaded";
  employeeTraining: EmployeeTrainingRow;
  previous?: EmployeeTrainingRow | null;
}) {
  const training = input.employeeTraining.hr_trainings;
  const titles = {
    training_required: "Treinamento atribuido",
    training_completed: "Treinamento concluido",
    training_certificate_uploaded: "Certificado de treinamento anexado"
  };

  try {
    const result = await createEmployeeFunctionalEvent(input.context.supabase, {
      employeeId: input.employeeTraining.employee_id,
      eventType: input.eventType,
      title: titles[input.eventType],
      description: training?.title ? `${titles[input.eventType]}: ${training.title}.` : titles[input.eventType],
      severity: "notice",
      visibilityScope: "unit",
      isSensitive: false,
      sourceModule: "hr",
      sourceEntityType: "employee_training",
      sourceEntityId: input.employeeTraining.id,
      relatedAttachmentId: input.eventType === "training_certificate_uploaded" ? input.employeeTraining.certificate_attachment_id : null,
      actorUserId: input.context.session.user.id,
      dedupeKey: `employee-training:${input.employeeTraining.id}:${input.eventType}`,
      eventPayload: {
        training_title: training?.title,
        training_type: training?.training_type,
        delivery_mode: training?.delivery_mode,
        due_date: input.employeeTraining.due_date,
        completed_at: input.employeeTraining.completed_at,
        expires_at: input.employeeTraining.expires_at,
        requires_certificate: training?.requires_certificate,
        has_expiration: training?.has_expiration
      }
    });

    if (!result.ok) logHrApiError("trainings.functional_event_failed", { message: result.error.message, code: result.error.code });
  } catch (error) {
    logHrApiError("trainings.functional_event_failed", error instanceof Error ? error : { message: "Erro desconhecido ao publicar evento de treinamento." });
  }
}
