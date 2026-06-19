import "server-only";

import type { SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";
import { logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";

export const HR_ADMISSION_PROCESS_SELECT =
  "id, organization_id, unit_id, source_job_opening_workflow_id, source_candidate_id, admission_workflow_id, employee_id, job_position_id, department_id, job_title, cbo_code, department_name, status, current_step, expected_start_date, documents_status, accounting_status, registration_status, occupational_health_status, uniform_status, onboarding_status, notes, created_by, updated_by, created_at, updated_at";

export const HR_ADMISSION_CHECKLIST_ITEM_SELECT =
  "id, organization_id, unit_id, admission_process_id, item_type, item_key, title, description, requirement_level, status, is_required, blocks_activation, source_requirement_key, source_rule_group, due_at, completed_at, completed_by, waived_at, waived_by, waiver_reason, notes, sort_order, created_by, updated_by, created_at, updated_at";

export type HrAdmissionProcessStatus =
  | "draft"
  | "documents_requested"
  | "documents_under_review"
  | "sent_to_accounting"
  | "registration_pending"
  | "registered"
  | "onboarding_ready"
  | "completed"
  | "cancelled";

export type HrAdmissionAuxiliaryStatus = "not_started" | "pending" | "in_progress" | "completed" | "blocked" | "waived" | "cancelled";

export type HrAdmissionChecklistItemType =
  | "document"
  | "occupational_health"
  | "training"
  | "uniform"
  | "epi"
  | "onboarding"
  | "accounting"
  | "registration"
  | "sst_confirmation"
  | "general";

export type HrAdmissionRequirementLevel = "required" | "recommended" | "confirm_with_sst" | "conditional";

export type HrAdmissionChecklistStatus =
  | "pending"
  | "requested"
  | "received"
  | "under_review"
  | "approved"
  | "rejected"
  | "waived"
  | "completed"
  | "not_applicable"
  | "cancelled";

export type HrAdmissionProcessRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  source_job_opening_workflow_id: string | null;
  source_candidate_id: string | null;
  admission_workflow_id: string | null;
  employee_id: string | null;
  job_position_id: string | null;
  department_id: string | null;
  job_title: string | null;
  cbo_code: string | null;
  department_name: string | null;
  status: HrAdmissionProcessStatus;
  current_step: HrAdmissionProcessStatus;
  expected_start_date: string | null;
  documents_status: HrAdmissionAuxiliaryStatus;
  accounting_status: HrAdmissionAuxiliaryStatus;
  registration_status: HrAdmissionAuxiliaryStatus;
  occupational_health_status: HrAdmissionAuxiliaryStatus;
  uniform_status: HrAdmissionAuxiliaryStatus;
  onboarding_status: HrAdmissionAuxiliaryStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrAdmissionChecklistItemRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  admission_process_id: string;
  item_type: HrAdmissionChecklistItemType;
  item_key: string;
  title: string;
  description: string | null;
  requirement_level: HrAdmissionRequirementLevel;
  status: HrAdmissionChecklistStatus;
  is_required: boolean;
  blocks_activation: boolean;
  source_requirement_key: string | null;
  source_rule_group: string | null;
  due_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  waived_at: string | null;
  waived_by: string | null;
  waiver_reason: string | null;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EnsureAdmissionProcessInput = {
  organizationId: string;
  unitId: string | null;
  sourceJobOpeningWorkflowId?: string | null;
  sourceCandidateId?: string | null;
  admissionWorkflowId?: string | null;
  employeeId?: string | null;
  jobPositionId?: string | null;
  departmentId?: string | null;
  jobTitle?: string | null;
  cboCode?: string | null;
  departmentName?: string | null;
  expectedStartDate?: string | null;
  actorUserId?: string | null;
};

export type EnsureAdmissionMinimumChecklistInput = {
  organizationId: string;
  unitId: string | null;
  admissionProcessId: string;
  actorUserId?: string | null;
};

export type AdmissionProcessListFilters = {
  workflowId?: string;
  candidateId?: string;
  employeeId?: string;
  jobOpeningWorkflowId?: string;
  status?: HrAdmissionProcessStatus;
  page?: number;
  pageSize?: number;
};

export type HrAdmissionStatusSummary = {
  processStatus: HrAdmissionProcessStatus;
  currentStep: HrAdmissionProcessStatus;
  documentsStatus: HrAdmissionAuxiliaryStatus;
  accountingStatus: HrAdmissionAuxiliaryStatus;
  registrationStatus: HrAdmissionAuxiliaryStatus;
  occupationalHealthStatus: HrAdmissionAuxiliaryStatus;
  uniformStatus: HrAdmissionAuxiliaryStatus;
  onboardingStatus: HrAdmissionAuxiliaryStatus;
  checklist: {
    total: number;
    pending: number;
    completed: number;
    blocked: number;
    waived: number;
    required: number;
    blocksActivation: number;
  };
};

export type HrAdmissionAggregateStatuses = {
  documents_status: HrAdmissionAuxiliaryStatus;
  accounting_status: HrAdmissionAuxiliaryStatus;
  registration_status: HrAdmissionAuxiliaryStatus;
  occupational_health_status: HrAdmissionAuxiliaryStatus;
  uniform_status: HrAdmissionAuxiliaryStatus;
  onboarding_status: HrAdmissionAuxiliaryStatus;
};

export type HrAdmissionMainStatusResolution = {
  status: HrAdmissionProcessStatus;
  current_step: HrAdmissionProcessStatus;
};

const admissionMinimumChecklistItems: Array<{
  itemKey: string;
  title: string;
  itemType: HrAdmissionChecklistItemType;
  requirementLevel: HrAdmissionRequirementLevel;
  status: HrAdmissionChecklistStatus;
  isRequired: boolean;
  blocksActivation: boolean;
  notes: string;
  sortOrder: number;
}> = [
  {
    itemKey: "request_documents",
    title: "Solicitar documentos admissionais",
    itemType: "document",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: true,
    notes: "Item operacional do checklist persistente. Nao cria documento real nesta etapa.",
    sortOrder: 10
  },
  {
    itemKey: "review_documents",
    title: "Conferir documentos recebidos",
    itemType: "document",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: true,
    notes: "Item operacional do checklist persistente. Nao cria documento real nesta etapa.",
    sortOrder: 20
  },
  {
    itemKey: "send_to_accounting",
    title: "Enviar dados para contabilidade",
    itemType: "accounting",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: false,
    notes: "Controle administrativo interno para acompanhamento cadastral. Nao aciona rotinas externas.",
    sortOrder: 30
  },
  {
    itemKey: "confirm_registration",
    title: "Confirmar registro administrativo",
    itemType: "registration",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: true,
    notes: "Controle administrativo interno para acompanhamento cadastral.",
    sortOrder: 40
  },
  {
    itemKey: "occupational_health_aso",
    title: "Agendar ou confirmar ASO admissional",
    itemType: "occupational_health",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: true,
    notes: "Item operacional do checklist persistente. Nao cria ASO real nesta etapa.",
    sortOrder: 50
  },
  {
    itemKey: "uniform_delivery",
    title: "Registrar entrega de uniforme operacional",
    itemType: "uniform",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: false,
    notes: "Uniforme operacional separado de EPI tecnico. Nao cria entrega real nesta etapa.",
    sortOrder: 60
  },
  {
    itemKey: "start_onboarding",
    title: "Iniciar onboarding do colaborador",
    itemType: "onboarding",
    requirementLevel: "required",
    status: "pending",
    isRequired: true,
    blocksActivation: false,
    notes: "Item operacional do checklist persistente. Nao cria onboarding real nesta etapa.",
    sortOrder: 70
  }
];

const admissionAggregateStatusGroups: Record<keyof HrAdmissionAggregateStatuses, string[]> = {
  documents_status: ["request_documents", "review_documents"],
  accounting_status: ["send_to_accounting"],
  registration_status: ["confirm_registration"],
  occupational_health_status: ["occupational_health_aso"],
  uniform_status: ["uniform_delivery"],
  onboarding_status: ["start_onboarding"]
};

function canAccessAdmissionProcess(context: HrRequestContext, process: HrAdmissionProcessRow) {
  return context.isSuperAdmin || !process.unit_id || context.accessibleUnitIds.includes(process.unit_id);
}

function normalizeOptionalText(value: string | null | undefined, max: number) {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact.slice(0, max) : null;
}

function normalizeDateOnly(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function listAdmissionChecklistItemsForProcess(supabase: SupabaseAdmin, admissionProcessId: string) {
  const { data, error } = await supabase
    .from("hr_admission_checklist_items")
    .select(HR_ADMISSION_CHECKLIST_ITEM_SELECT)
    .eq("admission_process_id", admissionProcessId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    logHrApiError("admission_process.checklist_lookup_failed", error);
    throw new Error("Nao foi possivel carregar o checklist admissional.");
  }

  return (data ?? []) as HrAdmissionChecklistItemRow[];
}

function resolveAdmissionAuxiliaryStatus(items: HrAdmissionChecklistItemRow[]): HrAdmissionAuxiliaryStatus {
  if (items.some((item) => item.status === "rejected")) return "blocked";
  if (items.length > 0 && items.every((item) => item.status === "completed" || item.status === "approved" || item.status === "waived" || item.status === "not_applicable")) {
    return "completed";
  }
  if (items.some((item) => item.status === "requested" || item.status === "received" || item.status === "under_review")) return "in_progress";
  return "pending";
}

function calculateAdmissionAggregateStatuses(checklistItems: HrAdmissionChecklistItemRow[]): HrAdmissionAggregateStatuses {
  return Object.fromEntries(
    Object.entries(admissionAggregateStatusGroups).map(([field, itemKeys]) => [
      field,
      resolveAdmissionAuxiliaryStatus(checklistItems.filter((item) => itemKeys.includes(item.item_key)))
    ])
  ) as HrAdmissionAggregateStatuses;
}

function deriveAdmissionProcessMainStatus(statuses: HrAdmissionAggregateStatuses): HrAdmissionMainStatusResolution {
  if (statuses.documents_status === "blocked") {
    return { status: "documents_under_review", current_step: "documents_under_review" };
  }

  if (statuses.accounting_status === "blocked") {
    return { status: "sent_to_accounting", current_step: "sent_to_accounting" };
  }

  if (statuses.registration_status === "blocked") {
    return { status: "registration_pending", current_step: "registration_pending" };
  }

  if (statuses.occupational_health_status === "blocked" || statuses.uniform_status === "blocked") {
    return { status: "registered", current_step: "registered" };
  }

  if (statuses.onboarding_status === "blocked") {
    return { status: "onboarding_ready", current_step: "onboarding_ready" };
  }

  if (statuses.documents_status !== "completed") {
    if (statuses.documents_status === "in_progress") {
      return { status: "documents_under_review", current_step: "documents_under_review" };
    }

    return { status: "documents_requested", current_step: "documents_requested" };
  }

  if (statuses.accounting_status !== "completed") {
    return { status: "sent_to_accounting", current_step: "sent_to_accounting" };
  }

  if (statuses.registration_status !== "completed") {
    return { status: "registration_pending", current_step: "registration_pending" };
  }

  if (statuses.occupational_health_status !== "completed" || statuses.uniform_status !== "completed") {
    return { status: "registered", current_step: "registered" };
  }

  if (statuses.onboarding_status !== "completed") {
    return { status: "onboarding_ready", current_step: "onboarding_ready" };
  }

  return { status: "completed", current_step: "completed" };
}

async function findAdmissionProcessForConversion(supabase: SupabaseAdmin, input: EnsureAdmissionProcessInput) {
  const loadBy = async (column: "source_candidate_id" | "admission_workflow_id", value: string) => {
    const { data, error } = await supabase
      .from("hr_admission_processes")
      .select(HR_ADMISSION_PROCESS_SELECT)
      .eq(column, value)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      logHrApiError("admission_process.ensure_lookup_failed", error);
      throw new Error("Nao foi possivel validar processo admissional existente.");
    }

    return (data?.[0] as HrAdmissionProcessRow | undefined) ?? null;
  };

  if (input.sourceCandidateId && input.admissionWorkflowId) {
    const { data, error } = await supabase
      .from("hr_admission_processes")
      .select(HR_ADMISSION_PROCESS_SELECT)
      .eq("source_candidate_id", input.sourceCandidateId)
      .eq("admission_workflow_id", input.admissionWorkflowId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      logHrApiError("admission_process.ensure_lookup_failed", error);
      throw new Error("Nao foi possivel validar processo admissional existente.");
    }

    const exact = (data?.[0] as HrAdmissionProcessRow | undefined) ?? null;
    if (exact) return exact;
  }

  if (input.admissionWorkflowId) {
    const byWorkflow = await loadBy("admission_workflow_id", input.admissionWorkflowId);
    if (byWorkflow) return byWorkflow;
  }

  if (input.sourceCandidateId) {
    const byCandidate = await loadBy("source_candidate_id", input.sourceCandidateId);
    if (byCandidate) return byCandidate;
  }

  return null;
}

async function loadSingleAdmissionProcessBy(
  context: HrRequestContext,
  column: "id" | "admission_workflow_id" | "source_candidate_id" | "employee_id",
  value: string
) {
  const { data, error } = await context.supabase
    .from("hr_admission_processes")
    .select(HR_ADMISSION_PROCESS_SELECT)
    .eq(column, value)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logHrApiError("admission_process.lookup_failed", error);
    throw new Error("Nao foi possivel carregar o processo admissional.");
  }

  const process = (data?.[0] as HrAdmissionProcessRow | undefined) ?? null;
  if (!process || !canAccessAdmissionProcess(context, process)) return null;
  return process;
}

export async function loadAdmissionProcessByWorkflow(context: HrRequestContext, admissionWorkflowId: string) {
  return loadSingleAdmissionProcessBy(context, "admission_workflow_id", admissionWorkflowId);
}

export async function loadAdmissionProcessByCandidate(context: HrRequestContext, candidateId: string) {
  return loadSingleAdmissionProcessBy(context, "source_candidate_id", candidateId);
}

export async function loadAdmissionProcessByEmployee(context: HrRequestContext, employeeId: string) {
  return loadSingleAdmissionProcessBy(context, "employee_id", employeeId);
}

export async function loadAdmissionProcessById(context: HrRequestContext, admissionProcessId: string) {
  return loadSingleAdmissionProcessBy(context, "id", admissionProcessId);
}

export async function listAdmissionProcesses(context: HrRequestContext, filters: AdmissionProcessListFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (!context.isSuperAdmin && context.accessibleUnitIds.length === 0) {
    return {
      data: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0
      }
    };
  }

  let query = context.supabase
    .from("hr_admission_processes")
    .select(HR_ADMISSION_PROCESS_SELECT, { count: "exact" })
    .is("deleted_at", null);

  if (!context.isSuperAdmin) query = query.in("unit_id", context.accessibleUnitIds);
  if (filters.workflowId) query = query.eq("admission_workflow_id", filters.workflowId);
  if (filters.candidateId) query = query.eq("source_candidate_id", filters.candidateId);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  if (filters.jobOpeningWorkflowId) query = query.eq("source_job_opening_workflow_id", filters.jobOpeningWorkflowId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, to);

  if (error) {
    logHrApiError("admission_process.list_failed", error);
    throw new Error("Nao foi possivel listar processos admissionais.");
  }

  return {
    data: ((data ?? []) as HrAdmissionProcessRow[]).filter((process) => canAccessAdmissionProcess(context, process)),
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / pageSize)
    }
  };
}

