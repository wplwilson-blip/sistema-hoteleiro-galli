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
import { assertEmployeeEvaluationReadyForStatus, loadEmployeeEvaluation, prepareEmployeeEvaluationUpdate } from "@/lib/hr/evaluation-actions";
import { createEmployeeFunctionalEvent, type EmployeeFunctionalEventType } from "@/lib/hr/employee-functional-events";
import { employeeEvaluationDetailSelect, employeeEvaluationListSelect, redactEmployeeEvaluation, type EmployeeEvaluationRow } from "@/lib/hr/evaluations";
import { employeeEvaluationUpdateSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function requiresReviewPermission(payload: z.infer<typeof employeeEvaluationUpdateSchema>) {
  return Boolean(
    payload.status && ["reviewed", "feedback_given", "acknowledged", "closed"].includes(payload.status)
  );
}

function evaluationEventForStatus(status: string) {
  const events: Record<
    string,
    {
      eventType: EmployeeFunctionalEventType;
      title: string;
      description: string;
      dedupeSuffix: string;
      severity?: "info" | "notice" | "warning" | "critical";
    }
  > = {
    in_progress: {
      eventType: "evaluation_started",
      title: "Avaliacao iniciada",
      description: "Avaliacao iniciada para o colaborador.",
      dedupeSuffix: "started",
      severity: "notice"
    },
    submitted: {
      eventType: "evaluation_submitted",
      title: "Avaliacao enviada",
      description: "Avaliacao enviada para revisao.",
      dedupeSuffix: "submitted",
      severity: "notice"
    },
    reviewed: {
      eventType: "evaluation_reviewed",
      title: "Avaliacao revisada",
      description: "Avaliacao revisada pelo RH.",
      dedupeSuffix: "reviewed",
      severity: "notice"
    },
    feedback_given: {
      eventType: "evaluation_feedback_given",
      title: "Devolutiva registrada",
      description: "Devolutiva da avaliacao registrada.",
      dedupeSuffix: "feedback",
      severity: "notice"
    },
    acknowledged: {
      eventType: "evaluation_acknowledged",
      title: "Ciencia do colaborador registrada",
      description: "Ciencia do colaborador registrada na avaliacao.",
      dedupeSuffix: "acknowledged",
      severity: "notice"
    },
    closed: {
      eventType: "evaluation_closed",
      title: "Avaliacao encerrada",
      description: "Avaliacao encerrada para o colaborador.",
      dedupeSuffix: "closed",
      severity: "notice"
    },
    cancelled: {
      eventType: "evaluation_cancelled",
      title: "Avaliacao cancelada",
      description: "Avaliacao cancelada.",
      dedupeSuffix: "cancelled",
      severity: "warning"
    }
  };

  return events[status] ?? null;
}

async function writeEvaluationStatusEvent(input: {
  context: HrRequestContext;
  previousEvaluation: EmployeeEvaluationRow;
  evaluation: EmployeeEvaluationRow;
}) {
  if (input.previousEvaluation.status === input.evaluation.status) return;
  const event = evaluationEventForStatus(input.evaluation.status);
  if (!event) return;

  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.evaluation.employee_id,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    severity: event.severity ?? "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_evaluation",
    sourceEntityId: input.evaluation.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `evaluation:${input.evaluation.id}:${event.dedupeSuffix}`,
    eventPayload: {
      previous_status: input.previousEvaluation.status,
      new_status: input.evaluation.status,
      template_name: input.evaluation.hr_evaluation_templates?.name ?? input.previousEvaluation.hr_evaluation_templates?.name ?? null,
      evaluation_type: input.evaluation.evaluation_type,
      score_summary: {
        total_score: input.evaluation.total_score,
        weighted_score: input.evaluation.weighted_score,
        result_level: input.evaluation.result_level
      }
    }
  });

  if (!result.ok) {
    logHrApiError("employee_evaluations.functional_event_status_failed", { message: result.error.message, code: result.error.code });
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const evaluation = await loadEmployeeEvaluation(context, id, employeeEvaluationDetailSelect);
    if (!evaluation) return hrApiError("Avaliacao nao encontrada.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: redactEmployeeEvaluation(evaluation, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(evaluation.unit_id), true)
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar avaliacao.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const payload = employeeEvaluationUpdateSchema.parse(body);
    const permission = requiresReviewPermission(payload) ? HR_PERMISSIONS.evaluationsReview : HR_PERMISSIONS.evaluationsManage;
    const { context, response } = await requireHrPermission(permission);
    if (response || !context) return response;

    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadEmployeeEvaluation(context, id, employeeEvaluationListSelect);
    if (!existing) return hrApiError("Avaliacao nao encontrada.", 404);
    await assertEmployeeEvaluationReadyForStatus(context, existing, payload);
    const updatePayload = prepareEmployeeEvaluationUpdate(existing, payload);
    const { data, error } = await context.supabase
      .from("employee_evaluations")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(employeeEvaluationListSelect)
      .single();

    if (error) {
      logHrApiError("employee_evaluations.update_failed", error);
      return hrApiError("Nao foi possivel atualizar a avaliacao.", 500);
    }

    const evaluation = data as unknown as EmployeeEvaluationRow;
    await writeEvaluationStatusEvent({ context, previousEvaluation: existing, evaluation });

    return NextResponse.json({ ok: true, data: redactEmployeeEvaluation(evaluation, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar avaliacao.");
  }
}
