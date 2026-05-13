import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit
} from "@/lib/hr/api-auth";
import { hrEmployeeDocumentsQuerySchema, hrIdParamSchema, parseSearchParams } from "@/lib/hr/schemas";
import { redactEmployeeDocument, type EmployeeDocumentRow, type HrDocumentTypeRow } from "@/lib/hr/redaction";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const query = parseSearchParams(request, hrEmployeeDocumentsQuerySchema);
    const employee = await assertCanAccessHrEmployee(context, id);
    const canViewSensitiveDocuments = await userHasHrPermissionForUnit(
      context.supabase,
      context.session,
      HR_PERMISSIONS.documentsSensitiveView,
      employee.unit_id
    );

    let documentsQuery = context.supabase
      .from("employee_documents")
      .select(
        "id, organization_id, unit_id, employee_id, document_type_id, current_attachment_id, status, issue_date, received_at, valid_until, verified_at, rejected_at, rejection_reason, waived_at, waiver_reason, replaced_by_document_id, is_sensitive, visibility_scope, notes, metadata, created_at, updated_at"
      )
      .eq("employee_id", employee.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (employee.unit_id) documentsQuery = documentsQuery.eq("unit_id", employee.unit_id);
    if (query.status) documentsQuery = documentsQuery.eq("status", query.status);
    if (query.documentTypeId) documentsQuery = documentsQuery.eq("document_type_id", query.documentTypeId);

    const { data, error } = await documentsQuery;

    if (error) {
      logHrApiError("employee_documents.list_failed", error);
      return hrApiError("Nao foi possivel carregar os documentos do colaborador.", 500);
    }

    const documents = (data ?? []) as EmployeeDocumentRow[];
    const documentTypeIds = Array.from(new Set(documents.map((document) => document.document_type_id)));
    const { data: documentTypes, error: documentTypesError } = documentTypeIds.length
      ? await context.supabase
          .from("hr_document_types")
          .select(
            "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at"
          )
          .in("id", documentTypeIds)
          .is("deleted_at", null)
      : { data: [], error: null };

    if (documentTypesError) {
      logHrApiError("employee_documents.types_lookup_failed", documentTypesError);
      return hrApiError("Nao foi possivel carregar os tipos documentais do colaborador.", 500);
    }

    const documentTypesById = new Map(((documentTypes ?? []) as HrDocumentTypeRow[]).map((documentType) => [documentType.id, documentType]));

    return NextResponse.json({
      ok: true,
      data: documents.map((document) =>
        redactEmployeeDocument({
          document,
          documentType: documentTypesById.get(document.document_type_id) ?? null,
          canViewSensitive: canViewSensitiveDocuments,
          includeSensitive: query.includeSensitive === true
        })
      ),
      permissions: {
        canViewSensitiveDocuments
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar os documentos do colaborador.");
  }
}
