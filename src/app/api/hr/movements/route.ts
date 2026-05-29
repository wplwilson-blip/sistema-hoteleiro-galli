import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import {
  movementListSelect,
  prepareEmployeeMovementWrite,
  redactEmployeeMovement,
  type EmployeeMovementRow
} from "@/lib/hr/employee-movements";
import { hrMovementPayloadSchema, hrMovementsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

function escapeIlikePattern(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.movementsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, hrMovementsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.movementsSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let movementsQuery = context.supabase
      .from("employee_movements")
      .select(movementListSelect, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) movementsQuery = movementsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) movementsQuery = movementsQuery.eq("employee_id", query.employeeId);
    if (query.unitId) movementsQuery = movementsQuery.eq("unit_id", query.unitId);
    if (query.departmentId) movementsQuery = movementsQuery.or(`old_department_id.eq.${query.departmentId},new_department_id.eq.${query.departmentId}`);
    if (query.movementType) movementsQuery = movementsQuery.eq("movement_type", query.movementType);
    if (query.status) movementsQuery = movementsQuery.eq("status", query.status);
    if (query.from) movementsQuery = movementsQuery.gte("effective_date", query.from);
    if (query.to) movementsQuery = movementsQuery.lte("effective_date", query.to);
    if (query.search) movementsQuery = movementsQuery.ilike("reason", `%${escapeIlikePattern(query.search)}%`);

    const { data, error, count } = await movementsQuery.order("effective_date", { ascending: false }).range(from, to);
    if (error) {
      logHrApiError("movements.list_failed", error);
      return hrApiError("Nao foi possivel carregar as movimentacoes funcionais.", 500);
    }

    const rows = (data ?? []) as unknown as EmployeeMovementRow[];
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => redactEmployeeMovement(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar movimentacoes funcionais.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.movementsManage);
  if (response || !context) return response;

  try {
    const payload = hrMovementPayloadSchema.parse(await request.json());
    if (payload.status !== "draft") {
      return hrApiError("Movimentacao deve nascer como rascunho e ser enviada para aprovacao pelo fluxo formal.", 422);
    }

    const insertPayload = await prepareEmployeeMovementWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_movements")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(movementListSelect)
      .single();

    if (error) {
      logHrApiError("movements.create_failed", error);
      return hrApiError("Nao foi possivel criar a movimentacao funcional.", 500);
    }

    const movement = data as unknown as EmployeeMovementRow;

    return NextResponse.json({ ok: true, data: redactEmployeeMovement(movement, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar movimentacao funcional.");
  }
}
