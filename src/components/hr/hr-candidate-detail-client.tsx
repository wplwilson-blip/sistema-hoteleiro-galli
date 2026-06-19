"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, Edit, History, Phone, Save, ShieldAlert, Star, UserRound, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HrInterviewFormClient } from "@/components/hr/hr-interview-form-client";
import { HrCandidateResumeCard } from "@/components/hr/hr-candidate-resume-card";
import { HrCandidateScorecardClient } from "@/components/hr/hr-candidate-scorecard-client";
import { HrCandidateAdmissionConversionCard } from "@/components/hr/hr-candidate-admission-conversion-card";
import { HrRecruitmentBreadcrumb, HrRecruitmentGuidance } from "@/components/hr/hr-recruitment-navigation";
import { HrRecruitmentTimeline, type HrRecruitmentStageKey } from "@/components/hr/hr-recruitment-timeline";
import {
  type Candidate,
  type CandidateAdmissionConversion,
  type CandidateInterview,
  type CandidateStatus,
  candidateStatusLabel,
  candidateStatusOptions,
  candidateStatusTone,
  formatDateTime,
  interviewOpinionLabel,
  requestJson
} from "@/components/hr/hr-candidate-shared";

type CandidateDetailResponse = {
  data: {
    candidate: Candidate;
    interviews: CandidateInterview[];
    admission_conversion: CandidateAdmissionConversion | null;
    workflow: {
      id: string;
      title: string;
      status: string;
    };
  };
};

type CandidateEditForm = {
  status: CandidateStatus;
  manual_score: string;
  human_opinion: string;
  notes: string;
};

const emptyInterviews: CandidateInterview[] = [];

function toForm(candidate: Candidate): CandidateEditForm {
  return {
    status: candidate.status,
    manual_score: candidate.manual_score === null ? "" : String(candidate.manual_score),
    human_opinion: candidate.human_opinion ?? "",
    notes: candidate.notes ?? ""
  };
}

function averageScore(interview: CandidateInterview) {
  const total =
    interview.communication_score +
    interview.posture_score +
    interview.experience_score +
    interview.availability_score +
    interview.hospitality_profile_score;
  return (total / 5).toFixed(1);
}

function candidateNextAction(candidate: Candidate, admissionConversion: CandidateAdmissionConversion | null) {
  if (admissionConversion) return "Acompanhe a admissao vinculada a este candidato aprovado.";
  if (candidate.status === "aprovado") return "Inicie a admissao ou acompanhe a conversao quando ela ja existir.";
  if (candidate.status === "banco_de_talentos") return "Mantenha o registro para consulta futura e volte para a vaga quando precisar comparar candidatos.";
  if (candidate.status === "reprovado") return "Confira o parecer registrado e volte para a lista de candidatos da vaga.";
  if (candidate.status === "desistiu") return "Confira o registro de encerramento e volte para a lista de candidatos da vaga.";
  return "Registre entrevista, scorecard e parecer humano antes de aprovar ou reprovar o candidato.";
}

function candidateTimelineStage(candidate: Candidate, admissionConversion: CandidateAdmissionConversion | null): HrRecruitmentStageKey {
  if (admissionConversion?.status === "completed") return "admission";
  if (candidate.status === "aprovado") return "candidate_approved";
  return "candidates";
}