export async function listAdmissionChecklistItems(context: HrRequestContext, admissionProcessId: string) {
  const process = await loadSingleAdmissionProcessBy(context, "id", admissionProcessId);

  if (!process) return [];
  return listAdmissionChecklistItemsForProcess(context.supabase, admissionProcessId);
}

export function summarizeAdmissionProcess(process: HrAdmissionProcessRow, checklistItems: HrAdmissionChecklistItemRow[]): HrAdmissionStatusSummary {
  return {
    processStatus: process.status,
    currentStep: process.current_step,
    documentsStatus: process.documents_status,
    accountingStatus: process.accounting_status,
    registrationStatus: process.registration_status,
    occupationalHealthStatus: process.occupational_health_status,
    uniformStatus: process.uniform_status,
    onboardingStatus: process.onboarding_status,
    checklist: {
      total: checklistItems.length,
      pending: checklistItems.filter((item) => item.status === "pending" || item.status === "requested" || item.status === "under_review").length,
      completed: checklistItems.filter((item) => item.status === "completed" || item.status === "approved").length,
      blocked: checklistItems.filter((item) => item.status === "rejected").length,
      waived: checklistItems.filter((item) => item.status === "waived" || item.status === "not_applicable").length,
      required: checklistItems.filter((item) => item.is_required).length,
      blocksActivation: checklistItems.filter((item) => item.blocks_activation).length
    }
  };
}

