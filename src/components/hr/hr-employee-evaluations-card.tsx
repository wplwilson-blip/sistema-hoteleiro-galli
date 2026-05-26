"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Edit3, Save, Star } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EvaluationTemplate = {
  id: string;
  name: string;
  code: string;
  evaluationType: string;
  scaleMin: number;
  scaleMax: number;
  sections?: Array<{
    id: string;
    title: string;
    criteria: Array<{
      id: string;
      title: string;
      description: string;
      expectedBehavior: string;
      weight: number;
      isCritical: boolean;
    }>;
  }>;
};

type Evaluation = {
  id: string;
  employeeId: string;
  templateId: string;
  templateName: string;
  periodStart: string;
  periodEnd: string;
  evaluationDate: string;
  evaluationType: string;
  status: string;
  totalScore: number | null;
  weightedScore: number | null;
  resultLabel: string;
  resultLevel: string;
  summary?: string;
  strengths?: string;
  developmentPoints?: string;
  employeeComments?: string;
  redacted: boolean;
  scores?: Array<{
    id: string;
    criterionId: string;
    sectionId: string;
    score: number | null;
    isNotApplicable: boolean;
    comment: string;
  }>;
};

type ListResponse<T> = { ok: true; data: T[] };
type DetailResponse<T> = { ok: true; data: T };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Não foi possível atualizar avaliações.");
  return payload as T;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    in_progress: "Em andamento",
    submitted: "Enviada",
    reviewed: "Revisada",
    feedback_given: "Devolutiva registrada",
    acknowledged: "Ciencia registrada",
    closed: "Encerrada",
    cancelled: "Cancelada"
  };
  return labels[status] ?? status;
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    experience: "Experiência",
    periodic: "Periódica",
    promotion: "Promoção",
    corrective: "Corretiva",
    specific: "Específica"
  };
  return labels[type] ?? type;
}

