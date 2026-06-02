import "server-only";

import type { z } from "zod";
import { assertCanAccessHrEmployee, assertUnitInHrScope, HrAuthorizationError, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import type { nrCertificationPayloadSchema, occupationalRecordPayloadSchema } from "@/lib/hr/schemas";

type OccupationalRecordPayload = z.infer<typeof occupationalRecordPayloadSchema>;
type NrCertificationPayload = z.infer<typeof nrCertificationPayloadSchema>;

type MetaRow = { id: string; code: string | null; name: string | null } | null;

export type OccupationalRecordRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  record_type: string;
  status: string;
  exam_date: string | null;
  expires_at: string | null;
  provider_name: string | null;
  doctor_name: string | null;
  certificate_number: string | null;
  restriction_notes: string | null;
  attachment_id: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  units?: MetaRow;
};

export type NrCertificationRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  nr_code: string;
  training_name: string;
  issued_at: string | null;
  expires_at: string | null;
  certificate_attachment_id: string | null;
  status: string;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null } | null;
  units?: MetaRow;
};

export const occupationalRecordSelect =
  "id, organization_id, unit_id, employee_id, record_type, status, exam_date, expires_at, provider_name, doctor_name, certificate_number, restriction_notes, attachment_id, is_sensitive, visibility_scope, created_at, updated_at";
export const occupationalRecordListSelect = `${occupationalRecordSelect}, employees(id, full_name, preferred_name), units(id, code, name)`;

export const nrCertificationSelect =
  "id, organization_id, unit_id, employee_id, nr_code, training_name, issued_at, expires_at, certificate_attachment_id, status, is_sensitive, visibility_scope, created_at, updated_at";
export const nrCertificationListSelect = `${nrCertificationSelect}, employees(id, full_name, preferred_name), units(id, code, name)`;

export const occupationalRecordTypeLabels: Record<string, string> = {
  aso_admission: "ASO admissional",
  aso_periodic: "ASO periodico",
  aso_return: "ASO retorno ao trabalho",
  aso_role_change: "ASO mudanca de funcao",
  aso_termination: "ASO demissional",
  occupational_exam: "Exame ocupacional",
  occupational_restriction: "Restricao ocupacional",
  nr_certification: "Certificacao NR"
};

export const occupationalStatusLabels: Record<string, string> = {
  valid: "Valido",
  expiring: "A vencer",
  expired: "Vencido",
  cancelled: "Cancelado"
};

export const initialNrCodes = ["NR-05", "NR-06", "NR-10", "NR-12", "NR-17", "NR-23", "NR-35"];

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

function isAso(recordType: string) {
  return recordType.startsWith("aso_");
}

