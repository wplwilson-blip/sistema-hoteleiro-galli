import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema, occupationalRecordPayloadSchema } from "@/lib/hr/schemas";
import {
  loadOccupationalRecord,
  mapOccupationalRecord,
  occupationalRecordListSelect,
  prepareOccupationalRecordWrite,
  publishOccupationalRecordEvent,
  type OccupationalRecordRow
} from "@/lib/hr/occupational-health";

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const record = await loadOccupationalRecord(context, id);
    if (!record) return hrApiError("Registro ocupacional nao encontrado.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    return NextResponse.json({ ok: true, data: mapOccupationalRecord(record, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(record.unit_id)) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar registro ocupacional.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadOccupationalRecord(context, id);
    if (!existing) return hrApiError("Registro ocupacional nao encontrado.", 404);
    const payload = occupationalRecordPayloadSchema.partial().parse(await request.json());
    const merged = {
      employeeId: payload.employeeId ?? existing.employee_id,
      recordType: payload.recordType ?? existing.record_type,
      status: payload.status ?? existing.status,
      examDate: payload.examDate ?? existing.exam_date ?? undefined,
      expiresAt: payload.expiresAt ?? existing.expires_at ?? undefined,
      providerName: payload.providerName ?? existing.provider_name ?? undefined,
      doctorName: payload.doctorName ?? existing.doctor_name ?? undefined,
      certificateNumber: payload.certificateNumber ?? existing.certificate_number ?? undefined,
      restrictionNotes: payload.restrictionNotes ?? existing.restriction_notes ?? undefined,
      attachmentId: payload.attachmentId ?? existing.attachment_id ?? undefined
    };
    const updatePayload = await prepareOccupationalRecordWrite(context, occupationalRecordPayloadSchema.parse(merged), existing);
    const { data, error } = await context.supabase
      .from("employee_occupational_records")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(occupationalRecordListSelect)
      .single();

    if (error) {
      logHrApiError("occupational.record_update_failed", error);
      return hrApiError("Nao foi possivel atualizar registro ocupacional.", 500);
    }

    const updated = data as unknown as OccupationalRecordRow;
    if (existing.status !== "valid" && updated.status === "valid") await publishOccupationalRecordEvent({ context, record: updated, previous: existing });
    return NextResponse.json({ ok: true, data: mapOccupationalRecord(updated, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar registro ocupacional.");
  }
}
