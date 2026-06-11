import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertCanAccessEvaluationTemplate, prepareEvaluationTemplateWrite } from "@/lib/hr/evaluation-actions";
import { evaluationTemplateListSelect, mapEvaluationTemplate, type EvaluationTemplateRow } from "@/lib/hr/evaluations";
import { evaluationTemplatePayloadSchema, evaluationTemplatesQuerySchema, formatEvaluationValidationError } from "@/lib/hr/evaluation-validation";
import { parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, evaluationTemplatesQuerySchema);
    let templatesQuery = context.supabase.from("hr_evaluation_templates").select(evaluationTemplateListSelect).is("deleted_at", null);

    if (query.status) templatesQuery = templatesQuery.eq("status", query.status);
    if (query.unitId) templatesQuery = templatesQuery.eq("unit_id", query.unitId);
    if (query.departmentId) templatesQuery = templatesQuery.eq("department_id", query.departmentId);
    if (query.jobPositionId) templatesQuery = templatesQuery.eq("job_position_id", query.jobPositionId);
    if (query.evaluationType) templatesQuery = templatesQuery.eq("evaluation_type", query.evaluationType);
    if (query.search) templatesQuery = templatesQuery.or(`name.ilike.%${query.search}%,code.ilike.%${query.search}%`);

    const { data, error } = await templatesQuery.order("status").order("updated_at", { ascending: false });
    if (error) {
      logHrApiError("evaluation_templates.list_failed", error);
      return hrApiError("Nao foi possivel carregar os modelos de avaliacao.", 500);
    }

    const rows = ((data ?? []) as unknown as EvaluationTemplateRow[]).filter((row) => {
      if (context.isSuperAdmin) return true;
      return !row.unit_id || context.accessibleUnitIds.includes(row.unit_id);
    });

    return NextResponse.json({ ok: true, data: rows.map((row) => mapEvaluationTemplate(row)) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(formatEvaluationValidationError(error), 422);
    return handleHrRouteError(error, "Nao foi possivel carregar modelos de avaliacao.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const payload = evaluationTemplatePayloadSchema.parse(await request.json());
    const insertPayload = await prepareEvaluationTemplateWrite(context, payload);
    const { data, error } = await context.supabase
      .from("hr_evaluation_templates")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(evaluationTemplateListSelect)
      .single();

    if (error) {
      logHrApiError("evaluation_templates.create_failed", error);
      return hrApiError("Nao foi possivel criar o modelo de avaliacao. Verifique se o codigo ja existe neste contexto.", 500);
    }

    return NextResponse.json({ ok: true, data: mapEvaluationTemplate(data as unknown as EvaluationTemplateRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(formatEvaluationValidationError(error), 422);
    return handleHrRouteError(error, "Nao foi possivel criar modelo de avaliacao.");
  }
}