function dateAtStart(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function expirationState(value: string | null | undefined, status: string, now = new Date()) {
  const expiresAt = dateAtStart(value);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const warningLimit = new Date(today);
  warningLimit.setDate(today.getDate() + 30);
  const expiredByDate = Boolean(expiresAt && expiresAt.getTime() < today.getTime());
  const expiresSoon = Boolean(
    expiresAt &&
      expiresAt.getTime() >= today.getTime() &&
      expiresAt.getTime() <= warningLimit.getTime() &&
      !["expired", "cancelled"].includes(status)
  );

  return {
    expiredByDate,
    isExpired: status === "expired" || expiredByDate,
    expiresSoon
  };
}

export function mapOccupationalRecord(row: OccupationalRecordRow, canViewSensitive: boolean) {
  const redacted = row.is_sensitive && !canViewSensitive;
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    employeeId: row.employee_id,
    employeeName: employeeName(row.employees),
    recordType: row.record_type,
    recordTypeLabel: occupationalRecordTypeLabels[row.record_type] ?? row.record_type,
    status: row.status,
    statusLabel: occupationalStatusLabels[row.status] ?? row.status,
    examDate: row.exam_date ?? "",
    expiresAt: row.expires_at ?? "",
    providerName: redacted ? "" : row.provider_name ?? "",
    doctorName: redacted ? "" : row.doctor_name ?? "",
    certificateNumber: redacted ? "" : row.certificate_number ?? "",
    restrictionNotes: redacted ? "" : row.restriction_notes ?? "",
    attachmentId: redacted ? "" : row.attachment_id ?? "",
    hasAttachment: Boolean(row.attachment_id),
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    expiration: expirationState(row.expires_at, row.status),
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapNrCertification(row: NrCertificationRow, canViewSensitive: boolean) {
  const redacted = row.is_sensitive && !canViewSensitive;
  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    unit: meta(row.units),
    employeeId: row.employee_id,
    employeeName: employeeName(row.employees),
    nrCode: row.nr_code,
    trainingName: row.training_name,
    issuedAt: row.issued_at ?? "",
    expiresAt: row.expires_at ?? "",
    certificateAttachmentId: redacted ? "" : row.certificate_attachment_id ?? "",
    hasCertificate: Boolean(row.certificate_attachment_id),
    status: row.status,
    statusLabel: occupationalStatusLabels[row.status] ?? row.status,
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    expiration: expirationState(row.expires_at, row.status),
    redacted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function prepareOccupationalRecordWrite(context: HrRequestContext, payload: OccupationalRecordPayload, existing?: OccupationalRecordRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) throw new HrAuthorizationError("Colaborador sem unidade valida para Saude Ocupacional.", 422);

  return {
    organization_id: existing?.organization_id ?? employee.organization_id,
    unit_id: existing?.unit_id ?? employee.unit_id,
    employee_id: employee.id,
    record_type: payload.recordType,
    status: payload.status,
    exam_date: payload.examDate ?? null,
    expires_at: payload.expiresAt ?? null,
    provider_name: payload.providerName?.trim() || null,
    doctor_name: payload.doctorName?.trim() || null,
    certificate_number: payload.certificateNumber?.trim() || null,
    restriction_notes: payload.restrictionNotes?.trim() || null,
    attachment_id: payload.attachmentId ?? null,
    is_sensitive: true,
    visibility_scope: "restricted"
  };
}

export async function prepareNrCertificationWrite(context: HrRequestContext, payload: NrCertificationPayload, existing?: NrCertificationRow) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  if (!employee.organization_id || !employee.unit_id) throw new HrAuthorizationError("Colaborador sem unidade valida para certificacao NR.", 422);

  return {
    organization_id: existing?.organization_id ?? employee.organization_id,
    unit_id: existing?.unit_id ?? employee.unit_id,
    employee_id: employee.id,
    nr_code: payload.nrCode,
    training_name: payload.trainingName.trim(),
    issued_at: payload.issuedAt ?? null,
    expires_at: payload.expiresAt ?? null,
    certificate_attachment_id: payload.certificateAttachmentId ?? null,
    status: payload.status,
    is_sensitive: true,
    visibility_scope: "restricted"
  };
}

export async function loadOccupationalRecord(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase.from("employee_occupational_records").select(occupationalRecordListSelect).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("occupational.record_lookup_failed", error);
    throw new Error("Nao foi possivel localizar o registro ocupacional.");
  }
  const row = (data?.[0] as unknown as OccupationalRecordRow | undefined) ?? null;
  if (row) assertUnitInHrScope(context, row.unit_id);
  return row;
}

export async function loadNrCertification(context: HrRequestContext, id: string) {
  const { data, error } = await context.supabase.from("employee_nr_certifications").select(nrCertificationListSelect).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("occupational.nr_lookup_failed", error);
    throw new Error("Nao foi possivel localizar a certificacao NR.");
  }
  const row = (data?.[0] as unknown as NrCertificationRow | undefined) ?? null;
  if (row) assertUnitInHrScope(context, row.unit_id);
  return row;
}

