import "server-only";

import { ATTACHMENTS_BUCKET, createSignedAttachmentUrl, sanitizeFileName, type AttachmentRow } from "@/lib/attachments/api";
import {
  HR_PERMISSIONS,
  HrAuthorizationError,
  logHrApiError,
  type HrEmployeeRow,
  type HrPermissionCode,
  type HrRequestContext
} from "@/lib/hr/api-auth";
import { containsSensitiveEvaluationText } from "@/lib/hr/evaluation-validation";
import {
  contextualDocumentRequirementStatusSchema,
  contextualDocumentRoleSchema,
  contextualDocumentSourceEntityTypeSchema,
  contextualDocumentVisibilityScopeSchema
} from "@/lib/hr/schemas";
import { redactEmployeeDocument, type EmployeeDocumentRow, type HrDocumentTypeRow } from "@/lib/hr/redaction";

export type ContextualDocumentSourceEntityType = (typeof contextualDocumentSourceEntityTypeSchema)["_output"];
export type ContextualDocumentRole = (typeof contextualDocumentRoleSchema)["_output"];
export type ContextualDocumentRequirementStatus = (typeof contextualDocumentRequirementStatusSchema)["_output"];
export type ContextualDocumentVisibilityScope = (typeof contextualDocumentVisibilityScopeSchema)["_output"];

export const DOCUMENT_ATTACHMENT_MODULE = "hr";
export const DOCUMENT_ATTACHMENT_ENTITY_TYPE = "employee_document";
export const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const employeeDocumentSelect =
  "id, organization_id, unit_id, employee_id, document_type_id, current_attachment_id, status, issue_date, received_at, valid_until, verified_at, rejected_at, rejection_reason, waived_at, waiver_reason, replaced_by_document_id, is_sensitive, visibility_scope, notes, metadata, created_at, updated_at";
export const hrDocumentTypeSelect =
  "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at";
export const hrAttachmentSelect =
  "id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at";
export const contextualDocumentLinkSelect =
  "id, organization_id, unit_id, employee_id, employee_document_id, attachment_id, source_module, source_entity_type, source_entity_id, source_context_label, document_role, is_required, requirement_status, is_sensitive, visibility_scope, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, waived_by, waived_at, waiver_reason, created_at, updated_at, deleted_at";

export type ContextualDocumentLinkRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  employee_document_id: string;
  attachment_id: string | null;
  source_module: string;
  source_entity_type: ContextualDocumentSourceEntityType;
  source_entity_id: string;
  source_context_label: string | null;
  document_role: ContextualDocumentRole;
  is_required: boolean;
  requirement_status: ContextualDocumentRequirementStatus;
  is_sensitive: boolean;
  visibility_scope: ContextualDocumentVisibilityScope;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  waived_by: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContextualSourceRecord = {
  sourceEntityType: ContextualDocumentSourceEntityType;
  id: string;
  organizationId: string;
  unitId: string;
  employeeId: string;
  label: string | null;
  isSensitive: boolean;
  visibilityScope: ContextualDocumentVisibilityScope;
};

const allowedRolesBySource: Record<ContextualDocumentSourceEntityType, ContextualDocumentRole[]> = {
  conduct: ["evidence"],
  occupational_health: ["aso", "exam", "restriction"],
  nr_certification: ["nr_certificate"],
  training: ["training_certificate", "attendance_list"],
  termination: ["termination_document"],
  termination_checklist_item: ["termination_document"],
  onboarding: ["other"],
  movement: ["other"],
  evaluation: ["other"]
};

const managePermissionBySource: Record<ContextualDocumentSourceEntityType, HrPermissionCode> = {
  conduct: HR_PERMISSIONS.conductManage,
  occupational_health: HR_PERMISSIONS.occupationalManage,
  nr_certification: HR_PERMISSIONS.occupationalManage,
  training: HR_PERMISSIONS.trainingsManage,
  termination: HR_PERMISSIONS.terminationsManage,
  termination_checklist_item: HR_PERMISSIONS.terminationsManage,
  onboarding: HR_PERMISSIONS.employeesManage,
  movement: HR_PERMISSIONS.movementsManage,
  evaluation: HR_PERMISSIONS.evaluationsManage
};

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function visibilityScope(value: unknown): ContextualDocumentVisibilityScope {
  return contextualDocumentVisibilityScopeSchema.safeParse(value).success
    ? (value as ContextualDocumentVisibilityScope)
    : "restricted";
}

export function requiredPermissionForContextualDocument(sourceEntityType: ContextualDocumentSourceEntityType) {
  return managePermissionBySource[sourceEntityType];
}

