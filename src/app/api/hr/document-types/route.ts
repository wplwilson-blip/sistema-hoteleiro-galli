import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { canUseRequestedUnit, getOrganizationIdsForUnits } from "@/lib/hr/data";
import { hrDocumentTypesQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { mapHrDocumentType, type HrDocumentTypeRow } from "@/lib/hr/redaction";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsView);

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrDocumentTypesQuerySchema);

    if (!canUseRequestedUnit(context, query.unitId)) {
      return hrApiError("Voce nao tem permissao para acessar esta unidade.", 403);
    }

    const scopedUnitIds = query.unitId ? [query.unitId] : context.accessibleUnitIds;
    const organizationIds = await getOrganizationIdsForUnits(context.supabase, scopedUnitIds);
    let documentTypesQuery = context.supabase
      .from("hr_document_types")
      .select(
        "id, organization_id, unit_id, code, name, description, category, is_system_default, is_required, requires_valid_until, default_validity_days, recurrence_months, is_sensitive_default, visibility_scope_default, sort_order, status, created_at, updated_at"
      )
      .is("deleted_at", null);

    if (query.status) documentTypesQuery = documentTypesQuery.eq("status", query.status);
    if (query.category) documentTypesQuery = documentTypesQuery.eq("category", query.category);
    if (query.required !== undefined) documentTypesQuery = documentTypesQuery.eq("is_required", query.required);

    const { data, error } = await documentTypesQuery.order("sort_order", { ascending: true }).order("name", { ascending: true });

    if (error) {
      return hrApiError("Nao foi possivel carregar os tipos documentais de RH.", 500);
    }

    const rows = ((data ?? []) as HrDocumentTypeRow[]).filter((row) => {
      if (context.isSuperAdmin && !query.unitId) return true;
      if (!row.organization_id && !row.unit_id) return true;
      if (row.unit_id && scopedUnitIds.includes(row.unit_id)) return true;
      return Boolean(row.organization_id && !row.unit_id && organizationIds.includes(row.organization_id));
    });

    return NextResponse.json({
      ok: true,
      data: rows.map(mapHrDocumentType)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar os tipos documentais de RH.");
  }
}