export async function publishOccupationalRecordEvent(input: { context: HrRequestContext; record: OccupationalRecordRow; previous?: OccupationalRecordRow | null; created?: boolean }) {
  const recordType = input.record.record_type;
  const eventType = isAso(recordType)
    ? input.record.status === "valid" && !input.created
      ? "aso_completed"
      : "aso_requested"
    : recordType === "occupational_restriction"
      ? "occupational_restriction_registered"
      : "occupational_exam_registered";
  const title = eventType === "aso_completed" ? "ASO concluido" : eventType === "aso_requested" ? "ASO registrado" : occupationalRecordTypeLabels[recordType] ?? "Registro ocupacional";

  try {
    const result = await createEmployeeFunctionalEvent(input.context.supabase, {
      employeeId: input.record.employee_id,
      eventType,
      title,
      description: occupationalRecordTypeLabels[recordType] ?? title,
      severity: recordType === "occupational_restriction" ? "warning" : "notice",
      visibilityScope: "restricted",
      isSensitive: true,
      sourceModule: "hr",
      sourceEntityType: "employee_occupational_record",
      sourceEntityId: input.record.id,
      relatedAttachmentId: input.record.attachment_id,
      actorUserId: input.context.session.user.id,
      dedupeKey: `occupational-record:${input.record.id}:${eventType}`,
      eventPayload: {
        record_type: input.record.record_type,
        exam_date: input.record.exam_date,
        expires_at: input.record.expires_at,
        provider_name: input.record.provider_name,
        previous_status: input.previous?.status,
        new_status: input.record.status
      }
    });
    if (!result.ok) logHrApiError("occupational.functional_event_failed", { message: result.error.message, code: result.error.code });
  } catch (error) {
    logHrApiError("occupational.functional_event_failed", error instanceof Error ? error : { message: "Erro desconhecido ao publicar evento ocupacional." });
  }
}

export async function publishNrCertificationEvent(input: { context: HrRequestContext; certification: NrCertificationRow; created?: boolean }) {
  if (!input.created) return;

  try {
    const result = await createEmployeeFunctionalEvent(input.context.supabase, {
      employeeId: input.certification.employee_id,
      eventType: "occupational_exam_registered",
      title: "Certificacao NR registrada",
      description: `${input.certification.nr_code} registrada para o colaborador.`,
      severity: "notice",
      visibilityScope: "restricted",
      isSensitive: true,
      sourceModule: "hr",
      sourceEntityType: "employee_nr_certification",
      sourceEntityId: input.certification.id,
      relatedAttachmentId: input.certification.certificate_attachment_id,
      actorUserId: input.context.session.user.id,
      dedupeKey: `nr-certification:${input.certification.id}:created`,
      eventPayload: {
        record_type: "nr_certification",
        nr_code: input.certification.nr_code,
        expires_at: input.certification.expires_at
      }
    });
    if (!result.ok) logHrApiError("occupational.nr_functional_event_failed", { message: result.error.message, code: result.error.code });
  } catch (error) {
    logHrApiError("occupational.nr_functional_event_failed", error instanceof Error ? error : { message: "Erro desconhecido ao publicar evento de certificacao NR." });
  }
}

async function publishAsoExpirationEvent(input: {
  context: HrRequestContext;
  eventType: "aso_expiring" | "aso_expired";
  record: OccupationalRecordRow;
  previous?: OccupationalRecordRow | null;
}) {
  const titles = {
    aso_expiring: "ASO vencendo",
    aso_expired: "ASO vencido"
  };

  try {
    const result = await createEmployeeFunctionalEvent(input.context.supabase, {
      employeeId: input.record.employee_id,
      eventType: input.eventType,
      title: titles[input.eventType],
      description: `${occupationalRecordTypeLabels[input.record.record_type] ?? "ASO"} ${input.eventType === "aso_expired" ? "vencido" : "em janela de vencimento"}.`,
      severity: input.eventType === "aso_expired" ? "warning" : "notice",
      visibilityScope: "restricted",
      isSensitive: true,
      sourceModule: "hr",
      sourceEntityType: "employee_occupational_record",
      sourceEntityId: input.record.id,
      relatedAttachmentId: input.record.attachment_id,
      actorUserId: input.context.session.user.id,
      dedupeKey: `occupational:${input.record.id}:${input.eventType === "aso_expired" ? "expired" : "expiring"}`,
      eventPayload: {
        record_type: input.record.record_type,
        exam_date: input.record.exam_date,
        expires_at: input.record.expires_at,
        previous_status: input.previous?.status,
        new_status: input.record.status
      }
    });
    if (!result.ok) logHrApiError("occupational.expiration_event_failed", { message: result.error.message, code: result.error.code });
  } catch (error) {
    logHrApiError("occupational.expiration_event_failed", error instanceof Error ? error : { message: "Erro desconhecido ao publicar vencimento ocupacional." });
  }
}

