"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  RefreshCw,
  Search,
  UserCheck,
  UserRoundCheck,
  UsersRound,
  XCircle
} from "lucide-react";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type Candidate } from "@/components/hr/hr-candidate-shared";
import { type AdmissionProcess } from "@/components/hr/hr-admission-operational-shared";
import {
  calculateCandidatePhase,
  calculateJobOpeningPhase,
  isAdmissionActive,
  isAdmissionCompleted,
  parseRequestedQuantity,
  type RecruitmentPhase
} from "@/lib/hr/recruitment-phases";

type StatusTone = "visual" | "warning" | "danger" | "success" | "info";

type WorkflowStep = {
  id: string;
  name: string;
  status: string;
  assigned_to: string | null;
};

type JobOpeningWorkflow = {
  id: string;
  unit_id: string;
  unit?: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
  title?: string | null;
  description?: string | null;
  status: string;
  priority: string;
  metadata?: Record<string, unknown> | null;
  current_step: WorkflowStep | null;
  created_at: string;
  updated_at: string;
};

type WorkflowsResponse = {
  data: JobOpeningWorkflow[];
  pagination?: { total: number };
};

type CandidatesResponse = {
  data: Candidate[];
};

type AdmissionProcessesResponse = {
  ok: boolean;
  data: AdmissionProcess[];
};

type CandidateWithWorkflow = Candidate & {
  workflow: JobOpeningWorkflow;
  admissionProcess: AdmissionProcess | null;
};

type PendingRow = {
  id: string;
  type: string;
  subject: string;
  job: string;
  unit: string;
  status: string;
  tone: StatusTone;
  nextAction: string;
  href: string;
  actionLabel: string;
};

type FunnelColumn = {
  key: string;
  title: string;
  empty: string;
  candidates: CandidateWithWorkflow[];
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível carregar o recrutamento.");
  return payload as T;
}

function unitLabel(workflow: JobOpeningWorkflow) {
  return workflow.unit?.name || workflow.unit?.code || "Unidade registrada";
}

