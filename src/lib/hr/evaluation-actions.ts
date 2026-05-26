import "server-only";

import { HrAuthorizationError, assertCanAccessHrEmployee, logHrApiError, type HrEmployeeRow, type HrRequestContext } from "@/lib/hr/api-auth";
import {
  evaluationTemplateDetailSelect,
  evaluationTemplateSelect,
  type EmployeeEvaluationRow,
  type EvaluationTemplateCriterionRow,
  type EvaluationTemplateRow
} from "@/lib/hr/evaluations";
import type {
  employeeEvaluationCreateSchema,
  employeeEvaluationUpdateSchema,
  employeeEvaluationScoresPayloadSchema,
  evaluationTemplateCriterionPayloadSchema,
  evaluationTemplatePayloadSchema,
  evaluationTemplateSectionPayloadSchema
} from "@/lib/hr/evaluation-validation";
import type { z } from "zod";

type TemplatePayload = z.infer<typeof evaluationTemplatePayloadSchema>;
type SectionPayload = z.infer<typeof evaluationTemplateSectionPayloadSchema>;
type CriterionPayload = z.infer<typeof evaluationTemplateCriterionPayloadSchema>;
type EvaluationCreatePayload = z.infer<typeof employeeEvaluationCreateSchema>;
type EvaluationUpdatePayload = z.infer<typeof employeeEvaluationUpdateSchema>;
export type EvaluationScoresPayload = z.infer<typeof employeeEvaluationScoresPayloadSchema>;

type UnitRow = { id: string; organization_id: string };
type DepartmentRow = { id: string; organization_id: string | null; unit_id: string | null };
type JobPositionRow = { id: string; organization_id: string | null; unit_id: string | null; department_id: string | null };

export const openEvaluationStatuses = ["draft", "in_progress", "submitted", "reviewed", "feedback_given", "acknowledged"] as const;

export function assertCanAccessEvaluationUnit(context: HrRequestContext, unitId: string | null | undefined) {
  if (context.isSuperAdmin) return;
  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new HrAuthorizationError("Recurso nao encontrado.", 404);
  }
}

function assertCanWriteScopedTemplate(context: HrRequestContext, unitId: string | null | undefined) {
  if (context.isSuperAdmin) return;
  if (!unitId || !context.accessibleUnitIds.includes(unitId)) {
    throw new HrAuthorizationError("Informe uma unidade permitida para gerenciar modelos de avaliacao.", 403);
  }
}

async function loadOne<T>(
  context: HrRequestContext,
  table: "organizations" | "units" | "departments" | "job_positions" | "app_users",
  select: string,
  id: string,
  stage: string,
  message: string
) {
  const { data, error } = await context.supabase.from(table).select(select).eq("id", id).is("deleted_at", null).limit(1);

  if (error) {
    logHrApiError(stage, error);
    throw new Error(message);
  }

  return (data?.[0] as T | undefined) ?? null;
}

async function getDefaultOrganizationId(context: HrRequestContext) {
  if (!context.isSuperAdmin && context.accessibleUnitIds.length) {
    const { data, error } = await context.supabase.from("units").select("organization_id").eq("id", context.accessibleUnitIds[0]).limit(1);
    if (error) throw new Error("Nao foi possivel identificar a organizacao.");
    return data?.[0]?.organization_id as string | undefined;
  }

  const { data, error } = await context.supabase
    .from("organizations")
    .select("id")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error("Nao foi possivel identificar a organizacao.");
  return data?.[0]?.id as string | undefined;
}

