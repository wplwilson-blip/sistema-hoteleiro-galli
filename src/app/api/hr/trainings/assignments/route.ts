import { NextResponse } from "next/server";
import { z } from "zod";
import { getHrAccessibleUnitIds, handleHrRouteError, HR_PERMISSIONS, hrApiError, logHrApiError, requireHrPermission } from "@/lib/hr/api-auth";
import { employeeTrainingsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";
import { employeeTrainingListSelect, redactEmployeeTraining, type EmployeeTrainingRow } from "@/lib/hr/trainings";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, employeeTrainingsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.trainingsSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let assignmentsQuery = context.supabase
      .from("employee_trainings")
      .select(employeeTrainingListSelect, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) assignmentsQuery = assignmentsQuery.in("unit_id", context.accessibleUnitIds);
    if (query.employeeId) assignmentsQuery = assignmentsQuery.eq("employee_id", query.employeeId);
    if (query.trainingId) assignmentsQuery = assignmentsQuery.eq("training_id", query.trainingId);
    if (query.unitId) assignmentsQuery = assignmentsQuery.eq("unit_id", query.unitId);
    if (query.status) assignmentsQuery = assignmentsQuery.eq("status", query.status);
    if (query.dueFrom) assignmentsQuery = assignmentsQuery.gte("due_date", query.dueFrom);
    if (query.dueTo) assignmentsQuery = assignmentsQuery.lte("due_date", query.dueTo);
    if (query.expiresFrom) assignmentsQuery = assignmentsQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) assignmentsQuery = assignmentsQuery.lte("expires_at", query.expiresTo);

    const { data, error, count } = await assignmentsQuery.order("due_date", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("training_assignments.list_failed", error);
      return hrApiError("Nao foi possivel carregar treinamentos atribuidos.", 500);
    }

    let rows = ((data ?? []) as unknown as EmployeeTrainingRow[]).map((row) =>
      redactEmployeeTraining(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))
    );
    if (query.trainingType) rows = rows.filter((row) => row.trainingType === query.trainingType);
    if (query.deliveryMode) rows = rows.filter((row) => row.deliveryMode === query.deliveryMode);
    if (query.mandatory !== undefined) rows = rows.filter((row) => row.isMandatory === query.mandatory);

    return NextResponse.json({
      ok: true,
      data: rows,
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar treinamentos atribuidos.");
  }
}
