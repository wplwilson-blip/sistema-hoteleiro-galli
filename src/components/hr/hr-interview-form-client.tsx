"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Save } from "lucide-react";
import { ErrorMessage, Field, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { interviewOpinionOptions, requestJson, type InterviewOpinion } from "@/components/hr/hr-candidate-shared";

type InterviewForm = {
  interview_at: string;
  communication_score: string;
  posture_score: string;
  experience_score: string;
  availability_score: string;
  hospitality_profile_score: string;
  final_opinion: InterviewOpinion;
  notes: string;
};

const scoreOptions = ["1", "2", "3", "4", "5"];

function nowForInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const initialForm: InterviewForm = {
  interview_at: nowForInput(),
  communication_score: "3",
  posture_score: "3",
  experience_score: "3",
  availability_score: "3",
  hospitality_profile_score: "3",
  final_opinion: "parcialmente_recomendado",
  notes: ""
};

export function HrInterviewFormClient({ workflowId, candidateId }: { workflowId: string; candidateId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<InterviewForm>(initialForm);
  const [savedMessage, setSavedMessage] = useState("");

  const mutation = useMutation({
    mutationFn: async (payload: InterviewForm) =>
      requestJson(`/api/hr/workflows/${workflowId}/candidates/${candidateId}/interviews`, {
        method: "POST",
        body: JSON.stringify({
          interview_at: payload.interview_at,
          communication_score: payload.communication_score,
          posture_score: payload.posture_score,
          experience_score: payload.experience_score,
          availability_score: payload.availability_score,
          hospitality_profile_score: payload.hospitality_profile_score,
          final_opinion: payload.final_opinion,
          notes: payload.notes || null
        })
      }),
    onSuccess: async () => {
      setSavedMessage("Entrevista registrada com parecer humano.");
      setForm({ ...initialForm, interview_at: nowForInput() });
      await queryClient.invalidateQueries({ queryKey: ["hr", "candidate-detail", workflowId, candidateId] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "job-opening-candidates"] });
    }
  });

  function updateForm(next: Partial<InterviewForm>) {
    setSavedMessage("");
    mutation.reset();
    setForm((current) => ({ ...current, ...next }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(form);
  }

  return (
    <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquarePlus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Registrar entrevista</h2>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Data da entrevista">
            <Input type="datetime-local" value={form.interview_at} onChange={(event) => updateForm({ interview_at: event.target.value })} required />
          </Field>
          <ScoreField label="Comunicação" value={form.communication_score} onChange={(value) => updateForm({ communication_score: value })} />
          <ScoreField label="Postura" value={form.posture_score} onChange={(value) => updateForm({ posture_score: value })} />
          <ScoreField label="Experiência" value={form.experience_score} onChange={(value) => updateForm({ experience_score: value })} />
          <ScoreField label="Disponibilidade" value={form.availability_score} onChange={(value) => updateForm({ availability_score: value })} />
          <ScoreField label="Perfil hotelaria" value={form.hospitality_profile_score} onChange={(value) => updateForm({ hospitality_profile_score: value })} />
          <Field label="Parecer final">
            <SelectField value={form.final_opinion} onChange={(event) => updateForm({ final_opinion: event.target.value as InterviewOpinion })}>
              {interviewOpinionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
        <Field label="Observacoes">
          <TextArea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={2000} placeholder="Parecer humano e contexto operacional, sem dados sensiveis." />
        </Field>
        {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível registrar a entrevista."} /> : null}
        {savedMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{savedMessage}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Save className="h-4 w-4 animate-pulse" /> : <MessageSquarePlus className="h-4 w-4" />}
            Registrar entrevista
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <SelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {scoreOptions.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </SelectField>
    </Field>
  );
}
