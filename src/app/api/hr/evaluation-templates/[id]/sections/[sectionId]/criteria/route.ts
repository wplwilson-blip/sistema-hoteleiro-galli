import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertCanAccessEvaluationTemplate, loadEvaluationTemplate, prepareEvaluationCriterionWrite } from "@/lib/hr/evaluation-actions";
import { evaluationCriterionSelect, mapEvaluationTemplateCriterion, type EvaluationTemplateCriterionRow } from "@/lib/hr/evaluations";
import { evaluationTemplateCriterionPayloadSchema, formatEvaluationValidationError } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; sectionId: string } };

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: sectionId } = hrIdParamSchema.parse({ id: params.sectionId });
    const payload = evaluationTemplateCriterionPayloadSchema.parse(await request.json());
    const template = await loadEvaluationTemplate(context, id);
    if (!template) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, template);

    const { data: sectionData, error: sectionError } = await context.supabase
      .from("hr_evaluation_template_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("template_id", id)
      .is("deleted_at", null)
      .limit(1);
    if (sectionError) throw sectionError;
    if (!sectionData?.[0]) return hrApiError("Secao do modelo nao encontrada.", 404);

    const { data, error } = await context.supabase
      .from("hr_evaluation_template_criteria")
      .insert({ ...prepareEvaluationCriterionWrite(sectionId, payload), created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(evaluationCriterionSelect)
      .single();

    if (error) {
      logHrApiError("evaluation_template_criteria.create_failed", error);
      return hrApiError("Nao foi possivel criar o criterio do modelo.", 500);
    }
    return NextResponse.json({ ok: true, data: mapEvaluationTemplateCriterion(data as unknown as EvaluationTemplateCriterionRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(formatEvaluationValidationError(error), 422);
    return handleHrRouteError(error, "Nao foi possivel criar criterio do modelo.");
  }
}
