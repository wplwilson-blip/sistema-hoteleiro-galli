import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { occupationalRecordPayloadSchema, occupationalRecordsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import {
  mapOccupationalRecord,
  occupationalRecordListSelect,
  prepareOccupationalRecordWrite,
  publishOccupationalRecordEvent,
  type OccupationalRecordRow
} from "@/lib/hr/occupational-health";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView, { scope: "active-unit" });
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, occupationalRecordsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let recordsQuery = context.supabase.from("employee_occupational_records").select(occupationalRecordListSelect, { count: "exact" }).is("deleted_at", null);

    // active-unit: accessibleUnitIds ja vem estreitado (inclui super admin = [unidade ativa]).
    recordsQuery = recordsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) recordsQuery = recordsQuery.eq("employee_id", query.employeeId);
    if (query.unitId) recordsQuery = recordsQuery.eq("unit_id", query.unitId);
    if (query.recordType) recordsQuery = recordsQuery.eq("record_type", query.recordType);
    if (query.status) recordsQuery = recordsQuery.eq("status", query.status);
    if (query.from) recordsQuery = recordsQuery.gte("exam_date", query.from);
    if (query.to) recordsQuery = recordsQuery.lte("exam_date", query.to);
    if (query.expiresFrom) recordsQuery = recordsQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) recordsQuery = recordsQuery.lte("expires_at", query.expiresTo);
    if (query.search) recordsQuery = recordsQuery.ilike("provider_name", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await recordsQuery.order("expires_at", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("occupational.records_list_failed", error);
      return hrApiError("Nao foi possivel carregar Saude Ocupacional.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as OccupationalRecordRow[]).map((row) =>
        mapOccupationalRecord(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))
      ),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar Saude Ocupacional.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalManage);
  if (response || !context) return response;

  try {
    const payload = occupationalRecordPayloadSchema.parse(await request.json());
    const insertPayload = await prepareOccupationalRecordWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_occupational_records")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(occupationalRecordListSelect)
      .single();

    if (error) {
      logHrApiError("occupational.record_create_failed", error);
      return hrApiError("Nao foi possivel criar registro ocupacional.", 500);
    }

    const record = data as unknown as OccupationalRecordRow;
    await publishOccupationalRecordEvent({ context, record, created: true });
    if (record.status === "valid" && record.record_type.startsWith("aso_")) await publishOccupationalRecordEvent({ context, record });

    return NextResponse.json({ ok: true, data: mapOccupationalRecord(record, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar registro ocupacional.");
  }
}
