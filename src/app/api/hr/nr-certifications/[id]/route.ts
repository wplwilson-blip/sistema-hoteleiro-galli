import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema, nrCertificationPayloadSchema } from "@/lib/hr/schemas";
import { loadNrCertification, mapNrCertification, nrCertificationListSelect, prepareNrCertificationWrite, type NrCertificationRow } from "@/lib/hr/occupational-health";

type RouteParams = { params: { id: string } };

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const row = await loadNrCertification(context, id);
    if (!row) return hrApiError("Certificacao NR nao encontrada.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    return NextResponse.json({ ok: true, data: mapNrCertification(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id)) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar certificacao NR.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalManage);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const existing = await loadNrCertification(context, id);
    if (!existing) return hrApiError("Certificacao NR nao encontrada.", 404);
    const payload = nrCertificationPayloadSchema.partial().parse(await request.json());
    const merged = {
      employeeId: payload.employeeId ?? existing.employee_id,
      nrCode: payload.nrCode ?? existing.nr_code,
      trainingName: payload.trainingName ?? existing.training_name,
      issuedAt: payload.issuedAt ?? existing.issued_at ?? undefined,
      expiresAt: payload.expiresAt ?? existing.expires_at ?? undefined,
      certificateAttachmentId: payload.certificateAttachmentId ?? existing.certificate_attachment_id ?? undefined,
      status: payload.status ?? existing.status
    };
    const updatePayload = await prepareNrCertificationWrite(context, nrCertificationPayloadSchema.parse(merged), existing);
    const { data, error } = await context.supabase
      .from("employee_nr_certifications")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(nrCertificationListSelect)
      .single();

    if (error) {
      logHrApiError("occupational.nr_update_failed", error);
      return hrApiError("Nao foi possivel atualizar certificacao NR.", 500);
    }

    return NextResponse.json({ ok: true, data: mapNrCertification(data as unknown as NrCertificationRow, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar certificacao NR.");
  }
}
