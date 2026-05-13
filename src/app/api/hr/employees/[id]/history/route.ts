import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCanAccessHrEmployee,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  userHasHrPermissionForUnit
} from "@/lib/hr/api-auth";
import { hrEmployeeHistoryQuerySchema, hrIdParamSchema, parseSearchParams } from "@/lib/hr/schemas";
import { redactFunctionalEvent, type EmployeeFunctionalEventRow } from "@/lib/hr/redaction";

function toStartOfDay(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toEndOfDay(value: string) {
  return `${value}T23:59:59.999Z`;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.historyView);

  if (response || !context) {
    return response;
  }

  try {
    const { id } = hrIdParamSchema.parse(params);
    const query = parseSearchParams(request, hrEmployeeHistoryQuerySchema);

    if (query.from && query.to && query.from > query.to) {
      return hrApiError("Periodo invalido.", 422);
    }

    const employee = await assertCanAccessHrEmployee(context, id);
    const canViewSensitiveHistory = await userHasHrPermissionForUnit(
      context.supabase,
      context.session,
      HR_PERMISSIONS.historySensitiveView,
      employee.unit_id
    );

    let historyQuery = context.supabase
      .from("employee_functional_events")
      .select(
        "id, organization_id, unit_id, employee_id, event_type, event_date, title, description, severity, visibility_scope, is_sensitive, source_module, source_entity_type, source_entity_id, related_document_id, related_attachment_id, actor_user_id, actor_employee_id, event_payload, status, correction_of_event_id, created_at, updated_at",
        { count: "exact" }
      )
      .eq("employee_id", employee.id);

    if (employee.unit_id) historyQuery = historyQuery.eq("unit_id", employee.unit_id);
    if (query.eventType) historyQuery = historyQuery.eq("event_type", query.eventType);
    historyQuery = historyQuery.eq("status", query.status ?? "active");
    if (query.from) historyQuery = historyQuery.gte("event_date", toStartOfDay(query.from));
    if (query.to) historyQuery = historyQuery.lte("event_date", toEndOfDay(query.to));

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await historyQuery.order("event_date", { ascending: false }).range(from, to);

    if (error) {
      logHrApiError("employee_history.list_failed", error);
      return hrApiError("Nao foi possivel carregar o historico funcional do colaborador.", 500);
    }

    const total = count ?? 0;

    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as EmployeeFunctionalEventRow[]).map((event) =>
        redactFunctionalEvent({
          event,
          canViewSensitive: canViewSensitiveHistory,
          includeSensitive: query.includeSensitive === true
        })
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize)
      },
      permissions: {
        canViewSensitiveHistory
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return handleHrRouteError(error, "Nao foi possivel carregar o historico funcional do colaborador.");
  }
}
