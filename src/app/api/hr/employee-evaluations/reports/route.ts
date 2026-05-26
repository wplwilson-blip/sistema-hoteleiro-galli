import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { employeeEvaluationDetailSelect, redactEmployeeEvaluation, type EmployeeEvaluationRow } from "@/lib/hr/evaluations";
import { optionalEvaluationUuidSchema, employeeEvaluationStatusSchema } from "@/lib/hr/evaluation-validation";
import { parseSearchParams } from "@/lib/hr/schemas";

type SafeEvaluationScore = {
  score: number | null;
  isCritical: boolean;
};

type SafeEvaluationReport = ReturnType<typeof redactEmployeeEvaluation> & {
  scores?: SafeEvaluationScore[];
  employeeAcknowledgedAt?: string;
  closedAt?: string;
};

const reportQuerySchema = z.object({
  unitId: optionalEvaluationUuidSchema,
  departmentId: optionalEvaluationUuidSchema,
  employeeId: optionalEvaluationUuidSchema,
  templateId: optionalEvaluationUuidSchema,
  status: employeeEvaluationStatusSchema.optional().or(z.literal("").transform(() => undefined)),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  search: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  lowScoreOnly: z.enum(["true", "false"]).optional(),
  pdiOnly: z.enum(["true", "false"]).optional()
});

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    in_progress: "Em andamento",
    submitted: "Aguardando devolutiva",
    reviewed: "Revisada",
    feedback_given: "Aguardando ciência",
    acknowledged: "Ciência registrada",
    closed: "Concluída",
    cancelled: "Cancelada"
  };
  return labels[status] ?? status;
}

function isLowScore(score: number | null | undefined) {
  return score != null && Number(score) < 3.5;
}

