import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import {
  assertCanAccessEvaluationTemplate,
  loadEvaluationTemplate,
  prepareEvaluationTemplateWrite
} from "@/lib/hr/evaluation-actions";
import { evaluationTemplateListSelect, mapEvaluationTemplate, type EvaluationTemplateRow } from "@/lib/hr/evaluations";
import { evaluationTemplatePayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const template = await loadEvaluationTemplate(context, id, true);
    if (!template) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, template);
    return NextResponse.json({ ok: true, data: mapEvaluationTemplate(template, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar o modelo de avaliacao.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = evaluationTemplatePayloadSchema.partial().parse(await request.json());
    const existing = await loadEvaluationTemplate(context, id);
    if (!existing) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, existing);

    const merged = {
      organizationId: pickPayload(payload, "organizationId", existing.organization_id ?? undefined) as string | undefined,
      unitId: pickPayload(payload, "unitId", existing.unit_id ?? undefined) as string | undefined,
      departmentId: pickPayload(payload, "departmentId", existing.department_id ?? undefined) as string | undefined,
      jobPositionId: pickPayload(payload, "jobPositionId", existing.job_position_id ?? undefined) as string | undefined,
      code: payload.code ?? existing.code,
      name: payload.name ?? existing.name,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      evaluationType: payload.evaluationType ?? existing.evaluation_type,
      status: payload.status ?? existing.status,
      scaleMin: payload.scaleMin ?? existing.scale_min,
      scaleMax: payload.scaleMax ?? existing.scale_max,
      passingScore: pickPayload(payload, "passingScore", existing.passing_score ?? undefined) as number | undefined,
      requiresFeedback: payload.requiresFeedback ?? existing.requires_feedback,
      requiresEmployeeAcknowledgement: payload.requiresEmployeeAcknowledgement ?? existing.requires_employee_acknowledgement,
      defaultFrequency: pickPayload(payload, "defaultFrequency", existing.default_frequency ?? undefined) as string | undefined,
      isSystemDefault: payload.isSystemDefault ?? existing.is_system_default
    };
    const updatePayload = await prepareEvaluationTemplateWrite(context, evaluationTemplatePayloadSchema.parse(merged));
    const { data, error } = await context.supabase
      .from("hr_evaluation_templates")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(evaluationTemplateListSelect)
      .single();

    if (error) {
      logHrApiError("evaluation_templates.update_failed", error);
      return hrApiError("Nao foi possivel atualizar o modelo de avaliacao.", 500);
    }

    return NextResponse.json({ ok: true, data: mapEvaluationTemplate(data as unknown as EvaluationTemplateRow) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar modelo de avaliacao.");
  }
}
