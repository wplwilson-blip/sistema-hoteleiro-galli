import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission
} from "@/lib/hr/api-auth";
import {
  employeeTrainingAssignPayloadSchema,
  employeeTrainingsQuerySchema,
  hrIdParamSchema,
  parseSearchParams
} from "@/lib/hr/schemas";
import {
  employeeTrainingListSelect,
  prepareEmployeeTrainingAssign,
  publishEmployeeTrainingEvent,
  redactEmployeeTraining,
  type EmployeeTrainingRow
} from "@/lib/hr/trainings";

type RouteParams = { params: { id: string } };

export async function GET(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const query = parseSearchParams(request, employeeTrainingsQuerySchema);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.trainingsSensitiveView);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let trainingQuery = context.supabase
      .from("employee_trainings")
      .select(employeeTrainingListSelect, { count: "exact" })
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (query.status) trainingQuery = trainingQuery.eq("status", query.status);
    if (query.trainingId) trainingQuery = trainingQuery.eq("training_id", query.trainingId);
    if (query.dueFrom) trainingQuery = trainingQuery.gte("due_date", query.dueFrom);
    if (query.dueTo) trainingQuery = trainingQuery.lte("due_date", query.dueTo);
    if (query.expiresFrom) trainingQuery = trainingQuery.gte("expires_at", query.expiresFrom);
    if (query.expiresTo) trainingQuery = trainingQuery.lte("expires_at", query.expiresTo);

    const { data, error, count } = await trainingQuery.order("due_date", { ascending: true, nullsFirst: false }).range(from, to);
    if (error) {
      logHrApiError("employee_trainings.list_failed", error);
      return hrApiError("Nao foi possivel carregar treinamentos do colaborador.", 500);
    }

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as EmployeeTrainingRow[]).map((row) =>
        redactEmployeeTraining(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))
      ),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / query.pageSize) }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar treinamentos do colaborador.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.trainingsAssign);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const payload = employeeTrainingAssignPayloadSchema.parse(await request.json());
    const insertPayload = await prepareEmployeeTrainingAssign(context, id, payload);
    const { data, error } = await context.supabase
      .from("employee_trainings")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(employeeTrainingListSelect)
      .single();

    if (error) {
      logHrApiError("employee_trainings.assign_failed", error);
      return hrApiError("Nao foi possivel atribuir treinamento.", 500);
    }

    const employeeTraining = data as unknown as EmployeeTrainingRow;
    await publishEmployeeTrainingEvent({ context, eventType: "training_required", employeeTraining });

    return NextResponse.json({ ok: true, data: redactEmployeeTraining(employeeTraining, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atribuir treinamento.");
  }
}