export async function recalculateAdmissionProcessAggregateStatuses(
  supabase: SupabaseAdmin,
  admissionProcessId: string,
  actorUserId: string | null | undefined
) {
  const checklistItems = await listAdmissionChecklistItemsForProcess(supabase, admissionProcessId);
  const aggregateStatuses = calculateAdmissionAggregateStatuses(checklistItems);
  const mainStatus = deriveAdmissionProcessMainStatus(aggregateStatuses);

  const { data, error } = await supabase
    .from("hr_admission_processes")
    .update({
      ...aggregateStatuses,
      ...mainStatus,
      updated_by: actorUserId ?? null
    })
    .eq("id", admissionProcessId)
    .is("deleted_at", null)
    .select(HR_ADMISSION_PROCESS_SELECT)
    .single();

  if (error) {
    logHrApiError("admission_process.aggregate_status_update_failed", error);
    throw new Error("Nao foi possivel recalcular os status agregados da admissao.");
  }

  return {
    process: data as HrAdmissionProcessRow,
    statuses: aggregateStatuses,
    summary: summarizeAdmissionProcess(data as HrAdmissionProcessRow, checklistItems)
  };
}

export async function ensureAdmissionProcessForConversion(
  supabase: SupabaseAdmin,
  input: EnsureAdmissionProcessInput
) {
  const existing = await findAdmissionProcessForConversion(supabase, input);
  if (existing) return { process: existing, created: false };

  const { data, error } = await supabase
    .from("hr_admission_processes")
    .insert({
      organization_id: input.organizationId,
      unit_id: input.unitId,
      source_job_opening_workflow_id: input.sourceJobOpeningWorkflowId ?? null,
      source_candidate_id: input.sourceCandidateId ?? null,
      admission_workflow_id: input.admissionWorkflowId ?? null,
      employee_id: input.employeeId ?? null,
      job_position_id: input.jobPositionId ?? null,
      department_id: input.departmentId ?? null,
      job_title: normalizeOptionalText(input.jobTitle, 180),
      cbo_code: normalizeOptionalText(input.cboCode, 20),
      department_name: normalizeOptionalText(input.departmentName, 180),
      status: "draft",
      current_step: "draft",
      documents_status: "not_started",
      accounting_status: "not_started",
      registration_status: "not_started",
      occupational_health_status: "not_started",
      uniform_status: "not_started",
      onboarding_status: "not_started",
      expected_start_date: normalizeDateOnly(input.expectedStartDate),
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null
    })
    .select(HR_ADMISSION_PROCESS_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await findAdmissionProcessForConversion(supabase, input);
      if (raced) return { process: raced, created: false };
    }

    logHrApiError("admission_process.ensure_create_failed", error);
    throw new Error("Nao foi possivel criar processo admissional persistente.");
  }

  return { process: data as HrAdmissionProcessRow, created: true };
}

