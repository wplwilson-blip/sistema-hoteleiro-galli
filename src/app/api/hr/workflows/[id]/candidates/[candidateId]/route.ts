import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  assertCandidateLgpdText,
  assertCandidateSourceText,
  candidateSelect,
  getCandidateSensitiveAccess,
  loadCandidateAdmissionConversion,
  loadCandidateForWorkflow,
  loadCandidateInterviews,
  loadJobOpeningWorkflow,
  redactCandidate,
  updateCandidateSchema
} from "@/lib/hr/candidate-data";
import { handleHrWorkflowRouteError, hrWorkflowApiError, requireHrWorkflowPermission } from "@/lib/hr/workflow-auth";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
    candidateId: string;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsView);

    if (response || !context) {
      return response;
    }

    const workflow = await loadJobOpeningWorkflow(context, params.id);
    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404);
    }

    const candidate = await loadCandidateForWorkflow(context, workflow.id, params.candidateId);
    if (!candidate) {
      return hrWorkflowApiError("CANDIDATE_NOT_FOUND", "Candidato nao encontrado.", 404);
    }

    const [interviews, admissionConversion, sensitiveAccess] = await Promise.all([
      loadCandidateInterviews(context, workflow.id, candidate.id),
      loadCandidateAdmissionConversion(context, workflow.id, candidate.id),
      getCandidateSensitiveAccess(context)
    ]);
    const showPhone = sensitiveAccess.isSuperAdmin || sensitiveAccess.accessibleUnitIds.includes(workflow.unit_id);

    return NextResponse.json({
      data: {
        candidate: redactCandidate(candidate, showPhone),
        interviews,
        admission_conversion: admissionConversion,
        workflow: {
          id: workflow.id,
          title: workflow.title,
          status: workflow.status
        }
      }
    });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar o candidato.");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { context, response } = await requireHrWorkflowPermission(HR_PERMISSIONS.workflowsManage);

    if (response || !context) {
      return response;
    }

    const workflow = await loadJobOpeningWorkflow(context, params.id);
    if (!workflow) {
      return hrWorkflowApiError("WORKFLOW_NOT_FOUND", "Solicitacao de vaga nao encontrada.", 404);
    }

    const candidate = await loadCandidateForWorkflow(context, workflow.id, params.candidateId);
    if (!candidate) {
      return hrWorkflowApiError("CANDIDATE_NOT_FOUND", "Candidato nao encontrado.", 404);
    }

    const payload = updateCandidateSchema.parse(await request.json().catch(() => ({})));
    assertCandidateSourceText(payload.source);
    assertCandidateLgpdText([payload.full_name, payload.phone, payload.notes, payload.human_opinion]);

    const updatePayload: Record<string, unknown> = {
      updated_by: context.session.user.id
    };

    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    }

    if (payload.status && payload.status !== candidate.status) {
      updatePayload.status_changed_at = new Date().toISOString();
    }

    const { data, error } = await context.supabase
      .from("hr_job_candidates")
      .update(updatePayload)
      .eq("id", candidate.id)
      .eq("workflow_id", workflow.id)
      .is("deleted_at", null)
      .select(candidateSelect)
      .single();

    if (error) {
      logHrApiError("candidates.update_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel atualizar o candidato.", 500);
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof Error && error.message.includes("Evite")) {
      return hrWorkflowApiError("LGPD_PAYLOAD_DENIED", error.message, 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel atualizar o candidato.");
  }
}
