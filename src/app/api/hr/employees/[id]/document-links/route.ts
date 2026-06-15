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
import {
  contextualDocumentLinkSelect,
  mapDocumentLinks,
  type ContextualDocumentLinkRow
} from "@/lib/hr/contextual-documents";
import {
  contextualDocumentRequirementStatusSchema,
  contextualDocumentRoleSchema,
  contextualDocumentSourceEntityTypeSchema,
  hrIdParamSchema,
  parseSearchParams
} from "@/lib/hr/schemas";

const emptyToUndefined = z.literal("").transform(() => undefined);

const documentLinksQuerySchema = z.object({
  source: contextualDocumentSourceEntityTypeSchema.optional().or(emptyToUndefined),
  documentRole: contextualDocumentRoleSchema.optional().or(emptyToUndefined),
  requirementStatus: contextualDocumentRequirementStatusSchema.optional().or(emptyToUndefined),
  sensitive: z
    .preprocess((value) => (value === "" || value == null ? undefined : value), z.enum(["true", "false", "1", "0"]).optional())
    .transform((value) => (value === undefined ? undefined : value === "true" || value === "1")),
  includeDeleted: z
    .preprocess((value) => (value === "" || value == null ? undefined : value), z.enum(["true", "false", "1", "0"]).optional())
    .transform((value) => (value === undefined ? undefined : value === "true" || value === "1")),
  includeSensitive: z
    .preprocess((value) => (value === "" || value == null ? undefined : value), z.enum(["true", "false", "1", "0"]).optional())
    .transform((value) => (value === undefined ? undefined : value === "true" || value === "1"))
});

type RouteParams = { params: { id: string } };

export async function GET(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const query = parseSearchParams(request, documentLinksQuerySchema);
    const employee = await assertCanAccessHrEmployee(context, id);
    const [canViewSensitiveDocuments, canManageDocuments, canVerifyDocuments] = await Promise.all([
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsSensitiveView, employee.unit_id),
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsManage, employee.unit_id),
      userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsVerify, employee.unit_id)
    ]);

    let linksQuery = context.supabase
      .from("employee_document_links")
      .select(contextualDocumentLinkSelect)
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });

    if (query.includeDeleted && !canManageDocuments && !canVerifyDocuments) {
      return hrApiError("Voce nao tem permissao para listar vinculos documentais excluidos.", 403);
    }

    if (!query.includeDeleted) linksQuery = linksQuery.is("deleted_at", null);
    if (employee.unit_id) linksQuery = linksQuery.eq("unit_id", employee.unit_id);
    if (query.source) linksQuery = linksQuery.eq("source_entity_type", query.source);
    if (query.documentRole) linksQuery = linksQuery.eq("document_role", query.documentRole);
    if (query.requirementStatus) linksQuery = linksQuery.eq("requirement_status", query.requirementStatus);
    if (query.sensitive !== undefined) linksQuery = linksQuery.eq("is_sensitive", query.sensitive);

    const { data, error } = await linksQuery;

    if (error) {
      logHrApiError("contextual_documents.links_list_failed", error);
      return hrApiError("Nao foi possivel carregar os anexos contextuais do colaborador.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: await mapDocumentLinks({
        context,
        links: (data ?? []) as ContextualDocumentLinkRow[],
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

    return handleHrRouteError(error, "Nao foi possivel carregar os anexos contextuais do colaborador.");
  }
}