export async function prepareEvaluationTemplateWrite(context: HrRequestContext, payload: TemplatePayload) {
  const [unit, department, jobPosition] = await Promise.all([
    payload.unitId ? loadOne<UnitRow>(context, "units", "id, organization_id", payload.unitId, "evaluation_templates.unit_lookup_failed", "Nao foi possivel validar a unidade.") : null,
    payload.departmentId
      ? loadOne<DepartmentRow>(
          context,
          "departments",
          "id, organization_id, unit_id",
          payload.departmentId,
          "evaluation_templates.department_lookup_failed",
          "Nao foi possivel validar o departamento."
        )
      : null,
    payload.jobPositionId
      ? loadOne<JobPositionRow>(
          context,
          "job_positions",
          "id, organization_id, unit_id, department_id",
          payload.jobPositionId,
          "evaluation_templates.job_position_lookup_failed",
          "Nao foi possivel validar o cargo."
        )
      : null
  ]);

  if (payload.unitId && !unit) throw new HrAuthorizationError("Unidade nao encontrada.", 404);
  if (payload.departmentId && !department) throw new HrAuthorizationError("Departamento nao encontrado.", 404);
  if (payload.jobPositionId && !jobPosition) throw new HrAuthorizationError("Cargo nao encontrado.", 404);

  const unitId = payload.unitId ?? null;
  const departmentId = payload.departmentId ?? null;
  const jobPositionId = payload.jobPositionId ?? null;
  assertCanWriteScopedTemplate(context, unitId);

  const organizationId =
    payload.organizationId ?? unit?.organization_id ?? department?.organization_id ?? jobPosition?.organization_id ?? (await getDefaultOrganizationId(context));

  if (!organizationId && !payload.isSystemDefault) {
    throw new HrAuthorizationError("Nao foi possivel definir a organizacao do modelo.", 422);
  }
  if (unit && unit.organization_id !== organizationId) throw new HrAuthorizationError("A unidade nao pertence a organizacao informada.", 422);
  if (department?.unit_id && unitId && department.unit_id !== unitId) throw new HrAuthorizationError("O departamento nao pertence a unidade informada.", 422);
  if (jobPosition?.department_id && departmentId && jobPosition.department_id !== departmentId) {
    throw new HrAuthorizationError("O cargo nao pertence ao departamento informado.", 422);
  }
  if (payload.scaleMax <= payload.scaleMin) throw new HrAuthorizationError("A escala maxima deve ser maior que a minima.", 422);
  if (payload.passingScore != null && (payload.passingScore < payload.scaleMin || payload.passingScore > payload.scaleMax)) {
    throw new HrAuthorizationError("A nota minima de referencia deve estar dentro da escala.", 422);
  }

  return {
    organization_id: payload.isSystemDefault ? null : organizationId,
    unit_id: payload.isSystemDefault ? null : unitId,
    department_id: payload.isSystemDefault ? null : departmentId,
    job_position_id: payload.isSystemDefault ? null : jobPositionId,
    code: payload.code,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    evaluation_type: payload.evaluationType,
    status: payload.status,
    scale_min: payload.scaleMin,
    scale_max: payload.scaleMax,
    passing_score: payload.passingScore ?? null,
    requires_feedback: payload.requiresFeedback,
    requires_employee_acknowledgement: payload.requiresEmployeeAcknowledgement,
    default_frequency: payload.defaultFrequency ?? null,
    is_system_default: payload.isSystemDefault
  };
}

export async function loadEvaluationTemplate(context: HrRequestContext, id: string, withStructure = false) {
  const { data, error } = await context.supabase
    .from("hr_evaluation_templates")
    .select(withStructure ? evaluationTemplateDetailSelect : evaluationTemplateSelect)
    .eq("id", id)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("evaluation_templates.lookup_failed", error);
    throw new Error("Nao foi possivel localizar o modelo de avaliacao.");
  }

  return (data?.[0] as unknown as EvaluationTemplateRow | undefined) ?? null;
}

export function assertCanAccessEvaluationTemplate(context: HrRequestContext, template: Pick<EvaluationTemplateRow, "unit_id">) {
  if (context.isSuperAdmin) return;
  if (!template.unit_id || context.accessibleUnitIds.includes(template.unit_id)) return;
  throw new HrAuthorizationError("Modelo de avaliacao nao encontrado.", 404);
}

export function prepareEvaluationSectionWrite(template: EvaluationTemplateRow, payload: SectionPayload) {
  return {
    template_id: template.id,
    code: payload.code,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    weight: payload.weight,
    sort_order: payload.sortOrder,
    applies_to_all: payload.appliesToAll,
    is_required: payload.isRequired,
    status: payload.status
  };
}

