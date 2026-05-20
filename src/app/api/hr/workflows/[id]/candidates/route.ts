import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  assertCandidateLgpdText,
  candidateListQuerySchema,
  candidateSelect,
  createCandidateSchema,
  getCandidateSensitiveAccess,
  loadJobOpeningWorkflow,
  parseSearchParams,
  redactCandidate,
  summarizeCandidates,
  type HrJobCandidateRow
} from "@/lib/hr/candidate-data";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";
import { escapeIlikePattern } from "@/lib/hr/workflow-data";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const workflow = await loadJobOpeningWorkflow(context, params.id);
    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404);
    }

    const query = parseSearchParams(request, candidateListQuerySchema);
    const from = (query.page - 1) * query.page_size;
    const to = from + query.page_size - 1;

    let candidatesQuery = context.supabase
      .from("hr_job_candidates")
      .select(candidateSelect, { count: "exact" })
      .eq("workflow_id", workflow.id)
      .is("deleted_at", null);

    if (query.status) {
      candidatesQuery = candidatesQuery.eq("status", query.status);
    }

    if (query.q) {
      const term = escapeIlikePattern(query.q);
      candidatesQuery = candidatesQuery.or(`full_name.ilike.%${term}%,source.ilike.%${term}%`);
    }

    const { data, error, count } = await candidatesQuery.order("created_at", { ascending: false }).range(from, to);

    if (error) {
      logHrApiError("candidates.list_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar os candidatos.", 500);
    }

    const summaryResult = await context.supabase
      .from("hr_job_candidates")
      .select(candidateSelect)
      .eq("workflow_id", workflow.id)
      .is("deleted_at", null);

    if (summaryResult.error) {
      logHrApiError("candidates.summary_failed", summaryResult.error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel carregar o resumo de candidatos.", 500);
    }

    const sensitiveAccess = await getCandidateSensitiveAccess(context);
    const showPhone = sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(workflow.unit_id);

    return NextResponse.json({
      data: ((data ?? []) as HrJobCandidateRow[]).map((candidate) => redactCandidate(candidate, showPhone)),
      summary: summarizeCandidates((summaryResult.data ?? []) as HrJobCandidateRow[]),
      workflow: {
        id: workflow.id,
        title: workflow.title,
        status: workflow.status
      },
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

    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os candidatos.");
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsManage);

    if (response || !context) {
      return response;
    }

    const workflow = await loadJobOpeningWorkflow(context, params.id);
    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404);
    }

    const payload = createCandidateSchema.parse(await request.json().catch(() => ({})));
    assertCandidateLgpdText([payload.full_name, payload.phone, payload.source, payload.notes, payload.human_opinion]);

    const { data, error } = await context.supabase
      .from("hr_job_candidates")
      .insert({
        organization_id: workflow.organization_id,
        unit_id: workflow.unit_id,
        workflow_id: workflow.id,
        full_name: payload.full_name,
        phone: payload.phone,
        source: payload.source,
        status: payload.status,
        notes: payload.notes,
        manual_score: payload.manual_score ?? null,
        human_opinion: payload.human_opinion,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(candidateSelect)
      .single();

    if (error) {
      logHrApiError("candidates.create_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel cadastrar o candidato.", 500);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof Error && error.message.includes("Evite")) {
      return hrWorkflowApiError("LGPD_PAYLOAD_DENIED", error.message, 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel cadastrar o candidato.");
  }
}
