import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError } from "@/lib/hr/api-auth";

export const HR_WORKFLOW_TEMPLATE_SELECT =
  "id, organization_id, unit_id, workflow_type, code, name, description, is_active, is_system, default_sla_minutes, default_escalation_enabled, default_escalation_max_level, default_notification_enabled, metadata, created_at, updated_at";

export const HR_WORKFLOW_TEMPLATE_STEP_SELECT =
  "id, template_id, step_key, name, description, step_type, order_index, is_required, default_assigned_role, default_assigned_profile_id, default_sla_minutes, requires_approval, default_notification_enabled, metadata, created_at, updated_at";

export type HrWorkflowTemplateRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  workflow_type: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  default_sla_minutes: number | string | null;
  default_escalation_enabled: boolean;
  default_escalation_max_level: number | string;
  default_notification_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HrWorkflowTemplateStepRow = {
  id: string;
  template_id: string;
  step_key: string;
  name: string;
  description: string | null;
  step_type: string;
  order_index: number | string;
  is_required: boolean;
  default_assigned_role: string | null;
  default_assigned_profile_id: string | null;
  default_sla_minutes: number | string | null;
  requires_approval: boolean;
  default_notification_enabled: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type HrWorkflowTemplateScope = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  unitId?: string;
  workflowType?: string;
  isActive?: boolean;
  includeSystem?: boolean;
};

const blockedMetadataKeyPattern =
  /(^|_)(cpf|rg|cid|salary|medical|file_path|storage_path|signed_url|signedurl|download_url|public_url|document_number)($|_)/i;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function safeMetadata(value: unknown, depth = 0): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) {
    return {};
  }

  const result: Record<string, JsonValue> = {};

  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (blockedMetadataKeyPattern.test(key)) {
      continue;
    }

    if (rawValue === null || ["string", "number", "boolean"].includes(typeof rawValue)) {
      result[key] = rawValue as JsonValue;
      continue;
    }

    if (Array.isArray(rawValue)) {
      const safeArray = rawValue.filter((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
      result[key] = safeArray as JsonValue[];
      continue;
    }

    if (typeof rawValue === "object") {
      result[key] = safeMetadata(rawValue, depth + 1);
    }
  }

  return result;
}

export function redactWorkflowTemplateStep(step: HrWorkflowTemplateStepRow) {
  return {
    id: step.id,
    template_id: step.template_id,
    step_key: step.step_key,
    name: step.name,
    description: step.description,
    step_type: step.step_type,
    order_index: Number(step.order_index),
    is_required: step.is_required,
    default_assigned_role: step.default_assigned_role,
    default_assigned_profile_id: step.default_assigned_profile_id,
    default_sla_minutes: toNumber(step.default_sla_minutes),
    requires_approval: step.requires_approval,
    default_notification_enabled: step.default_notification_enabled,
    metadata: safeMetadata(step.metadata),
    created_at: step.created_at,
    updated_at: step.updated_at
  };
}

export function redactWorkflowTemplate(input: {
  template: HrWorkflowTemplateRow;
  steps?: HrWorkflowTemplateStepRow[];
}) {
  return {
    id: input.template.id,
    organization_id: input.template.organization_id,
    unit_id: input.template.unit_id,
    workflow_type: input.template.workflow_type,
    code: input.template.code,
    name: input.template.name,
    description: input.template.description,
    is_active: input.template.is_active,
    is_system: input.template.is_system,
    default_sla_minutes: toNumber(input.template.default_sla_minutes),
    default_escalation_enabled: input.template.default_escalation_enabled,
    default_escalation_max_level: Number(input.template.default_escalation_max_level),
    default_notification_enabled: input.template.default_notification_enabled,
    metadata: safeMetadata(input.template.metadata),
    steps: input.steps?.map(redactWorkflowTemplateStep) ?? undefined,
    created_at: input.template.created_at,
    updated_at: input.template.updated_at
  };
}

async function getUnitOrganizationIds(supabase: SupabaseAdmin, unitIds: string[]) {
  if (!unitIds.length) return [];

  const { data, error } = await supabase
    .from("units")
    .select("organization_id")
    .in("id", unitIds)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("workflow_templates.unit_org_lookup_failed", error);
    throw new Error("Nao foi possivel validar as organizacoes dos templates.");
  }

  return unique((data ?? []).map((unit) => unit.organization_id));
}

