import { NextResponse } from "next/server";
import { z } from "zod";
import { ATTACHMENTS_BUCKET } from "@/lib/attachments/api";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit
} from "@/lib/hr/api-auth";
import {
  assertSafeContextualNotes,
  assertSafeSourceContextLabel,
  buildEmployeeDocumentPath,
  canUseDocumentType,
  contextualDocumentLinkSelect,
  DOCUMENT_ATTACHMENT_ENTITY_TYPE,
  DOCUMENT_ATTACHMENT_MODULE,
  employeeDocumentSelect,
  hrAttachmentSelect,
  loadContextualSource,
  loadDocumentType,
  parseFormBoolean,
  requiredPermissionForContextualDocument,
  updateContextualSourceAttachment,
  validateContextualDocumentFile,
  validateContextualDocumentRole
} from "@/lib/hr/contextual-documents";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import {
  contextualDocumentRoleSchema,
  contextualDocumentSourceEntityTypeSchema,
  contextualDocumentVisibilityScopeSchema
} from "@/lib/hr/schemas";
import type { AttachmentRow } from "@/lib/attachments/api";
import type { EmployeeDocumentRow } from "@/lib/hr/redaction";

const contextualUploadSchema = z.object({
  employeeId: z.string().uuid("Colaborador invalido."),
  documentTypeId: z.string().uuid("Tipo documental invalido."),
  sourceEntityType: contextualDocumentSourceEntityTypeSchema,
  sourceEntityId: z.string().uuid("Origem contextual invalida."),
  documentRole: contextualDocumentRoleSchema,
  sourceContextLabel: z.string().trim().max(160, "Rotulo de origem muito longo.").optional(),
  validUntil: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use vencimento no formato YYYY-MM-DD.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(500, "Observacao muito longa.").optional(),
  isRequired: z.boolean(),
  isSensitive: z.boolean(),
  visibilityScope: contextualDocumentVisibilityScopeSchema
});

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return value == null ? "" : String(value);
}

async function archiveAttachment(input: { attachmentId: string; context: Awaited<ReturnType<typeof requireHrPermission>>["context"] }) {
  if (!input.context) return;
  const { error } = await input.context.supabase
    .from("attachments")
    .update({
      status: "inactive",
      deleted_at: new Date().toISOString(),
      deleted_by: input.context.session.user.id,
      updated_by: input.context.session.user.id
    })
    .eq("id", input.attachmentId);

  if (error) {
    logHrApiError("contextual_documents.attachment_compensation_failed", error);
  }
}