function statusTone(status: string) {
  if (status === "closed" || status === "acknowledged") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  if (status === "submitted" || status === "reviewed" || status === "feedback_given") return "info" as const;
  return "warning" as const;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

type ScoreForm = Record<string, { score: string; isNotApplicable: boolean; comment: string }>;

export function HrEmployeeEvaluationsCard({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    templateId: "",
    periodStart: "",
    periodEnd: "",
    evaluationDate: todayIso(),
    status: "draft"
  });
  const [textForm, setTextForm] = useState({ summary: "", strengths: "", developmentPoints: "", employeeComments: "", status: "draft" });
  const [scoreForm, setScoreForm] = useState<ScoreForm>({});

  const evaluationsQuery = useQuery({
    queryKey: ["hr", "employee-evaluations", employeeId],
    queryFn: async () => requestJson<ListResponse<Evaluation>>(`/api/hr/employee-evaluations?employeeId=${employeeId}&pageSize=50`)
  });

  const templatesQuery = useQuery({
    queryKey: ["hr", "evaluation-templates", "active"],
    queryFn: async () => requestJson<ListResponse<EvaluationTemplate>>("/api/hr/evaluation-templates?status=active"),
    enabled: showCreate
  });

  const selectedEvaluation = useMemo(
    () => evaluationsQuery.data?.data.find((evaluation) => evaluation.id === selectedEvaluationId) ?? evaluationsQuery.data?.data[0] ?? null,
    [evaluationsQuery.data?.data, selectedEvaluationId]
  );

  const detailQuery = useQuery({
    queryKey: ["hr", "employee-evaluations", selectedEvaluation?.id],
    queryFn: async () => requestJson<DetailResponse<Evaluation>>(`/api/hr/employee-evaluations/${selectedEvaluation?.id}`),
    enabled: Boolean(selectedEvaluation?.id)
  });

  const templateDetailQuery = useQuery({
    queryKey: ["hr", "evaluation-template-detail", detailQuery.data?.data.templateId],
    queryFn: async () => requestJson<DetailResponse<EvaluationTemplate>>(`/api/hr/evaluation-templates/${detailQuery.data?.data.templateId}`),
    enabled: Boolean(detailQuery.data?.data.templateId && !detailQuery.data?.data.redacted)
  });

  const detail = detailQuery.data?.data ?? null;
  const template = templateDetailQuery.data?.data ?? null;

  useEffect(() => {
    if (!detail || detail.redacted) return;

    setTextForm({
      summary: detail.summary ?? "",
      strengths: detail.strengths ?? "",
      developmentPoints: detail.developmentPoints ?? "",
      employeeComments: detail.employeeComments ?? "",
      status: detail.status
    });

    const nextScores: ScoreForm = {};
    for (const score of detail.scores ?? []) {
      nextScores[score.criterionId] = {
        score: score.score == null ? "" : String(score.score),
        isNotApplicable: score.isNotApplicable,
        comment: score.comment ?? ""
      };
    }
    setScoreForm(nextScores);
  }, [detail]);

  function refreshEvaluations() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hr", "employee-evaluations", employeeId] }),
      queryClient.invalidateQueries({ queryKey: ["hr", "employee-evaluations", selectedEvaluation?.id] })
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      requestJson<DetailResponse<Evaluation>>("/api/hr/employee-evaluations", {
        method: "POST",
        body: JSON.stringify({ ...createForm, employeeId: employeeId })
      }),
    onSuccess: async (payload) => {
      setShowCreate(false);
      setSelectedEvaluationId(payload.data.id);
      await refreshEvaluations();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () =>
      requestJson(`/api/hr/employee-evaluations/${detail?.id}`, {
        method: "PATCH",
        body: JSON.stringify(textForm)
      }),
    onSuccess: refreshEvaluations
  });

  const scoresMutation = useMutation({
    mutationFn: async () => {
      const scores = (template?.sections ?? []).flatMap((section) =>
        section.criteria.map((criterion) => {
          const current = scoreForm[criterion.id] ?? { score: "", isNotApplicable: false, comment: "" };
          return {
            criterionId: criterion.id,
            sectionId: section.id,
            score: current.isNotApplicable || current.score === "" ? undefined : Number(current.score),
            isNotApplicable: current.isNotApplicable,
            comment: current.comment
          };
        })
      );
      return requestJson(`/api/hr/employee-evaluations/${detail?.id}/scores`, {
        method: "PATCH",
        body: JSON.stringify({ scores })
      });
    },
    onSuccess: refreshEvaluations
  });

  function selectEvaluation(evaluation: Evaluation) {
    setSelectedEvaluationId(evaluation.id);
    setTextForm({
      summary: evaluation.summary ?? "",
      strengths: evaluation.strengths ?? "",
      developmentPoints: evaluation.developmentPoints ?? "",
      employeeComments: evaluation.employeeComments ?? "",
      status: evaluation.status
    });
    const nextScores: ScoreForm = {};
    for (const score of evaluation.scores ?? []) {
      nextScores[score.criterionId] = {
        score: score.score == null ? "" : String(score.score),
        isNotApplicable: score.isNotApplicable,
        comment: score.comment ?? ""
      };
    }
    setScoreForm(nextScores);
  }

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Avaliações</h3>
              <StatusBadge status="visual" label="Decisão humana" />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Registre desempenho, devolutiva e pontos de desenvolvimento. Avaliações não geram promoção ou punição automática.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setShowCreate((current) => !current)}>
            <Edit3 className="h-4 w-4" />
            Nova avaliação
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {evaluationsQuery.isLoading ? <LoadingTable label="Carregando avaliações..." /> : null}
        {evaluationsQuery.error ? <ErrorMessage message={evaluationsQuery.error instanceof Error ? evaluationsQuery.error.message : "Não foi possível carregar avaliações."} /> : null}
        {createMutation.error ? <ErrorMessage message={createMutation.error instanceof Error ? createMutation.error.message : "Não foi possível criar avaliação."} /> : null}
        {updateMutation.error ? <ErrorMessage message={updateMutation.error instanceof Error ? updateMutation.error.message : "Não foi possível salvar avaliação."} /> : null}
        {scoresMutation.error ? <ErrorMessage message={scoresMutation.error instanceof Error ? scoresMutation.error.message : "Não foi possível salvar notas."} /> : null}

        {showCreate ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
            className="rounded-md border bg-muted/25 p-4"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Modelo">
                <SelectField
                  value={createForm.templateId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, templateId: event.target.value }))}
                  required
                  disabled={createMutation.isPending}
                >
                  <option value="">Selecione um modelo ativo</option>
                  {(templatesQuery.data?.data ?? []).map((templateOption) => (
                    <option key={templateOption.id} value={templateOption.id}>
                      {templateOption.name} - {typeLabel(templateOption.evaluationType)}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Periodo inicial">
                <Input type="date" value={createForm.periodStart} onChange={(event) => setCreateForm((current) => ({ ...current, periodStart: event.target.value }))} required />
              </Field>
              <Field label="Periodo final">
                <Input type="date" value={createForm.periodEnd} onChange={(event) => setCreateForm((current) => ({ ...current, periodEnd: event.target.value }))} required />
              </Field>
              <Field label="Data da avaliação">
                <Input type="date" value={createForm.evaluationDate} onChange={(event) => setCreateForm((current) => ({ ...current, evaluationDate: event.target.value }))} />
              </Field>
            </div>
            {!templatesQuery.isLoading && showCreate && !(templatesQuery.data?.data ?? []).length ? (
              <p className="mt-3 rounded-md border bg-background p-3 text-sm text-muted-foreground">
                Nenhum modelo ativo encontrado. Crie ou ative um modelo antes de aplicar avaliações.
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createMutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !createForm.templateId || !createForm.periodStart || !createForm.periodEnd}>
                Criar avaliação
              </Button>
            </div>
          </form>
        ) : null}

        {!evaluationsQuery.isLoading && !evaluationsQuery.error && !(evaluationsQuery.data?.data ?? []).length ? (
          <EmptyState
            title="Nenhuma avaliação registrada para este colaborador."
            description="Use avaliações para registrar desempenho, devolutiva e pontos de desenvolvimento. Avaliações não geram promoção ou punição automática."
          />
        ) : null}

        {(evaluationsQuery.data?.data ?? []).length ? (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2">
              {(evaluationsQuery.data?.data ?? []).map((evaluation) => (
                <button
                  key={evaluation.id}
                  type="button"
                  onClick={() => selectEvaluation(evaluation)}
                  className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold">{evaluation.templateName || typeLabel(evaluation.evaluationType)}</p>
                    <StatusBadge status={statusTone(evaluation.status)} label={statusLabel(evaluation.status)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(evaluation.periodStart)} a {formatDate(evaluation.periodEnd)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nota: {evaluation.weightedScore ?? evaluation.totalScore ?? "-"} {evaluation.resultLabel ? `| ${evaluation.resultLabel}` : ""}
                  </p>
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-md border bg-background p-4">
              {!detail ? <LoadingTable label="Carregando avaliação selecionada..." /> : null}
              {detail?.redacted ? (
                <EmptyState title="Avaliação protegida" description="Seu perfil pode ver o registro da avaliação, mas o conteúdo sensível está restrito." />
              ) : null}
              {detail && !detail.redacted ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold">{detail.templateName || "Avaliacao do colaborador"}</h4>
                    <StatusBadge status={statusTone(detail.status)} label={statusLabel(detail.status)} />
                    <StatusBadge status="info" label={`Nota ${detail.weightedScore ?? detail.totalScore ?? "-"}`} />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Resumo da devolutiva">
                      <TextArea value={textForm.summary} onChange={(event) => setTextForm((current) => ({ ...current, summary: event.target.value }))} maxLength={5000} />
                    </Field>
                    <Field label="Pontos fortes">
                      <TextArea value={textForm.strengths} onChange={(event) => setTextForm((current) => ({ ...current, strengths: event.target.value }))} maxLength={5000} />
                    </Field>
                    <Field label="Pontos a desenvolver">
                      <TextArea
                        value={textForm.developmentPoints}
                        onChange={(event) => setTextForm((current) => ({ ...current, developmentPoints: event.target.value }))}
                        maxLength={5000}
                      />
                    </Field>
                    <Field label="Comentário do colaborador">
                      <TextArea
                        value={textForm.employeeComments}
                        onChange={(event) => setTextForm((current) => ({ ...current, employeeComments: event.target.value }))}
                        maxLength={5000}
                      />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                      <Save className="h-4 w-4" />
                      Salvar devolutiva
                    </Button>
                  </div>

                  {templateDetailQuery.isLoading ? <LoadingTable label="Carregando critérios..." /> : null}
                  {template?.sections?.length ? (
                    <div className="space-y-3">
                      {template.sections.map((section) => (
                        <div key={section.id} className="rounded-md border bg-muted/20 p-3">
                          <h5 className="text-sm font-semibold">{section.title}</h5>
                          <div className="mt-3 space-y-3">
                            {section.criteria.map((criterion) => {
                              const current = scoreForm[criterion.id] ?? { score: "", isNotApplicable: false, comment: "" };
                              return (
                                <div key={criterion.id} className="rounded-md border bg-background p-3">
                                  <div className="flex flex-wrap items-start gap-2">
                                    <p className="min-w-0 flex-1 break-words text-sm font-medium">{criterion.title}</p>
                                    {criterion.isCritical ? <StatusBadge status="warning" label="Criterio critico" /> : null}
                                  </div>
                                  {criterion.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{criterion.description}</p> : null}
                                  <div className="mt-3 grid gap-3 md:grid-cols-[120px_120px_minmax(0,1fr)]">
                                    <Field label="Nota">
                                      <Input
                                        type="number"
                                        min={template.scaleMin}
                                        max={template.scaleMax}
                                        step="1"
                                        value={current.score}
                                        disabled={current.isNotApplicable}
                                        onChange={(event) =>
                                          setScoreForm((form) => ({ ...form, [criterion.id]: { ...current, score: event.target.value } }))
                                        }
                                      />
                                    </Field>
                                    <label className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={current.isNotApplicable}
                                        onChange={(event) =>
                                          setScoreForm((form) => ({
                                            ...form,
                                            [criterion.id]: { ...current, isNotApplicable: event.target.checked, score: event.target.checked ? "" : current.score }
                                          }))
                                        }
                                      />
                                      N/A
                                    </label>
                                    <Field label="Comentário">
                                      <Input
                                        value={current.comment}
                                        onChange={(event) =>
                                          setScoreForm((form) => ({ ...form, [criterion.id]: { ...current, comment: event.target.value } }))
                                        }
                                      />
                                    </Field>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <Button type="button" onClick={() => scoresMutation.mutate()} disabled={scoresMutation.isPending}>
                          <Save className="h-4 w-4" />
                          Salvar notas
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
