import { NextResponse } from "next/server";
import { z } from "zod";
import { handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema, hrTrainingPayloadSchema } from "@/lib/hr/schemas";
import { loadTraining, mapTraining, prepareTrainingWrite, trainingListSelect, type HrTrainingRow } from "@/lib/hr/trainings";

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const training = await loadTraining(context, id);
    if (!training) return hrApiError("Treinamento nao encontrado.", 404);
    return NextResponse.json({ ok: true, data: mapTraining(training) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar treinamento.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadTraining(context, id);
    if (!existing) return hrApiError("Treinamento nao encontrado.", 404);
    const payload = hrTrainingPayloadSchema.partial().parse(await request.json());
    const merged = {
      unitId: payload.unitId ?? existing.unit_id ?? undefined,
      title: payload.title ?? existing.title,
      description: payload.description ?? existing.description ?? undefined,
      trainingType: payload.trainingType ?? existing.training_type,
      deliveryMode: payload.deliveryMode ?? existing.delivery_mode,
      providerName: payload.providerName ?? existing.provider_name ?? undefined,
      workloadHours: payload.workloadHours ?? existing.workload_hours ?? undefined,
      isMandatory: payload.isMandatory ?? existing.is_mandatory,
      requiresCertificate: payload.requiresCertificate ?? existing.requires_certificate,
      hasExpiration: payload.hasExpiration ?? existing.has_expiration,
      validityDays: payload.validityDays ?? existing.validity_days ?? undefined,
      status: payload.status ?? existing.status
    };
    const updatePayload = await prepareTrainingWrite(context, hrTrainingPayloadSchema.parse(merged), existing);
    const { data, error } = await context.supabase
      .from("hr_trainings")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(trainingListSelect)
      .single();

    if (error) {
      logHrApiError("trainings.update_failed", error);
      return hrApiError("Nao foi possivel atualizar treinamento.", 500);
    }

    return NextResponse.json({ ok: true, data: mapTraining(data as unknown as HrTrainingRow) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar treinamento.");
  }
}
