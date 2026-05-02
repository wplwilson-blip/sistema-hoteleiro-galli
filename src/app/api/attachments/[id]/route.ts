import { NextResponse } from "next/server";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validatePurchaseQuoteAttachmentMutationAccess, type AttachmentRow } from "@/lib/attachments/api";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    const { data, error } = await supabase
      .from("attachments")
      .select("id, organization_id, unit_id, module, entity_type, entity_id, file_name, file_path, file_mime_type, file_size_bytes, storage_bucket, description, is_sensitive, visibility_scope, uploaded_by, status, created_at, updated_at")
      .eq("id", params.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .single();

    if (error) {
      logBaseCadastroError("attachments.lookup_failed", error);
      return apiError("Você não tem permissão para acessar este anexo.", 403);
    }

    const attachment = data as AttachmentRow;

    if (attachment.module !== "purchases" || attachment.entity_type !== "purchase_quote") {
      return apiError("Você não tem permissão para acessar este anexo.", 403);
    }

    await validatePurchaseQuoteAttachmentMutationAccess(supabase, attachment.entity_id, accessibleUnitIds);

    const { error: updateError } = await supabase
      .from("attachments")
      .update({
        status: "inactive",
        deleted_at: new Date().toISOString(),
        deleted_by: session.user.id,
        updated_by: session.user.id
      })
      .eq("id", attachment.id);

    if (updateError) {
      logBaseCadastroError("attachments.delete_failed", updateError);
      return apiError("Não foi possível remover o anexo.", 500);
    }

    return NextResponse.json({ ok: true, message: "Anexo removido com sucesso." });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível remover o anexo.", 500);
  }
}