export async function loadWorkflowTemplates(input: {
  supabase: SupabaseAdmin;
  scope: HrWorkflowTemplateScope;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return [];
  }

  const unitIds = input.scope.unitId ? [input.scope.unitId] : input.scope.accessibleUnitIds;
  const organizationIds = await getUnitOrganizationIds(input.supabase, unitIds);
  let query = input.supabase
    .from("hr_workflow_templates")
    .select(HR_WORKFLOW_TEMPLATE_SELECT)
    .is("deleted_at", null);

  if (input.scope.workflowType) query = query.eq("workflow_type", input.scope.workflowType);
  if (typeof input.scope.isActive === "boolean") query = query.eq("is_active", input.scope.isActive);
  if (input.scope.includeSystem === false) query = query.eq("is_system", false);

  if (input.scope.unitId) {
    if (!organizationIds.length) return [];
    query = query.eq("organization_id", organizationIds[0]).or(`unit_id.is.null,unit_id.eq.${input.scope.unitId}`);
  } else if (!input.scope.isSuperAdmin) {
    if (!organizationIds.length) return [];
    query = query.in("organization_id", organizationIds).or(`unit_id.is.null,unit_id.in.(${input.scope.accessibleUnitIds.join(",")})`);
  }

  const { data, error } = await query.order("name", { ascending: true }).order("code", { ascending: true });

  if (error) {
    logHrApiError("workflow_templates.lookup_failed", error);
    throw new Error("Nao foi possivel carregar os templates de workflow.");
  }

  return (data ?? []) as HrWorkflowTemplateRow[];
}

export async function loadWorkflowTemplateSteps(input: {
  supabase: SupabaseAdmin;
  templateIds: string[];
}) {
  if (!input.templateIds.length) return new Map<string, HrWorkflowTemplateStepRow[]>();

  const { data, error } = await input.supabase
    .from("hr_workflow_template_steps")
    .select(HR_WORKFLOW_TEMPLATE_STEP_SELECT)
    .in("template_id", input.templateIds)
    .is("deleted_at", null)
    .order("order_index", { ascending: true });

  if (error) {
    logHrApiError("workflow_template_steps.lookup_failed", error);
    throw new Error("Nao foi possivel carregar as etapas dos templates de workflow.");
  }

  const grouped = new Map<string, HrWorkflowTemplateStepRow[]>();

  for (const step of (data ?? []) as HrWorkflowTemplateStepRow[]) {
    grouped.set(step.template_id, [...(grouped.get(step.template_id) ?? []), step]);
  }

  return grouped;
}

export async function loadWorkflowTemplateDetail(input: {
  supabase: SupabaseAdmin;
  templateId: string;
  scope: Pick<HrWorkflowTemplateScope, "isSuperAdmin" | "accessibleUnitIds">;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return null;
  }

  const { data, error } = await input.supabase
    .from("hr_workflow_templates")
    .select(HR_WORKFLOW_TEMPLATE_SELECT)
    .eq("id", input.templateId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflow_templates.detail_failed", error);
    throw new Error("Nao foi possivel carregar o template de workflow.");
  }

  const template = data?.[0] as HrWorkflowTemplateRow | undefined;
  if (!template) return null;

  if (!input.scope.isSuperAdmin) {
    const unitIds = input.scope.accessibleUnitIds;
    const organizationIds = await getUnitOrganizationIds(input.supabase, unitIds);
    const canAccessUnitTemplate = Boolean(template.unit_id && unitIds.includes(template.unit_id));
    const canAccessGlobalTemplate = template.unit_id === null && organizationIds.includes(template.organization_id);

    if (!canAccessUnitTemplate && !canAccessGlobalTemplate) {
      return null;
    }
  }

  const stepsByTemplate = await loadWorkflowTemplateSteps({
    supabase: input.supabase,
    templateIds: [template.id]
  });

  return {
    template,
    steps: stepsByTemplate.get(template.id) ?? []
  };
}
