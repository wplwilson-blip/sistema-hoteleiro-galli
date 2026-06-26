import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { loadHrDocumentRuleOptions, prepareHrDocumentRuleWrite } from "@/lib/hr/document-rule-actions";
import { documentRuleListSelect, mapHrDocumentRule, type HrDocumentRuleListRow } from "@/lib/hr/document-rules";
import { hrDocumentRulePayloadSchema, hrDocumentRulesQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const query = parseSearchParams(request, hrDocumentRulesQuerySchema);
    let rulesQuery = context.supabase.from("hr_document_rules").select(documentRuleListSelect).is("deleted_at", null);

    if (query.status) rulesQuery = rulesQuery.eq("status", query.status);
    if (query.unitId) rulesQuery = rulesQuery.eq("unit_id", query.unitId);
    if (query.departmentId) rulesQuery = rulesQuery.eq("department_id", query.departmentId);
    if (query.jobPositionId) rulesQuery = rulesQuery.eq("job_position_id", query.jobPositionId);
    if (query.documentTypeId) rulesQuery = rulesQuery.eq("document_type_id", query.documentTypeId);
    if (query.admissionType) rulesQuery = rulesQuery.eq("admission_type", query.admissionType);

    const { data, error } = await rulesQuery
      .order("status", { ascending: true })
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      logHrApiError("document_rules.list_failed", error);
      return hrApiError("Nao foi possivel carregar as regras documentais.", 500);
    }

    // active-unit: accessibleUnitIds ja vem estreitado (super admin = [unidade ativa]).
    // Catalogo: regras de rede (unit_id NULL) permanecem visiveis em qualquer unidade.
    const rows = ((data ?? []) as unknown as HrDocumentRuleListRow[]).filter(
      (row) => !row.unit_id || context.accessibleUnitIds.includes(row.unit_id)
    );

    return NextResponse.json({
      ok: true,
      data: rows.map(mapHrDocumentRule),
      options: await loadHrDocumentRuleOptions(context)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar as regras documentais.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.documentsManage);

  if (response || !context) {
    return response;
  }

  try {
    const payload = hrDocumentRulePayloadSchema.parse(await request.json());
    const insertPayload = await prepareHrDocumentRuleWrite(context, payload);
    const { data, error } = await context.supabase
      .from("hr_document_rules")
      .insert({
        ...insertPayload,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(documentRuleListSelect)
      .single();

    if (error) {
      logHrApiError("document_rules.create_failed", error);
      return hrApiError("Nao foi possivel criar a regra documental. Verifique se ja existe uma regra para este mesmo contexto.", 500);
    }

    return NextResponse.json({ ok: true, data: mapHrDocumentRule(data as unknown as HrDocumentRuleListRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel criar a regra documental.");
  }
}
