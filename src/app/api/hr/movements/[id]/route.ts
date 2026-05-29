import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  type HrPermissionCode
} from "@/lib/hr/api-auth";
import {
  loadEmployeeMovement,
  movementListSelect,
  prepareEmployeeMovementWrite,
  publishEmployeeMovementFunctionalEvent,
  redactEmployeeMovement,
  type EmployeeMovementRow
} from "@/lib/hr/employee-movements";
import { hrIdParamSchema, hrMovementPayloadSchema } from "@/lib/hr/schemas";

type RouteParams = { params: { id: string } };

function pickPayload<T extends Record<string, unknown>, K extends keyof T, F>(payload: T, key: K, fallback: F) {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback;
}

async function requirePatchPermission(request: Request): Promise<{ permission: HrPermissionCode; body: unknown }> {
  const body = await request.json();
  const status = typeof body === "object" && body && "status" in body ? (body as { status?: unknown }).status : undefined;
  const permission =
    status === "approved" || status === "rejected" ? HR_PERMISSIONS.movementsApprove : HR_PERMISSIONS.movementsManage;
  return { permission, body };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.movementsView);
  if (response || !context) return response;

  try {
    const { id } = hrIdParamSchema.parse(params);
    const movement = await loadEmployeeMovement(context, id);
    if (!movement) return hrApiError("Movimentacao funcional nao encontrada.", 404);
    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.movementsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: redactEmployeeMovement(movement, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(movement.unit_id))
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError("Recurso nao encontrado.", 404);
    return handleHrRouteError(error, "Nao foi possivel carregar movimentacao funcional.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { permission, body } = await requirePatchPermission(request);
    const { context, response } = await requireHrPermission(permission);
    if (response || !context) return response;

    const { id } = hrIdParamSchema.parse(params);
    const payload = hrMovementPayloadSchema.partial().parse(body);
    const existing = await loadEmployeeMovement(context, id);
    if (!existing) return hrApiError("Movimentacao funcional nao encontrada.", 404);

    const merged = {
      employeeId: payload.employeeId ?? existing.employee_id,
      movementType: payload.movementType ?? existing.movement_type,
      status: payload.status ?? existing.status,
      effectiveDate: payload.effectiveDate ?? existing.effective_date,
      oldUnitId: pickPayload(payload, "oldUnitId", existing.old_unit_id ?? undefined) as string | undefined,
      newUnitId: pickPayload(payload, "newUnitId", existing.new_unit_id ?? undefined) as string | undefined,
      oldDepartmentId: pickPayload(payload, "oldDepartmentId", existing.old_department_id ?? undefined) as string | undefined,
      newDepartmentId: pickPayload(payload, "newDepartmentId", existing.new_department_id ?? undefined) as string | undefined,
      oldJobPositionId: pickPayload(payload, "oldJobPositionId", existing.old_job_position_id ?? undefined) as string | undefined,
      newJobPositionId: pickPayload(payload, "newJobPositionId", existing.new_job_position_id ?? undefined) as string | undefined,
      oldSalary: pickPayload(payload, "oldSalary", existing.old_salary ?? undefined) as number | undefined,
      newSalary: pickPayload(payload, "newSalary", existing.new_salary ?? undefined) as number | undefined,
      reason: payload.reason ?? existing.reason,
      notes: pickPayload(payload, "notes", existing.notes ?? undefined) as string | undefined,
      isSensitive: payload.isSensitive ?? existing.is_sensitive,
      visibilityScope: payload.visibilityScope ?? existing.visibility_scope
    };
    const updatePayload = await prepareEmployeeMovementWrite(context, hrMovementPayloadSchema.parse(merged), existing);
    const { data, error } = await context.supabase
      .from("employee_movements")
      .update({ ...updatePayload, updated_by: context.session.user.id })
      .eq("id", id)
      .select(movementListSelect)
      .single();

    if (error) {
      logHrApiError("movements.update_failed", error);
      return hrApiError("Nao foi possivel atualizar a movimentacao funcional.", 500);
    }

    const movement = data as unknown as EmployeeMovementRow;
    await publishEmployeeMovementFunctionalEvent({ context, previous: existing, movement });

    return NextResponse.json({ ok: true, data: redactEmployeeMovement(movement, true) });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel atualizar movimentacao funcional.");
  }
}