async function writeUploadEvent(input: {
  context: NonNullable<Awaited<ReturnType<typeof requireHrPermission>>["context"]>;
  document: EmployeeDocumentRow;
  attachmentId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  documentRole: string;
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.document.employee_id,
    eventType: "document_uploaded",
    title: "Arquivo contextual anexado",
    description: "Um arquivo de RH foi anexado ao dossie do colaborador a partir de um modulo operacional.",
    severity: "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "HR",
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    relatedDocumentId: input.document.id,
    relatedAttachmentId: input.attachmentId,
    actorUserId: input.context.session.user.id,
    eventPayload: {
      document_id: input.document.id,
      document_type_id: input.document.document_type_id,
      attachment_id: input.attachmentId,
      source_entity_type: input.sourceEntityType,
      source_entity_id: input.sourceEntityId,
      document_role: input.documentRole
    }
  });

  if (!result.ok) {
    logHrApiError("contextual_documents.event_insert_failed", { message: result.error.message, code: result.error.code });
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return hrApiError("Envie os dados como multipart/form-data.", 415);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logHrApiError("contextual_documents.form_data_parse_failed", error instanceof Error ? error : { message: "multipart parse failed" });
      return hrApiError("Nao foi possivel ler o arquivo enviado. Tente anexar novamente.", 422);
    }

    const rawSourceType = getFormString(formData, "sourceEntityType");
    const sourceTypeResult = contextualDocumentSourceEntityTypeSchema.safeParse(rawSourceType);
    if (!sourceTypeResult.success) {
      return hrApiError(sourceTypeResult.error.errors[0]?.message ?? "Origem contextual invalida.", 422);
    }

    const { context, response } = await requireHrPermission(requiredPermissionForContextualDocument(sourceTypeResult.data));
    if (response || !context) return response;

    const payload = contextualUploadSchema.parse({
      employeeId: getFormString(formData, "employeeId"),
      documentTypeId: getFormString(formData, "documentTypeId"),
      sourceEntityType: sourceTypeResult.data,
      sourceEntityId: getFormString(formData, "sourceEntityId"),
      documentRole: getFormString(formData, "documentRole"),
      sourceContextLabel: getFormString(formData, "sourceContextLabel") || undefined,
      validUntil: getFormString(formData, "validUntil") || undefined,
      notes: getFormString(formData, "notes") || undefined,
      isRequired: parseFormBoolean(formData.get("isRequired"), false),
      isSensitive: parseFormBoolean(formData.get("isSensitive"), true),
      visibilityScope: getFormString(formData, "visibilityScope") || "restricted"
    });

    if (!validateContextualDocumentRole(payload.sourceEntityType, payload.documentRole)) {
      return hrApiError("Papel documental nao permitido para esta origem de RH.", 422);
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return hrApiError("Selecione um arquivo para anexar.", 422);
    }

    const validationMessage = validateContextualDocumentFile(file);
    if (validationMessage) {
      return hrApiError(validationMessage, 422);
    }

    const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
    if (!employee.organization_id || !employee.unit_id) {
      return hrApiError("Colaborador sem unidade ou organizacao valida para dossie documental.", 422);
    }

    const canManageDocuments = await userHasHrPermissionForUnit(
      context.supabase,
      context.session,
      HR_PERMISSIONS.documentsManage,
      employee.unit_id
    );
    if (!canManageDocuments) {
      return hrApiError("Voce nao tem permissao para gerenciar documentos deste colaborador.", 403);
    }

    const sourceContextLabel = assertSafeSourceContextLabel(payload.sourceContextLabel);
    const notes = assertSafeContextualNotes(payload.notes);
    const validUntil = payload.validUntil || null;
    const source = await loadContextualSource({
      context,
      employee,
      sourceEntityType: payload.sourceEntityType,
      sourceEntityId: payload.sourceEntityId
    });
    const documentType = await loadDocumentType(context, payload.documentTypeId);

    if (!documentType || !canUseDocumentType(documentType, employee)) {
      return hrApiError("Tipo documental nao encontrado para este colaborador.", 404);
    }

    const duplicate = await context.supabase
      .from("employee_document_links")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("source_entity_type", payload.sourceEntityType)
      .eq("source_entity_id", payload.sourceEntityId)
      .eq("document_role", payload.documentRole)
      .is("deleted_at", null)
      .limit(1);

    if (duplicate.error) {
      logHrApiError("contextual_documents.duplicate_lookup_failed", duplicate.error);
      return hrApiError("Nao foi possivel validar anexos contextuais existentes.", 500);
    }

    if (duplicate.data?.length) {
      return hrApiError("Ja existe anexo contextual ativo para esta origem e papel documental.", 409);
    }

    const existingDocument = await context.supabase
      .from("employee_documents")
      .select(employeeDocumentSelect)
      .eq("employee_id", employee.id)
      .eq("document_type_id", documentType.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingDocument.error) {
      logHrApiError("contextual_documents.document_lookup_failed", existingDocument.error);
      return hrApiError("Nao foi possivel validar o dossie documental.", 500);
    }

    let document = (existingDocument.data?.[0] as EmployeeDocumentRow | undefined) ?? null;
    let createdDocumentId: string | null = null;

    if (!document) {
      const created = await context.supabase
        .from("employee_documents")
        .insert({
          organization_id: employee.organization_id,
          unit_id: employee.unit_id,
          employee_id: employee.id,
          document_type_id: documentType.id,
          status: "pending",
          valid_until: validUntil,
          is_sensitive: payload.isSensitive || documentType.is_sensitive_default,
          visibility_scope: payload.isSensitive || documentType.is_sensitive_default ? "restricted" : payload.visibilityScope,
          notes: notes ?? (sourceContextLabel ? `Origem: ${sourceContextLabel}` : null),
          created_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .select(employeeDocumentSelect)
        .single();

      if (created.error) {
        logHrApiError("contextual_documents.document_create_failed", created.error);
        return hrApiError("Nao foi possivel criar o documento no dossie do colaborador.", 500);
      }

      document = created.data as EmployeeDocumentRow;
      createdDocumentId = document.id;
    }

    const filePath = buildEmployeeDocumentPath({
      organizationId: employee.organization_id,
      unitId: employee.unit_id,
      employeeId: employee.id,
      documentId: document.id,
      fileName: file.name
    });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await context.supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

    if (uploaded.error) {
      logHrApiError("contextual_documents.upload_failed", uploaded.error);
      return hrApiError("Nao foi possivel enviar o arquivo para o armazenamento seguro.", 500);
    }

    const attachmentResult = await context.supabase
      .from("attachments")
      .insert({
        organization_id: employee.organization_id,
        unit_id: employee.unit_id,
        module: DOCUMENT_ATTACHMENT_MODULE,
        entity_type: DOCUMENT_ATTACHMENT_ENTITY_TYPE,
        entity_id: document.id,
        attachment_type_id: null,
        file_name: file.name,
        file_path: filePath,
        file_mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        storage_bucket: ATTACHMENTS_BUCKET,
        description: sourceContextLabel ? `Anexo contextual de RH: ${sourceContextLabel}` : "Anexo contextual de RH",
        is_sensitive: payload.isSensitive || source.isSensitive || documentType.is_sensitive_default,
        visibility_scope: payload.isSensitive || source.isSensitive || documentType.is_sensitive_default ? "restricted" : payload.visibilityScope,
        uploaded_by: context.session.user.id,
        status: "active",
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(hrAttachmentSelect)
      .single();

    if (attachmentResult.error) {
      logHrApiError("contextual_documents.attachment_create_failed", attachmentResult.error);
      await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      return hrApiError("Arquivo enviado, mas nao foi possivel registrar o anexo documental.", 500);
    }

    const attachment = attachmentResult.data as AttachmentRow;
    const documentUpdate = await context.supabase
      .from("employee_documents")
      .update({
        current_attachment_id: attachment.id,
        status: "received",
        received_at: new Date().toISOString(),
        valid_until: validUntil ?? document.valid_until,
        notes: notes ?? document.notes,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        waived_at: null,
        waived_by: null,
        waiver_reason: null,
        updated_by: context.session.user.id
      })
      .eq("id", document.id)
      .select(employeeDocumentSelect)
      .single();

    if (documentUpdate.error) {
      logHrApiError("contextual_documents.document_link_attachment_failed", documentUpdate.error);
      await archiveAttachment({ context, attachmentId: attachment.id });
      await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      return hrApiError("Arquivo enviado, mas nao foi possivel vincular ao documento.", 500);
    }

    const linkResult = await context.supabase
      .from("employee_document_links")
      .insert({
        organization_id: employee.organization_id,
        unit_id: employee.unit_id,
        employee_id: employee.id,
        employee_document_id: document.id,
        attachment_id: attachment.id,
        source_module: "hr",
        source_entity_type: payload.sourceEntityType,
        source_entity_id: payload.sourceEntityId,
        source_context_label: sourceContextLabel ?? source.label,
        document_role: payload.documentRole,
        is_required: payload.isRequired,
        requirement_status: "attached",
        is_sensitive: payload.isSensitive || source.isSensitive || documentType.is_sensitive_default,
        visibility_scope: payload.isSensitive || source.isSensitive || documentType.is_sensitive_default ? "restricted" : payload.visibilityScope,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(contextualDocumentLinkSelect)
      .single();

    if (linkResult.error) {
      logHrApiError("contextual_documents.link_create_failed", linkResult.error);
      await archiveAttachment({ context, attachmentId: attachment.id });
      await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      if (createdDocumentId) {
        await context.supabase
          .from("employee_documents")
          .update({ deleted_at: new Date().toISOString(), deleted_by: context.session.user.id, updated_by: context.session.user.id })
          .eq("id", createdDocumentId);
      }
      return hrApiError("Arquivo enviado, mas nao foi possivel criar o vinculo contextual.", 500);
    }

    await updateContextualSourceAttachment({ context, source, attachmentId: attachment.id });

    if (document.current_attachment_id) {
      const archivePrevious = await context.supabase
        .from("attachments")
        .update({
          status: "archived",
          deleted_at: new Date().toISOString(),
          deleted_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .eq("id", document.current_attachment_id);

      if (archivePrevious.error) {
        logHrApiError("contextual_documents.archive_previous_attachment_failed", archivePrevious.error);
      }
    }

    await writeUploadEvent({
      context,
      document: documentUpdate.data as EmployeeDocumentRow,
      attachmentId: attachment.id,
      sourceEntityType: payload.sourceEntityType,
      sourceEntityId: payload.sourceEntityId,
      documentRole: payload.documentRole
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          link: linkResult.data,
          document: documentUpdate.data,
          attachment: {
            id: attachment.id,
            fileName: attachment.file_name,
            fileMimeType: attachment.file_mime_type,
            fileSizeBytes: Number(attachment.file_size_bytes),
            uploadedAt: attachment.created_at
          }
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel anexar o documento contextual.");
  }
}