export function validateContextualDocumentRole(sourceEntityType: ContextualDocumentSourceEntityType, documentRole: ContextualDocumentRole) {
  return allowedRolesBySource[sourceEntityType].includes(documentRole);
}

export function validateContextualDocumentFile(file: File) {
  if (!file.size) return "Arquivo invalido.";
  if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) return "Arquivo excede o limite de 10 MB.";

  const extension = extensionOf(file.name);
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number])) {
    return "Tipo de arquivo nao permitido. Envie PDF, JPG, JPEG ou PNG.";
  }

  if (file.type && !ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
    return "Tipo de arquivo nao permitido. Envie PDF, JPG, JPEG ou PNG.";
  }

  return "";
}

export function buildEmployeeDocumentPath(input: {
  organizationId: string;
  unitId: string;
  employeeId: string;
  documentId: string;
  fileName: string;
}) {
  return `hr/${input.organizationId}/${input.unitId}/employees/${input.employeeId}/documents/${input.documentId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
}

export function assertSafeSourceContextLabel(label: string | null | undefined) {
  const normalized = label?.trim();
  if (!normalized) return null;
  if (normalized.length > 160) {
    throw new HrAuthorizationError("Rotulo de origem muito longo.", 422);
  }
  if (containsSensitiveEvaluationText(normalized)) {
    throw new HrAuthorizationError("Rotulo de origem contem dado sensivel ou tecnico nao permitido.", 422);
  }
  return normalized;
}

export function assertSafeContextualNotes(notes: string | null | undefined) {
  const normalized = notes?.trim();
  if (!normalized) return null;
  if (normalized.length > 500) {
    throw new HrAuthorizationError("Observacao muito longa.", 422);
  }
  if (containsSensitiveEvaluationText(normalized)) {
    throw new HrAuthorizationError("Observacao contem dado sensivel ou tecnico nao permitido.", 422);
  }
  return normalized;
}

export function parseFormBoolean(value: FormDataEntryValue | null, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "sim"].includes(normalized);
}

export function canUseDocumentType(documentType: HrDocumentTypeRow, employee: { organization_id: string | null; unit_id: string | null }) {
  if (documentType.is_system_default && !documentType.organization_id && !documentType.unit_id) return true;
  if (documentType.unit_id) return documentType.unit_id === employee.unit_id;
  if (documentType.organization_id) return documentType.organization_id === employee.organization_id;
  return false;
}

export async function loadDocumentType(context: HrRequestContext, documentTypeId: string) {
  const { data, error } = await context.supabase
    .from("hr_document_types")
    .select(hrDocumentTypeSelect)
    .eq("id", documentTypeId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("contextual_documents.document_type_lookup_failed", error);
    throw new Error("Nao foi possivel validar o tipo documental.");
  }

  return (data?.[0] as HrDocumentTypeRow | undefined) ?? null;
}

export async function loadDocumentTypes(context: HrRequestContext, documentTypeIds: string[]) {
  if (!documentTypeIds.length) return new Map<string, HrDocumentTypeRow>();

  const { data, error } = await context.supabase
    .from("hr_document_types")
    .select(hrDocumentTypeSelect)
    .in("id", Array.from(new Set(documentTypeIds)))
    .is("deleted_at", null);

  if (error) {
    logHrApiError("contextual_documents.document_types_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os tipos documentais.");
  }

  return new Map(((data ?? []) as HrDocumentTypeRow[]).map((documentType) => [documentType.id, documentType]));
}

export async function loadAttachments(context: HrRequestContext, attachmentIds: string[]) {
  if (!attachmentIds.length) return new Map<string, AttachmentRow>();

  const { data, error } = await context.supabase
    .from("attachments")
    .select(hrAttachmentSelect)
    .in("id", Array.from(new Set(attachmentIds)))
    .eq("module", DOCUMENT_ATTACHMENT_MODULE)
    .eq("entity_type", DOCUMENT_ATTACHMENT_ENTITY_TYPE)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("contextual_documents.attachments_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os anexos documentais.");
  }

  return new Map(((data ?? []) as AttachmentRow[]).map((attachment) => [attachment.id, attachment]));
}

async function loadSingleSourceRow(context: HrRequestContext, table: string, select: string, id: string) {
  const { data, error } = await context.supabase.from(table).select(select).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError(`contextual_documents.${table}.lookup_failed`, error);
    throw new Error("Nao foi possivel localizar a origem contextual do documento.");
  }
  return data?.[0] as unknown as Record<string, unknown> | undefined;
}

function sourceRecordFromRow(sourceEntityType: ContextualDocumentSourceEntityType, row: Record<string, unknown>, label: string | null) {
  return {
    sourceEntityType,
    id: String(row.id),
    organizationId: String(row.organization_id),
    unitId: String(row.unit_id),
    employeeId: String(row.employee_id),
    label,
    isSensitive: row.is_sensitive == null ? true : Boolean(row.is_sensitive),
    visibilityScope: visibilityScope(row.visibility_scope)
  } satisfies ContextualSourceRecord;
}

function assertSourceBelongsToEmployee(source: ContextualSourceRecord, employee: HrEmployeeRow) {
  if (source.employeeId !== employee.id || source.organizationId !== employee.organization_id || source.unitId !== employee.unit_id) {
    throw new HrAuthorizationError("Origem contextual nao pertence ao colaborador informado.", 404);
  }
}

export async function loadContextualSource(input: {
  context: HrRequestContext;
  employee: HrEmployeeRow;
  sourceEntityType: ContextualDocumentSourceEntityType;
  sourceEntityId: string;
}) {
  const { context, employee, sourceEntityType, sourceEntityId } = input;
  let source: ContextualSourceRecord | null = null;

  if (sourceEntityType === "conduct") {
    const row = await loadSingleSourceRow(
      context,
      "employee_conduct_records",
      "id, organization_id, unit_id, employee_id, title, conduct_type, attachment_id, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.title ?? row.conduct_type ?? "Conduta"));
  }

  if (sourceEntityType === "occupational_health") {
    const row = await loadSingleSourceRow(
      context,
      "employee_occupational_records",
      "id, organization_id, unit_id, employee_id, record_type, attachment_id, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.record_type ?? "Saude ocupacional"));
  }

  if (sourceEntityType === "nr_certification") {
    const row = await loadSingleSourceRow(
      context,
      "employee_nr_certifications",
      "id, organization_id, unit_id, employee_id, nr_code, training_name, certificate_attachment_id, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.training_name ?? row.nr_code ?? "Certificacao NR"));
  }

  if (sourceEntityType === "training") {
    const row = await loadSingleSourceRow(
      context,
      "employee_trainings",
      "id, organization_id, unit_id, employee_id, training_id, certificate_attachment_id, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, "Treinamento");
  }

  if (sourceEntityType === "termination") {
    const row = await loadSingleSourceRow(
      context,
      "employee_terminations",
      "id, organization_id, unit_id, employee_id, termination_type, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.termination_type ?? "Desligamento"));
  }

  if (sourceEntityType === "termination_checklist_item") {
    const item = await loadSingleSourceRow(context, "employee_termination_checklists", "id, termination_id, item_name", sourceEntityId);
    if (item) {
      const termination = await loadSingleSourceRow(
        context,
        "employee_terminations",
        "id, organization_id, unit_id, employee_id, termination_type, is_sensitive, visibility_scope",
        String(item.termination_id)
      );
      if (termination) source = sourceRecordFromRow(sourceEntityType, { ...termination, id: item.id }, String(item.item_name ?? "Checklist de desligamento"));
    }
  }

  if (sourceEntityType === "onboarding") {
    const row = await loadSingleSourceRow(
      context,
      "employee_onboardings",
      "id, organization_id, unit_id, employee_id, status",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, "Admissao");
  }

  if (sourceEntityType === "movement") {
    const row = await loadSingleSourceRow(
      context,
      "employee_movements",
      "id, organization_id, unit_id, employee_id, movement_type, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.movement_type ?? "Movimentacao"));
  }

  if (sourceEntityType === "evaluation") {
    const row = await loadSingleSourceRow(
      context,
      "employee_evaluations",
      "id, organization_id, unit_id, employee_id, evaluation_type, is_sensitive, visibility_scope",
      sourceEntityId
    );
    if (row) source = sourceRecordFromRow(sourceEntityType, row, String(row.evaluation_type ?? "Avaliacao"));
  }

  if (!source) {
    throw new HrAuthorizationError("Origem contextual nao encontrada.", 404);
  }

  assertSourceBelongsToEmployee(source, employee);
  return source;
}

export async function updateContextualSourceAttachment(input: {
  context: HrRequestContext;
  source: ContextualSourceRecord;
  attachmentId: string;
}) {
  const { context, source, attachmentId } = input;
  const commonPayload = { updated_by: context.session.user.id };
  let result: { error: { message?: string; code?: string } | null } | null = null;

  if (source.sourceEntityType === "conduct") {
    result = await context.supabase
      .from("employee_conduct_records")
      .update({ attachment_id: attachmentId, ...commonPayload })
      .eq("id", source.id);
  } else if (source.sourceEntityType === "occupational_health") {
    result = await context.supabase
      .from("employee_occupational_records")
      .update({ attachment_id: attachmentId, ...commonPayload })
      .eq("id", source.id);
  } else if (source.sourceEntityType === "nr_certification") {
    result = await context.supabase
      .from("employee_nr_certifications")
      .update({ certificate_attachment_id: attachmentId, ...commonPayload })
      .eq("id", source.id);
  } else if (source.sourceEntityType === "training") {
    result = await context.supabase
      .from("employee_trainings")
      .update({ certificate_attachment_id: attachmentId, ...commonPayload })
      .eq("id", source.id);
  }

  if (result?.error) {
    logHrApiError("contextual_documents.source_attachment_update_failed", result.error);
    throw new Error("Anexo registrado no dossie, mas nao foi possivel atualizar o campo contextual do modulo.");
  }
}

export async function mapDocumentLinks(input: {
  context: HrRequestContext;
  links: ContextualDocumentLinkRow[];
  canViewSensitiveDocuments: boolean;
  includeSensitive: boolean;
}) {
  const documentIds = input.links.map((link) => link.employee_document_id);
  const attachmentIds = input.links.map((link) => link.attachment_id).filter(Boolean) as string[];

  const [{ data: documentsData, error: documentsError }, documentTypesById, attachmentsById] = await Promise.all([
    input.context.supabase.from("employee_documents").select(employeeDocumentSelect).in("id", Array.from(new Set(documentIds))).is("deleted_at", null),
    Promise.resolve(new Map<string, HrDocumentTypeRow>()),
    loadAttachments(input.context, attachmentIds)
  ]);

  if (documentsError) {
    logHrApiError("contextual_documents.documents_lookup_failed", documentsError);
    throw new Error("Nao foi possivel carregar os documentos vinculados.");
  }

  const documents = (documentsData ?? []) as EmployeeDocumentRow[];
  const loadedDocumentTypesById = await loadDocumentTypes(
    input.context,
    documents.map((document) => document.document_type_id)
  );
  loadedDocumentTypesById.forEach((value, key) => documentTypesById.set(key, value));
  const documentsById = new Map(documents.map((document) => [document.id, document]));

  return Promise.all(
    input.links.map(async (link) => {
      const document = documentsById.get(link.employee_document_id) ?? null;
      const attachment = link.attachment_id ? attachmentsById.get(link.attachment_id) ?? null : null;
      const canExposeAttachment = Boolean(attachment && input.canViewSensitiveDocuments);
      const signedUrl =
        attachment && input.canViewSensitiveDocuments
          ? await createSignedAttachmentUrl(input.context.supabase, attachment.storage_bucket ?? ATTACHMENTS_BUCKET, attachment.file_path)
          : undefined;

      return {
        id: link.id,
        sourceModule: link.source_module,
        sourceEntityType: link.source_entity_type,
        sourceEntityId: link.source_entity_id,
        originLabel: input.canViewSensitiveDocuments ? link.source_context_label : null,
        sourceContextLabel: input.canViewSensitiveDocuments ? link.source_context_label : null,
        documentRole: link.document_role,
        isRequired: link.is_required,
        requirementStatus: link.requirement_status,
        isSensitive: link.is_sensitive,
        visibilityScope: link.visibility_scope,
        approvedAt: link.approved_at,
        rejectedAt: link.rejected_at,
        rejectionReason: input.canViewSensitiveDocuments ? link.rejection_reason : null,
        waivedAt: link.waived_at,
        waiverReason: input.canViewSensitiveDocuments ? link.waiver_reason : null,
        createdAt: link.created_at,
        updatedAt: link.updated_at,
        deletedAt: link.deleted_at,
        document: document
          ? redactEmployeeDocument({
              document,
              documentType: documentTypesById.get(document.document_type_id) ?? null,
              canViewSensitive: input.canViewSensitiveDocuments,
              includeSensitive: input.includeSensitive
            })
          : null,
        attachment: attachment
          ? {
              id: attachment.id,
              fileName: canExposeAttachment ? attachment.file_name : "Arquivo protegido",
              fileMimeType: canExposeAttachment ? attachment.file_mime_type : "",
              fileSizeBytes: Number(attachment.file_size_bytes),
              uploadedAt: attachment.created_at,
              signedUrl
            }
          : null
      };
    })
  );
}
