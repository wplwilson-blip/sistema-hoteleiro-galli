import "server-only";

export type EvaluationTemplateRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  department_id: string | null;
  job_position_id: string | null;
  code: string;
  name: string;
  description: string | null;
  evaluation_type: string;
  status: string;
  scale_min: number;
  scale_max: number;
  passing_score: number | null;
  requires_feedback: boolean;
  requires_employee_acknowledgement: boolean;
  default_frequency: string | null;
  is_system_default: boolean;
  created_at: string;
  updated_at: string;
  units?: { id: string; code: string | null; name: string | null } | null;
  departments?: { id: string; code: string | null; name: string | null } | null;
  job_positions?: { id: string; code: string | null; name: string | null } | null;
  hr_evaluation_template_sections?: EvaluationTemplateSectionRow[];
};

export type EvaluationTemplateSectionRow = {
  id: string;
  template_id: string;
  code: string;
  title: string;
  description: string | null;
  weight: number;
  sort_order: number;
  applies_to_all: boolean;
  is_required: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  hr_evaluation_template_criteria?: EvaluationTemplateCriterionRow[];
};

export type EvaluationTemplateCriterionRow = {
  id: string;
  section_id: string;
  code: string;
  title: string;
  description: string | null;
  expected_behavior: string | null;
  weight: number;
  sort_order: number;
  is_required: boolean;
  is_critical: boolean;
  requires_comment_below_score: boolean;
  comment_required_score_threshold: number | null;
  applies_to_job_position_id: string | null;
  applies_to_department_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EmployeeEvaluationRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  employee_id: string;
  template_id: string;
  evaluator_user_id: string;
  reviewer_user_id: string | null;
  period_start: string;
  period_end: string;
  evaluation_date: string | null;
  feedback_date: string | null;
  evaluation_type: string;
  status: string;
  total_score: number | null;
  weighted_score: number | null;
  result_label: string | null;
  result_level: string | null;
  summary: string | null;
  strengths: string | null;
  development_points: string | null;
  employee_comments: string | null;
  employee_acknowledged_at: string | null;
  reviewed_at: string | null;
  closed_at: string | null;
  is_sensitive: boolean;
  visibility_scope: string;
  created_at: string;
  updated_at: string;
  employees?: { id: string; full_name: string | null; preferred_name: string | null; unit_id: string | null; department_id: string | null } | null;
  units?: { id: string; code: string | null; name: string | null } | null;
  hr_evaluation_templates?: { id: string; code: string | null; name: string | null; evaluation_type: string | null } | null;
  employee_evaluation_scores?: EmployeeEvaluationScoreRow[];
};

export type EmployeeEvaluationScoreRow = {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  section_id: string;
  score: number | null;
  is_not_applicable: boolean;
  comment: string | null;
  evidence_note: string | null;
  weighted_score: number | null;
  created_at: string;
  updated_at: string;
  hr_evaluation_template_criteria?: { id: string; code: string | null; title: string | null; weight: number | null; is_critical: boolean | null } | null;
  hr_evaluation_template_sections?: { id: string; code: string | null; title: string | null } | null;
};

export const evaluationTemplateSelect =
  "id, organization_id, unit_id, department_id, job_position_id, code, name, description, evaluation_type, status, scale_min, scale_max, passing_score, requires_feedback, requires_employee_acknowledgement, default_frequency, is_system_default, created_at, updated_at";

export const evaluationTemplateListSelect = `${evaluationTemplateSelect}, units(id, code, name), departments(id, code, name), job_positions(id, code, name)`;

export const evaluationTemplateDetailSelect = `${evaluationTemplateListSelect}, hr_evaluation_template_sections(id, template_id, code, title, description, weight, sort_order, applies_to_all, is_required, status, created_at, updated_at, hr_evaluation_template_criteria(id, section_id, code, title, description, expected_behavior, weight, sort_order, is_required, is_critical, requires_comment_below_score, comment_required_score_threshold, applies_to_job_position_id, applies_to_department_id, status, created_at, updated_at))`;

export const evaluationSectionSelect =
  "id, template_id, code, title, description, weight, sort_order, applies_to_all, is_required, status, created_at, updated_at";

export const evaluationCriterionSelect =
  "id, section_id, code, title, description, expected_behavior, weight, sort_order, is_required, is_critical, requires_comment_below_score, comment_required_score_threshold, applies_to_job_position_id, applies_to_department_id, status, created_at, updated_at";

export const employeeEvaluationSelect =
  "id, organization_id, unit_id, employee_id, template_id, evaluator_user_id, reviewer_user_id, period_start, period_end, evaluation_date, feedback_date, evaluation_type, status, total_score, weighted_score, result_label, result_level, summary, strengths, development_points, employee_comments, employee_acknowledged_at, reviewed_at, closed_at, is_sensitive, visibility_scope, created_at, updated_at";

export const employeeEvaluationListSelect = `${employeeEvaluationSelect}, employees(id, full_name, preferred_name, unit_id, department_id), units(id, code, name), hr_evaluation_templates(id, code, name, evaluation_type)`;

