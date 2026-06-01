import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessHrEmployee, getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { hrIdParamSchema, occupationalRecordsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { mapOccupationalRecord, occupationalRecordListSelect, type OccupationalRecordRow } from "@/lib/hr/occupational-health";

type RouteParams = { params: { id: string } };

export async function GET(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.occupationalView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const query = parseSearchParams(request, occupationalRecordsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.occupationalSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let recordsQuery = context.supabase
      .from("employee_occupational_records")
      .select(occupationalRecordListSelect, { count: "exact" })
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (query.recordType) recordsQuery = recordsQuery.eq("record_type", query.recordType);
    if (query.status) recordsQuery = recordsQuery.eq("status", query.status);
    if (query.expiresFrom) recordsQuery = recordsQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) recordsQuery = recordsQuery.lte("expires_at", query.expiresTo);

    const { data, error, count } = await recordsQuery.order("expires_at", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("occupational.employee_records_failed", error);
      return hrApiError("Nao foi possivel carregar Saude Ocupacional do colaborador.", 500);
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
    return handleHrRouteError(error, "Nao foi possivel carregar Saude Ocupacional do colaborador.");
  }
}
