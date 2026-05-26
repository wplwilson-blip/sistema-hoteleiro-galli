import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { calculateCriterionWeightedScore, calculateEvaluationTotals } from "@/lib/hr/evaluation-calculations";
import { assertEvaluationScoreComments, loadCriteriaForScores, loadEmployeeEvaluation } from "@/lib/hr/evaluation-actions";
import { employeeEvaluationDetailSelect, employeeEvaluationListSelect, redactEmployeeEvaluation, type EmployeeEvaluationRow } from "@/lib/hr/evaluations";
import { employeeEvaluationScoresPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeEvaluationScoresPayloadSchema.parse(await request.json());
    const evaluation = await loadEmployeeEvaluation(context, id, employeeEvaluationListSelect);
    if (!evaluation) return hrApiError("Avaliacao nao encontrada.", 404);
    if (["closed", "cancelled"].includes(evaluation.status)) {
      return hrApiError("Avaliacao encerrada nao permite alterar notas.", 422);
    }

    const { data: templateData, error: templateError } = await context.supabase
      .from("hr_evaluation_templates")
      .select("id, scale_min, scale_max")
      .eq("id", evaluation.template_id)
      .is("deleted_at", null)
      .limit(1);
    if (templateError) throw templateError;
    const template = templateData?.[0] as { scale_min: number; scale_max: number } | undefined;
    if (!template) return hrApiError("Modelo da avaliacao nao encontrado.", 404);

    const criteria = await loadCriteriaForScores(
      context,
      payload.scores.map((score) => score.criterionId)
    );

    const writeRows = payload.scores.map((score) => {
      const criterion = criteria.get(score.criterionId);
      if (!criterion || criterion.section_id !== score.sectionId) {
        throw new Error("Criterio informado nao pertence a secao indicada.");
      }
      if (!score.isNotApplicable && (score.score == null || score.score < template.scale_min || score.score > template.scale_max)) {
        throw new Error(`Nota deve ficar entre ${template.scale_min} e ${template.scale_max}.`);
      }
      assertEvaluationScoreComments(criteria, [
        {
          criterionId: score.criterionId,
          score: score.score ?? null,
          isNotApplicable: score.isNotApplicable,
          comment: score.comment
        }
      ]);

      return {
        evaluation_id: evaluation.id,
        criterion_id: score.criterionId,
        section_id: score.sectionId,
        score: score.isNotApplicable ? null : score.score ?? null,
        is_not_applicable: score.isNotApplicable,
        comment: score.comment?.trim() || null,
        evidence_note: score.evidenceNote?.trim() || null,
        weighted_score: calculateCriterionWeightedScore(score.score ?? null, Number(criterion.weight ?? 0), score.isNotApplicable),
        updated_by: context.session.user.id
      };
    });

    const { data: existingData, error: existingError } = await context.supabase
      .from("employee_evaluation_scores")
      .select("id, criterion_id")
      .eq("evaluation_id", evaluation.id)
      .is("deleted_at", null);
    if (existingError) throw existingError;

    const existingByCriterion = new Map((existingData ?? []).map((row) => [row.criterion_id as string, row.id as string]));
    for (const row of writeRows) {
      const existingId = existingByCriterion.get(row.criterion_id);
      if (existingId) {
        const { error } = await context.supabase.from("employee_evaluation_scores").update(row).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await context.supabase
          .from("employee_evaluation_scores")
          .insert({ ...row, created_by: context.session.user.id });
        if (error) throw error;
      }
    }

    const totals = calculateEvaluationTotals(
      writeRows.map((row) => ({
        score: row.score,
        isNotApplicable: row.is_not_applicable,
        weight: Number(criteria.get(row.criterion_id)?.weight ?? 0)
      }))
    );
    const { data, error } = await context.supabase
      .from("employee_evaluations")
      .update({ total_score: totals.totalScore, weighted_score: totals.weightedScore, updated_by: context.session.user.id })
      .eq("id", evaluation.id)
      .select(employeeEvaluationDetailSelect)
      .single();
    if (error) {
      logHrApiError("employee_evaluation_scores.update_failed", error);
      return hrApiError("Nao foi possivel atualizar as notas da avaliacao.", 500);
    }

    return NextResponse.json({ ok: true, data: redactEmployeeEvaluation(data as unknown as EmployeeEvaluationRow, true, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar notas da avaliacao.");
  }
}
