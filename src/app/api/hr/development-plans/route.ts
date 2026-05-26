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
import { prepareDevelopmentPlanWrite } from "@/lib/hr/development-plan-actions";
import { developmentPlanListSelect, redactDevelopmentPlan, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { developmentPlanPayloadSchema, developmentPlansQuerySchema } from "@/lib/hr/evaluation-validation";
import { parseSearchParams } from "@/lib/hr/schemas";

export async function GET(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.evaluationsView);
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, developmentPlansQuerySchema);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let plansQuery = context.supabase
      .from("employee_development_plans")
      .select(developmentPlanListSelect, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) plansQuery = plansQuery.in("unit_id", context.accessibleUnitIds);
    if (query.unitId) plansQuery = plansQuery.eq("unit_id", query.unitId);
    if (query.employeeId) plansQuery = plansQuery.eq("employee_id", query.employeeId);
    if (query.evaluationId) plansQuery = plansQuery.eq("evaluation_id", query.evaluationId);
    if (query.status) plansQuery = plansQuery.eq("status", query.status);
    if (query.dueFrom) plansQuery = plansQuery.gte("due_at", query.dueFrom);
    if (query.dueTo) plansQuery = plansQuery.lte("due_at", query.dueTo);
    if (query.search) plansQuery = plansQuery.ilike("title", `%${query.search}%`);

    const { data, error, count } = await plansQuery.order("updated_at", { ascending: false }).range(from, to);
    if (error) {
      logHrApiError("development_plans.list_failed", error);
      return hrApiError("Nao foi possivel carregar os PDIs.", 500);
    }

    const sensitiveAccess = await getHrAccessibleUnitIds(context.supabase, context.session, HR_PERMISSIONS.evaluationsSensitiveView);
    return NextResponse.json({
      ok: true,
      data: ((data ?? []) as unknown as EmployeeDevelopmentPlanRow[]).map((row) =>
        redactDevelopmentPlan(row, sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(row.unit_id))
      ),
      pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0 }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel carregar PDIs.");
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireHrPermission(HR_PERMISSIONS.developmentManage);
  if (response || !context) return response;

  try {
    const payload = developmentPlanPayloadSchema.parse(await request.json());
    const insertPayload = await prepareDevelopmentPlanWrite(context, payload);
    const { data, error } = await context.supabase
      .from("employee_development_plans")
      .insert({ ...insertPayload, created_by: context.session.user.id, updated_by: context.session.user.id })
      .select(developmentPlanListSelect)
      .single();

    if (error) {
      logHrApiError("development_plans.create_failed", error);
      return hrApiError("Nao foi possivel criar o PDI.", 500);
    }

    return NextResponse.json({ ok: true, data: redactDevelopmentPlan(data as unknown as EmployeeDevelopmentPlanRow, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar PDI.");
  }
}
