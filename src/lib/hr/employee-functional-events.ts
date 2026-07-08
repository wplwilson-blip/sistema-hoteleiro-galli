import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { logHrApiError } from "@/lib/hr/api-auth";
import { employeeFunctionalEventTypeSchema } from "@/lib/hr/schemas";

export type EmployeeFunctionalEventType = z.infer<typeof employeeFunctionalEventTypeSchema>;
export type EmployeeFunctionalEventSeverity = "info" | "notice" | "warning" | "critical";
export type EmployeeFunctionalEventVisibilityScope = "restricted" | "unit" | "organization";
export type EmployeeFunctionalEventStatus = "active" | "cancelled" | "corrected";

export type CreateEmployeeFunctionalEventInput = {
  employeeId: string;
  eventType: EmployeeFunctionalEventType;
  eventDate?: string | Date;
  title?: string;
  description?: string | null;
  severity?: EmployeeFunctionalEventSeverity;
  visibilityScope?: EmployeeFunctionalEventVisibilityScope;
  isSensitive?: boolean;
  sourceModule: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  relatedDocumentId?: string | null;
  relatedAttachmentId?: string | null;
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  eventPayload?: Record<string, unknown>;
  status?: EmployeeFunctionalEventStatus;
  dedupeKey?: string;
};

export type EmployeeFunctionalEventRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  event_type: string;
  event_date: string;
  title: string;
  description: string | null;
  severity: string;
  visibility_scope: string;
  is_sensitive: boolean;
  source_module: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  related_document_id: string | null;
  related_attachment_id: string | null;
  actor_user_id: string | null;
  actor_employee_id: string | null;
  event_payload: Record<string, unknown>;
  status: string;
  correction_of_event_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type CreateEmployeeFunctionalEventResult =
  | {
      ok: true;
      data: EmployeeFunctionalEventRow;
      deduped: boolean;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

type EmployeeScopeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
};

type FunctionalEventSupabase = SupabaseClient;

type FunctionalEventDomain =
  | "registration"
  | "documents"
  | "admission"
  | "onboarding"
  | "evaluations"
  | "development"
  | "movement"
  | "conduct"
  | "training"
  | "occupational_health"
  | "termination"
  | "other";

const employeeSelect = "id, organization_id, unit_id";
const eventSelect =
  "id, organization_id, unit_id, employee_id, event_type, event_date, title, description, severity, visibility_scope, is_sensitive, source_module, source_entity_type, source_entity_id, related_document_id, related_attachment_id, actor_user_id, actor_employee_id, event_payload, status, correction_of_event_id, created_at, updated_at";

