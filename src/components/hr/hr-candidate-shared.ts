"use client";

export type CandidateStatus = "novo" | "triagem" | "entrevista" | "aprovado" | "banco_de_talentos" | "reprovado" | "desistiu";
export type InterviewOpinion = "recomendado" | "parcialmente_recomendado" | "nao_recomendado";

export type Candidate = {
  id: string;
  workflow_id: string;
  full_name: string;
  phone: string | null;
  phone_redacted?: boolean;
  source: string;
  status: CandidateStatus;
  notes: string | null;
  manual_score: number | null;
  human_opinion: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};

export type CandidateSummary = {
  total: number;
  triagem: number;
  entrevista: number;
  aprovado: number;
  reprovado: number;
};

export type CandidateInterview = {
  id: string;
  candidate_id: string;
  interviewer_user_id: string | null;
  interviewer?: {
    display_name: string | null;
    username: string | null;
  } | null;
  interview_at: string;
  communication_score: number;
  posture_score: number;
  experience_score: number;
  availability_score: number;
  hospitality_profile_score: number;
  notes: string | null;
  final_opinion: InterviewOpinion;
  created_at: string;
};

export const candidateStatusOptions: Array<{ value: CandidateStatus; label: string }> = [
  { value: "novo", label: "Novo" },
  { value: "triagem", label: "Triagem" },
  { value: "entrevista", label: "Entrevista" },
  { value: "aprovado", label: "Aprovado" },
  { value: "banco_de_talentos", label: "Banco de talentos" },
  { value: "reprovado", label: "Reprovado" },
  { value: "desistiu", label: "Desistiu" }
];

export const interviewOpinionOptions: Array<{ value: InterviewOpinion; label: string }> = [
  { value: "recomendado", label: "Recomendado" },
  { value: "parcialmente_recomendado", label: "Parcialmente recomendado" },
  { value: "nao_recomendado", label: "Nao recomendado" }
];

export function candidateStatusLabel(status: string) {
  return candidateStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function interviewOpinionLabel(opinion: string) {
  return interviewOpinionOptions.find((option) => option.value === opinion)?.label ?? opinion;
}

export function candidateStatusTone(status: string) {
  if (status === "aprovado") return "success" as const;
  if (status === "reprovado" || status === "desistiu") return "danger" as const;
  if (status === "entrevista" || status === "triagem") return "warning" as const;
  return "info" as const;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel concluir a operacao.");
  }

  return payload as T;
}
