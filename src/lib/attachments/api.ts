import { apiError, logBaseCadastroError, type SupabaseAdmin } from "@/lib/base-cadastros/api-helpers";

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx"] as const;
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
] as const;

const BLOCKED_ATTACHMENT_EXTENSIONS = ["exe", "bat", "cmd", "js", "sh", "php", "html"];
const VALID_VISIBILITY_SCOPES = ["own", "department", "unit", "all", "restricted"];

export type AttachmentEntityContext = {
  organizationId: string;
  unitId: string | null;
};

export type AttachmentRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  file_mime_type: string;
  file_size_bytes: string | number;
  storage_bucket: string | null;
  description: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  uploaded_by: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};

type PurchaseQuoteContextRow = {
  id: string;
  organization_id: string;
  unit_id: string | null;
  purchase_request_id: string;
};

type PurchaseRequestContextRow = {
  id: string;
  organization_id: string;
  unit_id: string;
};

export function normalizeAttachmentText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseAttachmentBoolean(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return false;
  }

  return value === "true" || value === "1" || value === "on";
}

export function normalizeVisibilityScope(value: FormDataEntryValue | null) {
  const scope = normalizeAttachmentText(value) || "unit";
  return VALID_VISIBILITY_SCOPES.includes(scope) ? scope : "unit";
}

export function getAttachmentExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return extension;
}

export function validateAttachmentFile(file: File) {
  if (!file.size) {
    return "Arquivo inválido.";
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return "Arquivo excede o tamanho máximo de 10 MB.";
  }

  const extension = getAttachmentExtension(file.name);

  if (BLOCKED_ATTACHMENT_EXTENSIONS.includes(extension)) {
    return "Tipo de arquivo não permitido.";
  }

  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension as (typeof ALLOWED_ATTACHMENT_EXTENSIONS)[number])) {
    return "Tipo de arquivo não permitido.";
  }

  if (file.type && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number])) {
    return "Tipo de arquivo não permitido.";
  }

  return "";
}

export function sanitizeFileName(fileName: string) {
  const fallback = "arquivo";
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

export function buildAttachmentStoragePath(input: {
  organizationId: string;
  unitId: string | null;
  entityType: "purchase_quote";
  entityId: string;
  fileName: string;
}) {
  const unitSegment = input.unitId ?? "global";
  return `purchases/${input.organizationId}/${unitSegment}/purchase_quotes/${input.entityId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;
}

export function mapAttachment(row: AttachmentRow, signedUrl?: string) {
  return {
    id: row.id,
    module: row.module,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    storageBucket: row.storage_bucket ?? ATTACHMENTS_BUCKET,
    description: row.description ?? "",
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    uploadedBy: row.uploaded_by ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl
  };
}

export function validateSupportedAttachmentEntity(module: string, entityType: string) {
  if (module !== "purchases" || entityType !== "purchase_quote") {
    return apiError("Tipo de anexo não suportado nesta sprint.", 422);
  }

  return null;
}

export async function validatePurchaseQuoteAttachmentAccess(
  supabase: SupabaseAdmin,
  entityId: string,
  accessibleUnitIds: string[]
): Promise<AttachmentEntityContext> {
  const { data: quoteData, error: quoteError } = await supabase
    .from("purchase_quotes")
    .select("id, organization_id, unit_id, purchase_request_id")
    .eq("id", entityId)
    .is("deleted_at", null)
    .single();

  if (quoteError) {
    logBaseCadastroError("attachments.purchase_quote_lookup_failed", quoteError);
    throw new Error("Você não tem permissão para acessar este anexo.");
  }

  const quote = quoteData as PurchaseQuoteContextRow;
  const { data: requestData, error: requestError } = await supabase
    .from("purchase_requests")
    .select("id, organization_id, unit_id")
    .eq("id", quote.purchase_request_id)
    .is("deleted_at", null)
    .single();

  if (requestError) {
    logBaseCadastroError("attachments.purchase_request_lookup_failed", requestError);
    throw new Error("Você não tem permissão para acessar este anexo.");
  }

  const purchaseRequest = requestData as PurchaseRequestContextRow;

  if (quote.organization_id !== purchaseRequest.organization_id || quote.unit_id !== purchaseRequest.unit_id) {
    throw new Error("Você não tem permissão para acessar este anexo.");
  }

  if (!accessibleUnitIds.includes(purchaseRequest.unit_id)) {
    throw new Error("Você não tem permissão para acessar este anexo.");
  }

  return {
    organizationId: purchaseRequest.organization_id,
    unitId: purchaseRequest.unit_id
  };
}

export async function createSignedAttachmentUrl(supabase: SupabaseAdmin, bucket: string, filePath: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 300);

  if (error) {
    logBaseCadastroError("attachments.signed_url_failed", error);
    return undefined;
  }

  return data.signedUrl;
}
