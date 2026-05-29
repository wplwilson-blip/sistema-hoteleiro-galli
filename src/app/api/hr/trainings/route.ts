import { NextResponse } from "next/server";
import { z } from "zod";
import {
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import { hrTrainingPayloadSchema, hrTrainingsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { mapTraining, prepareTrainingWrite, trainingListSelect, type HrTrainingRow } from "@/lib/hr/trainings";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, hrTrainingsQuerySchema);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let trainingsQuery = context.supabase.from("hr_trainings").select(trainingListSelect, { count: "exact" }).is("deleted_at", null);

    if (!context.isSuperAdmin) {
      trainingsQuery = context.accessibleUnitIds.length
        ? trainingsQuery.or(`unit_id.is.null,unit_id.in.(${context.accessibleUnitIds.join(",")})`)
        : trainingsQuery.is("unit_id", null);
    }
    if (query.unitId) trainingsQuery = trainingsQuery.eq("unit_id", query.unitId);
    if (query.trainingType) trainingsQuery = trainingsQuery.eq("training_type", query.trainingType);
    if (query.deliveryMode) trainingsQuery = trainingsQuery.eq("delivery_mode", query.deliveryMode);
    if (query.status) trainingsQuery = trainingsQuery.eq("status", query.status);
    if (query.mandatory !== undefined) trainingsQuery = trainingsQuery.eq("is_mandatory", query.mandatory);
    if (query.search) trainingsQuery = trainingsQuery.ilike("title", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await trainingsQuery.order("title", { ascending: true }).range(from, to);
    if (error) {
      logHrApiError("trainings.list_failed", error);
      return hrApiError("Nao foi possivel carregar treinamentos.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as HrTrainingRow[]).map(mapTraining),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar treinamentos.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsManage);
  if (response || !context) return response;

  try {
    const payload = hrTrainingPayloadSchema.parse(await request.json());
    const insertPayload = await prepareTrainingWrite(context, payload);
    const { data, error } = await context.supabase
      .from("hr_trainings")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(trainingListSelect)
      .single();

    if (error) {
      logHrApiError("trainings.create_failed", error);
      return hrApiError("Nao foi possivel criar treinamento.", 500);
    }

    return NextResponse.json({ ok: true, data: mapTraining(data as unknown as HrTrainingRow) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar treinamento.");
  }
}