const eventTypeLabels: Record<EmployeeFunctionalEventType, string> = {
  employee_created: "Colaborador criado",
  employee_basic_updated: "Dados basicos alterados",
  employee_sensitive_updated: "Dados protegidos alterados",
  unit_changed: "Unidade alterada",
  department_changed: "Departamento alterado",
  job_position_changed: "Cargo alterado",
  document_requested: "Documento solicitado",
  document_uploaded: "Documento enviado",
  document_verified: "Documento aprovado",
  document_rejected: "Documento rejeitado",
  document_expired: "Documento vencido",
  document_replaced: "Documento substituido",
  document_waived: "Documento dispensado",
  admission_started: "Admissao iniciada",
  admission_completed: "Admissao concluida",
  termination_started: "Desligamento iniciado",
  termination_completed: "Desligamento concluido",
  training_registered: "Treinamento registrado",
  warning_registered: "Advertencia registrada",
  vacation_registered: "Ferias registradas",
  note_added: "Observacao registrada",
  onboarding_created: "Onboarding criado",
  onboarding_started: "Onboarding iniciado",
  onboarding_item_started: "Item de onboarding iniciado",
  onboarding_item_completed: "Item de onboarding concluido",
  onboarding_item_blocked: "Item de onboarding bloqueado",
  onboarding_item_waived: "Item de onboarding dispensado",
  onboarding_completed: "Onboarding concluido",
  onboarding_cancelled: "Onboarding cancelado",
  evaluation_created: "Avaliacao criada",
  evaluation_started: "Avaliacao iniciada",
  evaluation_submitted: "Avaliacao enviada",
  evaluation_reviewed: "Avaliacao revisada",
  evaluation_feedback_given: "Devolutiva registrada",
  evaluation_acknowledged: "Ciencia do colaborador registrada",
  evaluation_closed: "Avaliacao encerrada",
  evaluation_cancelled: "Avaliacao cancelada",
  development_plan_created: "PDI criado",
  development_plan_item_created: "Item de PDI criado",
  development_plan_item_completed: "Item de PDI concluido",
  development_plan_item_overdue: "Item de PDI em atraso",
  development_plan_reviewed: "PDI revisado",
  development_plan_completed: "PDI concluido",
  development_plan_cancelled: "PDI cancelado",
  salary_changed: "Salario alterado",
  promotion_registered: "Promocao registrada",
  transfer_registered: "Transferencia registrada",
  suspension_registered: "Suspensao registrada",
  complaint_registered: "Reclamacao registrada",
  compliment_registered: "Elogio registrado",
  formal_guidance_registered: "Orientacao formal registrada",
  formal_conversation_registered: "Conversa formal registrada",
  training_required: "Treinamento obrigatorio criado",
  training_completed: "Treinamento concluido",
  training_certificate_uploaded: "Certificado de treinamento anexado",
  training_expiring: "Treinamento vencendo",
  training_expired: "Treinamento vencido",
  training_retraining_required: "Reciclagem necessaria",
  aso_requested: "ASO solicitado",
  aso_completed: "ASO concluido",
  aso_expiring: "ASO vencendo",
  aso_expired: "ASO vencido",
  nr_expiring: "Certificação NR vencendo",
  nr_expired: "Certificação NR vencida",
  occupational_restriction_registered: "Restricao ocupacional registrada",
  occupational_exam_registered: "Exame ocupacional registrado",
  termination_checklist_created: "Checklist de desligamento criado",
  termination_pending_item_registered: "Pendencia de desligamento registrada",
  employee_inactivated: "Colaborador inativado"
};

const blockedPayloadKeyPattern =
  /(cpf|rg|ctps|pis|banco|bancario|bank|account|agencia|salary|salario|medical|medico|cid|diagnostico|laudo|token|password|senha|auth|file|path|storage|signed_url|url_assinada|document_number)/i;
