import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRequiredDocumentExpectations, type HrDocumentRuleRow } from "@/lib/hr/document-rules";
import type { HrDocumentTypeRow } from "@/lib/hr/redaction";

type EmployeeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  full_name: string;
  preferred_name: string | null;
  document_number: string | null;
  corporate_email: string | null;
  personal_email: string | null;
  phone: string | null;
  hire_date: string | null;
  termination_date: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

type GeneratedDocument = {
  documentType: HrDocumentTypeRow;
  validUntil: string;
  notes: string;
  source: "rule" | "required_type" | "hotel_galli_default";
  ruleId: string | null;
};

const employeeSelect =
  "id, organization_id, unit_id, department_id, job_position_id, full_name, preferred_name, document_number, corporate_email, personal_email, phone, hire_date, termination_date, status, created_at, updated_at";
const documentTypeSelect =
  "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at";
const documentRuleSelect =
  "id, organization_id, unit_id, department_id, job_position_id, admission_type, document_type_id, is_required, due_days_after_admission, recurrence_months, priority, notes, status, created_at, updated_at";
const employeeDocumentSelect = "id, document_type_id";

const hotelGalliDefaultMatchers = [
  { codes: ["RG_CNH", "RG", "CNH"], terms: ["rg", "cnh", "identificacao"], notes: "Documento de identificacao para compor o dossie admissional." },
  { codes: ["CPF"], terms: ["cpf"], notes: "CPF para conferencia cadastral do colaborador." },
  { codes: ["CTPS", "CARTEIRA_TRABALHO"], terms: ["ctps", "carteira de trabalho"], notes: "Documento trabalhista para conferencia administrativa do RH." },
  {
    codes: ["COMPROVANTE_RESIDENCIA", "COMPROVANTE_ENDERECO"],
    terms: ["comprovante de residencia", "comprovante de endereco"],
    notes: "Comprovante de residencia atualizado para o dossie admissional."
  },
  { codes: ["TITULO_ELEITOR"], terms: ["titulo de eleitor"], notes: "Titulo de eleitor quando aplicavel ao colaborador." },
  { codes: ["RESERVISTA"], terms: ["reservista"], notes: "Certificado de reservista quando aplicavel." },
  { codes: ["ASO", "EXAME_ADMISSIONAL"], terms: ["aso", "atestado de saude ocupacional", "exame admissional"], notes: "ASO ou exame admissional para acompanhamento documental." },
  { codes: ["CONTRATO_TRABALHO"], terms: ["contrato de trabalho"], notes: "Contrato de trabalho para o prontuario funcional." },
  { codes: ["FICHA_ADMISSAO"], terms: ["ficha de admissao"], notes: "Ficha administrativa de admissao do colaborador." },
  { codes: ["TERMO_RESPONSABILIDADE"], terms: ["termo de responsabilidade", "termo interno"], notes: "Termo interno ou ciencia operacional do colaborador." },
  { codes: ["UNIFORME"], terms: ["uniforme"], notes: "Registro documental de uniforme quando aplicavel." },
  { codes: ["EPI", "EPIS"], terms: ["epi", "epis", "equipamento de protecao"], notes: "Registro documental de EPI quando a funcao exigir." }
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function addDaysToDateOnly(dateValue: string | null, days: number | null) {
  if (!dateValue || days == null) return "";
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesHotelGalliDefault(documentType: HrDocumentTypeRow) {
  const code = documentType.code.toUpperCase();
  const text = normalize(`${documentType.name} ${documentType.description ?? ""}`);

  return (
    hotelGalliDefaultMatchers.find(
      (matcher) => matcher.codes.some((matcherCode) => matcherCode === code) || matcher.terms.some((term) => text.includes(normalize(term)))
    ) ?? null
  );
}

async function loadEmployee(supabase: SupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("id", employeeId)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw error;
  return (data?.[0] as EmployeeRow | undefined) ?? null;
}

async function loadDocumentTypes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("hr_document_types")
    .select(documentTypeSelect)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as HrDocumentTypeRow[];
}

async function loadDocumentRules(supabase: SupabaseClient, employee: EmployeeRow) {
  let query = supabase
    .from("hr_document_rules")
    .select(documentRuleSelect)
    .eq("status", "active")
    .is("deleted_at", null);

  if (employee.organization_id) query = query.or(`organization_id.is.null,organization_id.eq.${employee.organization_id}`);
  if (employee.unit_id) query = query.or(`unit_id.is.null,unit_id.eq.${employee.unit_id}`);
  if (employee.department_id) query = query.or(`department_id.is.null,department_id.eq.${employee.department_id}`);
  if (employee.job_position_id) query = query.or(`job_position_id.is.null,job_position_id.eq.${employee.job_position_id}`);

  const { data, error } = await query.order("priority", { ascending: false });

  if (error) throw error;
  return (data ?? []) as HrDocumentRuleRow[];
}

async function loadExistingDocumentTypeIds(supabase: SupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_documents")
    .select(employeeDocumentSelect)
    .eq("employee_id", employeeId)
    .is("deleted_at", null);

  if (error) throw error;
  return new Set(((data ?? []) as Array<{ document_type_id: string }>).map((document) => document.document_type_id));
}

function buildGeneratedDocuments(employee: EmployeeRow, documentTypes: HrDocumentTypeRow[], rules: HrDocumentRuleRow[]) {
  const generated = new Map<string, GeneratedDocument>();

  for (const expectation of resolveRequiredDocumentExpectations({ employee, documentTypes, rules })) {
    generated.set(expectation.documentType.id, {
      documentType: expectation.documentType,
      validUntil: expectation.validUntil,
      notes: expectation.rule?.notes?.trim() || "Pendencia documental obrigatoria gerada automaticamente para admissao.",
      source: expectation.rule ? "rule" : "required_type",
      ruleId: expectation.rule?.id ?? null
    });
  }

  for (const documentType of documentTypes) {
    if (generated.has(documentType.id)) continue;
    const matcher = matchesHotelGalliDefault(documentType);
    if (!matcher) continue;

    generated.set(documentType.id, {
      documentType,
      validUntil: addDaysToDateOnly(employee.hire_date, 7),
      notes: matcher.notes,
      source: "hotel_galli_default",
      ruleId: null
    });
  }

  return Array.from(generated.values()).sort((left, right) => left.documentType.sort_order - right.documentType.sort_order || left.documentType.name.localeCompare(right.documentType.name));
}

export async function ensureAutomaticEmployeeDocumentDossier(supabase: SupabaseClient, employeeId: string, actorUserId: string) {
  const employee = await loadEmployee(supabase, employeeId);
  if (!employee || employee.status !== "active" || !employee.organization_id || !employee.unit_id) {
    return { created: 0, skipped: true, reason: "employee_not_active_or_incomplete" };
  }

  const [documentTypes, rules, existingTypeIds] = await Promise.all([
    loadDocumentTypes(supabase),
    loadDocumentRules(supabase, employee),
    loadExistingDocumentTypeIds(supabase, employee.id)
  ]);

  const documentsToCreate = buildGeneratedDocuments(employee, documentTypes, rules).filter((document) => !existingTypeIds.has(document.documentType.id));

  if (!documentsToCreate.length) {
    return { created: 0, skipped: false, reason: "dossier_already_complete" };
  }

  const rows = documentsToCreate.map((document) => ({
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    document_type_id: document.documentType.id,
    status: "pending",
    valid_until: document.validUntil || null,
    is_sensitive: document.documentType.is_sensitive_default,
    visibility_scope: document.documentType.visibility_scope_default === "organization" ? "organization" : document.documentType.visibility_scope_default,
    notes: document.notes,
    metadata: {
      source: "automatic_employee_document_dossier",
      dossier_source: document.source,
      document_rule_id: document.ruleId,
      generated_at: new Date().toISOString()
    },
    created_by: actorUserId,
    updated_by: actorUserId
  }));

  const { data, error } = await supabase.from("employee_documents").insert(rows).select("id, document_type_id");
  if (error) throw error;

  const createdRows = (data ?? []) as Array<{ id: string; document_type_id: string }>;
  if (createdRows.length) {
    const events = createdRows.map((document) => ({
      organization_id: employee.organization_id,
      unit_id: employee.unit_id,
      employee_id: employee.id,
      event_type: "document_requested",
      title: "Dossie documental iniciado",
      description: "Pendencia documental criada automaticamente para o colaborador.",
      severity: "notice",
      visibility_scope: "restricted",
      is_sensitive: true,
      source_module: "HR",
      source_entity_type: "employee_document",
      source_entity_id: document.id,
      related_document_id: document.id,
      actor_user_id: actorUserId,
      event_payload: {
        document_id: document.id,
        document_type_id: document.document_type_id,
        source: "automatic_employee_document_dossier"
      },
      created_by: actorUserId,
      updated_by: actorUserId
    }));

    const { error: eventError } = await supabase.from("employee_functional_events").insert(events);
    if (eventError) throw eventError;
  }

  return { created: createdRows.length, skipped: false, reason: "created" };
}
