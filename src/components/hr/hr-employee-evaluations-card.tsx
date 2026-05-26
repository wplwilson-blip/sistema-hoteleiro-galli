"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, Edit3, MessageSquare, Save, Star, Target, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
      isRequired: boolean;
      isCritical: boolean;
      requiresCommentBelowScore: boolean;
      commentRequiredScoreThreshold: number | null;
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
  feedbackDate?: string;
  summary?: string;
  strengths?: string;
  developmentPoints?: string;
  employeeComments?: string;
  employeeAcknowledgedAt?: string;
  closedAt?: string;
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

function nowIso() {
  return new Date().toISOString();
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    in_progress: "Em andamento",
    submitted: "Pronta para devolutiva",
    reviewed: "Revisada",
    feedback_given: "Devolutiva registrada",
    acknowledged: "Ciência registrada",
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

type TemplateCriterion = NonNullable<EvaluationTemplate["sections"]>[number]["criteria"][number];

function parseScore(value: string) {
  if (value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function formatScore(value: number | null | undefined) {
  return value == null ? "-" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function commentThreshold(criterion: TemplateCriterion) {
  if (criterion.commentRequiredScoreThreshold != null) return criterion.commentRequiredScoreThreshold;
  return null;
}

function needsLowScoreComment(criterion: TemplateCriterion, current: ScoreForm[string]) {
  if (current.isNotApplicable) return false;
  const score = parseScore(current.score);
  const threshold = commentThreshold(criterion);
  const requiredByCritical = criterion.isCritical && score != null && score < 3;
  const requiredByTemplate = Boolean(criterion.requiresCommentBelowScore && threshold != null && score != null && score <= threshold);
  return Boolean((requiredByCritical || requiredByTemplate) && !current.comment.trim());
}

function resultLabel(score: number | null) {
  if (score == null) return "Sem nota";
  if (score >= 4.5) return "Destaque";
  if (score >= 3.5) return "Adequado";
  if (score >= 2.5) return "Acompanhar";
  return "Crítico";
}

function resultTone(score: number | null) {
  if (score == null) return "warning" as const;
  if (score >= 3.5) return "success" as const;
  if (score >= 2.5) return "warning" as const;
  return "danger" as const;
}

function buildScoreSummary(template: EvaluationTemplate | null, scoreForm: ScoreForm) {
  const criteria = (template?.sections ?? []).flatMap((section) => section.criteria);
  let filled = 0;
  let notApplicable = 0;
  let lowScores = 0;
  let criticalLowScores = 0;
  let weightedSum = 0;
  let weightSum = 0;
  let simpleSum = 0;
  let simpleCount = 0;
  const missingComments: string[] = [];
  const missingScores: string[] = [];

  for (const criterion of criteria) {
    const current = scoreForm[criterion.id] ?? { score: "", isNotApplicable: false, comment: "" };
    const score = parseScore(current.score);
    if (current.isNotApplicable) {
      filled += 1;
      notApplicable += 1;
      continue;
    }
    if (score == null) {
      if (criterion.isRequired !== false) missingScores.push(criterion.title);
      continue;
    }
    filled += 1;
    simpleSum += score;
    simpleCount += 1;
    const weight = Math.max(Number(criterion.weight ?? 0), 0);
    weightedSum += score * weight;
    weightSum += weight;
    if (score < 3.5) lowScores += 1;
    if (criterion.isCritical && score < 3.5) criticalLowScores += 1;
    if (needsLowScoreComment(criterion, current)) missingComments.push(criterion.title);
  }

  const weightedScore = weightSum > 0 ? weightedSum / weightSum : simpleCount ? simpleSum / simpleCount : null;
  const criticalCount = criteria.filter((criterion) => criterion.isCritical).length;

  return {
    total: criteria.length,
    filled,
    notApplicable,
    criticalCount,
    lowScores,
    criticalLowScores,
    missingComments,
    missingScores,
    weightedScore: weightedScore == null ? null : Number(weightedScore.toFixed(2)),
    label: resultLabel(weightedScore)
  };
}

function isEvaluationLocked(status: string) {
  return ["closed", "cancelled"].includes(status);
}

function buildOperationalPendencies(scoreSummary: ReturnType<typeof buildScoreSummary>, textForm: { summary: string; feedbackDate: string }, status: string) {
  const pendencies: string[] = [];
  if (scoreSummary.missingScores.length) pendencies.push(`Critérios obrigatórios sem nota: ${scoreSummary.missingScores.slice(0, 4).join(", ")}.`);
  if (scoreSummary.missingComments.length) pendencies.push(`Comentários obrigatórios pendentes: ${scoreSummary.missingComments.slice(0, 4).join(", ")}.`);
  if (["submitted", "feedback_given", "acknowledged"].includes(status) && !textForm.summary.trim()) pendencies.push("Resumo da devolutiva não preenchido.");
  if (["submitted", "feedback_given", "acknowledged"].includes(status) && !textForm.feedbackDate) pendencies.push("Data da devolutiva não preenchida.");
  return pendencies;
}

function buildHistorySummary(evaluations: Evaluation[]) {
  const scored = evaluations.filter((evaluation) => evaluation.weightedScore != null || evaluation.totalScore != null);
  const scoreSum = scored.reduce((sum, evaluation) => sum + Number(evaluation.weightedScore ?? evaluation.totalScore ?? 0), 0);
  return {
    total: evaluations.length,
    scored: scored.length,
    open: evaluations.filter((evaluation) => !["closed", "acknowledged", "cancelled"].includes(evaluation.status)).length,
    average: scored.length ? Number((scoreSum / scored.length).toFixed(2)) : null
  };
}

export function HrEmployeeEvaluationsCard({
  employeeId,
  initialEvaluationId,
  onOpenDevelopment
}: {
  employeeId: string;
  initialEvaluationId?: string | null;
  onOpenDevelopment?: () => void;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(initialEvaluationId ?? null);
  const [createForm, setCreateForm] = useState({
    templateId: "",
    periodStart: "",
    periodEnd: "",
    evaluationDate: todayIso(),
    status: "draft"
  });
  const [textForm, setTextForm] = useState({ summary: "", strengths: "", developmentPoints: "", employeeComments: "", feedbackDate: "", status: "draft" });
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

  const evaluations = useMemo(() => evaluationsQuery.data?.data ?? [], [evaluationsQuery.data?.data]);
  const selectedEvaluation = useMemo(
    () => evaluations.find((evaluation) => evaluation.id === selectedEvaluationId) ?? evaluations[0] ?? null,
    [evaluations, selectedEvaluationId]
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
  const historySummary = useMemo(() => buildHistorySummary(evaluations), [evaluations]);
  const scoreSummary = useMemo(() => buildScoreSummary(template, scoreForm), [scoreForm, template]);
  const savedScore = detail?.weightedScore ?? detail?.totalScore ?? null;
  const displayedScore = scoreSummary.weightedScore ?? savedScore;
  const isLocked = Boolean(detail && isEvaluationLocked(detail.status));
  const operationalPendencies = useMemo(() => buildOperationalPendencies(scoreSummary, textForm, detail?.status ?? "draft"), [detail?.status, scoreSummary, textForm]);

  useEffect(() => {
    if (initialEvaluationId) {
      setSelectedEvaluationId(initialEvaluationId);
    }
  }, [initialEvaluationId]);

  useEffect(() => {
    if (!detail || detail.redacted) return;

    setTextForm({
      summary: detail.summary ?? "",
      strengths: detail.strengths ?? "",
      developmentPoints: detail.developmentPoints ?? "",
      employeeComments: detail.employeeComments ?? "",
      feedbackDate: detail.feedbackDate ?? "",
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

  const statusMutation = useMutation({
    mutationFn: async (payload: Partial<typeof textForm> & { status: string; employeeAcknowledgedAt?: string; closedAt?: string }) =>
      requestJson(`/api/hr/employee-evaluations/${detail?.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...textForm, ...payload })
      }),
    onSuccess: refreshEvaluations
  });

  const scoresMutation = useMutation({
    mutationFn: async () => {
      if (scoreSummary.missingComments.length) {
        throw new Error("Preencha o comentário das notas baixas em critérios críticos antes de salvar.");
      }
      if (isLocked) {
        throw new Error("Avaliação encerrada não permite alterar notas.");
      }
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
      feedbackDate: evaluation.feedbackDate ?? "",
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

  const hasScorePendencies = scoreSummary.missingScores.length > 0 || scoreSummary.missingComments.length > 0;
  const canMarkReady = Boolean(detail && ["draft", "in_progress"].includes(detail.status) && !hasScorePendencies && !isLocked);
  const canRegisterFeedback = Boolean(detail && ["submitted", "reviewed"].includes(detail.status) && !hasScorePendencies && textForm.summary.trim());
  const canRegisterAcknowledgement = Boolean(detail && detail.status === "feedback_given");
  const canCloseEvaluation = Boolean(detail && detail.status === "acknowledged");

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
        {statusMutation.error ? <ErrorMessage message={statusMutation.error instanceof Error ? statusMutation.error.message : "Não foi possível avançar a avaliação."} /> : null}
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

        {evaluations.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ClipboardList className="h-4 w-4 text-primary" />
                Histórico
              </div>
              <p className="mt-2 text-2xl font-semibold">{historySummary.total}</p>
              <p className="text-xs text-muted-foreground">{historySummary.open} em acompanhamento</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Média histórica
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatScore(historySummary.average)}</p>
              <p className="text-xs text-muted-foreground">{historySummary.scored} avaliação(ões) com nota</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                Leitura rápida
              </div>
              <p className="mt-2 text-sm font-semibold">{historySummary.average == null ? "Sem média salva" : resultLabel(historySummary.average)}</p>
              <p className="text-xs text-muted-foreground">A avaliação apoia decisão humana do gestor e do RH.</p>
            </div>
          </div>
        ) : null}

        {evaluations.length ? (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2">
              {evaluations.map((evaluation) => (
                <button
                  key={evaluation.id}
                  type="button"
                  onClick={() => selectEvaluation(evaluation)}
                  className={cn(
                    "w-full rounded-md border bg-background p-3 text-left hover:bg-muted/30",
                    selectedEvaluation?.id === evaluation.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : null
                  )}
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
                    <StatusBadge status={resultTone(displayedScore)} label={`Nota ${formatScore(displayedScore)}`} />
                  </div>

                  {template ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Preenchimento
                        </div>
                        <p className="mt-2 text-xl font-semibold">
                          {scoreSummary.filled}/{scoreSummary.total}
                        </p>
                        <p className="text-xs text-muted-foreground">{scoreSummary.notApplicable} marcado(s) como N/A</p>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Star className="h-4 w-4 text-primary" />
                          Resultado parcial
                        </div>
                        <p className="mt-2 text-xl font-semibold">{formatScore(scoreSummary.weightedScore ?? savedScore)}</p>
                        <StatusBadge status={resultTone(scoreSummary.weightedScore ?? savedScore)} label={scoreSummary.weightedScore == null ? resultLabel(savedScore) : scoreSummary.label} />
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <AlertTriangle className="h-4 w-4 text-primary" />
                          Pontos de atenção
                        </div>
                        <p className="mt-2 text-xl font-semibold">{scoreSummary.lowScores}</p>
                        <p className="text-xs text-muted-foreground">{scoreSummary.criticalLowScores} crítico(s) abaixo de 3,5</p>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          Comentários pendentes
                        </div>
                        <p className="mt-2 text-xl font-semibold">{scoreSummary.missingComments.length}</p>
                        <p className="text-xs text-muted-foreground">Obrigatórios em nota baixa crítica</p>
                      </div>
                    </div>
                  ) : null}

                  {scoreSummary.missingComments.length ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      Preencha comentário para: {scoreSummary.missingComments.slice(0, 4).join(", ")}
                      {scoreSummary.missingComments.length > 4 ? "..." : ""}.
                    </div>
                  ) : null}

                  {operationalPendencies.length ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900">
                      <p className="font-medium">Pendências antes de avançar</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {operationalPendencies.map((pendency) => (
                          <li key={pendency}>{pendency}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {isLocked ? (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                      Avaliação encerrada. As notas e critérios ficam bloqueados para edição operacional; o PDI continua em acompanhamento separado.
                    </div>
                  ) : (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => statusMutation.mutate({ status: "submitted" })} disabled={!canMarkReady || statusMutation.isPending}>
                          Marcar como pronta
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => statusMutation.mutate({ status: "feedback_given", feedbackDate: textForm.feedbackDate || todayIso() })}
                          disabled={!canRegisterFeedback || statusMutation.isPending}
                        >
                          Registrar devolutiva
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => statusMutation.mutate({ status: "acknowledged", employeeAcknowledgedAt: nowIso() })}
                          disabled={!canRegisterAcknowledgement || statusMutation.isPending}
                        >
                          Registrar ciência
                        </Button>
                        <Button type="button" size="sm" onClick={() => statusMutation.mutate({ status: "closed", closedAt: nowIso() })} disabled={!canCloseEvaluation || statusMutation.isPending}>
                          Concluir avaliação
                        </Button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Ciência significa que o colaborador tomou conhecimento, não que concorda com o conteúdo. Conclusão não gera promoção, punição ou desligamento automático.
                      </p>
                    </div>
                  )}

                  {onOpenDevelopment && scoreSummary.lowScores > 0 ? (
                    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>Há pontos de atenção. Depois da devolutiva, o RH pode abrir um PDI vinculado a esta avaliação.</span>
                      <Button type="button" variant="outline" size="sm" onClick={onOpenDevelopment}>
                        Criar PDI
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Data da devolutiva">
                      <Input
                        type="date"
                        value={textForm.feedbackDate}
                        disabled={isLocked}
                        onChange={(event) => setTextForm((current) => ({ ...current, feedbackDate: event.target.value }))}
                      />
                    </Field>
                    <Field label="Resumo da devolutiva">
                      <TextArea value={textForm.summary} disabled={isLocked} onChange={(event) => setTextForm((current) => ({ ...current, summary: event.target.value }))} maxLength={5000} />
                    </Field>
                    <Field label="Pontos fortes">
                      <TextArea value={textForm.strengths} disabled={isLocked} onChange={(event) => setTextForm((current) => ({ ...current, strengths: event.target.value }))} maxLength={5000} />
                    </Field>
                    <Field label="Pontos a desenvolver">
                      <TextArea
                        value={textForm.developmentPoints}
                        disabled={isLocked}
                        onChange={(event) => setTextForm((current) => ({ ...current, developmentPoints: event.target.value }))}
                        maxLength={5000}
                      />
                    </Field>
                    <Field label="Comentário do colaborador">
                      <TextArea
                        value={textForm.employeeComments}
                        disabled={isLocked}
                        onChange={(event) => setTextForm((current) => ({ ...current, employeeComments: event.target.value }))}
                        maxLength={5000}
                      />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || isLocked}>
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
                              const currentScore = parseScore(current.score);
                              const hasLowScore = !current.isNotApplicable && currentScore != null && currentScore < 3.5;
                              const missingRequiredComment = needsLowScoreComment(criterion, current);
                              const threshold = commentThreshold(criterion);
                              return (
                                <div
                                  key={criterion.id}
                                  className={cn(
                                    "rounded-md border bg-background p-3",
                                    criterion.isCritical ? "border-amber-300 bg-amber-50/40" : null,
                                    missingRequiredComment ? "border-destructive bg-destructive/5" : null
                                  )}
                                >
                                  <div className="flex flex-wrap items-start gap-2">
                                    <p className="min-w-0 flex-1 break-words text-sm font-medium">{criterion.title}</p>
                                    {criterion.isCritical ? <StatusBadge status={hasLowScore ? "danger" : "warning"} label="Crítico" /> : null}
                                    {criterion.weight > 1 ? <StatusBadge status="info" label={`Peso ${criterion.weight}`} /> : null}
                                    {threshold != null && criterion.requiresCommentBelowScore ? <StatusBadge status="visual" label={`Comentário até nota ${threshold}`} /> : null}
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
                                        disabled={current.isNotApplicable || isLocked}
                                        onChange={(event) =>
                                          setScoreForm((form) => ({ ...form, [criterion.id]: { ...current, score: event.target.value } }))
                                        }
                                      />
                                    </Field>
                                    <label className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={current.isNotApplicable}
                                        disabled={isLocked}
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
                                        disabled={isLocked}
                                        onChange={(event) =>
                                          setScoreForm((form) => ({ ...form, [criterion.id]: { ...current, comment: event.target.value } }))
                                        }
                                      />
                                      {missingRequiredComment ? <p className="mt-1 text-xs text-destructive">Comentário obrigatório para esta nota.</p> : null}
                                    </Field>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end">
                        <Button type="button" onClick={() => scoresMutation.mutate()} disabled={scoresMutation.isPending || scoreSummary.missingComments.length > 0 || isLocked}>
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
