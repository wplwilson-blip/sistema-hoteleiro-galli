import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import type { HrWorkflowRow, HrWorkflowStepRow } from "@/lib/hr/workflow-data";

export const HR_WORKFLOW_DELEGATION_SELECT =
  "id, organization_id, unit_id, delegator_user_id, delegate_user_id, workflow_type, step_type, starts_at, ends_at, is_active, reason, metadata, created_by, updated_by, created_at, updated_at, revoked_at, revoked_by, revocation_reason";

export type HrWorkflowDelegationRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  delegator_user_id: string;
  delegate_user_id: string;
  workflow_type: string | null;
  step_type: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  reason: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

export type HrWorkflowDelegationScope = {
  isSuperAdmin: boolean;
  accessibleUnitIds: string[];
  unitId?: string;
  delegatorUserId?: string;
  delegateUserId?: string;
  workflowType?: string;
  isActive?: boolean;
};

export type CreateWorkflowDelegationInput = {
  context: HrRequestContext;
  unitId: string;
  delegatorUserId: string;
  delegateUserId: string;
  workflowType?: string;
  stepType?: string;
  startsAt: string;
  endsAt?: string;
  reason: string;
};

export class HrWorkflowDelegationValidationError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "HrWorkflowDelegationValidationError";
    this.code = code;
    this.status = status;
  }
}

const blockedKeyPattern =
  /(^|_)(cpf|rg|cid|salary|medical|file_path|storage_path|signed_url|signedurl|download_url|public_url|document_number)($|_)/i;

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string | number | boolean | null> = {};

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (blockedKeyPattern.test(key)) continue;
    if (entryValue === null || ["string", "number", "boolean"].includes(typeof entryValue)) {
      result[key] = entryValue as string | number | boolean | null;
    }
  }

  return result;
}

function isActiveNow(delegation: HrWorkflowDelegationRow) {
  const now = new Date().toISOString();
  return (
    delegation.is_active &&
    delegation.revoked_at === null &&
    delegation.starts_at <= now &&
    (delegation.ends_at === null || delegation.ends_at >= now)
  );
}

function templateStepType(step: HrWorkflowStepRow) {
  if (step.requires_approval) return "approval";
  if (step.step_code?.toUpperCase().includes("DOC")) return "document";
  return "task";
}

export function redactWorkflowDelegation(delegation: HrWorkflowDelegationRow) {
  return {
    id: delegation.id,
    organization_id: delegation.organization_id,
    unit_id: delegation.unit_id,
    delegator_user_id: delegation.delegator_user_id,
    delegate_user_id: delegation.delegate_user_id,
    workflow_type: delegation.workflow_type,
    step_type: delegation.step_type,
    starts_at: delegation.starts_at,
    ends_at: delegation.ends_at,
    is_active: delegation.is_active,
    effective_status: isActiveNow(delegation) ? "active" : "inactive",
    reason: delegation.reason,
    metadata: safeMetadata(delegation.metadata),
    created_by: delegation.created_by,
    created_at: delegation.created_at,
    updated_at: delegation.updated_at,
    revoked_at: delegation.revoked_at,
    revoked_by: delegation.revoked_by,
    revocation_reason: delegation.revocation_reason
  };
}

export async function loadWorkflowDelegations(input: {
  supabase: SupabaseAdmin;
  scope: HrWorkflowDelegationScope;
}) {
  if (!input.scope.isSuperAdmin && !input.scope.accessibleUnitIds.length) {
    return [];
  }

  let query = input.supabase
    .from("hr_workflow_approver_delegations")
    .select(HR_WORKFLOW_DELEGATION_SELECT)
    .is("deleted_at", null);

  if (input.scope.unitId) {
    query = query.eq("unit_id", input.scope.unitId);
  } else if (!input.scope.isSuperAdmin) {
    query = query.in("unit_id", input.scope.accessibleUnitIds);
  }

  if (input.scope.delegatorUserId) query = query.eq("delegator_user_id", input.scope.delegatorUserId);
  if (input.scope.delegateUserId) query = query.eq("delegate_user_id", input.scope.delegateUserId);
  if (input.scope.workflowType) query = query.eq("workflow_type", input.scope.workflowType);
  if (typeof input.scope.isActive === "boolean") query = query.eq("is_active", input.scope.isActive);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    logHrApiError("workflow_delegations.lookup_failed", error);
    throw new Error("Nao foi possivel carregar as delegacoes de workflows.");
  }

  return (data ?? []) as HrWorkflowDelegationRow[];
}

async function getUnitOrganizationId(supabase: SupabaseAdmin, unitId: string) {
  const { data, error } = await supabase
    .from("units")
    .select("organization_id")
    .eq("id", unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflow_delegations.unit_lookup_failed", error);
    throw new Error("Nao foi possivel validar a unidade da delegacao.");
  }

  return data?.[0]?.organization_id as string | undefined;
}

