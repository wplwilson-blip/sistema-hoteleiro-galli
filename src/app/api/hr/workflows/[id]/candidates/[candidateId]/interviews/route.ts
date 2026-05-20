import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  assertCandidateLgpdText,
  createInterviewSchema,
  interviewSelect,
  loadCandidateForWorkflow,
  loadCandidateInterviews,
  loadJobOpeningWorkflow
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

    return NextResponse.json({ data: await loadCandidateInterviews(context, workflow.id, candidate.id) });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar as entrevistas.");
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

    const candidate = await loadCandidateForWorkflow(context, workflow.id, params.candidateId);
    if (!candidate) {
      return hrWorkflowApiError("CANDIDATE_NOT_FOUND", "Candidato nao encontrado.", 404);
    }

    const payload = createInterviewSchema.parse(await request.json().catch(() => ({})));
    const interviewAt = new Date(payload.interview_at);

    if (Number.isNaN(interviewAt.getTime())) {
      return hrWorkflowApiError("INVALID_PAYLOAD", "Data da entrevista invalida.", 422);
    }

    assertCandidateLgpdText([payload.notes]);

    const { data, error } = await context.supabase
      .from("hr_candidate_interviews")
      .insert({
        organization_id: workflow.organization_id,
        unit_id: workflow.unit_id,
        workflow_id: workflow.id,
        candidate_id: candidate.id,
        interviewer_user_id: context.session.user.id,
        interview_at: interviewAt.toISOString(),
        communication_score: payload.communication_score,
        posture_score: payload.posture_score,
        experience_score: payload.experience_score,
        availability_score: payload.availability_score,
        hospitality_profile_score: payload.hospitality_profile_score,
        notes: payload.notes,
        final_opinion: payload.final_opinion,
        created_by: context.session.user.id,
        updated_by: context.session.user.id
      })
      .select(interviewSelect)
      .single();

    if (error) {
      logHrApiError("candidates.interview_create_failed", error);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel registrar a entrevista.", 500);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof Error && error.message.includes("Evite")) {
      return hrWorkflowApiError("LGPD_PAYLOAD_DENIED", error.message, 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel registrar a entrevista.");
  }
}
