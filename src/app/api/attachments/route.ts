import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ATTACHMENTS_BUCKET,
  buildAttachmentStoragePath,
  createSignedAttachmentUrl,
  mapAttachment,
  normalizeAttachmentText,
  normalizeVisibilityScope,
  parseAttachmentBoolean,
  validateAttachmentFile,
  validatePurchaseQuoteAttachmentAccess,
  validateSupportedAttachmentEntity,
  type AttachmentRow
} from "@/lib/attachments/api";

const attachmentQuerySchema = z.object({
  module: z.literal("purchases"),
  entity_type: z.literal("purchase_quote"),
  entity_id: z.string().uuid("Entidade inválida.")
});

export async function GET(request: Request) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const params = attachmentQuerySchema.parse({
      module: url.searchParams.get("module") ?? "",
      entity_type: url.searchParams.get("entity_type") ?? "",
      entity_id: url.searchParams.get("entity_id") ?? ""
    });
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    await validatePurchaseQuoteAttachmentAccess(supabase, params.entity_id, accessibleUnitIds);

    const { data, error } = await supabase
      .from("attachments")
      .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
      .eq("module", params.module)
      .eq("entity_type", params.entity_type)
      .eq("entity_id", params.entity_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      logBaseCadastroError("attachments.list_failed", error);
      return apiError("Não foi possível carregar os anexos.", 500);
    }

    const rows = (data ?? []) as AttachmentRow[];
    const attachments = await Promise.all(
      rows.map(async (row) => {
        const signedUrl = await createSignedAttachmentUrl(supabase, row.storage_bucket ?? ATTACHMENTS_BUCKET, row.file_path);
        return mapAttachment(row, signedUrl);
      })
    );

    return NextResponse.json({ ok: true, attachments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados inválidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Não foi possível carregar os anexos.", 500);
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const formData = await request.formData();
    const moduleName = normalizeAttachmentText(formData.get("module"));
    const entityType = normalizeAttachmentText(formData.get("entity_type"));
    const entityId = normalizeAttachmentText(formData.get("entity_id"));
    const description = normalizeAttachmentText(formData.get("description"));
    const isSensitive = parseAttachmentBoolean(formData.get("is_sensitive"));
    const visibilityScope = normalizeVisibilityScope(formData.get("visibility_scope"));
    const file = formData.get("file");

    const entityValidationResponse = validateSupportedAttachmentEntity(moduleName, entityType);
    if (entityValidationResponse) {
      return entityValidationResponse;
    }

    const entityIdValidation = z.string().uuid("Entidade inválida.").safeParse(entityId);
    if (!entityIdValidation.success) {
      return apiError("Entidade inválida.", 422);
    }

    if (!(file instanceof File)) {
      return apiError("Selecione um arquivo para enviar.", 422);
    }

    const fileValidationMessage = validateAttachmentFile(file);
    if (fileValidationMessage) {
      return apiError(fileValidationMessage, 422);
    }

    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const entityContext = await validatePurchaseQuoteAttachmentAccess(supabase, entityId, accessibleUnitIds);
    const filePath = buildAttachmentStoragePath({
      organizationId: entityContext.organizationId,
      unitId: entityContext.unitId,
      entityType: "purchase_quote",
      entityId,
      fileName: file.name
    });
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });

    if (uploadError) {
      logBaseCadastroError("attachments.upload_failed", uploadError);
      return apiError("Não foi possível enviar o arquivo. Verifique se o bucket privado attachments existe no Supabase.", 500);
    }

    const { data: insertData, error: insertError } = await supabase
      .from("attachments")
      .insert({
        organization_id: entityContext.organizationId,
        unit_id: entityContext.unitId,
        module: moduleName,
        entity_type: entityType,
        entity_id: entityId,
        attachment_type_id: null,
        file_name: file.name,
        file_path: filePath,
        file_mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        storage_bucket: ATTACHMENTS_BUCKET,
        description: description || null,
        is_sensitive: isSensitive,
        visibility_scope: visibilityScope,
        uploaded_by: session.user.id,
        status: "active",
        created_by: session.user.id,
        updated_by: session.user.id
      })
      .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
      .single();

    if (insertError) {
      logBaseCadastroError("attachments.create_failed", insertError);
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath]);
      return apiError("Não foi possível registrar o anexo.", 500);
    }

    const attachmentRow = insertData as AttachmentRow;
    const signedUrl = await createSignedAttachmentUrl(supabase, attachmentRow.storage_bucket ?? ATTACHMENTS_BUCKET, attachmentRow.file_path);

    return NextResponse.json({
      ok: true,
      message: "Arquivo enviado com sucesso.",
      attachment: mapAttachment(attachmentRow, signedUrl)
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.", 500);
  }
}