export async function ensureAdmissionMinimumChecklist(
  supabase: SupabaseAdmin,
  input: EnsureAdmissionMinimumChecklistInput
) {
  const existingItems = await listAdmissionChecklistItemsForProcess(supabase, input.admissionProcessId);
  const existingKeys = new Set(existingItems.map((item) => item.item_key));
  const missingItems = admissionMinimumChecklistItems.filter((item) => !existingKeys.has(item.itemKey));

  if (missingItems.length === 0) {
    return { items: existingItems, created: 0 };
  }

  const { error } = await supabase.from("hr_admission_checklist_items").insert(
    missingItems.map((item) => ({
      organization_id: input.organizationId,
      unit_id: input.unitId,
      admission_process_id: input.admissionProcessId,
      item_type: item.itemType,
      item_key: item.itemKey,
      title: item.title,
      description: null,
      requirement_level: item.requirementLevel,
      status: item.status,
      is_required: item.isRequired,
      blocks_activation: item.blocksActivation,
      source_requirement_key: null,
      source_rule_group: "minimum_admission_checklist",
      notes: item.notes,
      sort_order: item.sortOrder,
      created_by: input.actorUserId ?? null,
      updated_by: input.actorUserId ?? null
    }))
  );

  if (error && error.code !== "23505") {
    logHrApiError("admission_process.minimum_checklist_create_failed", error);
    throw new Error("Nao foi possivel criar checklist admissional persistente.");
  }

  const items = await listAdmissionChecklistItemsForProcess(supabase, input.admissionProcessId);
  return {
    items,
    created: Math.max(0, items.length - existingItems.length)
  };
}
