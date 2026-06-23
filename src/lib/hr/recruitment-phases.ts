export type RecruitmentPhaseTone = "visual" | "warning" | "danger" | "success" | "info";

export type RecruitmentPhase = {
  key: string;
  label: string;
  tone: RecruitmentPhaseTone;
  nextAction: string;
};

export type CandidatePhaseInput = {
  status: string;
  humanOpinion?: string | null;
  interviewCount?: number | null;
  hasAdmission?: boolean;
};

export type JobOpeningPhaseInput = {
  status: string;
  currentStepName?: string | null;
  currentStepStatus?: string | null;
  canExecute?: boolean;
  canApprove?: boolean;
  requestedQuantity?: number | null;
  totalCandidates?: number;
  activeCandidates?: number;
  approvedWithoutAdmission?: number;
  admissionsInProgress?: number;
  admissionsCompleted?: number;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function requestedTotal(value: number | null | undefined) {
  return value && value > 0 ? value : 1;
}

export function parseRequestedQuantity(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.requested_quantity ?? metadata?.requestedQuantity ?? metadata?.quantity;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return 1;
}

export function isAdmissionActive(status: string | null | undefined) {
  return !["completed", "registered", "onboarding_ready", "cancelled"].includes(status ?? "");
}

export function isAdmissionCompleted(status: string | null | undefined) {
  return ["completed", "registered", "onboarding_ready"].includes(status ?? "");
}

export function calculateCandidatePhase(input: CandidatePhaseInput): RecruitmentPhase {
  const hasOpinion = Boolean(input.humanOpinion?.trim());

  if (input.status === "aprovado") {
    return input.hasAdmission
      ? { key: "in_admission", label: "Em admissão", tone: "info", nextAction: "Acompanhar admissão" }
      : { key: "approved_without_admission", label: "Aprovado sem admissão", tone: "success", nextAction: "Encaminhar para admissão" };
  }

  if (input.status === "banco_de_talentos") {
    return { key: "talent_pool", label: "Banco de talentos", tone: "info", nextAction: "Consultar histórico" };
  }

  if (input.status === "reprovado") {
    return { key: "rejected", label: "Não avançou / Reprovado", tone: "danger", nextAction: "Consultar decisão" };
  }

  if (input.status === "desistiu") {
    return { key: "withdrawn", label: "Desistiu", tone: "danger", nextAction: "Consultar desistência" };
  }

  if (hasOpinion) {
    return { key: "decision_pending", label: "Decisão pendente", tone: "warning", nextAction: "Decidir candidato" };
  }

  if (input.status === "entrevista") {
    return { key: "interview_opinion_pending", label: "Entrevista / Parecer pendente", tone: "warning", nextAction: "Registrar entrevista/parecer" };
  }

  if (input.status === "triagem") {
    return { key: "screening", label: "Em triagem", tone: "warning", nextAction: "Registrar parecer" };
  }

  return { key: "screening_pending", label: "Triagem pendente", tone: "info", nextAction: "Fazer triagem" };
}

export function calculateJobOpeningPhase(input: JobOpeningPhaseInput): RecruitmentPhase {
  const stepName = normalize(input.currentStepName);
  const requested = requestedTotal(input.requestedQuantity);
  const admissionsCompleted = input.admissionsCompleted ?? 0;
  const admissionsInProgress = input.admissionsInProgress ?? 0;
  const approvedWithoutAdmission = input.approvedWithoutAdmission ?? 0;
  const activeCandidates = input.activeCandidates ?? 0;
  const totalCandidates = input.totalCandidates ?? 0;

  if (input.status === "cancelled") {
    return { key: "cancelled", label: "Cancelada", tone: "danger", nextAction: "Consultar histórico" };
  }

  if (input.status === "rejected") {
    return { key: "rejected", label: "Rejeitada", tone: "danger", nextAction: "Consultar decisão" };
  }

  if (input.status === "returned" || input.currentStepStatus === "returned") {
    return { key: "returned_for_adjustment", label: "Devolvida para ajuste", tone: "warning", nextAction: "Ajustar solicitação" };
  }

  if (input.status === "completed") {
    return admissionsCompleted > 0 || admissionsInProgress > 0
      ? { key: "completed_with_hire", label: "Encerrada com contratação", tone: "success", nextAction: "Consultar admissão" }
      : { key: "completed", label: "Encerrada", tone: "success", nextAction: "Consultar histórico" };
  }

  if (input.status === "draft") {
    return { key: "draft", label: "Rascunho", tone: "visual", nextAction: "Revisar solicitação" };
  }

  const isRecruitmentStep = includesAny(stepName, ["recrut", "candidat", "entrevista", "admiss", "captac", "selec"]);
  const isDirectorApprovalStep =
    input.status === "waiting_approval" ||
    input.currentStepStatus === "waiting_approval" ||
    Boolean(input.canApprove) ||
    includesAny(stepName, ["aprov", "diretoria", "diretor"]);
  const isHrValidationStep = includesAny(stepName, ["valid", "rh", "revis", "confer"]);
  const isClearlyApprovedForRecruitment = input.status === "approved" || isRecruitmentStep;

  if (!isClearlyApprovedForRecruitment) {
    if (isDirectorApprovalStep) {
      return { key: "waiting_director_approval", label: "Aguardando aprovação da diretoria", tone: "warning", nextAction: "Acompanhar aprovação da diretoria" };
    }

    if (isHrValidationStep || input.canExecute || input.status === "open" || input.status === "in_progress") {
      return input.canExecute || input.currentStepStatus === "in_progress"
        ? { key: "hr_validation", label: "Em validação pelo RH", tone: "warning", nextAction: "Validar solicitação" }
        : { key: "waiting_hr_validation", label: "Aguardando validação do RH", tone: "warning", nextAction: "Acompanhar validação do RH" };
    }
  }

  if (admissionsCompleted >= requested) {
    return { key: "ready_to_close", label: "Pronta para encerramento", tone: "success", nextAction: "Encerrar vaga" };
  }

  if (admissionsInProgress > 0) {
    return admissionsInProgress + admissionsCompleted >= requested
      ? { key: "in_admission", label: "Em admissão", tone: "info", nextAction: "Acompanhar admissão" }
      : { key: "recruiting_partial_admission", label: "Recrutamento em andamento", tone: "info", nextAction: "Acompanhar candidatos" };
  }

  if (approvedWithoutAdmission > 0) {
    return { key: "candidate_approved", label: "Candidato aprovado", tone: "success", nextAction: "Encaminhar para admissão" };
  }

  if (activeCandidates > 0 || totalCandidates > 0) {
    return { key: "recruiting", label: "Em recrutamento", tone: "info", nextAction: "Acompanhar candidatos" };
  }

  if (isClearlyApprovedForRecruitment) {
    return { key: "approved_for_recruitment", label: "Aprovada para recrutamento", tone: "info", nextAction: "Adicionar candidato" };
  }

  return { key: "waiting_hr_validation", label: "Aguardando validação do RH", tone: "warning", nextAction: "Acompanhar validação do RH" };
}
