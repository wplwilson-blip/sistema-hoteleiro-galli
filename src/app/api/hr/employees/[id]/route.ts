import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit
} from "@/lib/hr/api-auth";
import { getEmployeeRelations, loadEmployeeRelations } from "@/lib/hr/data";
import { hrIdParamSchema } from "@/lib/hr/schemas";
import { redactEmployeeForHrDetail } from "@/lib/hr/redaction";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.employeesView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const employee = await assertCanAccessHrEmployee(context, id);
    const [
      relations,
      canViewSensitive,
      canViewDocuments,
      canManageDocuments,
      canViewSensitiveDocuments,
      canVerifyDocuments,
      canViewHistory,
      canViewSensitiveHistory,
      canViewMovements,
      canViewSensitiveMovements
    ] =
      await Promise.all([
        loadEmployeeRelations(context.supabase, [employee]),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.employeesSensitiveView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsManage, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsSensitiveView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.documentsVerify, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.historyView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.historySensitiveView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.movementsView, employee.unit_id),
        userHasHrPermissionForUnit(context.supabase, context.session, HR_PERMISSIONS.movementsSensitiveView, employee.unit_id)
      ]);

    return NextResponse.json({
      ok: true,
      data: redactEmployeeForHrDetail(employee, getEmployeeRelations(employee, relations), canViewSensitive),
      permissions: {
        canViewSensitive,
        canViewDocuments,
        canManageDocuments,
        canViewSensitiveDocuments,
        canVerifyDocuments,
        canViewHistory,
        canViewSensitiveHistory,
        canViewMovements,
        canViewSensitiveMovements
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError("Recurso nao encontrado.", 404);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar o colaborador de RH.");
  }
}