const blockedTextPattern =
  /(cpf|ctps|pis|cid|diagnostico|laudo|token|password|senha|signed_url|url assinada|storage_path|file_path|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i;

function eventDomain(eventType: EmployeeFunctionalEventType): FunctionalEventDomain {
  if (["employee_created", "employee_basic_updated", "employee_sensitive_updated"].includes(eventType)) return "registration";
  if (eventType.startsWith("document_")) return "documents";
  if (eventType.startsWith("admission_")) return "admission";
  if (eventType.startsWith("onboarding_")) return "onboarding";
  if (eventType.startsWith("evaluation_")) return "evaluations";
  if (eventType.startsWith("development_plan_")) return "development";
  if (["unit_changed", "department_changed", "job_position_changed", "salary_changed", "promotion_registered", "transfer_registered"].includes(eventType)) return "movement";
  if (
    [
      "warning_registered",
      "suspension_registered",
      "complaint_registered",
      "compliment_registered",
      "formal_guidance_registered",
      "formal_conversation_registered"
    ].includes(eventType)
  ) {
    return "conduct";
  }
  if (eventType.startsWith("training_")) return "training";
  if (eventType.startsWith("aso_") || eventType.startsWith("occupational_") || eventType.startsWith("nr_")) return "occupational_health";
  if (eventType.startsWith("termination_") || eventType === "employee_inactivated") return "termination";
  return "other";
}

function defaultSeverity(eventType: EmployeeFunctionalEventType): EmployeeFunctionalEventSeverity {
  const domain = eventDomain(eventType);
  if (domain === "conduct" || domain === "occupational_health" || domain === "termination") return "warning";
  if (domain === "onboarding" || domain === "registration" || domain === "other") return "info";
  return "notice";
}

function defaultIsSensitive(eventType: EmployeeFunctionalEventType): boolean {
  const domain = eventDomain(eventType);
  if (eventType === "employee_sensitive_updated" || eventType === "salary_changed") return true;
  if (domain === "documents" || domain === "evaluations" || domain === "development" || domain === "occupational_health" || domain === "termination") return true;
  if (domain === "conduct") return eventType !== "compliment_registered";
  return false;
}

function defaultVisibilityScope(eventType: EmployeeFunctionalEventType, isSensitive: boolean): EmployeeFunctionalEventVisibilityScope {
  const domain = eventDomain(eventType);
  if (isSensitive) return "restricted";
  if (domain === "documents" || domain === "evaluations" || domain === "development" || domain === "occupational_health" || domain === "termination") return "restricted";
  return "unit";
}

function formatEventDate(eventDate?: string | Date) {
  if (!eventDate) return new Date().toISOString();
  if (eventDate instanceof Date) return eventDate.toISOString();
  return eventDate;
}

function sanitizeText(value: string | null | undefined) {
  if (value == null) return { ok: true as const, value: null };
  const text = value.trim();
  if (!text) return { ok: true as const, value: null };
  if (blockedTextPattern.test(text)) {
    return {
      ok: false as const,
      message: "Texto contem dado sensivel ou tecnico que nao deve ser gravado na Vida Funcional."
    };
  }
  return { ok: true as const, value: text };
}

function sanitizePayloadValue(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizePayloadValue).filter((item) => item !== undefined);
  if (typeof value === "object") return sanitizePayload(value as Record<string, unknown>);
  if (typeof value === "string" && blockedTextPattern.test(value)) return undefined;
  return value;
}

function sanitizePayload(payload: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (blockedPayloadKeyPattern.test(key)) continue;
    const sanitizedValue = sanitizePayloadValue(value);
    if (sanitizedValue !== undefined) sanitized[key] = sanitizedValue;
  }

  return sanitized;
}

function shouldRunDedupe(input: CreateEmployeeFunctionalEventInput) {
  return Boolean(input.dedupeKey);
}

async function loadEmployee(supabase: FunctionalEventSupabase, employeeId: string) {
  const { data, error } = await supabase.from("employees").select(employeeSelect).eq("id", employeeId).is("deleted_at", null).limit(1);

  if (error) {
    logHrApiError("functional_events.employee_lookup_failed", error);
    return { ok: false as const, message: "Nao foi possivel localizar o colaborador." };
  }

  const employee = data?.[0] as EmployeeScopeRow | undefined;
  if (!employee) return { ok: false as const, message: "Colaborador nao encontrado para registro da Vida Funcional." };
  if (!employee.organization_id || !employee.unit_id) {
    return { ok: false as const, message: "Colaborador sem unidade ou organizacao valida para registro da Vida Funcional." };
  }

  return { ok: true as const, employee };
}