export function prepareEvaluationCriterionWrite(sectionId: string, payload: CriterionPayload) {
  if (payload.requiresCommentBelowScore && payload.commentRequiredScoreThreshold == null) {
    throw new HrAuthorizationError("Informe a nota limite para comentario obrigatorio.", 422);
  }

  return {
    section_id: sectionId,
    code: payload.code,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    expected_behavior: payload.expectedBehavior?.trim() || null,
    weight: payload.weight,
    sort_order: payload.sortOrder,
    is_required: payload.isRequired,
    is_critical: payload.isCritical,
    requires_comment_below_score: payload.requiresCommentBelowScore,
    comment_required_score_threshold: payload.commentRequiredScoreThreshold ?? null,
    applies_to_job_position_id: payload.appliesToJobPositionId ?? null,
    applies_to_department_id: payload.appliesToDepartmentId ?? null,
    status: payload.status
  };
}

export async function prepareEmployeeEvaluationCreate(context: HrRequestContext, payload: EvaluationCreatePayload) {
  const employee = await assertCanAccessHrEmployee(context, payload.employeeId);
  const template = await loadEvaluationTemplate(context, payload.templateId);
  if (!template) throw new HrAuthorizationError("Modelo de avaliacao nao encontrado.", 404);
  assertCanAccessEvaluationTemplate(context, template);
  if (template.status !== "active") {
    throw new HrAuthorizationError("Apenas modelos ativos podem ser usados para criar avaliacoes.", 422);
  }
  assertTemplateAppliesToEmployee(template, employee);

  return {
    organization_id: employee.organization_id,
    unit_id: employee.unit_id,
    employee_id: employee.id,
    template_id: template.id,
    evaluator_user_id: payload.evaluatorUserId ?? context.session.user.id,
    reviewer_user_id: payload.reviewerUserId ?? null,
    period_start: payload.periodStart,
    period_end: payload.periodEnd,
    evaluation_date: payload.evaluationDate ?? null,
    evaluation_type: template.evaluation_type,
    status: payload.status,
    summary: payload.summary?.trim() || null,
    strengths: payload.strengths?.trim() || null,
    development_points: payload.developmentPoints?.trim() || null,
    is_sensitive: true,
    visibility_scope: "restricted",
    metadata: {}
  };
}

function assertTemplateAppliesToEmployee(template: EvaluationTemplateRow, employee: HrEmployeeRow) {
  if (template.organization_id && template.organization_id !== employee.organization_id) {
    throw new HrAuthorizationError("Modelo de avaliacao nao pertence a organizacao do colaborador.", 422);
  }
  if (template.unit_id && template.unit_id !== employee.unit_id) {
    throw new HrAuthorizationError("Modelo de avaliacao nao pertence a unidade do colaborador.", 422);
  }
  if (template.department_id && template.department_id !== employee.department_id) {
    throw new HrAuthorizationError("Modelo de avaliacao nao pertence ao departamento do colaborador.", 422);
  }
  if (template.job_position_id && template.job_position_id !== employee.job_position_id) {
    throw new HrAuthorizationError("Modelo de avaliacao nao pertence ao cargo do colaborador.", 422);
  }
}

export async function loadEmployeeEvaluation(context: HrRequestContext, id: string, select: string) {
  const { data, error } = await context.supabase.from("employee_evaluations").select(select).eq("id", id).is("deleted_at", null).limit(1);
  if (error) {
    logHrApiError("employee_evaluations.lookup_failed", error);
    throw new Error("Nao foi possivel localizar a avaliacao.");
  }
  const evaluation = (data?.[0] as unknown as EmployeeEvaluationRow | undefined) ?? null;
  if (evaluation) assertCanAccessEvaluationUnit(context, evaluation.unit_id);
  return evaluation;
}

