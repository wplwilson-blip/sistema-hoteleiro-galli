import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  type HrRequestContext
} from "@/lib/hr/api-auth";
import { prepareEmployeeEvaluationCreate } from "@/lib/hr/evaluation-actions";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import { employeeEvaluationListSelect, redactEmployeeEvaluation, type EmployeeEvaluationRow } from "@/lib/hr/evaluations";
import { employeeEvaluationCreateSchema, employeeEvaluationsQuerySchema } from "@/lib/hr/evaluation-validation";
import { parseSearchParams } from "@/lib/hr/schemas";

async function writeEvaluationCreatedEvent(input: {
  context: HrRequestContext;
  evaluation: EmployeeEvaluationRow;
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.evaluation.employee_id,
    eventType: "evaluation_created",
    title: "Avaliacao criada",
    description: "Avaliacao criada para o colaborador.",
    severity: "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_evaluation",
    sourceEntityId: input.evaluation.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `evaluation:${input.evaluation.id}:created`,
    eventPayload: {
      template_name: input.evaluation.hr_evaluation_templates?.name ?? null,
      evaluation_type: input.evaluation.evaluation_type,
      status: input.evaluation.status,
      period_start: input.evaluation.period_start,
      period_end: input.evaluation.period_end
    }
  });

  if (!result.ok) {
    logHrApiError("employee_evaluations.functional_event_create_failed", { message: result.error.message, code: result.error.code });
  }
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, employeeEvaluationsQuerySchema);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let evaluationsQuery = context.supabase
      .from("employee_evaluations")
      .select(employeeEvaluationListSelect, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) evaluationsQuery = evaluationsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.unitId) evaluationsQuery = evaluationsQuery.eq("unit_id", query.unitId);
    if (query.employeeId) evaluationsQuery = evaluationsQuery.eq("employee_id", query.employeeId);
    if (query.evaluatorUserId) evaluationsQuery = evaluationsQuery.eq("evaluator_user_id", query.evaluatorUserId);
    if (query.evaluationType) evaluationsQuery = evaluationsQuery.eq("evaluation_type", query.evaluationType);
    if (query.status) evaluationsQuery = evaluationsQuery.eq("status", query.status);
    if (query.resultLevel) evaluationsQuery = evaluationsQuery.eq("result_level", query.resultLevel);
    if (query.periodFrom) evaluationsQuery = evaluationsQuery.gte("period_start", query.periodFrom);
    if (query.periodTo) evaluationsQuery = evaluationsQuery.lte("period_end", query.periodTo);

    const { data, error, count } = await evaluationsQuery.order("updated_at", { ascending: false }).range(from, to);
    if (error) {
      logHrApiError("employee_evaluations.list_failed", error);
      return hrApiError("Nao foi possivel carregar avaliacoes de colaboradores.", 500);
    }

    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as EmployeeEvaluationRow[]).map((row) =>
        redactEmployeeEvaluation(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))
      ),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0 }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar avaliacoes.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const payload = employeeEvaluationCreateSchema.parse(await request.json());
    const insertPayload = await prepareEmployeeEvaluationCreate(context, payload);
    const { data, error } = await context.supabase
      .from("employee_evaluations")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(employeeEvaluationListSelect)
      .single();

    if (error) {
      logHrApiError("employee_evaluations.create_failed", error);
      return hrApiError("Nao foi possivel criar a avaliacao do colaborador.", 500);
    }

    const evaluation = data as unknown as EmployeeEvaluationRow;
    await writeEvaluationCreatedEvent({ context, evaluation });

    return NextResponse.json({ ok: true, data: redactEmployeeEvaluation(evaluation, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar avaliacao.");
  }
}
