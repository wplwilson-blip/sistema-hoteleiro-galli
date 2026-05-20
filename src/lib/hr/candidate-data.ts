import "server-only";

import { z } from "zod";
import { HR_PERMISSIONS, logHrApiError, type HrRequestContext } from "@/lib/hr/api-auth";
import { canAccessWorkflowUnit, getWorkflowPermissionAccess, type HrPermissionAccess } from "@/lib/hr/workflow-auth";

export const candidateStatuses = [
  "novo",
  "triagem",
  "entrevista",
  "aprovado",
  "banco_de_talentos",
  "reprovado",
  "desistiu"
] as const;

export const interviewOpinions = ["recomendado", "parcialmente_recomendado", "nao_recomendado"] as const;

export const candidateSelect =
  "id, organization_id, unit_id, workflow_id, full_name, phone, source, status, notes, manual_score, human_opinion, status_changed_at, created_at, updated_at, created_by, updated_by";

export const interviewSelect =
  "id, organization_id, unit_id, workflow_id, candidate_id, interviewer_user_id, interview_at, communication_score, posture_score, experience_score, availability_score, hospitality_profile_score, notes, final_opinion, created_at, updated_at, created_by, updated_by";

export type JobOpeningWorkflowForCandidate = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_type: string;
  title: string;
  status: string;
};

export type HrJobCandidateRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  full_name: string;
  phone: string;
  source: string;
  status: (typeof candidateStatuses)[number];
  notes: string | null;
  manual_score: number | null;
  human_opinion: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type HrCandidateInterviewRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  workflow_id: string;
  candidate_id: string;
  interviewer_user_id: string | null;
  interview_at: string;
  communication_score: number;
  posture_score: number;
  experience_score: number;
  availability_score: number;
  hospitality_profile_score: number;
  notes: string | null;
  final_opinion: (typeof interviewOpinions)[number];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  interviewer?: {
    display_name: string | null;
    username: string | null;
  } | null;
};

export const candidateListQuerySchema = z.object({
  status: z.enum(candidateStatuses).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50)
});

const optionalText = (max: number) =>
  z
    .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string().max(max).nullable().optional())
    .transform((value) => (value === undefined ? undefined : value ? value : null));

export const createCandidateSchema = z.object({
  full_name: z.string().trim().min(2).max(140),
  phone: z.string().trim().min(6).max(30),
  source: z.string().trim().min(2).max(80),
  status: z.enum(candidateStatuses).default("novo"),
  notes: optionalText(1000),
  manual_score: z.coerce.number().int().min(0).max(100).nullable().optional(),
  human_opinion: optionalText(2000)
});

export const updateCandidateSchema = z
  .object({
    full_name: z.string().trim().min(2).max(140).optional(),
    phone: z.string().trim().min(6).max(30).optional(),
    source: z.string().trim().min(2).max(80).optional(),
    status: z.enum(candidateStatuses).optional(),
    notes: optionalText(1000),
    manual_score: z.coerce.number().int().min(0).max(100).nullable().optional(),
    human_opinion: optionalText(2000)
  })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const createInterviewSchema = z.object({
  interview_at: z.string().trim().min(1).max(40),
  communication_score: z.coerce.number().int().min(1).max(5),
  posture_score: z.coerce.number().int().min(1).max(5),
  experience_score: z.coerce.number().int().min(1).max(5),
  availability_score: z.coerce.number().int().min(1).max(5),
  hospitality_profile_score: z.coerce.number().int().min(1).max(5),
  notes: optionalText(2000),
  final_opinion: z.enum(interviewOpinions)
});

const forbiddenPayloadPattern =
  /\b(cpf|rg|cid|salario|salary|documento|document_number|file_path|storage_path|signed_url|download_url|public_url|curriculo|resume)\b/i;

export function assertCandidateLgpdText(values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ");
  if (forbiddenPayloadPattern.test(text)) {
    throw new Error("Evite documentos, dados sensiveis, discriminatorios ou anexos neste cadastro.");
  }
}

export function parseRequestUrl(request: Request) {
  return new URL(request.url);
}

export function parseSearchParams<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  const url = parseRequestUrl(request);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

export async function loadJobOpeningWorkflow(context: HrRequestContext, workflowId: string) {
  const { data, error } = await context.supabase
    .from("hr_workflows")
    .select("id, organization_id, unit_id, workflow_type, title, status")
    .eq("id", workflowId)
    .eq("workflow_type", "job_opening")
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("candidates.workflow_lookup_failed", error);
    throw new Error("Nao foi possivel carregar a solicitacao de vaga.");
  }

  const workflow = data?.[0] as JobOpeningWorkflowForCandidate | undefined;

  if (!workflow || !canAccessWorkflowUnit(context, workflow.unit_id)) {
    return null;
  }

  return workflow;
}

export async function loadCandidateForWorkflow(context: HrRequestContext, workflowId: string, candidateId: string) {
  const { data, error } = await context.supabase
    .from("hr_job_candidates")
    .select(candidateSelect)
    .eq("id", candidateId)
    .eq("workflow_id", workflowId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logHrApiError("candidates.candidate_lookup_failed", error);
    throw new Error("Nao foi possivel carregar o candidato.");
  }

  return (data?.[0] as HrJobCandidateRow | undefined) ?? null;
}

export async function loadCandidateInterviews(context: HrRequestContext, workflowId: string, candidateId: string) {
  const { data, error } = await context.supabase
    .from("hr_candidate_interviews")
    .select(`${interviewSelect}, interviewer:app_users!hr_candidate_interviews_interviewer_user_id_fkey(display_name, username)`)
    .eq("workflow_id", workflowId)
    .eq("candidate_id", candidateId)
    .is("deleted_at", null)
    .order("interview_at", { ascending: false });

  if (error) {
    logHrApiError("candidates.interviews_lookup_failed", error);
    throw new Error("Nao foi possivel carregar as entrevistas.");
  }

  return ((data ?? []) as Array<HrCandidateInterviewRow & { interviewer?: HrCandidateInterviewRow["interviewer"] | HrCandidateInterviewRow["interviewer"][] }>).map(
    (interview) => ({
      ...interview,
      interviewer: Array.isArray(interview.interviewer) ? interview.interviewer[0] ?? null : interview.interviewer ?? null
    })
  );
}

export async function getCandidateSensitiveAccess(context: HrRequestContext): Promise<HrPermissionAccess> {
  return getWorkflowPermissionAccess(context, HR_PERMISSIONS.workflowsSensitiveView);
}

export function canViewCandidatePhone(access: HrPermissionAccess, unitId: string) {
  return access.isSuperAdmin || access.accessibleUnitIds.includes(unitId);
}

export function summarizeCandidates(candidates: HrJobCandidateRow[]) {
  return {
    total: candidates.length,
    triagem: candidates.filter((candidate) => candidate.status === "triagem").length,
    entrevista: candidates.filter((candidate) => candidate.status === "entrevista").length,
    aprovado: candidates.filter((candidate) => candidate.status === "aprovado").length,
    reprovado: candidates.filter((candidate) => candidate.status === "reprovado").length
  };
}

export function redactCandidate(candidate: HrJobCandidateRow, showPhone: boolean) {
  return {
    ...candidate,
    phone: showPhone ? candidate.phone : null,
    phone_redacted: !showPhone
  };
}
