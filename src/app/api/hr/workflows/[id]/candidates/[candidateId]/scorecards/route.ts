import { NextResponse } from "next/server";
import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError } from "@/lib/hr/api-auth";
import {
  assertCandidateLgpdText,
  interviewOpinions,
  interviewSelect,
  loadCandidateForWorkflow,
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

type ScorecardTemplateRow = {
  id: string;
  organization_id: string | null;
  unit_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
};

type ScorecardQuestionRow = {
  id: string;
  template_id: string;
  question_text: string;
  category: string;
  weight: number | string;
  is_required: boolean;
  order_index: number;
};

type InterviewScorecardRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  candidate_id: string;
  interview_id: string;
  template_id: string;
  total_score: number | string;
  final_opinion: (typeof interviewOpinions)[number];
  human_opinion: string | null;
  evaluated_by: string | null;
  evaluated_at: string;
  created_at: string;
  updated_at: string;
};

type ScorecardResponseRow = {
  id: string;
  scorecard_id: string;
  question_id: string;
  category: string;
  weight: number | string;
  score: number;
  observation: string | null;
};

const scorecardResponseSchema = z.object({
  question_id: z.string().uuid(),
  score: z.coerce.number().int().min(1).max(5),
  observation: z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().max(1000).nullable().optional())
    .transform((value) => (value === undefined ? null : value ? value : null))
});

const saveScorecardSchema = z.object({
  interview_id: z.string().uuid(),
  template_id: z.string().uuid(),
  final_opinion: z.enum(interviewOpinions),
  human_opinion: z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().max(2000).nullable().optional())
    .transform((value) => (value === undefined ? null : value ? value : null)),
  responses: z.array(scorecardResponseSchema).min(1).max(40)
});

