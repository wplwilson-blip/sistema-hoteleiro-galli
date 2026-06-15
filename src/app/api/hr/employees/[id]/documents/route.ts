import { NextResponse } from "next/server";
import { z } from "zod";
import { ATTACHMENTS_BUCKET, createSignedAttachmentUrl, sanitizeFileName, type AttachmentRow } from "@/lib/attachments/api";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit,
  type HrRequestContext
} from "@/lib/hr/api-auth";
import { ensureAutomaticEmployeeDocumentDossier } from "@/lib/hr/employee-document-dossier-auto";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import { hrEmployeeDocumentsQuerySchema, hrIdParamSchema, parseSearchParams } from "@/lib/hr/schemas";
import { redactEmployeeDocument, type EmployeeDocumentRow, type HrDocumentTypeRow } from "@/lib/hr/redaction";

const DOCUMENT_ATTACHMENT_MODULE = "hr";
const DOCUMENT_ATTACHMENT_ENTITY_TYPE = "employee_document";
const MAX_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const documentSelect =
  "id, organization_id, unit_id, employee_id, document_type_id, current_attachment_id, status, issue_date, received_at, valid_until, verified_at, rejected_at, rejection_reason, waived_at, waiver_reason, replaced_by_document_id, is_sensitive, visibility_scope, notes, metadata, created_at, updated_at";
const documentTypeSelect =
  "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at";
const attachmentSelect =
  "id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at";

const documentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ensure_dossier")
  }),
  z.object({
    action: z.literal("create"),
    documentTypeId: z.string().uuid("Tipo documental invalido."),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use vencimento no formato YYYY-MM-DD.").optional().or(z.literal("")),
    notes: z.string().trim().max(500, "Observacao muito longa.").optional()
  }),
  z.object({
    action: z.literal("update"),
    documentId: z.string().uuid("Documento invalido."),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use vencimento no formato YYYY-MM-DD.").optional().or(z.literal("")),
    notes: z.string().trim().max(500, "Observacao muito longa.").optional()
  }),
  z.object({
    action: z.literal("approve"),
    documentId: z.string().uuid("Documento invalido.")
  }),
  z.object({
    action: z.literal("reject"),
    documentId: z.string().uuid("Documento invalido."),
    reason: z.string().trim().min(3, "Informe o motivo da rejeicao.").max(500, "Motivo muito longo.")
  }),
  z.object({
    action: z.literal("waive"),
    documentId: z.string().uuid("Documento invalido."),
    reason: z.string().trim().min(3, "Informe o motivo da dispensa.").max(500, "Motivo muito longo.")
  })
]);

