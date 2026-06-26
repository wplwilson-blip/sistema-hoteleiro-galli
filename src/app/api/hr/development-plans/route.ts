import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getHrAccessibleUnitIds,
  handleHrRouteError,
  HR_PERMISSIONS,
  hrApiError,
  logHrApiError,
  requireHrPermission,
  type HrRequestContext
} from "@/lib/hr/api-auth";
import { prepareDevelopmentPlanWrite } from "@/lib/hr/development-plan-actions";
import { createEmployeeFunctionalEvent } from "@/lib/hr/employee-functional-events";
import { developmentPlanListSelect, redactDevelopmentPlan, type EmployeeDevelopmentPlanRow } from "@/lib/hr/development-plans";
import { developmentPlanPayloadSchema, developmentPlansQuerySchema } from "@/lib/hr/evaluation-validation";
import { parseSearchParams } from "@/lib/hr/schemas";

async function writeDevelopmentPlanCreatedEvent(input: {
  context: HrRequestContext;
  plan: EmployeeDevelopmentPlanRow;
}) {
  const result = await createEmployeeFunctionalEvent(input.context.supabase, {
    employeeId: input.plan.employee_id,
    eventType: "development_plan_created",
    title: "PDI criado",
    description: "Plano de desenvolvimento individual criado para o colaborador.",
    severity: "notice",
    visibilityScope: "restricted",
    isSensitive: true,
    sourceModule: "hr",
    sourceEntityType: "employee_development_plan",
    sourceEntityId: input.plan.id,
    actorUserId: input.context.session.user.id,
    dedupeKey: `development-plan:${input.plan.id}:created`,
    eventPayload: {
      plan_title: input.plan.title,
      status: input.plan.status,
      due_date: input.plan.due_at,
      evaluation_id: input.plan.evaluation_id
    }
  });

  if (!result.ok) {
    logHrApiError("development_plans.functional_event_create_failed", { message: result.error.message, code: result.error.code });
  }
}

export async function GET(request: Request) {
  // Lista standalone estreita pela unidade ativa; quando filtrada por employeeId (card do
  // detalhe do colaborador) fica aggregate + check per-record, preservando colaboradores de
  // qualquer unidade da uniao.
  const hasEmployeeFilter = Boolean(new URL(request.url).searchParams.get("employeeId")?.trim());
  const { context, response } = await requireHrPermission(
    HR_PERMISSIONS.evaluationsView,
    hasEmployeeFilter ? undefined : { scope: "active-unit" }
  );
  if (response || !context) return response;

  try {
    const query = parseSearchParams(request, developmentPlansQuerySchema);
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let plansQuery = context.supabase
      .from("employee_development_plans")
      .select(developmentPlanListSelect, { count: "exact" })
      .is("deleted_at", null);

    // active-unit: accessibleUnitIds ja vem estreitado (inclui super admin = [unidade ativa]).
    plansQuery = plansQuery.in("unit_id", context.accessibleUnitIds);
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

    const plan = data as unknown as EmployeeDevelopmentPlanRow;
    await writeDevelopmentPlanCreatedEvent({ context, plan });

    return NextResponse.json({ ok: true, data: redactDevelopmentPlan(plan, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return hrApiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    return handleHrRouteError(error, "Nao foi possivel criar PDI.");
  }
}
