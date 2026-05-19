import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";

export const HR_WORKFLOW_NOTIFICATION_SELECT =
  "id, organization_id, unit_id, workflow_id, step_id, event_id, recipient_user_id, notification_type, channel, status, priority, title, message, visibility_scope, is_sensitive, payload, scheduled_for, sent_at, read_at, failed_at, failure_reason, created_at, updated_at";

export type HrWorkflowNotificationType =
  | "workflow_event"
  | "workflow_assigned"
  | "workflow_status_changed"
  | "step_assigned"
  | "step_waiting_approval"
  | "step_returned"
  | "step_rejected"
  | "workflow_cancelled"
  | "sla_warning"
  | "sla_overdue"
  | "escalation_notice";

export type HrWorkflowNotificationChannel = "in_app" | "email" | "whatsapp";
export type HrWorkflowNotificationStatus = "pending" | "scheduled" | "sent" | "read" | "failed" | "cancelled";
export type HrWorkflowNotificationPriority = "low" | "normal" | "high" | "critical";

export type HrWorkflowNotificationRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  step_id: string | null;
  event_id: string | null;
  recipient_user_id: string;
  notification_type: HrWorkflowNotificationType;
  channel: HrWorkflowNotificationChannel;
  status: HrWorkflowNotificationStatus;
  priority: HrWorkflowNotificationPriority;
  title: string;
  message: string;
  visibility_scope: string;
  is_sensitive: boolean;
  payload: Record<string, unknown>;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type CreateHrWorkflowNotificationInput = {
  supabase: SupabaseAdmin;
  organizationId: string;
  unitId: string;
  workflowId: string;
  stepId?: string | null;
  eventId?: string | null;
  recipientUserId: string;
  notificationType: HrWorkflowNotificationType;
  channel?: HrWorkflowNotificationChannel;
  status?: Extract<HrWorkflowNotificationStatus, "pending" | "scheduled">;
  priority?: HrWorkflowNotificationPriority;
  title: string;
  message: string;
  payload?: Record<string, unknown> | null;
  scheduledFor?: string | null;
  isSensitive?: boolean;
  visibilityScope?: "restricted" | "unit" | "organization";
  createdBy?: string | null;
};

const notificationPayloadKeys = new Set([
  "workflow_id",
  "step_id",
  "event_id",
  "event_type",
  "notification_type",
  "channel",
  "status",
  "priority",
  "workflow_status",
  "step_status",
  "sla_status",
  "escalation_level",
  "reason_code",
  "action",
  "summary",
  "scheduled_for"
]);

const blockedPayloadKeyPattern =
  /(^|_)(cpf|rg|cid|salary|medical|file_path|storage_path|signed_url|signedurl|download_url|public_url|document_number)($|_)/i;

function isSafePayloadValue(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function sanitizeNotificationPayload(payload: Record<string, unknown> | null | undefined) {
  const source = safeRecord(payload);
  const result: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!notificationPayloadKeys.has(key) || blockedPayloadKeyPattern.test(key) || !isSafePayloadValue(value)) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function redactWorkflowNotification(input: {
  notification: HrWorkflowNotificationRow;
  canViewSensitive: boolean;
}) {
  const isRedacted = input.notification.is_sensitive && !input.canViewSensitive;

  return {
    id: input.notification.id,
    organization_id: input.notification.organization_id,
    unit_id: input.notification.unit_id,
    workflow_id: input.notification.workflow_id,
    step_id: input.notification.step_id,
    event_id: input.notification.event_id,
    recipient_user_id: input.notification.recipient_user_id,
    notification_type: input.notification.notification_type,
    channel: input.notification.channel,
    status: input.notification.status,
    priority: input.notification.priority,
    title: isRedacted ? "Notificacao restrita" : input.notification.title,
    message: isRedacted ? "Conteudo restrito" : input.notification.message,
    payload: isRedacted ? { redacted: true } : sanitizeNotificationPayload(input.notification.payload),
    scheduled_for: input.notification.scheduled_for,
    sent_at: input.notification.sent_at,
    read_at: input.notification.read_at,
    failed_at: input.notification.failed_at,
    failure_reason: isRedacted ? null : input.notification.failure_reason,
    is_sensitive: input.notification.is_sensitive,
    redacted: isRedacted,
    created_at: input.notification.created_at,
    updated_at: input.notification.updated_at
  };
}

export async function createWorkflowNotificationRecord(input: CreateHrWorkflowNotificationInput) {
  const status = input.status ?? (input.scheduledFor ? "scheduled" : "pending");
  const visibilityScope = input.isSensitive ? "restricted" : input.visibilityScope ?? "unit";

  const { data, error } = await input.supabase
    .from("hr_workflow_notifications")
    .insert({
      organization_id: input.organizationId,
      unit_id: input.unitId,
      workflow_id: input.workflowId,
      step_id: input.stepId ?? null,
      event_id: input.eventId ?? null,
      recipient_user_id: input.recipientUserId,
      notification_type: input.notificationType,
      channel: input.channel ?? "in_app",
      status,
      priority: input.priority ?? "normal",
      title: input.title.trim(),
      message: input.message.trim(),
      visibility_scope: visibilityScope,
      is_sensitive: input.isSensitive ?? false,
      payload: sanitizeNotificationPayload(input.payload),
      scheduled_for: input.scheduledFor ?? null,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null
    })
    .select(HR_WORKFLOW_NOTIFICATION_SELECT)
    .single();

  if (error) {
    logHrApiError("workflow_notifications.insert_failed", error);
    throw new Error("Nao foi possivel registrar a notificacao de workflow.");
  }

  return data as HrWorkflowNotificationRow;
}

export async function loadWorkflowNotifications(input: {
  supabase: SupabaseAdmin;
  workflowId: string;
  status?: HrWorkflowNotificationStatus;
  channel?: HrWorkflowNotificationChannel;
}) {
  let query = input.supabase
    .from("hr_workflow_notifications")
    .select(HR_WORKFLOW_NOTIFICATION_SELECT)
    .eq("workflow_id", input.workflowId)
    .is("deleted_at", null);

  if (input.status) query = query.eq("status", input.status);
  if (input.channel) query = query.eq("channel", input.channel);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logHrApiError("workflow_notifications.lookup_failed", error);
    throw new Error("Nao foi possivel carregar as notificacoes de workflow.");
  }

  return (data ?? []) as HrWorkflowNotificationRow[];
}