function metadataText(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function jobLabel(workflow: JobOpeningWorkflow) {
  return metadataText(workflow.metadata, ["job_position", "jobTitle", "job_title"]) || workflow.title?.replace(/^Vaga\s*[-–]\s*/i, "").trim() || "Cargo a confirmar";
}

function hasAdmission(candidate: CandidateWithWorkflow) {
  return Boolean(candidate.admissionProcess?.admission_workflow_id || candidate.admissionProcess?.id);
}

function admissionHref(process: AdmissionProcess | null) {
  if (!process) return "";
  return `/rh/admissoes/${process.admission_workflow_id ?? process.id}`;
}

function candidateHref(candidate: CandidateWithWorkflow) {
  return `/rh/vagas/${candidate.workflow.id}/candidatos/${candidate.id}`;
}

function candidatePhase(candidate: CandidateWithWorkflow): RecruitmentPhase {
  return calculateCandidatePhase({
    status: candidate.status,
    humanOpinion: candidate.human_opinion,
    hasAdmission: hasAdmission(candidate)
  });
}

function candidatesForWorkflow(workflow: JobOpeningWorkflow, candidates: CandidateWithWorkflow[]) {
  return candidates.filter((candidate) => candidate.workflow.id === workflow.id);
}

function jobOpeningPhase(workflow: JobOpeningWorkflow, candidates: CandidateWithWorkflow[]) {
  const relatedCandidates = candidatesForWorkflow(workflow, candidates);
  const approvedCandidates = relatedCandidates.filter((candidate) => candidate.status === "aprovado");
  const admissionsInProgress = approvedCandidates.filter((candidate) => hasAdmission(candidate) && isAdmissionActive(candidate.admissionProcess?.status)).length;
  const admissionsCompleted = approvedCandidates.filter((candidate) => hasAdmission(candidate) && isAdmissionCompleted(candidate.admissionProcess?.status)).length;

  return calculateJobOpeningPhase({
    status: workflow.status,
    currentStepName: workflow.current_step?.name,
    currentStepStatus: workflow.current_step?.status,
    requestedQuantity: parseRequestedQuantity(workflow.metadata),
    totalCandidates: relatedCandidates.length,
    activeCandidates: relatedCandidates.filter((candidate) => ["novo", "triagem", "entrevista"].includes(candidate.status)).length,
    approvedWithoutAdmission: approvedCandidates.filter((candidate) => !hasAdmission(candidate)).length,
    admissionsInProgress,
    admissionsCompleted
  });
}

function workflowAllowsRecruitment(workflow: JobOpeningWorkflow, candidates: CandidateWithWorkflow[]) {
  return [
    "approved_for_recruitment",
    "recruiting",
    "candidate_approved",
    "in_admission",
    "recruiting_partial_admission",
    "ready_to_close",
    "completed_with_hire",
    "completed"
  ].includes(jobOpeningPhase(workflow, candidates).key);
}

function buildPendingRows(workflows: JobOpeningWorkflow[], candidates: CandidateWithWorkflow[]) {
  const rows: PendingRow[] = [];

  for (const workflow of workflows) {
    const phase = jobOpeningPhase(workflow, candidates);
    if (phase.key === "waiting_hr_validation" || phase.key === "draft") {
      rows.push({
        id: `workflow-validation-${workflow.id}`,
        type: "Vaga aguardando validação RH",
        subject: jobLabel(workflow),
        job: jobLabel(workflow),
        unit: unitLabel(workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: `/rh/workflows/${workflow.id}`,
        actionLabel: "Abrir vaga"
      });
    } else if (phase.key === "waiting_director_approval") {
      rows.push({
        id: `workflow-approval-${workflow.id}`,
        type: "Vaga aguardando aprovação",
        subject: jobLabel(workflow),
        job: jobLabel(workflow),
        unit: unitLabel(workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: `/rh/workflows/${workflow.id}`,
        actionLabel: "Abrir vaga"
      });
    }
  }

  for (const candidate of candidates.filter((item) => workflowAllowsRecruitment(item.workflow, candidates))) {
    const phase = candidatePhase(candidate);
    if (phase.key === "screening_pending") {
      rows.push({
        id: `candidate-new-${candidate.id}`,
        type: "Triagem pendente",
        subject: candidate.full_name,
        job: jobLabel(candidate.workflow),
        unit: unitLabel(candidate.workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: candidateHref(candidate),
        actionLabel: "Abrir candidato"
      });
    } else if (phase.key === "interview_opinion_pending") {
      rows.push({
        id: `candidate-interview-${candidate.id}`,
        type: "Entrevista / Parecer pendente",
        subject: candidate.full_name,
        job: jobLabel(candidate.workflow),
        unit: unitLabel(candidate.workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: candidateHref(candidate),
        actionLabel: "Registrar parecer"
      });
    } else if (phase.key === "decision_pending") {
      rows.push({
        id: `candidate-decision-${candidate.id}`,
        type: "Candidato aguardando decisão",
        subject: candidate.full_name,
        job: jobLabel(candidate.workflow),
        unit: unitLabel(candidate.workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: candidateHref(candidate),
        actionLabel: "Decidir candidato"
      });
    } else if (phase.key === "approved_without_admission") {
      rows.push({
        id: `candidate-approved-${candidate.id}`,
        type: "Aprovado sem admissão",
        subject: candidate.full_name,
        job: jobLabel(candidate.workflow),
        unit: unitLabel(candidate.workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: candidateHref(candidate),
        actionLabel: "Encaminhar"
      });
    } else if (phase.key === "in_admission") {
      rows.push({
        id: `candidate-admission-${candidate.id}`,
        type: "Admissão em andamento",
        subject: candidate.full_name,
        job: jobLabel(candidate.workflow),
        unit: unitLabel(candidate.workflow),
        status: phase.label,
        tone: phase.tone,
        nextAction: phase.nextAction,
        href: admissionHref(candidate.admissionProcess),
        actionLabel: "Acompanhar"
      });
    }
  }

  return rows.slice(0, 80);
}

function IndicatorCard({ label, value, icon: Icon, tone = "visual" }: { label: string; value: number; icon: typeof BriefcaseBusiness; tone?: StatusTone }) {
  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-2xl font-semibold leading-tight">{value}</p>
            <StatusBadge status={tone} label={value === 1 ? "item" : "itens"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelColumnCard({ column }: { column: FunnelColumn }) {
  return (
    <Card className="min-w-[260px] border-border/80 shadow-sm shadow-primary/5">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{column.title}</h2>
          <StatusBadge status="visual" label={String(column.candidates.length)} />
        </div>
        {column.candidates.length ? (
          <div className="space-y-2">
            {column.candidates.slice(0, 6).map((candidate) => (
              <Link key={`${column.key}-${candidate.id}`} href={hasAdmission(candidate) && column.key === "in_admission" ? admissionHref(candidate.admissionProcess) : candidateHref(candidate)} className="block rounded-md border bg-background p-3 text-sm transition-colors hover:bg-muted/40">
                <p className="break-words font-medium text-foreground">{candidate.full_name}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{jobLabel(candidate.workflow)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={candidatePhase(candidate).tone} label={candidatePhase(candidate).label} />
                </div>
              </Link>
            ))}
            {column.candidates.length > 6 ? <p className="text-xs text-muted-foreground">Mais {column.candidates.length - 6} candidato(s) nesta etapa.</p> : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">{column.empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingTable({ rows }: { rows: PendingRow[] }) {
  if (!rows.length) {
    return <EmptyState title="Nenhuma pendência de recrutamento" description="As vagas, candidatos e admissões não têm ação imediata registrada agora." />;
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Pendência</th>
              <th className="px-4 py-3">Candidato ou vaga</th>
              <th className="px-4 py-3">Cargo</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Próxima ação</th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{row.type}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.job}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.unit}</td>
                <td className="px-4 py-3"><StatusBadge status={row.tone} label={row.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{row.nextAction}</td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                    <Link href={row.href}>
                      {row.actionLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function HrRecruitmentDashboardClient() {
  const query = useQuery({
    queryKey: ["hr", "recruitment-dashboard"],
    queryFn: async () => {
      const [workflowsPayload, admissionsPayload] = await Promise.all([
        requestJson<WorkflowsResponse>("/api/hr/workflows?workflow_type=job_opening&page_size=80"),
        requestJson<AdmissionProcessesResponse>("/api/hr/admission-processes?pageSize=100")
      ]);
      const workflows = workflowsPayload.data ?? [];
      const admissions = admissionsPayload.data ?? [];
      const admissionsByCandidateId = new Map(admissions.filter((process) => process.source_candidate_id).map((process) => [process.source_candidate_id, process]));
      const candidateResults = await Promise.allSettled(
        workflows.map(async (workflow) => {
          const payload = await requestJson<CandidatesResponse>(`/api/hr/workflows/${workflow.id}/candidates?page_size=80`);
          return (payload.data ?? []).map((candidate) => ({
            ...candidate,
            workflow,
            admissionProcess: admissionsByCandidateId.get(candidate.id) ?? null
          }));
        })
      );
      const candidates = candidateResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

      return {
        workflows,
        admissions,
        candidates
      };
    }
  });

  const workflows = useMemo(() => query.data?.workflows ?? [], [query.data?.workflows]);
  const candidates = useMemo(() => query.data?.candidates ?? [], [query.data?.candidates]);

  const metrics = useMemo(() => {
    const recruitmentCandidates = candidates.filter((candidate) => workflowAllowsRecruitment(candidate.workflow, candidates));
    const candidatePhases = recruitmentCandidates.map(candidatePhase);
    const workflowPhases = workflows.map((workflow) => jobOpeningPhase(workflow, candidates));
    return {
      waitingHrValidation: workflowPhases.filter((phase) => ["draft", "waiting_hr_validation", "hr_validation", "returned_for_adjustment"].includes(phase.key)).length,
      waitingApproval: workflowPhases.filter((phase) => phase.key === "waiting_director_approval").length,
      inRecruitment: workflowPhases.filter((phase) => ["approved_for_recruitment", "recruiting", "recruiting_partial_admission"].includes(phase.key)).length,
      candidateApproved: workflowPhases.filter((phase) => phase.key === "candidate_approved").length,
      vacanciesInAdmission: workflowPhases.filter((phase) => phase.key === "in_admission").length,
      screeningPending: candidatePhases.filter((phase) => phase.key === "screening_pending").length,
      interviewOpinionPending: candidatePhases.filter((phase) => phase.key === "interview_opinion_pending").length,
      decisionPending: candidatePhases.filter((phase) => phase.key === "decision_pending").length,
      approvedWithoutAdmission: candidatePhases.filter((phase) => phase.key === "approved_without_admission").length,
      inAdmission: candidatePhases.filter((phase) => phase.key === "in_admission").length,
      talentPool: candidatePhases.filter((phase) => phase.key === "talent_pool").length,
      rejected: candidatePhases.filter((phase) => phase.key === "rejected").length,
      withdrawn: candidatePhases.filter((phase) => phase.key === "withdrawn").length
    };
  }, [candidates, workflows]);

  const funnelColumns = useMemo<FunnelColumn[]>(
    () => {
      const recruitmentCandidates = candidates.filter((candidate) => workflowAllowsRecruitment(candidate.workflow, candidates));
      return ((candidates: CandidateWithWorkflow[]) => [
      { key: "screening_pending", title: "Triagem pendente", empty: "Nenhum candidato aguardando triagem.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "screening_pending") },
      { key: "screening", title: "Em triagem", empty: "Nenhum candidato em triagem.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "screening") },
      { key: "interview_opinion_pending", title: "Entrevista / Parecer pendente", empty: "Nenhum parecer pendente.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "interview_opinion_pending") },
      { key: "decision_pending", title: "Decisão pendente", empty: "Nenhum candidato pendente de decisão.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "decision_pending") },
      { key: "approved_without_admission", title: "Aprovado sem admissão", empty: "Nenhum aprovado aguardando admissão.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "approved_without_admission") },
      { key: "in_admission", title: "Em admissão", empty: "Nenhuma admissão pendente.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "in_admission") },
      { key: "talent_pool", title: "Banco de talentos", empty: "Nenhum candidato no banco de talentos.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "talent_pool") },
      { key: "rejected", title: "Não avançou / Reprovado", empty: "Nenhum candidato reprovado.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "rejected") },
      { key: "withdrawn", title: "Desistiu", empty: "Nenhuma desistência registrada.", candidates: candidates.filter((candidate) => candidatePhase(candidate).key === "withdrawn") }
    ])(recruitmentCandidates);
    },
    [candidates]
  );

  const pendingRows = useMemo(() => buildPendingRows(workflows, candidates), [workflows, candidates]);

  if (query.isLoading) {
    return <LoadingTable label="Carregando dashboard de recrutamento..." />;
  }

  if (query.error) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={query.error instanceof Error ? query.error.message : "Não foi possível carregar o dashboard de recrutamento."} />
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Resumo operacional</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vagas, candidatos e admissões que precisam de acompanhamento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/vagas">
              <BriefcaseBusiness className="h-4 w-4" />
              Vagas
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/admissoes">
              <ClipboardCheck className="h-4 w-4" />
              Admissões
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <IndicatorCard label="Vagas aguardando validação RH" value={metrics.waitingHrValidation} icon={FileClock} tone={metrics.waitingHrValidation ? "warning" : "visual"} />
        <IndicatorCard label="Vagas aguardando aprovação" value={metrics.waitingApproval} icon={CheckCircle2} tone={metrics.waitingApproval ? "warning" : "visual"} />
        <IndicatorCard label="Vagas em recrutamento" value={metrics.inRecruitment} icon={BriefcaseBusiness} tone={metrics.inRecruitment ? "info" : "visual"} />
        <IndicatorCard label="Vagas com candidato aprovado" value={metrics.candidateApproved} icon={UserRoundCheck} tone={metrics.candidateApproved ? "success" : "visual"} />
        <IndicatorCard label="Vagas em admissão" value={metrics.vacanciesInAdmission} icon={ClipboardCheck} tone={metrics.vacanciesInAdmission ? "info" : "visual"} />
        <IndicatorCard label="Candidatos em triagem pendente" value={metrics.screeningPending} icon={Search} tone={metrics.screeningPending ? "info" : "visual"} />
        <IndicatorCard label="Candidatos com entrevista/parecer pendente" value={metrics.interviewOpinionPending} icon={CalendarClock} tone={metrics.interviewOpinionPending ? "warning" : "visual"} />
        <IndicatorCard label="Candidatos aguardando decisão" value={metrics.decisionPending} icon={UserCheck} tone={metrics.decisionPending ? "warning" : "visual"} />
        <IndicatorCard label="Aprovados sem admissão" value={metrics.approvedWithoutAdmission} icon={UserRoundCheck} tone={metrics.approvedWithoutAdmission ? "success" : "visual"} />
        <IndicatorCard label="Candidatos em admissão" value={metrics.inAdmission} icon={ClipboardCheck} tone={metrics.inAdmission ? "info" : "visual"} />
        <IndicatorCard label="Banco de talentos" value={metrics.talentPool} icon={UsersRound} tone={metrics.talentPool ? "info" : "visual"} />
        <IndicatorCard label="Não avançaram / Reprovados" value={metrics.rejected} icon={XCircle} tone={metrics.rejected ? "danger" : "visual"} />
        <IndicatorCard label="Desistiram" value={metrics.withdrawn} icon={XCircle} tone={metrics.withdrawn ? "danger" : "visual"} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Funil de candidatos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Distribuição dos candidatos por etapa operacional.</p>
        </div>
        <div className="max-w-full overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {funnelColumns.map((column) => (
              <FunnelColumnCard key={column.key} column={column} />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Pendências de recrutamento</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vagas, candidatos e admissões com próxima ação identificada.</p>
        </div>
        <PendingTable rows={pendingRows} />
      </section>
    </div>
  );
}
