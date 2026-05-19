import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { buildWorkflowAuditState, loadWorkflowAuditSnapshot, recordWorkflowAuditLog } from "@/lib/hr/workflow-audit";
import {
  HR_WORKFLOW_SELECT,
  escapeIlikePattern,
  loadWorkflowEmployees,
  loadWorkflowSteps,
  toEndOfDay,
  toStartOfDay,
  uniqueIds,
  type HrWorkflowRow
} from "@/lib/hr/workflow-data";
import {
  HrWorkflowMutationError,
  applyCreateWorkflowRpc,
  assertCreateWorkflowEmployeeRequirement,
  assertSensitiveWorkflowCreateAllowed,
  buildCreateWorkflowRpcPayload,
  createWorkflowRequestHash,
  getCreateWorkflowIdempotencyKey,
  mapWorkflowRpcError,
  parseCreateWorkflowPayload,
  type CreateWorkflowInput
} from "@/lib/hr/workflow-mutations";
import { redactWorkflowDetail, redactWorkflowListItem } from "@/lib/hr/workflow-redaction";
import {
  canAccessSensitiveWorkflowUnit,
  canAccessWorkflowUnit,
  canUseWorkflowUnitFilter,
  getWorkflowPermissionAccess,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrWorkflowListQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

function emptyWorkflowListPayload(page: number, pageSize: number) {
  return NextResponse.json({
    data: [],
    pagination: {
      page,
      page_size: pageSize,
      total: 0
    }
  });
}

type WorkflowMutationEmployeeRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
};

type WorkflowMutationUnitRow = {
  id: string;
  organization_id: string;
};

function workflowMutationError(code: string, message: string, status: number): never {
  throw new HrWorkflowMutationError(code, message, status);
}

async function resolveCreateWorkflowTarget(context: HrRequestContext, payload: CreateWorkflowInput) {
  assertCreateWorkflowEmployeeRequirement(payload);

  if (payload.employee_id) {
    const { data, error } = await context.supabase
      .from("employees")
      .select("id, organization_id, unit_id")
      .eq("id", payload.employee_id)
      .is("deleted_at", null)
      .limit(1);

    if (error) {
      logHrApiError("workflows.create.employee_lookup_failed", error);
      workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar o colaborador do workflow.", 500);
    }

    const employee = data?.[0] as WorkflowMutationEmployeeRow | undefined;

    if (!employee?.organization_id || !employee.unit_id) {
      workflowMutationError("INVALID_PAYLOAD", "Colaborador invalido para criar workflow.", 422);
    }

    if (!canAccessWorkflowUnit(context, employee.unit_id)) {
      workflowMutationError("FORBIDDEN", "Voce nao tem permissao para criar workflows nesta unidade.", 403);
    }

    if (payload.unit_id && payload.unit_id !== employee.unit_id) {
      workflowMutationError("INVALID_PAYLOAD", "unit_id nao confere com a unidade do colaborador.", 422);
    }

    return {
      organizationId: employee.organization_id,
      unitId: employee.unit_id
    };
  }

  if (!payload.unit_id) {
    workflowMutationError("INVALID_PAYLOAD", "unit_id e obrigatorio quando o workflow nao possui colaborador.", 422);
  }

  if (!canAccessWorkflowUnit(context, payload.unit_id)) {
    workflowMutationError("FORBIDDEN", "Voce nao tem permissao para criar workflows nesta unidade.", 403);
  }

  const { data, error } = await context.supabase
    .from("units")
    .select("id, organization_id")
    .eq("id", payload.unit_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflows.create.unit_lookup_failed", error);
    workflowMutationError("INTERNAL_ERROR", "Nao foi possivel validar a unidade do workflow.", 500);
  }

  const unit = data?.[0] as WorkflowMutationUnitRow | undefined;

  if (!unit?.organization_id) {
    workflowMutationError("INVALID_PAYLOAD", "Unidade invalida para criar workflow.", 422);
  }

  return {
    organizationId: unit.organization_id,
    unitId: unit.id
  };
}

