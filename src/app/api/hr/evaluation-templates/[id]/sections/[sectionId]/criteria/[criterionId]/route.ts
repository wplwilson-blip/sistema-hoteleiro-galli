import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertCanAccessEvaluationTemplate, loadEvaluationTemplate, prepareEvaluationCriterionWrite } from "@/lib/hr/evaluation-actions";
import { evaluationCriterionSelect, mapEvaluationTemplateCriterion, type EvaluationTemplateCriterionRow } from "@/lib/hr/evaluations";
import { evaluationTemplateCriterionPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; sectionId: string; criterionId: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: sectionId } = hrIdParamSchema.parse({ id: params.sectionId });
    const { id: criterionId } = hrIdParamSchema.parse({ id: params.criterionId });
    const payload = evaluationTemplateCriterionPayloadSchema.partial().parse(await request.json());
    const template = await loadEvaluationTemplate(context, id);
    if (!template) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, template);

    const { data: existingData, error: existingError } = await context.supabase
      .from("hr_evaluation_template_criteria")
      .select(evaluationCriterionSelect)
      .eq("id", criterionId)
      .eq("section_id", sectionId)
      .is("deleted_at", null)
      .limit(1);
    if (existingError) throw existingError;
    const existing = existingData?.[0] as unknown as EvaluationTemplateCriterionRow | undefined;
    if (!existing) return hrApiError("Criterio do modelo nao encontrado.", 404);

    const merged = {
      code: payload.code ?? existing.code,
      title: payload.title ?? existing.title,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      expectedBehavior: pickPayload(payload, "expectedBehavior", existing.expected_behavior ?? undefined) as string | undefined,
      weight: payload.weight ?? existing.weight,
      sortOrder: payload.sortOrder ?? existing.sort_order,
      isRequired: payload.isRequired ?? existing.is_required,
      isCritical: payload.isCritical ?? existing.is_critical,
      requiresCommentBelowScore: payload.requiresCommentBelowScore ?? existing.requires_comment_below_score,
      commentRequiredScoreThreshold: pickPayload(payload, "commentRequiredScoreThreshold", existing.comment_required_score_threshold ?? undefined) as
        | number
        | undefined,
      appliesToJobPositionId: pickPayload(payload, "appliesToJobPositionId", existing.applies_to_job_position_id ?? undefined) as string | undefined,
      appliesToDepartmentId: pickPayload(payload, "appliesToDepartmentId", existing.applies_to_department_id ?? undefined) as string | undefined,
      status: payload.status ?? existing.status
    };
    const { data, error } = await context.supabase
      .from("hr_evaluation_template_criteria")
      .update({
        ...prepareEvaluationCriterionWrite(sectionId, evaluationTemplateCriterionPayloadSchema.parse(merged)),
        updated_by: context.session.user.id
      })
      .eq("id", criterionId)
      .select(evaluationCriterionSelect)
      .single();
    if (error) {
      logHrApiError("evaluation_template_criteria.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o criterio do modelo.", 500);
    }
    return NextResponse.json({ ok: true, data: mapEvaluationTemplateCriterion(data as unknown as EvaluationTemplateCriterionRow) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar criterio do modelo.");
  }
}
