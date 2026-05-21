"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Save, ShieldAlert, Star } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDateTime,
  interviewOpinionLabel,
  interviewOpinionOptions,
  requestJson,
  type CandidateInterview,
  type InterviewOpinion
} from "@/components/hr/hr-candidate-shared";

type ScorecardQuestion = {
  id: string;
  template_id: string;
  question_text: string;
  category: string;
  weight: number;
  is_required: boolean;
  order_index: number;
};

type ScorecardTemplate = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  questions: ScorecardQuestion[];
};

type ScorecardResponse = {
  id: string;
  scorecard_id: string;
  question_id: string;
  category: string;
  weight: number;
  score: number;
  observation: string | null;
};

type InterviewScorecard = {
  id: string;
  interview_id: string;
  template_id: string;
  total_score: number;
  final_opinion: InterviewOpinion;
  human_opinion: string | null;
  evaluated_at: string;
  responses: ScorecardResponse[];
};

type ScorecardResponsePayload = {
  data: {
    templates: ScorecardTemplate[];
    scorecards: InterviewScorecard[];
  };
};

type ResponseForm = Record<string, { score: string; observation: string }>;

const emptyTemplates: ScorecardTemplate[] = [];
const emptyScorecards: InterviewScorecard[] = [];

const scoreLabels = [
  { value: "", label: "Selecione" },
  { value: "1", label: "1 - Muito abaixo" },
  { value: "2", label: "2 - Abaixo" },
  { value: "3", label: "3 - Adequado" },
  { value: "4", label: "4 - Bom" },
  { value: "5", label: "5 - Excelente" }
];

function calculateLiveScore(questions: ScorecardQuestion[], responses: ResponseForm) {
  let totalWeighted = 0;
  let totalWeight = 0;
  const categoryMap = new Map<string, { weighted: number; weight: number }>();

  for (const question of questions) {
    const score = Number(responses[question.id]?.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      continue;
    }

    totalWeighted += score * question.weight;
    totalWeight += question.weight;
    const current = categoryMap.get(question.category) ?? { weighted: 0, weight: 0 };
    current.weighted += score * question.weight;
    current.weight += question.weight;
    categoryMap.set(question.category, current);
  }

  return {
    total: totalWeight ? Math.round((totalWeighted / totalWeight) * 100) / 100 : null,
    categories: Array.from(categoryMap.entries()).map(([category, value]) => ({
      category,
      score: Math.round((value.weighted / value.weight) * 100) / 100
    }))
  };
}

function buildResponseForm(questions: ScorecardQuestion[], scorecard?: InterviewScorecard): ResponseForm {
  return Object.fromEntries(
    questions.map((question) => {
      const response = scorecard?.responses.find((item) => item.question_id === question.id);
      return [
        question.id,
        {
          score: response ? String(response.score) : "",
          observation: response?.observation ?? ""
        }
      ];
    })
  );
}