export function HrCandidateDetailClient({ workflowId, candidateId }: { workflowId: string; candidateId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CandidateEditForm | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");
  const [isOpinionEditing, setIsOpinionEditing] = useState(false);

  const query = useQuery({
    queryKey: ["hr", "candidate-detail", workflowId, candidateId],
    queryFn: async () => requestJson<CandidateDetailResponse>(`/api/hr/workflows/${workflowId}/candidates/${candidateId}`)
  });

  const candidate = query.data?.data.candidate ?? null;
  const interviews = query.data?.data.interviews ?? emptyInterviews;
  const admissionConversion = query.data?.data.admission_conversion ?? null;

  useEffect(() => {
    if (candidate) {
      setForm(toForm(candidate));
      setIsOpinionEditing(!candidate.human_opinion && !candidate.notes && candidate.manual_score === null);
    }
  }, [candidate]);

  const mutation = useMutation({
    mutationFn: async (payload: CandidateEditForm) =>
      requestJson(`/api/hr/workflows/${workflowId}/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: payload.status,
          manual_score: payload.manual_score === "" ? null : Number(payload.manual_score),
          human_opinion: payload.human_opinion || null,
          notes: payload.notes || null
        })
      }),
    onSuccess: async () => {
      setSavedMessage("Candidato atualizado com decisao humana registrada.");
      setIsOpinionEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["hr", "candidate-detail", workflowId, candidateId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] });
    }
  });

  const decisionMutation = useMutation({
    mutationFn: async (payload: { status: CandidateStatus; human_opinion?: string | null }) =>
      requestJson(`/api/hr/workflows/${workflowId}/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: async (_response, payload) => {
      setDecisionMessage(`Decisao registrada: ${candidateStatusLabel(payload.status)}.`);
      await queryClient.invalidateQueries({ queryKey: ["hr", "candidate-detail", workflowId, candidateId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] });
    }
  });

  const historyItems = useMemo(() => {
    if (!candidate) return [];
    return [
      { id: "created", label: "Candidato cadastrado", when: candidate.created_at },
      { id: "status", label: `Status atual: ${candidateStatusLabel(candidate.status)}`, when: candidate.status_changed_at },
      ...interviews.map((interview) => ({
        id: interview.id,
        label: `Entrevista registrada: ${interviewOpinionLabel(interview.final_opinion)}`,
        when: interview.interview_at
      }))
    ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [candidate, interviews]);

  if (query.isLoading) {
    return <LoadingTable label="Carregando candidato..." />;
  }

  if (query.error) {
    return <ErrorMessage message={query.error instanceof Error ? query.error.message : "Erro ao carregar candidato."} />;
  }

  if (!candidate || !form) {
    return <EmptyState title="Candidato nao encontrado" description="O candidato nao existe ou esta fora do seu escopo de RH." />;
  }

  function updateForm(next: Partial<CandidateEditForm>) {
    setSavedMessage("");
    setDecisionMessage("");
    mutation.reset();
    decisionMutation.reset();
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form) mutation.mutate(form);
  }

  function decide(status: CandidateStatus, defaultOpinion: string, confirmationMessage: string) {
    if (!candidate) return;
    if (!window.confirm(confirmationMessage)) return;

    const currentOpinion = form?.human_opinion?.trim() || candidate.human_opinion?.trim() || "";
    setSavedMessage("");
    setDecisionMessage("");
    mutation.reset();
    decisionMutation.reset();
    decisionMutation.mutate({
      status,
      human_opinion: currentOpinion || defaultOpinion || null
    });
  }

  return (
    <div className="space-y-5">
      <HrRecruitmentBreadcrumb
        items={[
          { label: "Vagas", href: "/rh/vagas" },
          { label: "Detalhe da vaga", href: `/rh/workflows/${workflowId}` },
          { label: "Candidatos", href: `/rh/vagas/${workflowId}/candidatos` },
          { label: "Candidato" }
        ]}
      />
      <HrRecruitmentGuidance
        where="Voce esta avaliando um candidato vinculado a esta vaga."
        next={candidateNextAction(candidate, admissionConversion)}
      />
      <HrRecruitmentTimeline
        mode="candidate"
        currentStage={candidateTimelineStage(candidate, admissionConversion)}
        title="Jornada do candidato ate a admissao"
        description="Use esta leitura para saber se o candidato ainda esta em analise, ja foi aprovado ou ja iniciou admissao."
      />

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={candidateStatusTone(candidate.status)} label={candidateStatusLabel(candidate.status)} />
              <StatusBadge status="visual" label="Decisao humana" />
            </div>
            <h2 className="mt-2 break-words text-lg font-semibold text-foreground">{candidate.full_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Origem: {candidate.source}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/rh/vagas/${workflowId}/candidatos`}>
                <ArrowLeft className="h-4 w-4" />
                Voltar para candidatos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/rh/workflows/${workflowId}`}>Voltar para vaga</Link>
            </Button>
          </div>
        </div>
      </Card>

      {/*
        {false ? (
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Dados basicos</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Nome" value={candidate.full_name} />
            <InfoTile label="Origem" value={candidate.source} />
            <InfoTile label="Telefone" value={candidate.phone ?? "Restrito"} icon={Phone} />
            <InfoTile label="Nota manual" value={candidate.manual_score === null ? "Não informado" : String(candidate.manual_score)} icon={Star} />
          </div>
          {candidate.phone_redacted ? (
            <p className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Telefone oculto por permissao. Consulte apenas quando necessario para contato operacional.</p>
          ) : null}
        </Card>

        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Parecer e status</h2>
          </div>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Status">
              <SelectField value={form.status} onChange={(event) => updateForm({ status: event.target.value as CandidateStatus })}>
                {candidateStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Nota manual">
              <Input type="number" min={0} max={100} value={form.manual_score} onChange={(event) => updateForm({ manual_score: event.target.value })} placeholder="0 a 100" />
            </Field>
            <Field label="Parecer humano">
              <TextArea value={form.human_opinion} onChange={(event) => updateForm({ human_opinion: event.target.value })} maxLength={2000} placeholder="Parecer humano, sem dados sensiveis." />
            </Field>
            <Field label="Observacoes">
              <TextArea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={1000} placeholder="Contexto operacional breve." />
            </Field>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Nota e parecer são manuais. O sistema não aprova, reprova nem ranqueia automaticamente.
            </div>
            {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível atualizar o candidato."} /> : null}
            {savedMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{savedMessage}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                <Save className="h-4 w-4" />
                Salvar parecer
              </Button>
            </div>
          </form>
        </Card>
        ) : null}
      */}

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Dados basicos</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Nome" value={candidate.full_name} />
          <InfoTile label="Origem" value={candidate.source} />
          <InfoTile label="Telefone" value={candidate.phone ?? "Restrito"} icon={Phone} />
          <InfoTile label="Nota manual" value={candidate.manual_score === null ? "Nao informado" : String(candidate.manual_score)} icon={Star} />
        </div>
        {candidate.phone_redacted ? (
          <p className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Telefone oculto por permissao. Consulte apenas quando necessario para contato operacional.</p>
        ) : null}
      </Card>

      <HrCandidateResumeCard workflowId={workflowId} candidateId={candidateId} />

      <Card className="min-w-0 border-border/80 bg-muted/20 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Regras admissionais serao revisadas apos aprovacao do candidato, no fluxo de admissao/contratacao.
        </div>
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-start gap-2">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Roteiro da entrevista</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leia o roteiro antes de registrar a conversa. Ele orienta a entrevista e a avaliacao, mas a decisao final continua humana e vinculada a esta vaga.
            </p>
          </div>
        </div>
      </Card>

      <HrInterviewFormClient workflowId={workflowId} candidateId={candidateId} interviews={interviews} />

      <HrCandidateScorecardClient workflowId={workflowId} candidateId={candidateId} interviews={interviews} />

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Parecer e status</h2>
              {isOpinionEditing ? <StatusBadge status="warning" label="Em edicao" /> : <StatusBadge status="success" label="Salvo" />}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Parecer operacional da selecao. Nao substitui a decisao formal da vaga.</p>
          </div>
          {!isOpinionEditing ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setIsOpinionEditing(true)}>
              <Edit className="h-4 w-4" />
              Editar parecer
            </Button>
          ) : null}
        </div>

        {!isOpinionEditing ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile label="Status" value={candidateStatusLabel(candidate.status)} icon={ClipboardCheck} />
              <InfoTile label="Nota manual" value={candidate.manual_score === null ? "Nao informado" : String(candidate.manual_score)} icon={Star} />
              <InfoTile label="Atualizado em" value={formatDateTime(candidate.updated_at)} icon={CalendarClock} />
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">Parecer humano</p>
              <p className="mt-2 break-words text-sm text-foreground">{candidate.human_opinion || "Sem parecer registrado."}</p>
            </div>
            {candidate.notes ? (
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground">Observacoes</p>
                <p className="mt-2 break-words text-sm text-foreground">{candidate.notes}</p>
              </div>
            ) : null}
            {savedMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{savedMessage}</p> : null}
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Status">
              <SelectField value={form.status} onChange={(event) => updateForm({ status: event.target.value as CandidateStatus })}>
                {candidateStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Nota manual">
              <Input type="number" min={0} max={100} value={form.manual_score} onChange={(event) => updateForm({ manual_score: event.target.value })} placeholder="0 a 100" />
            </Field>
            <Field label="Parecer humano">
              <TextArea value={form.human_opinion} onChange={(event) => updateForm({ human_opinion: event.target.value })} maxLength={2000} placeholder="Parecer humano, sem dados sensiveis." />
            </Field>
            <Field label="Observacoes">
              <TextArea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={1000} placeholder="Contexto operacional breve." />
            </Field>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Nota e parecer sao manuais. O sistema nao aprova, reprova nem ranqueia automaticamente.
            </div>
            {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel atualizar o candidato."} /> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                <Save className="h-4 w-4" />
                Salvar parecer
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Decisao do candidato</h2>
              <StatusBadge status={candidateStatusTone(candidate.status)} label={candidateStatusLabel(candidate.status)} />
              {candidate.status === "aprovado" || candidate.status === "reprovado" || candidate.status === "banco_de_talentos" || candidate.status === "desistiu" ? (
                <StatusBadge status="success" label="Decisao registrada" />
              ) : (
                <StatusBadge status="warning" label="Pendente de decisao" />
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{candidateNextAction(candidate, admissionConversion)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A decisao abaixo atualiza somente o status do candidato nesta vaga e o parecer humano quando estiver vazio. Nao cria colaborador, admissao, documentos ou pendencias automaticamente.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button
              type="button"
              onClick={() => decide("aprovado", "Candidato aprovado para esta vaga.", "Confirmar aprovacao deste candidato para esta vaga?")}
              disabled={decisionMutation.isPending || candidate.status === "aprovado"}
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprovar para esta vaga
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => decide("banco_de_talentos", "Candidato apto para futura vaga.", "Confirmar envio deste candidato para banco de talentos?")}
              disabled={decisionMutation.isPending || candidate.status === "banco_de_talentos"}
            >
              <Archive className="h-4 w-4" />
              Banco de talentos
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => decide("reprovado", "Candidato nao avancou neste processo seletivo.", "Confirmar que este candidato nao avancara neste processo?")}
              disabled={decisionMutation.isPending || candidate.status === "reprovado"}
            >
              <XCircle className="h-4 w-4" />
              Nao avancar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => decide("reprovado", "Candidato nao recomendado para esta vaga.", "Confirmar marcacao deste candidato como nao recomendado?")}
              disabled={decisionMutation.isPending || candidate.status === "reprovado"}
            >
              <XCircle className="h-4 w-4" />
              Nao recomendado
            </Button>
          </div>
        </div>
        {candidate.human_opinion ? <p className="mt-3 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">Parecer atual: {candidate.human_opinion}</p> : null}
        {decisionMutation.error ? <ErrorMessage message={decisionMutation.error instanceof Error ? decisionMutation.error.message : "Nao foi possivel registrar a decisao."} /> : null}
        {decisionMessage ? <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{decisionMessage}</p> : null}
      </Card>

      <HrCandidateAdmissionConversionCard workflowId={workflowId} candidate={candidate} admissionConversion={admissionConversion} />

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Entrevistas</h2>
        </div>
        {interviews.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {interviews.map((interview) => (
              <article key={interview.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={interview.final_opinion === "nao_recomendado" ? "danger" : interview.final_opinion === "recomendado" ? "success" : "warning"} label={interviewOpinionLabel(interview.final_opinion)} />
                  <StatusBadge status="visual" label={`Média das avaliações ${averageScore(interview)}`} />
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{formatDateTime(interview.interview_at)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entrevistador: {interview.interviewer?.display_name || interview.interviewer?.username || "Usuário registrado"}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>Comunicação: {interview.communication_score}</p>
                  <p>Postura: {interview.posture_score}</p>
                  <p>Experiência: {interview.experience_score}</p>
                  <p>Disponibilidade: {interview.availability_score}</p>
                  <p>Perfil hotelaria: {interview.hospitality_profile_score}</p>
                </div>
                {interview.notes ? <p className="mt-3 break-words text-sm text-muted-foreground">{interview.notes}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem entrevistas" description="Registre a primeira entrevista quando houver conversa com o candidato." />
        )}
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Histórico simples</h2>
        </div>
        <div className="space-y-2">
          {historyItems.map((item) => (
            <div key={item.id} className="rounded-md border bg-background px-3 py-2 text-sm">
              <p className="font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(item.when)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InfoTile({ label, value, icon: Icon = UserRound }: { label: string; value: string; icon?: typeof UserRound }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