function numeric(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function normalizeQuestion(question: ScorecardQuestionRow) {
  return {
    ...question,
    weight: numeric(question.weight)
  };
}

function normalizeScorecard(scorecard: InterviewScorecardRow, responses: ScorecardResponseRow[]) {
  return {
    ...scorecard,
    total_score: numeric(scorecard.total_score),
    responses: responses.map((response) => ({
      ...response,
      weight: numeric(response.weight)
    }))
  };
}

function calculateScores(responses: Array<{ category: string; score: number; weight: number }>) {
  const totals = new Map<string, { weighted: number; weight: number }>();
  let weighted = 0;
  let weight = 0;

  for (const response of responses) {
    weighted += response.score * response.weight;
    weight += response.weight;

    const current = totals.get(response.category) ?? { weighted: 0, weight: 0 };
    current.weighted += response.score * response.weight;
    current.weight += response.weight;
    totals.set(response.category, current);
  }

  const categoryScores = Array.from(totals.entries()).map(([category, value]) => ({
    category,
    score: Math.round((value.weighted / value.weight) * 100) / 100
  }));

  return {
    totalScore: Math.round((weighted / weight) * 100) / 100,
    categoryScores
  };
}

async function loadScorecardPayload(
  context: Awaited<ReturnType<typeof requireHrWorkflowPermission>>["context"],
  workflow: { id: string; organization_id: string; unit_id: string },
  candidateId: string
) {
  if (!context) {
    throw new Error("Contexto de RH indisponivel.");
  }

  const { data: templatesData, error: templatesError } = await context.supabase
    .from("hr_scorecard_templates")
    .select("id, organization_id, unit_id, code, name, description, is_system")
    .eq("status", "active")
    .is("deleted_at", null)
    .or(`organization_id.is.null,organization_id.eq.${workflow.organization_id}`)
    .or(`unit_id.is.null,unit_id.eq.${workflow.unit_id}`);

  if (templatesError) {
    logHrApiError("scorecards.templates_lookup_failed", templatesError);
    throw new Error("Nao foi possivel carregar os modelos de scorecard.");
  }

  const templates = (templatesData ?? []) as ScorecardTemplateRow[];
  const templateIds = templates.map((template) => template.id);

  const { data: questionsData, error: questionsError } = templateIds.length
    ? await context.supabase
        .from("hr_scorecard_questions")
        .select("id, template_id, question_text, category, weight, is_required, order_index")
        .in("template_id", templateIds)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("order_index", { ascending: true })
    : { data: [], error: null };

  if (questionsError) {
    logHrApiError("scorecards.questions_lookup_failed", questionsError);
    throw new Error("Nao foi possivel carregar as perguntas de scorecard.");
  }

  const questions = ((questionsData ?? []) as ScorecardQuestionRow[]).map(normalizeQuestion);
  const templatesWithQuestions = templates.map((template) => ({
    ...template,
    questions: questions.filter((question) => question.template_id === template.id)
  }));

  const { data: scorecardsData, error: scorecardsError } = await context.supabase
    .from("hr_interview_scorecards")
    .select("id, organization_id, unit_id, workflow_id, candidate_id, interview_id, template_id, total_score, final_opinion, human_opinion, evaluated_by, evaluated_at, created_at, updated_at")
    .eq("workflow_id", workflow.id)
    .eq("candidate_id", candidateId)
    .is("deleted_at", null)
    .order("evaluated_at", { ascending: false });

  if (scorecardsError) {
    logHrApiError("scorecards.lookup_failed", scorecardsError);
    throw new Error("Nao foi possivel carregar as avaliacoes estruturadas.");
  }

  const scorecards = (scorecardsData ?? []) as InterviewScorecardRow[];
  const scorecardIds = scorecards.map((scorecard) => scorecard.id);

  const { data: responsesData, error: responsesError } = scorecardIds.length
    ? await context.supabase
        .from("hr_interview_scorecard_responses")
        .select("id, scorecard_id, question_id, category, weight, score, observation")
        .in("scorecard_id", scorecardIds)
        .is("deleted_at", null)
    : { data: [], error: null };

  if (responsesError) {
    logHrApiError("scorecards.responses_lookup_failed", responsesError);
    throw new Error("Nao foi possivel carregar as respostas do scorecard.");
  }

  const responses = (responsesData ?? []) as ScorecardResponseRow[];

  return {
    templates: templatesWithQuestions,
    scorecards: scorecards.map((scorecard) => normalizeScorecard(scorecard, responses.filter((response) => response.scorecard_id === scorecard.id)))
  };
}

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

    const payload = await loadScorecardPayload(context, workflow, candidate.id);

    return NextResponse.json({ data: payload });
  } catch (error) {
    return handleHrWorkflowRouteError(error, "Nao foi possivel carregar os scorecards.");
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

    const payload = saveScorecardSchema.parse(await request.json().catch(() => ({})));
    assertCandidateLgpdText([payload.human_opinion, ...payload.responses.map((item) => item.observation)]);

    const { data: interviewData, error: interviewError } = await context.supabase
      .from("hr_candidate_interviews")
      .select(interviewSelect)
      .eq("id", payload.interview_id)
      .eq("workflow_id", workflow.id)
      .eq("candidate_id", candidate.id)
      .is("deleted_at", null)
      .limit(1);

    if (interviewError) {
      logHrApiError("scorecards.interview_lookup_failed", interviewError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel validar a entrevista.", 500);
    }

    if (!interviewData?.length) {
      return hrWorkflowApiError("INTERVIEW_NOT_FOUND", "Entrevista nao encontrada para este candidato.", 404);
    }

    const { data: templateData, error: templateError } = await context.supabase
      .from("hr_scorecard_templates")
      .select("id, organization_id, unit_id, code, name, description, is_system")
      .eq("id", payload.template_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1);

    if (templateError) {
      logHrApiError("scorecards.template_lookup_failed", templateError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel validar o modelo de scorecard.", 500);
    }

    const template = templateData?.[0] as ScorecardTemplateRow | undefined;
    if (!template || (template.organization_id && template.organization_id !== workflow.organization_id) || (template.unit_id && template.unit_id !== workflow.unit_id)) {
      return hrWorkflowApiError("SCORECARD_TEMPLATE_NOT_FOUND", "Modelo de scorecard nao encontrado.", 404);
    }

    const { data: questionsData, error: questionsError } = await context.supabase
      .from("hr_scorecard_questions")
      .select("id, template_id, question_text, category, weight, is_required, order_index")
      .eq("template_id", template.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("order_index", { ascending: true });

    if (questionsError) {
      logHrApiError("scorecards.questions_validate_failed", questionsError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel validar as perguntas.", 500);
    }

    const questions = ((questionsData ?? []) as ScorecardQuestionRow[]).map(normalizeQuestion);
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const responseQuestionIds = new Set(payload.responses.map((item) => item.question_id));

    if (responseQuestionIds.size !== payload.responses.length || payload.responses.some((item) => !questionById.has(item.question_id))) {
      return hrWorkflowApiError("INVALID_PAYLOAD", "Respostas do scorecard invalidas.", 422);
    }

    const missingRequired = questions.some((question) => question.is_required && !responseQuestionIds.has(question.id));
    if (missingRequired) {
      return hrWorkflowApiError("INVALID_PAYLOAD", "Preencha todas as perguntas obrigatorias do scorecard.", 422);
    }

    const responseRows = payload.responses.map((item) => {
      const question = questionById.get(item.question_id);
      if (!question) {
        throw new Error("Pergunta invalida.");
      }

      return {
        question,
        score: item.score,
        observation: item.observation
      };
    });
    const { totalScore, categoryScores } = calculateScores(
      responseRows.map((item) => ({ category: item.question.category, score: item.score, weight: item.question.weight }))
    );

    const { data: existingData, error: existingError } = await context.supabase
      .from("hr_interview_scorecards")
      .select("id")
      .eq("interview_id", payload.interview_id)
      .is("deleted_at", null)
      .limit(1);

    if (existingError) {
      logHrApiError("scorecards.existing_lookup_failed", existingError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel verificar scorecard existente.", 500);
    }

    const existingId = existingData?.[0]?.id as string | undefined;
    const scorecardPayload = {
      organization_id: workflow.organization_id,
      unit_id: workflow.unit_id,
      workflow_id: workflow.id,
      candidate_id: candidate.id,
      interview_id: payload.interview_id,
      template_id: template.id,
      total_score: totalScore,
      final_opinion: payload.final_opinion,
      human_opinion: payload.human_opinion,
      evaluated_by: context.session.user.id,
      evaluated_at: new Date().toISOString(),
      metadata: {
        category_scores: categoryScores,
        decision: "human_only"
      },
      updated_by: context.session.user.id
    };

    const { data: savedData, error: saveError } = existingId
      ? await context.supabase
          .from("hr_interview_scorecards")
          .update(scorecardPayload)
          .eq("id", existingId)
          .select("id, organization_id, unit_id, workflow_id, candidate_id, interview_id, template_id, total_score, final_opinion, human_opinion, evaluated_by, evaluated_at, created_at, updated_at")
          .single()
      : await context.supabase
          .from("hr_interview_scorecards")
          .insert({
            ...scorecardPayload,
            created_by: context.session.user.id
          })
          .select("id, organization_id, unit_id, workflow_id, candidate_id, interview_id, template_id, total_score, final_opinion, human_opinion, evaluated_by, evaluated_at, created_at, updated_at")
          .single();

    if (saveError) {
      logHrApiError("scorecards.save_failed", saveError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel salvar o scorecard.", 500);
    }

    const savedScorecard = savedData as InterviewScorecardRow;

    if (existingId) {
      const { error: removeResponsesError } = await context.supabase
        .from("hr_interview_scorecard_responses")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: context.session.user.id,
          updated_by: context.session.user.id
        })
        .eq("scorecard_id", existingId)
        .is("deleted_at", null);

      if (removeResponsesError) {
        logHrApiError("scorecards.responses_replace_failed", removeResponsesError);
        return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel substituir as respostas do scorecard.", 500);
      }
    }

    const { data: savedResponsesData, error: responsesSaveError } = await context.supabase
      .from("hr_interview_scorecard_responses")
      .insert(
        responseRows.map((item) => ({
          scorecard_id: savedScorecard.id,
          question_id: item.question.id,
          category: item.question.category,
          weight: item.question.weight,
          score: item.score,
          observation: item.observation,
          created_by: context.session.user.id,
          updated_by: context.session.user.id
        }))
      )
      .select("id, scorecard_id, question_id, category, weight, score, observation");

    if (responsesSaveError) {
      logHrApiError("scorecards.responses_save_failed", responsesSaveError);
      return hrWorkflowApiError("INTERNAL_ERROR", "Nao foi possivel salvar as respostas do scorecard.", 500);
    }

    return NextResponse.json({
      data: normalizeScorecard(savedScorecard, (savedResponsesData ?? []) as ScorecardResponseRow[])
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return hrWorkflowApiError("INVALID_PAYLOAD", error.errors[0]?.message ?? "Payload invalido.", 422);
    }

    if (error instanceof Error && error.message.includes("Evite")) {
      return hrWorkflowApiError("LGPD_PAYLOAD_DENIED", error.message, 422);
    }

    return handleHrWorkflowRouteError(error, "Nao foi possivel salvar o scorecard.");
  }
}
