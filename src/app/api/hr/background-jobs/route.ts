import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS } from "@/lib/hr/api-auth";
import {
  createBackgroundJob,
  loadBackgroundJobs,
  redactBackgroundJob,
  type HrBackgroundJobPriority,
  type HrBackgroundJobStatus,
  type HrBackgroundJobType
} from "@/lib/hr/background-jobs";
import {
  canUseWorkflowUnitFilter,
  handleHrWorkflowRouteError,
  hrWorkflowApiError,
  requireHrWorkflowPermission
} from "@/lib/hr/workflow-auth";
import { hrBackgroundJobCreateSchema, hrBackgroundJobsQuerySchema, parseSearchParams } from "@/lib/hr/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const query = parseSearchParams(request, hrBackgroundJobsQuerySchema);

    if (query.from && query.to && query.from > query.to) {
      return hrWorkflowApiError("INVALID_QUERY", "Periodo invalido.", 422);
    }

    if (!canUseWorkflowUnitFilter(context, query.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const jobs = await loadBackgroundJobs({
      supabase: context.supabase,
      scope: {
        isSuperAdmin: context.isSuperAdmin,
        accessibleUnitIds: context.accessibleUnitIds,
        unitId: query.unit_id,
        jobType: query.job_type as HrBackgroundJobType | undefined,
        status: query.status as HrBackgroundJobStatus | undefined,
        priority: query.priority as HrBackgroundJobPriority | undefined,
        from: query.from,
        to: query.to
      }
    });

    return NextResponse.json({
      data: jobs.map(redactBackgroundJob)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_QUERY", error.errors[0]?.message ?? "Consulta invalida.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os jobs background de RH.");
  }
}

export async function POST(request: Request) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsApprove);

    if (response || !context) {
      return response;
    }

    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return hrWorkflowApiError("INVALID_PAYLOAD", "JSON invalido.", 400);
    }

    const payload = hrBackgroundJobCreateSchema.parse(rawPayload);

    if (!canUseWorkflowUnitFilter(context, payload.unit_id)) {
      return hrWorkflowApiError("UNIT_NOT_FOUND", "Unidade nao encontrada.", 404);
    }

    const job = await createBackgroundJob({
      context,
      unitId: payload.unit_id,
      jobType: payload.job_type,
      status: payload.status,
      priority: payload.priority,
      payload: payload.payload,
      scheduledAt: payload.scheduled_at,
      correlationId: payload.correlation_id,
      maxAttempts: payload.max_attempts
    });

    return NextResponse.json({ data: redactBackgroundJob(job) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel criar o job background de RH.");
  }
}
