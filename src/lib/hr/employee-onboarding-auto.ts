import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logHrApiError } from "@/lib/hr/api-auth";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";

type EmployeeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  status: string;
};

type OnboardingPlanRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  admission_type: string | null;
  name: string;
  priority: number;
};

type OnboardingPlanItemRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  owner_area: string;
  responsible_profile_code: string | null;
  due_days_after_start: number | null;
  is_required: boolean;
  is_critical: boolean;
  blocks_operational_release: boolean;
  related_document_type_id: string | null;
  sort_order: number;
};

type GeneratedItem = {
  plan_item_id: string | null;
  title: string;
  description: string | null;
  category: string;
  owner_area: string;
  responsible_profile_code: string | null;
  due_days_after_start: number | null;
  is_required: boolean;
  is_critical: boolean;
  blocks_operational_release: boolean;
  related_document_type_id: string | null;
  sort_order: number;
};

const onboardingSelect = "id";
const employeeSelect = "id, organization_id, unit_id, department_id, job_position_id, status";
const planSelect = "id, organization_id, unit_id, department_id, job_position_id, admission_type, name, priority";
const planItemSelect =
  "id, title, description, category, owner_area, responsible_profile_code, due_days_after_start, is_required, is_critical, blocks_operational_release, related_document_type_id, sort_order";

const fallbackItems: GeneratedItem[] = [
  {
    plan_item_id: null,
    title: "Conferir documentos pessoais",
    description: "Validar RG, CPF, CTPS, comprovante e documentos obrigatorios do colaborador.",
    category: "document",
    owner_area: "RH",
    responsible_profile_code: null,
    due_days_after_start: 0,
    is_required: true,
    is_critical: true,
    blocks_operational_release: true,
    related_document_type_id: null,
    sort_order: 10
  },
  {
    plan_item_id: null,
    title: "Entregar uniforme",
    description: "Registrar entrega ou pendencia de uniforme conforme setor.",
    category: "uniform",
    owner_area: "RH",
    responsible_profile_code: null,
    due_days_after_start: 1,
    is_required: true,
    is_critical: false,
    blocks_operational_release: false,
    related_document_type_id: null,
    sort_order: 20
  },
  {
    plan_item_id: null,
    title: "Liberar acessos necessarios",
    description: "Solicitar ou conferir acessos operacionais, sistemas e chaves necessarias.",
    category: "access",
    owner_area: "TI",
    responsible_profile_code: null,
    due_days_after_start: 1,
    is_required: true,
    is_critical: true,
    blocks_operational_release: true,
    related_document_type_id: null,
    sort_order: 30
  },
  {
    plan_item_id: null,
    title: "Apresentar regras internas",
    description: "Orientar sobre conduta, pontualidade, comunicacao e padroes basicos do hotel.",
    category: "policy",
    owner_area: "RH",
    responsible_profile_code: null,
    due_days_after_start: 2,
    is_required: true,
    is_critical: false,
    blocks_operational_release: false,
    related_document_type_id: null,
    sort_order: 40
  },
  {
    plan_item_id: null,
    title: "Apresentar operacao e setor",
    description: "Apresentar lideranca, rotina do setor, areas de apoio e padrao operacional esperado.",
    category: "operational_orientation",
    owner_area: "GESTOR",
    responsible_profile_code: null,
    due_days_after_start: 2,
    is_required: true,
    is_critical: false,
    blocks_operational_release: false,
    related_document_type_id: null,
    sort_order: 50
  },
  {
    plan_item_id: null,
    title: "Conferir EPIs ou equipamentos",
    description: "Verificar se a funcao exige EPI, ferramenta, equipamento ou material de trabalho.",
    category: "epi",
    owner_area: "GESTOR",
    responsible_profile_code: null,
    due_days_after_start: 3,
    is_required: true,
    is_critical: false,
    blocks_operational_release: false,
    related_document_type_id: null,
    sort_order: 60
  },
  {
    plan_item_id: null,
    title: "Validar liberacao operacional",
    description: "Gestor confirma que o colaborador recebeu orientacoes iniciais e pode iniciar a rotina acompanhada.",
    category: "manager_validation",
    owner_area: "GESTOR",
    responsible_profile_code: null,
    due_days_after_start: 5,
    is_required: true,
    is_critical: true,
    blocks_operational_release: true,
    related_document_type_id: null,
    sort_order: 70
  }
];

function addDaysIso(startedAt: Date, days: number | null) {
  if (days === null || days === undefined) return null;
  const dueAt = new Date(startedAt);
  dueAt.setDate(dueAt.getDate() + days);
  return dueAt.toISOString();
}

async function writeOnboardingCreatedEvent(input: {
  supabase: SupabaseClient;
  employeeId: string;
  onboardingId: string;
  actorUserId: string;
  source: string;
  itemCount: number;
}) {
  const result = await createEmployeeFunctionalEvent(input.supabase, {
    employeeId: input.employeeId,
    eventType: "onboarding_created",
    title: "Onboarding criado",
    description: "Checklist de onboarding criado para o colaborador.",
    severity: "info",
    visibilityScope: "unit",
    isSensitive: false,
    sourceModule: "hr",
    sourceEntityType: "employee_onboarding",
    sourceEntityId: input.onboardingId,
    actorUserId: input.actorUserId,
    dedupeKey: `onboarding:${input.onboardingId}:created`,
    eventPayload: {
      source: input.source,
      item_count: input.itemCount
    }
  });

  if (!result.ok) {
    logHrApiError("employee_onboarding.functional_event_create_failed", { message: result.error.message, code: result.error.code });
  }
}

