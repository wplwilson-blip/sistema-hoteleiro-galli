import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { assertCanAccessEvaluationTemplate, loadEvaluationTemplate, prepareEvaluationSectionWrite } from "@/lib/hr/evaluation-actions";
import { evaluationSectionSelect, mapEvaluationTemplateSection, type EvaluationTemplateSectionRow } from "@/lib/hr/evaluations";
import { evaluationTemplateSectionPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string; sectionId: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse({ id: params.id });
    const { id: sectionId } = hrIdParamSchema.parse({ id: params.sectionId });
    const payload = evaluationTemplateSectionPayloadSchema.partial().parse(await request.json());
    const template = await loadEvaluationTemplate(context, id);
    if (!template) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, template);

    const { data: existingData, error: existingError } = await context.supabase
      .from("hr_evaluation_template_sections")
      .select(evaluationSectionSelect)
      .eq("id", sectionId)
      .eq("template_id", id)
      .is("deleted_at", null)
      .limit(1);
    if (existingError) throw existingError;
    const existing = existingData?.[0] as unknown as EvaluationTemplateSectionRow | undefined;
    if (!existing) return hrApiError("Secao do modelo nao encontrada.", 404);

    const merged = {
      code: payload.code ?? existing.code,
      title: payload.title ?? existing.title,
      description: pickPayload(payload, "description", existing.description ?? undefined) as string | undefined,
      weight: payload.weight ?? existing.weight,
      sortOrder: payload.sortOrder ?? existing.sort_order,
      appliesToAll: payload.appliesToAll ?? existing.applies_to_all,
      isRequired: payload.isRequired ?? existing.is_required,
      status: payload.status ?? existing.status
    };
    const { data, error } = await context.supabase
      .from("hr_evaluation_template_sections")
      .update({
        ...prepareEvaluationSectionWrite(template, evaluationTemplateSectionPayloadSchema.parse(merged)),
        updated_by: context.session.user.id
      })
      .eq("id", sectionId)
      .select(evaluationSectionSelect)
      .single();

    if (error) {
      logHrApiError("evaluation_template_sections.update_failed", error);
      return hrApiError("Nao foi possivel atualizar a secao do modelo.", 500);
    }
    return NextResponse.json({ ok: true, data: mapEvaluationTemplateSection(data as unknown as EvaluationTemplateSectionRow) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar secao do modelo.");
  }
}