export function prepareEmployeeEvaluationUpdate(existing: EmployeeEvaluationRow, payload: EvaluationUpdatePayload) {
  if (["closed", "cancelled"].includes(existing.status)) {
    throw new HrAuthorizationError("Avaliacao encerrada nao permite edicao operacional.", 422);
  }
  const nextStatus = payload.status ?? existing.status;
  assertEvaluationStatusTransition(existing.status, nextStatus);
  const now = new Date().toISOString();

  return {
    reviewer_user_id: payload.reviewerUserId ?? existing.reviewer_user_id,
    evaluation_date: payload.evaluationDate ?? existing.evaluation_date,
    feedback_date: payload.feedbackDate ?? existing.feedback_date,
    status: nextStatus,
    result_label: payload.resultLabel ?? existing.result_label,
    result_level: payload.resultLevel ?? existing.result_level,
    summary: payload.summary?.trim() ?? existing.summary,
    strengths: payload.strengths?.trim() ?? existing.strengths,
    development_points: payload.developmentPoints?.trim() ?? existing.development_points,
    employee_comments: payload.employeeComments?.trim() ?? existing.employee_comments,
    employee_acknowledged_at: payload.employeeAcknowledgedAt ?? (nextStatus === "acknowledged" && !existing.employee_acknowledged_at ? now : existing.employee_acknowledged_at),
    reviewed_at:
      payload.reviewedAt ??
      (["reviewed", "feedback_given", "acknowledged", "closed"].includes(nextStatus) && !existing.reviewed_at ? now : existing.reviewed_at),
    closed_at: payload.closedAt ?? (nextStatus === "closed" && !existing.closed_at ? now : existing.closed_at),
    visibility_scope: payload.visibilityScope ?? existing.visibility_scope,
    is_sensitive: payload.isSensitive ?? existing.is_sensitive
  };
}

function assertEvaluationStatusTransition(current: string, next: string) {
  if (current === next) return;
  if (next === "cancelled") return;
  const order = ["draft", "in_progress", "submitted", "feedback_given", "acknowledged", "closed"];
  const currentIndex = order.indexOf(current);
  const nextIndex = order.indexOf(next);
  const allowedSkips = (current === "draft" && next === "submitted") || (current === "submitted" && next === "reviewed");
  if ((current === "reviewed" && next === "feedback_given") || allowedSkips) return;
  if (currentIndex === -1 || nextIndex === -1 || nextIndex < currentIndex || nextIndex > currentIndex + 1) {
    throw new HrAuthorizationError("Transicao de status da avaliacao nao permitida nesta etapa.", 422);
  }
}

export async function loadCriteriaForScores(context: HrRequestContext, criterionIds: string[]) {
  const { data, error } = await context.supabase
    .from("hr_evaluation_template_criteria")
    .select("id, section_id, title, weight, is_required, is_critical, requires_comment_below_score, comment_required_score_threshold, status")
    .in("id", criterionIds)
    .is("deleted_at", null);

  if (error) {
    logHrApiError("employee_evaluation_scores.criteria_lookup_failed", error);
    throw new Error("Nao foi possivel validar os criterios.");
  }

  return new Map((data ?? []).map((criterion) => [criterion.id as string, criterion as EvaluationTemplateCriterionRow & { status: string }]));
}

type ScoreValidationInput = {
  criterionId: string;
  score: number | null | undefined;
  isNotApplicable: boolean;
  comment?: string | null;
};

export function requiresEvaluationScoreComment(
  criterion: Pick<EvaluationTemplateCriterionRow, "is_critical" | "requires_comment_below_score" | "comment_required_score_threshold">,
  score: number | null | undefined,
  isNotApplicable: boolean
) {
  if (isNotApplicable || score == null) return false;
  if (criterion.is_critical && score < 3) return true;
  if (criterion.requires_comment_below_score && criterion.comment_required_score_threshold != null && score <= Number(criterion.comment_required_score_threshold)) {
    return true;
  }
  return false;
}

export function assertEvaluationScoreComments(criteria: Map<string, EvaluationTemplateCriterionRow>, scores: ScoreValidationInput[]) {
  const missingComments = scores
    .filter((score) => {
      const criterion = criteria.get(score.criterionId);
      if (!criterion) return false;
      return requiresEvaluationScoreComment(criterion, score.score, score.isNotApplicable) && !score.comment?.trim();
    })
    .map((score) => criteria.get(score.criterionId)?.title ?? "criterio");

  if (missingComments.length) {
    throw new HrAuthorizationError(`Comentario obrigatorio para nota baixa em: ${missingComments.slice(0, 5).join(", ")}.`, 422);
  }
}

