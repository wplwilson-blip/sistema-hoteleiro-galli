"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, ClipboardCheck, History, Phone, Save, ShieldAlert, Star, UserRound } from "lucide-react";
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

export function HrCandidateDetailClient({ workflowId, candidateId }: { workflowId: string; candidateId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CandidateEditForm | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

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
    mutation.reset();
    setForm((current) => (current ? { ...current, ...next } : current));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form) mutation.mutate(form);
  }

  return (
    <div className="space-y-5">
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
                Candidatos
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/rh/workflows/${workflowId}`}>Vaga</Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Dados basicos</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
      </div>

      <HrCandidateResumeCard workflowId={workflowId} candidateId={candidateId} />

      <HrCandidateAdmissionConversionCard workflowId={workflowId} candidate={candidate} admissionConversion={admissionConversion} />

      <HrInterviewFormClient workflowId={workflowId} candidateId={candidateId} />

      <HrCandidateScorecardClient workflowId={workflowId} candidateId={candidateId} interviews={interviews} />

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