export async function processOccupationalExpirationGovernance(input: { context: HrRequestContext; unitId: string }) {
  assertUnitInHrScope(input.context, input.unitId);

  const asoTypes = ["aso_admission", "aso_periodic", "aso_return", "aso_role_change", "aso_termination"];
  const result = {
    processedCount: 0,
    asoExpiringCount: 0,
    asoExpiredCount: 0,
    nrExpiringCount: 0,
    nrExpiredCount: 0,
    restrictionCount: 0
  };

  const { data: recordData, error: recordError } = await input.context.supabase
    .from("employee_occupational_records")
    .select(occupationalRecordListSelect)
    .eq("unit_id", input.unitId)
    .is("deleted_at", null);

  if (recordError) {
    logHrApiError("occupational.expiration_records_scan_failed", recordError);
    throw new Error("Nao foi possivel processar vencimentos ocupacionais.");
  }

  const records = (recordData ?? []) as unknown as OccupationalRecordRow[];
  const asoRecords = records.filter((record) => asoTypes.includes(record.record_type) && record.expires_at && record.status !== "cancelled");
  result.restrictionCount = records.filter((record) => record.record_type === "occupational_restriction" && record.status !== "cancelled").length;
  result.processedCount += asoRecords.length;

  for (const record of asoRecords) {
    const state = expirationState(record.expires_at, record.status);

    if (state.expiresSoon) {
      result.asoExpiringCount += 1;
      await publishAsoExpirationEvent({ context: input.context, eventType: "aso_expiring", record });
    }

    if (!state.expiredByDate || record.status === "expired") continue;

    const { data: updated, error: updateError } = await input.context.supabase
      .from("employee_occupational_records")
      .update({ status: "expired", updated_by: input.context.session.user.id })
      .eq("id", record.id)
      .select(occupationalRecordListSelect)
      .single();

    if (updateError) {
      logHrApiError("occupational.aso_expiration_update_failed", updateError);
      continue;
    }

    const updatedRecord = updated as unknown as OccupationalRecordRow;
    result.asoExpiredCount += 1;
    await publishAsoExpirationEvent({ context: input.context, eventType: "aso_expired", record: updatedRecord, previous: record });
  }

  const { data: nrData, error: nrError } = await input.context.supabase
    .from("employee_nr_certifications")
    .select(nrCertificationListSelect)
    .eq("unit_id", input.unitId)
    .is("deleted_at", null)
    .not("expires_at", "is", null)
    .neq("status", "cancelled");

  if (nrError) {
    logHrApiError("occupational.expiration_nr_scan_failed", nrError);
    throw new Error("Nao foi possivel processar vencimentos de certificacoes NR.");
  }

  const nrRows = (nrData ?? []) as unknown as NrCertificationRow[];
  result.processedCount += nrRows.length;

  for (const nr of nrRows) {
    const state = expirationState(nr.expires_at, nr.status);

    if (state.expiresSoon) result.nrExpiringCount += 1;
    if (!state.expiredByDate || nr.status === "expired") continue;

    const { error: updateError } = await input.context.supabase
      .from("employee_nr_certifications")
      .update({ status: "expired", updated_by: input.context.session.user.id })
      .eq("id", nr.id);

    if (updateError) {
      logHrApiError("occupational.nr_expiration_update_failed", updateError);
      continue;
    }

    result.nrExpiredCount += 1;
  }

  return result;
}