export const employeeEvaluationDetailSelect = `${employeeEvaluationListSelect}, employee_evaluation_scores(id, evaluation_id, criterion_id, section_id, score, is_not_applicable, comment, evidence_note, weighted_score, created_at, updated_at, hr_evaluation_template_criteria(id, code, title, weight, is_critical), hr_evaluation_template_sections(id, code, title))`;

function compactLabel(input?: { code: string | null; name: string | null } | null) {
  if (!input) return "";
  return [input.code, input.name].filter(Boolean).join(" - ");
}

export function mapEvaluationTemplate(row: EvaluationTemplateRow, includeStructure = false) {
  const sections = includeStructure
    ? [...(row.hr_evaluation_template_sections ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(mapEvaluationTemplateSection)
    : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    departmentId: row.department_id,
    jobPositionId: row.job_position_id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    evaluationType: row.evaluation_type,
    status: row.status,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
    passingScore: row.passing_score,
    requiresFeedback: row.requires_feedback,
    requiresEmployeeAcknowledgement: row.requires_employee_acknowledgement,
    defaultFrequency: row.default_frequency ?? "",
    isSystemDefault: row.is_system_default,
    unitName: compactLabel(row.units) || "Todas as unidades permitidas",
    departmentName: compactLabel(row.departments) || "Todos os departamentos",
    jobPositionName: compactLabel(row.job_positions) || "Todos os cargos",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(sections ? { sections } : {})
  };
}

export function mapEvaluationTemplateSection(row: EvaluationTemplateSectionRow) {
  const criteria = [...(row.hr_evaluation_template_criteria ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapEvaluationTemplateCriterion);

  return {
    id: row.id,
    templateId: row.template_id,
    code: row.code,
    title: row.title,
    description: row.description ?? "",
    weight: row.weight,
    sortOrder: row.sort_order,
    appliesToAll: row.applies_to_all,
    isRequired: row.is_required,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    criteria
  };
}

export function mapEvaluationTemplateCriterion(row: EvaluationTemplateCriterionRow) {
  return {
    id: row.id,
    sectionId: row.section_id,
    code: row.code,
    title: row.title,
    description: row.description ?? "",
    expectedBehavior: row.expected_behavior ?? "",
    weight: row.weight,
    sortOrder: row.sort_order,
    isRequired: row.is_required,
    isCritical: row.is_critical,
    requiresCommentBelowScore: row.requires_comment_below_score,
    commentRequiredScoreThreshold: row.comment_required_score_threshold,
    appliesToJobPositionId: row.applies_to_job_position_id,
    appliesToDepartmentId: row.applies_to_department_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function redactEmployeeEvaluation(row: EmployeeEvaluationRow, canViewSensitive: boolean, includeScores = false) {
  const isRedacted = row.is_sensitive && !canViewSensitive;
  const base = {
    id: row.id,
    organizationId: row.organization_id,
    unitId: row.unit_id,
    employeeId: row.employee_id,
    employeeName: row.employees?.preferred_name || row.employees?.full_name || "",
    templateId: row.template_id,
    templateName: row.hr_evaluation_templates?.name ?? "",
    evaluatorUserId: row.evaluator_user_id,
    reviewerUserId: row.reviewer_user_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    evaluationDate: row.evaluation_date ?? "",
    feedbackDate: row.feedback_date ?? "",
    evaluationType: row.evaluation_type,
    status: row.status,
    totalScore: row.total_score,
    weightedScore: row.weighted_score,
    resultLabel: row.result_label ?? "",
    resultLevel: row.result_level ?? "",
    isSensitive: row.is_sensitive,
    visibilityScope: row.visibility_scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    redacted: isRedacted
  };

  if (isRedacted) {
    return base;
  }

  return {
    ...base,
    summary: row.summary ?? "",
    strengths: row.strengths ?? "",
    developmentPoints: row.development_points ?? "",
    employeeComments: row.employee_comments ?? "",
    employeeAcknowledgedAt: row.employee_acknowledged_at ?? "",
    reviewedAt: row.reviewed_at ?? "",
    closedAt: row.closed_at ?? "",
    ...(includeScores ? { scores: (row.employee_evaluation_scores ?? []).map(mapEmployeeEvaluationScore) } : {})
  };
}

export function mapEmployeeEvaluationScore(row: EmployeeEvaluationScoreRow) {
  return {
    id: row.id,
    evaluationId: row.evaluation_id,
    criterionId: row.criterion_id,
    sectionId: row.section_id,
    criterionTitle: row.hr_evaluation_template_criteria?.title ?? "",
    sectionTitle: row.hr_evaluation_template_sections?.title ?? "",
    score: row.score,
    isNotApplicable: row.is_not_applicable,
    comment: row.comment ?? "",
    evidenceNote: row.evidence_note ?? "",
    isCritical: Boolean(row.hr_evaluation_template_criteria?.is_critical),
    weightedScore: row.weighted_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