async function loadWorkflowDetailPayload(context: HrRequestContext, workflowId: string) {
  const { data, error } = await context.supabase
    .from("hr_workflows")
    .select(HR_WORKFLOW_SELECT)
    .eq("id", workflowId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("workflows.create.created_workflow_lookup_failed", error);
    workflowMutationError("INTERNAL_ERROR", "Workflow criado, mas nao foi possivel carregar o retorno seguro.", 500);
  }

  const workflow = data?.[0] as HrWorkflowRow | undefined;

  if (!workflow) {
    workflowMutationError("INTERNAL_ERROR", "Workflow criado, mas nao foi possivel localizar o retorno seguro.", 500);
  }

  const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
  const [stepsByWorkflow, employeesById] = await Promise.all([
    loadWorkflowSteps(context.supabase, [workflow.id]),
    loadWorkflowEmployees(context.supabase, workflow.employee_id ? [workflow.employee_id] : [])
  ]);

  return redactWorkflowDetail({
    workflow,
    employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
    steps: stepsByWorkflow.get(workflow.id) ?? [],
    canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
  });
}

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrWorkflowListQuerySchema);

    if (query.created_from && query.created_to && query.created_from > query.created_to) {
      return hrWorkflowApiError("INVALID_QUERY", "Periodo invalido.", 422);
    }

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return emptyWorkflowListPayload(query.page, query.page_size);
    }

    if (!context.isSuperAdmin && !context.accessibleUnitIds.length) {
      return emptyWorkflowListPayload(query.page, query.page_size);
    }

    const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
    let assignedWorkflowIds: string[] | null = null;

    if (query.assigned_to) {
      let assignedStepsQuery = context.supabase
        .from("hr_workflow_steps")
        .select("workflow_id")
        .eq("assigned_to_user_id", query.assigned_to)
        .in("status", ["in_progress", "waiting_approval", "returned"])
        .is("deleted_at", null);

      if (!context.isSuperAdmin) {
        assignedStepsQuery = assignedStepsQuery.in("unit_id", context.accessibleUnitIds);
      }

      if (query.unit_id) {
        assignedStepsQuery = assignedStepsQuery.eq("unit_id", query.unit_id);
      }

      const { data: assignedSteps, error: assignedStepsError } = await assignedStepsQuery;

      if (assignedStepsError) {
        return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel filtrar workflows por responsavel.", 500);
      }

      assignedWorkflowIds = uniqueIds((assignedSteps ?? []).map((step) => step.workflow_id));

      if (!assignedWorkflowIds.length) {
        return emptyWorkflowListPayload(query.page, query.page_size);
      }
    }

    let workflowsQuery = context.supabase
      .from("hr_workflows")
      .select(HR_WORKFLOW_SELECT, { count: "exact" })
      .is("deleted_at", null);

    if (!context.isSuperAdmin) {
      workflowsQuery = workflowsQuery.in("unit_id", context.accessibleUnitIds);
    }

    if (assignedWorkflowIds) workflowsQuery = workflowsQuery.in("id", assignedWorkflowIds);
    if (query.status) workflowsQuery = workflowsQuery.eq("status", query.status);
    if (query.workflow_type) workflowsQuery = workflowsQuery.eq("workflow_type", query.workflow_type);
    if (query.employee_id) workflowsQuery = workflowsQuery.eq("employee_id", query.employee_id);
    if (query.unit_id) workflowsQuery = workflowsQuery.eq("unit_id", query.unit_id);
    if (query.created_by) workflowsQuery = workflowsQuery.eq("created_by", query.created_by);
    if (query.sensitive !== undefined) workflowsQuery = workflowsQuery.eq("is_sensitive", query.sensitive);
    if (query.created_from) workflowsQuery = workflowsQuery.gte("created_at", toStartOfDay(query.created_from));
    if (query.created_to) workflowsQuery = workflowsQuery.lte("created_at", toEndOfDay(query.created_to));
    if (query.q) workflowsQuery = workflowsQuery.ilike("title", `%${escapeIlikePattern(query.q)}%`);

    const from = (query.page - 1) * query.page_size;
    const to = from + query.page_size - 1;
    const { data, error, count } = await workflowsQuery.order("created_at", { ascending: false }).range(from, to);

    if (error) {
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar os workflows de RH.", 500);
    }

    const workflows = (data ?? []) as HrWorkflowRow[];
    const workflowIds = workflows.map((workflow) => workflow.id);
    const employeeIds = uniqueIds(workflows.map((workflow) => workflow.employee_id));
    const [stepsByWorkflow, employeesById] = await Promise.all([
      loadWorkflowSteps(context.supabase, workflowIds),
      loadWorkflowEmployees(context.supabase, employeeIds)
    ]);

    return NextResponse.json({
      data: workflows.map((workflow) =>
        redactWorkflowListItem({
          workflow,
          employee: workflow.employee_id ? employeesById.get(workflow.employee_id) ?? null : null,
          steps: stepsByWorkflow.get(workflow.id) ?? [],
          canViewSensitive: canAccessSensitiveWorkflowUnit(sensitiveAccess, workflow.unit_id)
        })
      ),
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total: count ?? 0
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os workflows de RH.");
  }
}

