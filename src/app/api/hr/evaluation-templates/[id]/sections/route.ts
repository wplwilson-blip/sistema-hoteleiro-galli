import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import {
  assertCanAccessEvaluationTemplate,
  loadEvaluationTemplate,
  prepareEvaluationSectionWrite
} from "@/lib/hr/evaluation-actions";
import { evaluationSectionSelect, mapEvaluationTemplateSection, type EvaluationTemplateSectionRow } from "@/lib/hr/evaluations";
import { evaluationTemplateSectionPayloadSchema } from "@/lib/hr/evaluation-validation";
import { hrIdParamSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = evaluationTemplateSectionPayloadSchema.parse(await request.json());
    const template = await loadEvaluationTemplate(context, id);
    if (!template) return hrApiError("Modelo de avaliacao nao encontrado.", 404);
    assertCanAccessEvaluationTemplate(context, template);

    const { data, error } = await context.supabase
      .from("hr_evaluation_template_sections")
      .insert({
        ...prepareEvaluationSectionWrite(template, payload),
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(evaluationSectionSelect)
      .single();

    if (error) {
      logHrApiError("evaluation_template_sections.create_failed", error);
      return hrApiError("Nao foi possivel criar a secao do modelo.", 500);
    }

    return NextResponse.json({ ok: true, data: mapEvaluationTemplateSection(data as unknown as EvaluationTemplateSectionRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar secao do modelo.");
  }
}