function isOverdue(row: EmployeeEvaluationRow) {
  const openStatuses = ["draft", "in_progress", "submitted", "reviewed", "feedback_given"];
  if (!openStatuses.includes(row.status) || !row.period_end) return false;
  return row.period_end < new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, reportQuerySchema);
    let evaluationsQuery = context.supabase
      .from("employee_evaluations")
      .select(employeeEvaluationDetailSelect)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (!context.isSuperAdmin) evaluationsQuery = evaluationsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.unitId) evaluationsQuery = evaluationsQuery.eq("unit_id", query.unitId);
    if (query.employeeId) evaluationsQuery = evaluationsQuery.eq("employee_id", query.employeeId);
    if (query.templateId) evaluationsQuery = evaluationsQuery.eq("template_id", query.templateId);
    if (query.status) evaluationsQuery = evaluationsQuery.eq("status", query.status);
    if (query.periodFrom) evaluationsQuery = evaluationsQuery.gte("period_start", query.periodFrom);
    if (query.periodTo) evaluationsQuery = evaluationsQuery.lte("period_end", query.periodTo);

    const { data, error } = await evaluationsQuery;
    if (error) {
      logHrApiError("employee_evaluations.report_failed", error);
      return hrApiError("Nao foi possivel carregar relatorio de avaliacoes.", 500);
    }

    const rows = (data ?? []) as unknown as EmployeeEvaluationRow[];
    const departmentIds = Array.from(new Set(rows.map((row) => row.employees?.department_id).filter(Boolean))) as string[];
    const evaluationIds = rows.map((row) => row.id);

    const [{ data: departments, error: departmentsError }, { data: plans, error: plansError }] = await Promise.all([
      departmentIds.length
        ? context.supabase.from("departments").select("id, code, name").in("id", departmentIds).is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      evaluationIds.length
        ? context.supabase
            .from("employee_development_plans")
            .select("id, evaluation_id, status")
            .in("evaluation_id", evaluationIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (departmentsError) throw departmentsError;
    if (plansError) throw plansError;

    const departmentsById = new Map((departments ?? []).map((department) => [department.id as string, department]));
    const pdiByEvaluationId = new Map<string, { total: number; open: number; firstId: string }>();
    for (const plan of plans ?? []) {
      const evaluationId = plan.evaluation_id as string | null;
      if (!evaluationId) continue;
      const current = pdiByEvaluationId.get(evaluationId) ?? { total: 0, open: 0, firstId: plan.id as string };
      current.total += 1;
      if (!["completed", "cancelled"].includes(plan.status as string)) current.open += 1;
      pdiByEvaluationId.set(evaluationId, current);
    }

    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    const mapped = rows.map((row) => {
      const safe = redactEmployeeEvaluation(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id), true) as SafeEvaluationReport;
      const department = row.employees?.department_id ? departmentsById.get(row.employees.department_id) : null;
      const scores = safe.redacted ? [] : safe.scores ?? [];
      const criticalScores = scores.filter((score) => score.isCritical);
      const lowScores = scores.filter((score) => isLowScore(score.score));
      const criticalLowScores = criticalScores.filter((score) => isLowScore(score.score));
      const pdi = pdiByEvaluationId.get(row.id);

      return {
        id: row.id,
        employeeId: row.employee_id,
        employeeName: safe.employeeName,
        unitId: row.unit_id,
        unitName: row.units?.name ?? row.units?.code ?? "",
        departmentId: row.employees?.department_id ?? "",
        departmentName: department ? [department.code, department.name].filter(Boolean).join(" - ") : "",
        templateId: row.template_id,
        templateName: safe.templateName,
        status: row.status,
        statusLabel: statusLabel(row.status),
        weightedScore: safe.weightedScore,
        totalScore: safe.totalScore,
        evaluationDate: safe.evaluationDate,
        periodStart: safe.periodStart,
        periodEnd: safe.periodEnd,
        feedbackDate: safe.feedbackDate,
        acknowledgedAt: safe.employeeAcknowledgedAt ?? "",
        closedAt: safe.closedAt ?? "",
        isOverdue: isOverdue(row),
        hasLowScore: lowScores.length > 0 || isLowScore(safe.weightedScore ?? safe.totalScore),
        lowScoreCount: lowScores.length,
        criticalCount: criticalScores.length,
        criticalLowScoreCount: criticalLowScores.length,
        hasCritical: criticalScores.length > 0,
        hasPdi: Boolean(pdi?.total),
        pdiCount: pdi?.total ?? 0,
        openPdiCount: pdi?.open ?? 0,
        firstPdiId: pdi?.firstId ?? "",
        redacted: safe.redacted
      };
    });

    const filtered = mapped.filter((row) => {
      if (query.departmentId && row.departmentId !== query.departmentId) return false;
      if (query.lowScoreOnly === "true" && !row.hasLowScore && !row.criticalLowScoreCount) return false;
      if (query.pdiOnly === "true" && !row.hasPdi) return false;
      if (query.search) {
        const haystack = [row.employeeName, row.templateName, row.unitName, row.departmentName].join(" ").toLowerCase();
        if (!haystack.includes(query.search.toLowerCase())) return false;
      }
      return true;
    });

    const summary = {
      total: filtered.length,
      inProgress: filtered.filter((row) => ["draft", "in_progress"].includes(row.status)).length,
      waitingFeedback: filtered.filter((row) => ["submitted", "reviewed"].includes(row.status)).length,
      waitingAcknowledgement: filtered.filter((row) => row.status === "feedback_given").length,
      closedThisMonth: filtered.filter((row) => row.status === "closed" && row.closedAt?.startsWith(new Date().toISOString().slice(0, 7))).length,
      lowScore: filtered.filter((row) => row.hasLowScore || row.criticalLowScoreCount).length,
      withCritical: filtered.filter((row) => row.hasCritical).length,
      withPdi: filtered.filter((row) => row.hasPdi).length,
      overdue: filtered.filter((row) => row.isOverdue).length
    };

    return NextResponse.json({ ok: true, data: filtered, summary });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar relatorio de avaliacoes.");
  }
}