async function findDuplicateEvent(input: {
  supabase: FunctionalEventSupabase;
  employeeId: string;
  eventType: EmployeeFunctionalEventType;
  sourceModule: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  relatedDocumentId: string | null;
  dedupeKey?: string;
}) {
  let query = input.supabase
    .from("employee_functional_events")
    .select(eventSelect)
    .eq("employee_id", input.employeeId)
    .eq("event_type", input.eventType)
    .eq("source_module", input.sourceModule)
    .eq("status", "active")
    .order("event_date", { ascending: false })
    .limit(1);

  if (input.sourceEntityType) query = query.eq("source_entity_type", input.sourceEntityType);
  if (input.sourceEntityId) query = query.eq("source_entity_id", input.sourceEntityId);
  if (input.relatedDocumentId) query = query.eq("related_document_id", input.relatedDocumentId);
  if (input.dedupeKey) query = query.eq("event_payload->>dedupe_key", input.dedupeKey);

  const { data, error } = await query;
  if (error) {
    logHrApiError("functional_events.dedupe_lookup_failed", error);
    return null;
  }

  return ((data ?? [])[0] as EmployeeFunctionalEventRow | undefined) ?? null;
}

export async function createEmployeeFunctionalEvent(
  supabase: FunctionalEventSupabase,
  input: CreateEmployeeFunctionalEventInput
): Promise<CreateEmployeeFunctionalEventResult> {
  const eventTypeResult = employeeFunctionalEventTypeSchema.safeParse(input.eventType);
  if (!eventTypeResult.success) {
    return { ok: false, error: { code: "invalid_event_type", message: "Tipo de evento funcional invalido." } };
  }

  const sourceModule = input.sourceModule.trim();
  if (!sourceModule) {
    return { ok: false, error: { code: "invalid_source_module", message: "Modulo de origem e obrigatorio." } };
  }

  const employeeResult = await loadEmployee(supabase, input.employeeId);
  if (!employeeResult.ok) {
    return { ok: false, error: { code: "employee_not_found", message: employeeResult.message } };
  }

  const title = input.title?.trim() || eventTypeLabels[eventTypeResult.data];
  const descriptionResult = sanitizeText(input.description);
  if (!descriptionResult.ok) {
    return { ok: false, error: { code: "unsafe_description", message: descriptionResult.message } };
  }

  const isSensitive = input.isSensitive ?? defaultIsSensitive(eventTypeResult.data);
  const visibilityScope = input.visibilityScope ?? defaultVisibilityScope(eventTypeResult.data, isSensitive);
  const payload = sanitizePayload({
    ...(input.eventPayload ?? {}),
    ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {})
  });

  const sourceEntityType = input.sourceEntityType ?? null;
  const sourceEntityId = input.sourceEntityId ?? null;
  const relatedDocumentId = input.relatedDocumentId ?? null;

  if (shouldRunDedupe(input)) {
    const duplicate = await findDuplicateEvent({
      supabase,
      employeeId: employeeResult.employee.id,
      eventType: eventTypeResult.data,
      sourceModule,
      sourceEntityType,
      sourceEntityId,
      relatedDocumentId,
      dedupeKey: input.dedupeKey
    });

    if (duplicate) {
      return { ok: true, data: duplicate, deduped: true };
    }
  }

  const { data, error } = await supabase
    .from("employee_functional_events")
    .insert({
      organization_id: employeeResult.employee.organization_id,
      unit_id: employeeResult.employee.unit_id,
      employee_id: employeeResult.employee.id,
      event_type: eventTypeResult.data,
      event_date: formatEventDate(input.eventDate),
      title,
      description: descriptionResult.value,
      severity: input.severity ?? defaultSeverity(eventTypeResult.data),
      visibility_scope: visibilityScope,
      is_sensitive: isSensitive,
      source_module: sourceModule,
      source_entity_type: sourceEntityType,
      source_entity_id: sourceEntityId,
      related_document_id: relatedDocumentId,
      related_attachment_id: input.relatedAttachmentId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_employee_id: input.actorEmployeeId ?? null,
      event_payload: payload,
      status: input.status ?? "active",
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null
    })
    .select(eventSelect)
    .single();

  if (error) {
    logHrApiError("functional_events.insert_failed", error);
    return { ok: false, error: { code: "insert_failed", message: "Nao foi possivel registrar o evento na Vida Funcional." } };
  }

  return { ok: true, data: data as EmployeeFunctionalEventRow, deduped: false };
}