function planSpecificity(plan: OnboardingPlanRow) {
  if (plan.job_position_id && plan.unit_id) return 1;
  if (plan.job_position_id) return 2;
  if (plan.department_id && plan.unit_id) return 3;
  if (plan.department_id) return 4;
  if (plan.unit_id) return 5;
  return 6;
}

function planMatchesEmployee(plan: OnboardingPlanRow, employee: EmployeeRow) {
  if (!employee.organization_id || plan.organization_id !== employee.organization_id) return false;
  if (plan.admission_type) return false;
  if (plan.unit_id && plan.unit_id !== employee.unit_id) return false;
  if (plan.department_id && plan.department_id !== employee.department_id) return false;
  if (plan.job_position_id && plan.job_position_id !== employee.job_position_id) return false;
  return true;
}

async function loadBestPlan(supabase: SupabaseClient, employee: EmployeeRow) {
  if (!employee.organization_id) return null;

  const { data, error } = await supabase
    .from("hr_onboarding_plans")
    .select(planSelect)
    .eq("organization_id", employee.organization_id)
    .eq("status", "active")
    .is("admission_type", null)
    .is("deleted_at", null);

  if (error) throw error;

  return (
    ((data ?? []) as OnboardingPlanRow[])
      .filter((plan) => planMatchesEmployee(plan, employee))
      .sort((a, b) => planSpecificity(a) - planSpecificity(b) || a.priority - b.priority || a.name.localeCompare(b.name))[0] ?? null
  );
}

async function loadGeneratedItems(supabase: SupabaseClient, plan: OnboardingPlanRow | null) {
  if (!plan) return fallbackItems;

  const { data, error } = await supabase
    .from("hr_onboarding_plan_items")
    .select(planItemSelect)
    .eq("plan_id", plan.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const planItems = (data ?? []) as OnboardingPlanItemRow[];
  if (!planItems.length) return fallbackItems;

  return planItems.map((item) => ({
    plan_item_id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    owner_area: item.owner_area,
    responsible_profile_code: item.responsible_profile_code,
    due_days_after_start: item.due_days_after_start,
    is_required: item.is_required,
    is_critical: item.is_critical,
    blocks_operational_release: item.blocks_operational_release,
    related_document_type_id: item.related_document_type_id,
    sort_order: item.sort_order
  }));
}

export async function ensureAutomaticEmployeeOnboarding(supabase: SupabaseClient, employeeId: string, actorUserId: string) {
  const { data: employeeData, error: employeeError } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .limit(1);

  if (employeeError) throw employeeError;

  const employee = (employeeData?.[0] as EmployeeRow | undefined) ?? null;
  if (!employee || employee.status !== "active" || !employee.organization_id || !employee.unit_id) {
    return { created: false, reason: "employee_not_active_or_incomplete" };
  }

  const { data: existingData, error: existingError } = await supabase
    .from("employee_onboardings")
    .select(onboardingSelect)
    .eq("employee_id", employee.id)
    .in("status", ["not_started", "in_progress"])
    .is("deleted_at", null)
    .limit(1);

  if (existingError) throw existingError;
  if (existingData?.length) return { created: false, reason: "open_onboarding_exists" };

  const plan = await loadBestPlan(supabase, employee);
  const items = await loadGeneratedItems(supabase, plan);
  const startedAt = new Date();
  const expectedReleaseAt =
    items
      .map((item) => addDaysIso(startedAt, item.due_days_after_start))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const hasCriticalOrBlocking = items.some((item) => item.is_critical || item.blocks_operational_release);

  const { data: onboardingData, error: onboardingError } = await supabase
    .from("employee_onboardings")
    .insert({
      organization_id: employee.organization_id,
      unit_id: employee.unit_id,
      employee_id: employee.id,
      plan_id: plan?.id ?? null,
      status: "not_started",
      operational_release_status: hasCriticalOrBlocking ? "critical_pending" : "partial",
      started_at: null,
      expected_release_at: expectedReleaseAt,
      notes: plan ? "Checklist de onboarding gerado automaticamente a partir do plano aplicavel." : "Checklist padrao Hotel Galli gerado automaticamente.",
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select("id")
    .single();

  if (onboardingError) throw onboardingError;

  const onboardingId = (onboardingData as { id: string }).id;
  const itemsToInsert = items.map((item) => ({
    onboarding_id: onboardingId,
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    plan_item_id: item.plan_item_id,
    title: item.title,
    description: item.description,
    category: item.category,
    owner_area: item.owner_area,
    responsible_profile_code: item.responsible_profile_code,
    due_at: addDaysIso(startedAt, item.due_days_after_start),
    status: "pending",
    is_required: item.is_required,
    is_critical: item.is_critical,
    blocks_operational_release: item.blocks_operational_release,
    related_document_type_id: item.related_document_type_id,
    created_by: actorUserId,
    updated_by: actorUserId
  }));

  const { error: itemsError } = await supabase.from("employee_onboarding_items").insert(itemsToInsert);

  if (itemsError) {
    await supabase
      .from("employee_onboardings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: actorUserId,
        cancellation_reason: "Falha ao criar itens do onboarding automatico.",
        deleted_at: new Date().toISOString(),
        deleted_by: actorUserId,
        updated_by: actorUserId
      })
      .eq("id", onboardingId);
    throw itemsError;
  }

  await writeOnboardingCreatedEvent({
    supabase,
    employeeId: employee.id,
    onboardingId,
    actorUserId,
    source: plan ? "plan" : "fallback",
    itemCount: itemsToInsert.length
  });

  return { created: true, reason: plan ? "plan" : "fallback", onboardingId };
}