export async function POST(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsManage);

    if (response || !context) {
      return response;
    }

    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return hrWorkflowApiError("INVALID_PAYLOAD", "JSON invalido.", 400);
    }

    const payload = parseCreateWorkflowPayload(rawPayload);
    const idempotencyKey = getCreateWorkflowIdempotencyKey(request, payload);
    const target = await resolveCreateWorkflowTarget(context, payload);
    const sensitiveAccess = await getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);

    assertSensitiveWorkflowCreateAllowed({
      workflowType: payload.workflow_type,
      unitId: target.unitId,
      sensitiveUnitIds: sensitiveAccess.accessibleUnitIds,
      isSuperAdmin: sensitiveAccess.isSuperAdmin
    });

    const rpcPayload = buildCreateWorkflowRpcPayload(payload);
    const requestHash = createWorkflowRequestHash({
      organizationId: target.organizationId,
      unitId: target.unitId,
      payload: rpcPayload
    });
    const result = await applyCreateWorkflowRpc({
      supabase: context.supabase,
      context,
      organizationId: target.organizationId,
      unitId: target.unitId,
      idempotencyKey,
      requestHash,
      payload: rpcPayload
    });

    if (!result.ok) {
      throw mapWorkflowRpcError(result);
    }

    if (!result.workflow_id) {
      workflowMutationError("INTERNAL_ERROR", "A engine nao retornou o workflow criado.", 500);
    }

    const auditSnapshot = await loadWorkflowAuditSnapshot({
      supabase: context.supabase,
      workflowId: result.workflow_id
    });
    const workflowForAudit = auditSnapshot.workflow;

    if (!workflowForAudit) {
      workflowMutationError("INTERNAL_ERROR", "Workflow criado, mas nao foi possivel localizar o snapshot de auditoria.", 500);
    }

    if (result.idempotency?.replayed !== true) {
      await recordWorkflowAuditLog({
        context,
        request,
        action: "create_workflow",
        workflow: workflowForAudit,
        previousState: null,
        newState: {
          workflow: buildWorkflowAuditState(workflowForAudit)
        },
        metadata: {
          idempotency_key: idempotencyKey,
          idempotency_replayed: false,
          source: "api"
        }
      });
    }

    const workflow = await loadWorkflowDetailPayload(context, result.workflow_id);

    return NextResponse.json(
      {
        data: workflow,
        idempotency: {
          status: result.idempotency?.status ?? "completed",
          replayed: result.idempotency?.replayed === true
        }
      },
      { status: result.idempotency?.replayed ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof HrWorkflowMutationError) {
      return hrWorkflowApiError(error.code, error.message, error.status);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel criar o workflow de RH.");
  }
}