type RouteParams = { params: { id: string } };

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function validateDocumentFile(file: File) {
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

function buildEmployeeDocumentPath(input: {
  organizationId: string;
  unitId: string;
  employeeId: string;
  documentId: string;
  fileName: string;
}) {
  return `hr/${input.organizationId}/${input.unitId}/employees/${input.employeeId}/documents/${input.documentId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
}

function canUseDocumentType(documentType: HrDocumentTypeRow, employee: { organization_id: string | null; unit_id: string | null }) {
  if (documentType.is_system_default && !documentType.organization_id && !documentType.unit_id) return true;
  if (documentType.unit_id) return documentType.unit_id === employee.unit_id;
  if (documentType.organization_id) return documentType.organization_id === employee.organization_id;
  return false;
}

async function loadDocumentTypes(context: HrRequestContext, documentTypeIds: string[]) {
  if (!documentTypeIds.length) {
    return new Map<string, HrDocumentTypeRow>();
  }

  const { data, error } = await context.supabase
    .from("hr_document_types")
    .select(documentTypeSelect)
    .in("id", Array.from(new Set(documentTypeIds)))
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_documents.types_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os tipos documentais do colaborador.");
  }

  return new Map(((data ?? []) as HrDocumentTypeRow[]).map((documentType) => [documentType.id, documentType]));
}

async function loadAttachments(context: HrRequestContext, attachmentIds: string[]) {
  if (!attachmentIds.length) {
    return new Map<string, AttachmentRow>();
  }

  const { data, error } = await context.supabase
    .from("attachments")
    .select(attachmentSelect)
    .in("id", Array.from(new Set(attachmentIds)))
    .eq("module", DOCUMENT_ATTACHMENT_MODULE)
    .eq("entity_type", DOCUMENT_ATTACHMENT_ENTITY_TYPE)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_documents.attachments_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os anexos documentais.");
  }

  return new Map(((data ?? []) as AttachmentRow[]).map((attachment) => [attachment.id, attachment]));
}

async function mapDocuments(input: {
  context: HrRequestContext;
  documents: EmployeeDocumentRow[];
  canViewSensitiveDocuments: boolean;
  includeSensitive: boolean;
}) {
  const documentTypesById = await loadDocumentTypes(
    input.context,
    input.documents.map((document) => document.document_type_id)
  );
  const attachmentsById = await loadAttachments(
    input.context,
    input.documents.map((document) => document.current_attachment_id).filter(Boolean) as string[]
  );

  return Promise.all(
    input.documents.map(async (document) => {
      const attachment = document.current_attachment_id ? attachmentsById.get(document.current_attachment_id) ?? null : null;
      const signedUrl =
        attachment && input.canViewSensitiveDocuments
          ? await createSignedAttachmentUrl(input.context.supabase, attachment.storage_bucket ?? ATTACHMENTS_BUCKET, attachment.file_path)
          : undefined;

      return {
        ...redactEmployeeDocument({
          document,
          documentType: documentTypesById.get(document.document_type_id) ?? null,
          canViewSensitive: input.canViewSensitiveDocuments,
          includeSensitive: input.includeSensitive
        }),
        currentAttachment: attachment
          ? {
              id: attachment.id,
              fileName: input.canViewSensitiveDocuments ? attachment.file_name : "Arquivo protegido",
              fileMimeType: input.canViewSensitiveDocuments ? attachment.file_mime_type : "",
              fileSizeBytes: Number(attachment.file_size_bytes),
              uploadedAt: attachment.created_at,
              signedUrl
            }
          : null
      };
    })
  );
}

async function loadEmployeeDocument(context: HrRequestContext, employeeId: string, documentId: string) {
  const { data, error } = await context.supabase
    .from("employee_documents")
    .select(documentSelect)
    .eq("id", documentId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("employee_documents.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o documento do colaborador.");
  }

  return (data?.[0] as EmployeeDocumentRow | undefined) ?? null;
}

async function writeDocumentEvent(input: {
  context: HrRequestContext;
  document: EmployeeDocumentRow;
  attachmentId?: string | null;
  eventType:
    | "document_requested"
    | "document_uploaded"
    | "document_verified"
    | "document_rejected"
    | "document_waived";
  title: string;
  description: string;
  severity?: "info" | "notice" | "warning" | "critical";
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.document.employee_id,
    eventType: input.eventType,
    title: input.title,
    description: input.description,
    severity: input.severity ?? "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "HR",
    sourceEntityType: "employee_document",
    sourceEntityId: input.document.id,
    relatedDocumentId: input.document.id,
    relatedAttachmentId: input.attachmentId ?? null,
    actorUserId: input.context.session.user.id,
    eventPayload: {
      document_id: input.document.id,
      document_type_id: input.document.document_type_id,
      attachment_id: input.attachmentId ?? null
    }
  });

  if (!result.ok) {
    logHrApiError("employee_documents.event_insert_failed", { message: result.error.message, code: result.error.code });
  }
}

async function assertDocumentMutationContext(permission: string, employeeId: string) {
  const { context, response } = await requireHrPermission(permission as Parameters<typeof requireHrPermission>[0]);
  if (response || !context) return { context: null, response, employee: null };
  const employee = await assertCanAccessHrEmployee(context, employeeId);
  return { context, response: null, employee };
}

function isResolvedDocumentStatus(status: string) {
  return ["approved", "waived", "replaced"].includes(status);
}

function canReviewDocument(document: EmployeeDocumentRow) {
  return Boolean(document.current_attachment_id) && ["received", "under_review"].includes(document.status);
}

export async function GET(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const query = parseSearchParams(request, hrEmployeeDocumentsQuerySchema);
    const employee = await assertCanAccessHrEmployee(context, id);
    const [canViewSensitiveDocuments, canManageDocuments, canVerifyDocuments] = await Promise.all([
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsSensitiveView, employee.unit_id),
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsManage, employee.unit_id),
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsVerify, employee.unit_id)
    ]);

    let documentsQuery = context.supabase
      .from("employee_documents")
      .select(documentSelect)
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (employee.unit_id) documentsQuery = documentsQuery.eq("unit_id", employee.unit_id);
    if (query.status) documentsQuery = documentsQuery.eq("status", query.status);
    if (query.documentTypeId) documentsQuery = documentsQuery.eq("document_type_id", query.documentTypeId);
    if (query.source) {
      const { data: linkedDocuments, error: linkedDocumentsError } = await context.supabase
        .from("employee_document_links")
        .select("employee_document_id")
        .eq("employee_id", employee.id)
        .eq("source_entity_type", query.source)
        .is("deleted_at", null);

      if (linkedDocumentsError) {
        logHrApiError("employee_documents.contextual_links_lookup_failed", linkedDocumentsError);
        return hrApiError("Nao foi possivel carregar os vinculos contextuais dos documentos.", 500);
      }

      const linkedDocumentIds = Array.from(new Set((linkedDocuments ?? []).map((link) => link.employee_document_id).filter(Boolean)));
      if (!linkedDocumentIds.length) {
        return NextResponse.json({
          ok: true,
          data: [],
          permissions: {
            canViewSensitiveDocuments,
            canManageDocuments,
            canVerifyDocuments
          }
        });
      }

      documentsQuery = documentsQuery.in("id", linkedDocumentIds);
    }

    const { data, error } = await documentsQuery;

    if (error) {
      logHrApiError("employee_documents.list_failed", error);
      return hrApiError("Nao foi possivel carregar os documentos do colaborador.", 500);
    }

    const documents = (data ?? []) as EmployeeDocumentRow[];

    return NextResponse.json({
      ok: true,
      data: await mapDocuments({
        context,
        documents,
        canViewSensitiveDocuments,
        includeSensitive: query.includeSensitive === true
      }),
      permissions: {
        canViewSensitiveDocuments,
        canManageDocuments,
        canVerifyDocuments
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar os documentos do colaborador.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = hrIdParamSchema.parse(params);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      return handleUpload(request, id);
    }

    const payload = documentActionSchema.parse(await request.json());
    const requiredPermission =
      payload.action === "approve" || payload.action === "reject" || payload.action === "waive"
        ? HR_PERMISSIONS.documentsVerify
        : HR_PERMISSIONS.documentsManage;
    const { context, response, employee } = await assertDocumentMutationContext(requiredPermission, id);

    if (response || !context || !employee) {
      return response;
    }

    if (!employee.organization_id || !employee.unit_id) {
      return hrApiError("Colaborador sem unidade ou organizacao valida para dossie documental.", 422);
    }

    if (payload.action === "ensure_dossier") {
      const result = await ensureAutomaticEmployeeDocumentDossier(context.supabase, employee.id, context.session.user.id);
      return NextResponse.json({ ok: true, data: result });
    }

    if (payload.action === "create") {
      const documentTypeMap = await loadDocumentTypes(context, [payload.documentTypeId]);
      const documentType = documentTypeMap.get(payload.documentTypeId);

      if (!documentType || documentType.status !== "active" || !canUseDocumentType(documentType, employee)) {
        return hrApiError("Tipo documental nao encontrado para este colaborador.", 404);
      }

      const duplicate = await context.supabase
        .from("employee_documents")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("document_type_id", documentType.id)
        .is("deleted_at", null)
        .limit(1);

      if (duplicate.error) {
        logHrApiError("employee_documents.duplicate_lookup_failed", duplicate.error);
        return hrApiError("Nao foi possivel validar documentos existentes.", 500);
      }

      if (duplicate.data?.length) {
        return hrApiError("Este tipo documental ja existe no dossie do colaborador.", 409);
      }

      const { data, error } = await context.supabase
        .from("employee_documents")
        .insert({
          organization_id: employee.organization_id,
          unit_id: employee.unit_id,
          employee_id: employee.id,
          document_type_id: documentType.id,
          status: "pending",
          valid_until: payload.validUntil || null,
          is_sensitive: documentType.is_sensitive_default,
          visibility_scope: documentType.visibility_scope_default === "organization" ? "organization" : documentType.visibility_scope_default,
          notes: payload.notes?.trim() || null,
          created_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .select(documentSelect)
        .single();

      if (error) {
        logHrApiError("employee_documents.create_failed", error);
        return hrApiError("Nao foi possivel solicitar o documento.", 500);
      }

      await writeDocumentEvent({
        context,
        document: data as EmployeeDocumentRow,
        eventType: "document_requested",
        title: "Documento solicitado",
        description: "Uma pendencia documental foi aberta para o colaborador."
      });

      return NextResponse.json({ ok: true, data }, { status: 201 });
    }

    const document = await loadEmployeeDocument(context, employee.id, payload.documentId);
    if (!document || document.unit_id !== employee.unit_id) {
      return hrApiError("Documento nao encontrado para este colaborador.", 404);
    }

    if (isResolvedDocumentStatus(document.status) && payload.action !== "update") {
      return hrApiError("Documento ja resolvido. Abra uma nova pendencia se precisar substituir o registro.", 422);
    }

    if (payload.action === "update") {
      const { data, error } = await context.supabase
        .from("employee_documents")
        .update({
          valid_until: payload.validUntil || null,
          notes: payload.notes?.trim() || null,
          updated_by: context.session.user.id
        })
        .eq("id", document.id)
        .select(documentSelect)
        .single();

      if (error) {
        logHrApiError("employee_documents.update_failed", error);
        return hrApiError("Nao foi possivel atualizar o documento.", 500);
      }

      return NextResponse.json({ ok: true, data });
    }

    if (payload.action === "approve") {
      if (!canReviewDocument(document)) {
        return hrApiError("Anexe o arquivo antes de aprovar. Se o documento nao se aplica, use Dispensar.", 422);
      }

      const { data, error } = await context.supabase
        .from("employee_documents")
        .update({
          status: "approved",
          verified_by: context.session.user.id,
          verified_at: new Date().toISOString(),
          received_at: document.received_at ?? new Date().toISOString(),
          rejected_at: null,
          rejected_by: null,
          rejection_reason: null,
          waived_at: null,
          waived_by: null,
          waiver_reason: null,
          updated_by: context.session.user.id
        })
        .eq("id", document.id)
        .select(documentSelect)
        .single();

      if (error) {
        logHrApiError("employee_documents.approve_failed", error);
        return hrApiError("Nao foi possivel aprovar o documento.", 500);
      }

      await writeDocumentEvent({
        context,
        document: data as EmployeeDocumentRow,
        attachmentId: document.current_attachment_id,
        eventType: "document_verified",
        title: "Documento aprovado",
        description: "O documento foi conferido e aprovado pelo RH."
      });

      return NextResponse.json({ ok: true, data });
    }

    if (payload.action === "reject") {
      if (!canReviewDocument(document)) {
        return hrApiError("So e possivel rejeitar documento com arquivo enviado para conferencia.", 422);
      }

      const { data, error } = await context.supabase
        .from("employee_documents")
        .update({
          status: "rejected",
          rejected_by: context.session.user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: payload.reason,
          verified_at: null,
          verified_by: null,
          waived_at: null,
          waived_by: null,
          waiver_reason: null,
          updated_by: context.session.user.id
        })
        .eq("id", document.id)
        .select(documentSelect)
        .single();

      if (error) {
        logHrApiError("employee_documents.reject_failed", error);
        return hrApiError("Nao foi possivel rejeitar o documento.", 500);
      }

      await writeDocumentEvent({
        context,
        document: data as EmployeeDocumentRow,
        attachmentId: document.current_attachment_id,
        eventType: "document_rejected",
        title: "Documento rejeitado",
        description: "O documento foi rejeitado para ajuste pelo RH.",
        severity: "warning"
      });

      return NextResponse.json({ ok: true, data });
    }

    const { data, error } = await context.supabase
      .from("employee_documents")
      .update({
        status: "waived",
        waived_by: context.session.user.id,
        waived_at: new Date().toISOString(),
        waiver_reason: payload.reason,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        updated_by: context.session.user.id
      })
      .eq("id", document.id)
      .select(documentSelect)
      .single();

    if (error) {
      logHrApiError("employee_documents.waive_failed", error);
      return hrApiError("Nao foi possivel dispensar o documento.", 500);
    }

    await writeDocumentEvent({
      context,
      document: data as EmployeeDocumentRow,
      eventType: "document_waived",
      title: "Documento dispensado",
      description: "O documento foi dispensado com justificativa registrada.",
      severity: "warning"
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel atualizar o dossie documental.");
  }
}

async function handleUpload(request: Request, employeeId: string) {
  const { context, response, employee } = await assertDocumentMutationContext(HR_PERMISSIONS.documentsManage, employeeId);

  if (response || !context || !employee) {
    return response;
  }

  if (!employee.organization_id || !employee.unit_id) {
    return hrApiError("Colaborador sem unidade ou organizacao valida para dossie documental.", 422);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logHrApiError("employee_documents.form_data_parse_failed", error instanceof Error ? error : { message: "multipart parse failed" });
    return hrApiError("Nao foi possivel ler o arquivo enviado. Tente anexar novamente.", 422);
  }

  const documentId = String(formData.get("documentId") ?? "");
  const file = formData.get("file");
  const documentIdResult = z.string().uuid("Documento invalido.").safeParse(documentId);

  if (!documentIdResult.success) {
    return hrApiError(documentIdResult.error.errors[0]?.message ?? "Documento invalido.", 422);
  }

  if (!(file instanceof File)) {
    return hrApiError("Selecione um arquivo para anexar.", 422);
  }

  const validationMessage = validateDocumentFile(file);
  if (validationMessage) {
    return hrApiError(validationMessage, 422);
  }

  const document = await loadEmployeeDocument(context, employee.id, documentId);
  if (!document || document.unit_id !== employee.unit_id) {
    return hrApiError("Documento nao encontrado para este colaborador.", 404);
  }

  if (isResolvedDocumentStatus(document.status)) {
    return hrApiError("Documento ja resolvido. Abra uma nova pendencia se precisar substituir o registro.", 422);
  }

  const filePath = buildEmployeeDocumentPath({
    organizationId: employee.organization_id,
    unitId: employee.unit_id,
    employeeId: employee.id,
    documentId: document.id,
    fileName: file.name
  });
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await context.supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, fileBuffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });

  if (uploadError) {
    logHrApiError("employee_documents.upload_failed", uploadError);
    return hrApiError("Nao foi possivel enviar o arquivo para o armazenamento seguro.", 500);
  }

  const { data: attachmentData, error: attachmentError } = await context.supabase
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
      description: "Evidencia documental do colaborador",
      is_sensitive: true,
      visibility_scope: "restricted",
      uploaded_by: context.session.user.id,
      status: "active",
      created_by: context.session.user.id,
      updated_by: context.session.user.id
    })
    .select(attachmentSelect)
    .single();

  if (attachmentError) {
    logHrApiError("employee_documents.attachment_create_failed", attachmentError);
    await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
    return hrApiError("Arquivo enviado, mas nao foi possivel registrar o anexo documental.", 500);
  }

  const attachment = attachmentData as AttachmentRow;
  const { data: updatedDocument, error: documentUpdateError } = await context.supabase
    .from("employee_documents")
    .update({
      current_attachment_id: attachment.id,
      status: "received",
      received_at: new Date().toISOString(),
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      waived_at: null,
      waived_by: null,
      waiver_reason: null,
      updated_by: context.session.user.id
    })
    .eq("id", document.id)
    .select(documentSelect)
    .single();

  if (documentUpdateError) {
    logHrApiError("employee_documents.link_attachment_failed", documentUpdateError);
    await context.supabase.from("attachments").update({ status: "inactive", deleted_at: new Date().toISOString(), deleted_by: context.session.user.id }).eq("id", attachment.id);
    await context.supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
    return hrApiError("Arquivo enviado, mas nao foi possivel vincular ao documento.", 500);
  }

  if (document.current_attachment_id) {
    const { error: archiveError } = await context.supabase
      .from("attachments")
      .update({
        status: "archived",
        deleted_at: new Date().toISOString(),
        deleted_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .eq("id", document.current_attachment_id);

    if (archiveError) {
      logHrApiError("employee_documents.archive_previous_attachment_failed", archiveError);
    }
  }

  await writeDocumentEvent({
    context,
    document: updatedDocument as EmployeeDocumentRow,
    attachmentId: attachment.id,
    eventType: "document_uploaded",
    title: document.current_attachment_id ? "Arquivo substituido" : "Arquivo anexado",
    description: "Uma evidencia documental foi vinculada ao dossie do colaborador."
  });

  return NextResponse.json({ ok: true, data: updatedDocument }, { status: 201 });
}