async function assertActiveUserInUnit(input: {
  supabase: SupabaseAdmin;
  userId: string;
  unitId: string;
  label: "delegador" | "delegado";
}) {
  const { data, error } = await input.supabase
    .from("user_unit_links")
    .select("id, app_users!inner(id, status)")
    .eq("app_user_id", input.userId)
    .eq("unit_id", input.unitId)
    .eq("status", "active")
    .is("deleted_at", null)
    .eq("app_users.status", "active")
    .is("app_users.deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError(`workflow_delegations.${input.label}_lookup_failed`, error);
    throw new Error(`Nao foi possivel validar o ${input.label}.`);
  }

  if (!data?.length) {
    const errorMessage = input.label === "delegador" ? "Delegador invalido para esta unidade." : "Delegado invalido para esta unidade.";
    throw new HrWorkflowDelegationValidationError("USER_UNIT_INVALID", errorMessage, 422);
  }
}

export async function createWorkflowDelegation(input: CreateWorkflowDelegationInput) {
  const organizationId = await getUnitOrganizationId(input.context.supabase, input.unitId);

  if (!organizationId) {
    throw new HrWorkflowDelegationValidationError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
  }

  await Promise.all([
    assertActiveUserInUnit({
      supabase: input.context.supabase,
      userId: input.delegatorUserId,
      unitId: input.unitId,
      label: "delegador"
    }),
    assertActiveUserInUnit({
      supabase: input.context.supabase,
      userId: input.delegateUserId,
      unitId: input.unitId,
      label: "delegado"
    })
  ]);

  const { data, error } = await input.context.supabase
    .from("hr_workflow_approver_delegations")
    .insert({
      organization_id: organizationId,
      unit_id: input.unitId,
      delegator_user_id: input.delegatorUserId,
      delegate_user_id: input.delegateUserId,
      workflow_type: input.workflowType ?? null,
      step_type: input.stepType ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      reason: input.reason,
      metadata: { source: "api" },
      created_by: input.context.session.user.id,
      updated_by: input.context.session.user.id
    })
    .select(HR_WORKFLOW_DELEGATION_SELECT)
    .single();

  if (error) {
    logHrApiError("workflow_delegations.insert_failed", error);
    throw new Error("Nao foi possivel criar a delegacao de workflow.");
  }

  return data as HrWorkflowDelegationRow;
}

export async function revokeWorkflowDelegation(input: {
  context: HrRequestContext;
  delegationId: string;
  reason: string;
}) {
  const { data: currentData, error: currentError } = await input.context.supabase
    .from("hr_workflow_approver_delegations")
    .select(HR_WORKFLOW_DELEGATION_SELECT)
    .eq("id", input.delegationId)
    .is("deleted_at", null)
    .limit(1);

  if (currentError) {
    logHrApiError("workflow_delegations.revoke_lookup_failed", currentError);
    throw new Error("Nao foi possivel localizar a delegacao.");
  }

  const current = currentData?.[0] as HrWorkflowDelegationRow | undefined;
  if (!current) return null;

  if (!input.context.isSuperAdmin && !input.context.accessibleUnitIds.includes(current.unit_id)) {
    return null;
  }

  const { data, error } = await input.context.supabase
    .from("hr_workflow_approver_delegations")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: input.context.session.user.id,
      revocation_reason: input.reason,
      updated_by: input.context.session.user.id
    })
    .eq("id", input.delegationId)
    .select(HR_WORKFLOW_DELEGATION_SELECT)
    .single();

  if (error) {
    logHrApiError("workflow_delegations.revoke_failed", error);
    throw new Error("Nao foi possivel revogar a delegacao.");
  }

  return data as HrWorkflowDelegationRow;
}

export async function resolveActiveWorkflowDelegation(input: {
  supabase: SupabaseAdmin;
  workflow: HrWorkflowRow;
  step: HrWorkflowStepRow;
  delegateUserId: string;
}) {
  if (!input.step.assigned_to_user_id || input.step.assigned_to_user_id === input.delegateUserId) {
    return null;
  }

  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("hr_workflow_approver_delegations")
    .select(HR_WORKFLOW_DELEGATION_SELECT)
    .eq("organization_id", input.workflow.organization_id)
    .eq("unit_id", input.workflow.unit_id)
    .eq("delegator_user_id", input.step.assigned_to_user_id)
    .eq("delegate_user_id", input.delegateUserId)
    .eq("is_active", true)
    .is("revoked_at", null)
    .is("deleted_at", null)
    .lte("starts_at", now)
    .or(`workflow_type.is.null,workflow_type.eq.${input.workflow.workflow_type}`)
    .order("starts_at", { ascending: false })
    .limit(10);

  if (error) {
    logHrApiError("workflow_delegations.resolve_failed", error);
    throw new Error("Nao foi possivel validar a delegacao do aprovador.");
  }

  const stepType = templateStepType(input.step);
  const delegation = ((data ?? []) as HrWorkflowDelegationRow[]).find(
    (row) => (row.ends_at === null || row.ends_at >= now) && (row.step_type === null || row.step_type === stepType)
  );

  return delegation ?? null;
}
