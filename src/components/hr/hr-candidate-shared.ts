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

export type CandidateAdmissionConversion = {
  id: string;
  candidate_id: string;
  source_job_opening_workflow_id: string;
  admission_workflow_id: string | null;
  status: "processing" | "completed" | "failed";
  converted_at: string | null;
  converted_by: string | null;
  created_at: string;
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
  { value: "nao_recomendado", label: "Não recomendado" }
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

export function formatPhone(value: string | null | undefined) {
  if (!value) return "Restrito";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

export function normalizePhoneForApi(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 11);
}

export function maskPhoneInput(value: string | null | undefined) {
  const digits = normalizePhoneForApi(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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
    throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível concluir a operação.");
  }

  return payload as T;
}