export async function assertEmployeeEvaluationReadyForStatus(context: HrRequestContext, evaluation: EmployeeEvaluationRow, payload: EvaluationUpdatePayload) {
  const nextStatus = payload.status ?? evaluation.status;
  if (!["submitted", "feedback_given", "acknowledged", "closed"].includes(nextStatus)) return;

  const { data: sections, error: sectionsError } = await context.supabase
    .from("hr_evaluation_template_sections")
    .select("id")
    .eq("template_id", evaluation.template_id)
    .eq("status", "active")
    .is("deleted_at", null);
  if (sectionsError) {
    logHrApiError("employee_evaluations.sections_validation_failed", sectionsError);
    throw new Error("Nao foi possivel validar as secoes da avaliacao.");
  }

  const sectionIds = (sections ?? []).map((section) => section.id as string);
  if (!sectionIds.length) throw new HrAuthorizationError("Modelo sem secoes ativas para concluir avaliacao.", 422);

  const { data: criteriaRows, error: criteriaError } = await context.supabase
    .from("hr_evaluation_template_criteria")
    .select("id, section_id, title, weight, is_required, is_critical, requires_comment_below_score, comment_required_score_threshold, status")
    .in("section_id", sectionIds)
    .eq("status", "active")
    .is("deleted_at", null);
  if (criteriaError) {
    logHrApiError("employee_evaluations.criteria_validation_failed", criteriaError);
    throw new Error("Nao foi possivel validar os criterios da avaliacao.");
  }

  const criteria = new Map((criteriaRows ?? []).map((criterion) => [criterion.id as string, criterion as EvaluationTemplateCriterionRow]));
  if (!criteria.size) throw new HrAuthorizationError("Modelo sem criterios ativos para concluir avaliacao.", 422);

  const { data: scoreRows, error: scoreError } = await context.supabase
    .from("employee_evaluation_scores")
    .select("criterion_id, score, is_not_applicable, comment")
    .eq("evaluation_id", evaluation.id)
    .is("deleted_at", null);
  if (scoreError) {
    logHrApiError("employee_evaluations.scores_validation_failed", scoreError);
    throw new Error("Nao foi possivel validar as notas da avaliacao.");
  }

  const scoresByCriterion = new Map((scoreRows ?? []).map((score) => [score.criterion_id as string, score]));
  const missingScores = Array.from(criteria.values())
    .filter((criterion) => criterion.is_required)
    .filter((criterion) => {
      const score = scoresByCriterion.get(criterion.id);
      return !score || (!score.is_not_applicable && score.score == null);
    })
    .map((criterion) => criterion.title);
  if (missingScores.length) {
    throw new HrAuthorizationError(`Preencha todos os criterios obrigatorios antes de avancar: ${missingScores.slice(0, 5).join(", ")}.`, 422);
  }

  assertEvaluationScoreComments(
    criteria,
    (scoreRows ?? []).map((score) => ({
      criterionId: score.criterion_id as string,
      score: score.score as number | null,
      isNotApplicable: Boolean(score.is_not_applicable),
      comment: score.comment as string | null
    }))
  );

  const summary = payload.summary?.trim() ?? evaluation.summary?.trim() ?? "";
  const feedbackDate = payload.feedbackDate ?? evaluation.feedback_date;
  const acknowledgedAt = payload.employeeAcknowledgedAt ?? evaluation.employee_acknowledged_at;

  if (["feedback_given", "acknowledged", "closed"].includes(nextStatus) && (!summary || !feedbackDate)) {
    throw new HrAuthorizationError("Registre a data e o resumo da devolutiva antes de avancar.", 422);
  }
  if (["closed"].includes(nextStatus) && !acknowledgedAt) {
    throw new HrAuthorizationError("Registre a ciencia do colaborador antes de concluir a avaliacao.", 422);
  }
}