export function HrCandidateScorecardClient({
  workflowId,
  candidateId,
  interviews
}: {
  workflowId: string;
  candidateId: string;
  interviews: CandidateInterview[];
}) {
  const queryClient = useQueryClient();
  const [selectedInterviewId, setSelectedInterviewId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [responses, setResponses] = useState<ResponseForm>({});
  const [finalOpinion, setFinalOpinion] = useState<InterviewOpinion>("parcialmente_recomendado");
  const [humanOpinion, setHumanOpinion] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const query = useQuery({
    queryKey: ["hr", "candidate-scorecards", workflowId, candidateId],
    queryFn: async () => requestJson<ScorecardResponsePayload>(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/scorecards`),
    enabled: interviews.length > 0
  });

  const templates = query.data?.data.templates ?? emptyTemplates;
  const scorecards = query.data?.data.scorecards ?? emptyScorecards;
  const selectedInterview = interviews.find((interview) => interview.id === selectedInterviewId) ?? interviews[0] ?? null;
  const existingScorecard = selectedInterview ? scorecards.find((scorecard) => scorecard.interview_id === selectedInterview.id) : undefined;
  const selectedInterviewKey = selectedInterview?.id ?? "";
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const liveScore = useMemo(
    () => calculateLiveScore(selectedTemplate?.questions ?? [], responses),
    [responses, selectedTemplate?.questions]
  );

  useEffect(() => {
    if (!selectedInterviewId && interviews.length) {
      setSelectedInterviewId(interviews[0].id);
    }
  }, [interviews, selectedInterviewId]);

  useEffect(() => {
    if (!templates.length || !selectedInterviewKey) {
      return;
    }

    const scorecard = scorecards.find((item) => item.interview_id === selectedInterviewKey);
    const nextTemplateId = scorecard?.template_id ?? templates[0].id;
    const nextTemplate = templates.find((template) => template.id === nextTemplateId) ?? templates[0];
    setSelectedTemplateId(nextTemplate.id);
    setFinalOpinion(scorecard?.final_opinion ?? "parcialmente_recomendado");
    setHumanOpinion(scorecard?.human_opinion ?? "");
    setResponses(buildResponseForm(nextTemplate.questions, scorecard));
    setSavedMessage("");
  }, [scorecards, selectedInterviewKey, templates]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedInterview || !selectedTemplate) {
        throw new Error("Selecione uma entrevista e um roteiro de avaliacao.");
      }

      return requestJson(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/scorecards`, {
        method: "POST",
        body: JSON.stringify({
          interview_id: selectedInterview.id,
          template_id: selectedTemplate.id,
          final_opinion: finalOpinion,
          human_opinion: humanOpinion || null,
          responses: selectedTemplate.questions
            .filter((question) => responses[question.id]?.score)
            .map((question) => ({
              question_id: question.id,
              score: Number(responses[question.id]?.score),
              observation: responses[question.id]?.observation || null
            }))
        })
      });
    },
    onSuccess: async () => {
      setSavedMessage("Roteiro de avaliacao salvo. A decisao permanece humana.");
      await queryClient.invalidateQueries({ queryKey: ["hr", "candidate-scorecards", workflowId, candidateId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "candidate-detail", workflowId, candidateId] });
    }
  });

  function updateResponse(questionId: string, value: Partial<ResponseForm[string]>) {
    setSavedMessage("");
    mutation.reset();
    setResponses((current) => ({
      ...current,
      [questionId]: {
        score: current[questionId]?.score ?? "",
        observation: current[questionId]?.observation ?? "",
        ...value
      }
    }));
  }

  function changeTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setSelectedTemplateId(template.id);
    setResponses(buildResponseForm(template.questions, existingScorecard?.template_id === template.id ? existingScorecard : undefined));
    setSavedMessage("");
    mutation.reset();
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (!interviews.length) {
    return (
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Roteiro de avaliacao da entrevista</h2>
        </div>
        <EmptyState title="Sem entrevista para avaliar" description="Registre uma entrevista antes de preencher o roteiro de avaliacao." />
      </Card>
    );
  }

  if (query.isLoading) {
    return <LoadingTable label="Carregando roteiros de avaliacao..." />;
  }

  if (query.error) {
    return <ErrorMessage message={query.error instanceof Error ? query.error.message : "Erro ao carregar roteiros de avaliacao."} />;
  }

  if (!templates.length) {
    return (
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Roteiro de avaliacao da entrevista</h2>
        </div>
        <EmptyState title="Sem modelos ativos" description="Nao ha roteiros de avaliacao ativos para esta unidade." />
      </Card>
    );
  }

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Roteiro de avaliacao da entrevista</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Notas estruturadas de 1 a 5, calculadas apenas para apoio operacional.</p>
        </div>
        {existingScorecard ? <StatusBadge status="success" label={`Salvo em ${formatDateTime(existingScorecard.evaluated_at)}`} /> : null}
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Entrevista">
            <SelectField
              value={selectedInterview?.id ?? ""}
              onChange={(event) => {
                setSelectedInterviewId(event.target.value);
                mutation.reset();
              }}
            >
              {interviews.map((interview) => (
                <option key={interview.id} value={interview.id}>
                  {formatDateTime(interview.interview_at)} - {interviewOpinionLabel(interview.final_opinion)}
                </option>
              ))}
            </SelectField>
          </Field>

          <Field label="Modelo">
            <SelectField value={selectedTemplate?.id ?? ""} onChange={(event) => changeTemplate(event.target.value)}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-3">
            {selectedTemplate?.questions.map((question) => (
              <div key={question.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{question.question_text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {question.category} | Peso {question.weight.toFixed(2)} {question.is_required ? "| Obrigatoria" : "| Opcional"}
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <SelectField value={responses[question.id]?.score ?? ""} onChange={(event) => updateResponse(question.id, { score: event.target.value })}>
                      {scoreLabels.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
                <div className="mt-3">
                  <TextArea
                    value={responses[question.id]?.observation ?? ""}
                    onChange={(event) => updateResponse(question.id, { observation: event.target.value })}
                    maxLength={1000}
                    placeholder="Observacao opcional, sem dados sensiveis."
                  />
                </div>
              </div>
            ))}
          </div>

          <aside className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Resultado</h3>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">Nota final</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{liveScore.total === null ? "-" : liveScore.total.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              {liveScore.categories.length ? (
                liveScore.categories.map((item) => (
                  <div key={item.category} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                    <span className="min-w-0 break-words text-muted-foreground">{item.category}</span>
                    <strong className="text-foreground">{item.score.toFixed(2)}</strong>
                  </div>
                ))
              ) : (
                <p className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">Preencha as notas para calcular a avaliacao.</p>
              )}
            </div>
            <Field label="Parecer final humano">
              <SelectField value={finalOpinion} onChange={(event) => setFinalOpinion(event.target.value as InterviewOpinion)}>
                {interviewOpinionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Parecer humano">
              <TextArea value={humanOpinion} onChange={(event) => setHumanOpinion(event.target.value)} maxLength={2000} placeholder="Parecer humano da entrevista." />
            </Field>
            <div className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              A nota nao aprova, reprova, ranqueia ou substitui avaliacao humana.
            </div>
          </aside>
        </div>

        {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar o roteiro de avaliacao."} /> : null}
        {savedMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{savedMessage}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            <Save className="h-4 w-4" />
            Salvar avaliacao
          </Button>
        </div>
      </form>
    </Card>
  );
}
