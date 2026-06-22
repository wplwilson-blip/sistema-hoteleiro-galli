"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Filter, MessageSquarePlus, Search, UserPlus, UsersRound, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { HrCandidateAdmissionActionButton } from "@/components/hr/hr-candidate-admission-conversion-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HrRecruitmentBreadcrumb, HrRecruitmentGuidance } from "@/components/hr/hr-recruitment-navigation";
import { HrRecruitmentTimeline } from "@/components/hr/hr-recruitment-timeline";
import {
  type Candidate,
  type CandidateSummary,
  candidateStatusLabel,
  candidateStatusOptions,
  candidateStatusTone,
  formatDateTime,
  formatPhone,
  requestJson
} from "@/components/hr/hr-candidate-shared";

type CandidatesResponse = {
  data: Candidate[];
  summary: CandidateSummary;
  workflow: {
    id: string;
    title: string;
    status: string;
  };
  pagination: {
    total: number;
  };
};

type AdmissionProcessForCandidate = {
  id: string;
  source_candidate_id: string | null;
  admission_workflow_id: string | null;
  status: string;
  current_step: string;
};

type AdmissionProcessesByJobOpeningResponse = {
  data: AdmissionProcessForCandidate[];
};

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function HrCandidateListClient({ workflowId }: { workflowId: string }) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const candidatesUrl = buildUrl(`/api/hr/workflows/${workflowId}/candidates`, {
    status: status || undefined,
    q: search.trim() || undefined,
    page_size: 80
  });
  const query = useQuery({
    queryKey: ["hr", "job-opening-candidates", candidatesUrl],
    queryFn: async () => requestJson<CandidatesResponse>(candidatesUrl)
  });

  const candidates = query.data?.data ?? [];
  const summary = query.data?.summary ?? { total: 0, triagem: 0, entrevista: 0, aprovado: 0, reprovado: 0 };
  const admissionProcessesQuery = useQuery({
    queryKey: ["hr", "admission-processes", "job-opening", workflowId],
    queryFn: async () => requestJson<AdmissionProcessesByJobOpeningResponse>(`/api/hr/admission-processes?jobOpeningWorkflowId=${workflowId}&pageSize=100`),
    enabled: summary.aprovado > 0
  });
  const admissionProcesses = admissionProcessesQuery.data?.data;
  const admissionByCandidateId = useMemo(() => {
    const map = new Map<string, AdmissionProcessForCandidate>();
    for (const process of admissionProcesses ?? []) {
      if (process.source_candidate_id) map.set(process.source_candidate_id, process);
    }
    return map;
  }, [admissionProcesses]);
  const hasFilters = Boolean(status || search.trim());

  function clearFilters() {
    setStatus("");
    setSearch("");
  }

  return (
    <div className="space-y-5">
      <HrRecruitmentBreadcrumb
        items={[
          { label: "Vagas", href: "/rh/vagas" },
          { label: "Detalhe da vaga", href: `/rh/workflows/${workflowId}` },
          { label: "Candidatos" }
        ]}
      />
      <HrRecruitmentGuidance
        where="Você esta avaliando candidatos vinculados a esta vaga."
        next={summary.aprovado > 0 ? "Use Encaminhar para admissão ou Acompanhar admissão no candidato aprovado." : "Cadastre candidatos, registre entrevistas e aprove um candidato quando a decisão humana estiver pronta."}
      />
      <HrRecruitmentTimeline
        mode="candidate"
        currentStage={summary.aprovado > 0 ? "candidate_approved" : "candidates"}
        title="Etapa de candidatos"
        description="Esta etapa serve para avaliar candidatos antes de iniciar admissão."
      />

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label="Candidatos da vaga" />
              <StatusBadge status="visual" label={`${summary.total} cadastrados`} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Lista operacional sem ranking automático, com contato formatado e ação admissional para aprovados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/rh/workflows/${workflowId}`}>
                <ArrowLeft className="h-4 w-4" />
                Voltar para vaga
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/rh/vagas/${workflowId}/candidatos/novo`}>
                <UserPlus className="h-4 w-4" />
                Novo Candidato
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Total" value={String(summary.total)} icon={UsersRound} tone={summary.total ? "info" : "neutral"} />
        <StatCard title="Em triagem" value={String(summary.triagem)} icon={Filter} tone={summary.triagem ? "warning" : "neutral"} />
        <StatCard title="Em entrevista" value={String(summary.entrevista)} icon={MessageSquarePlus} tone={summary.entrevista ? "warning" : "neutral"} />
        <StatCard title="Aprovados" value={String(summary.aprovado)} icon={CheckCircle2} tone={summary.aprovado ? "info" : "neutral"} />
        <StatCard title="Reprovados" value={String(summary.reprovado)} icon={X} tone={summary.reprovado ? "danger" : "neutral"} />
      </div>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Filtros</h2>
          </div>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Limpar
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou origem" />
            </div>
          </Field>
          <Field label="Status">
            <SelectField value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {candidateStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
      </Card>

      {query.isLoading ? <LoadingTable label="Carregando candidatos..." /> : null}
      {query.error ? <ErrorMessage message={query.error instanceof Error ? query.error.message : "Erro ao carregar candidatos."} /> : null}
      {!query.isLoading && !query.error && !candidates.length ? (
        <EmptyState title="Nenhum candidato encontrado" description="Cadastre o primeiro candidato ou ajuste os filtros da vaga." />
      ) : null}

      {candidates.length ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Candidato</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Atualização</th>
                  <th className="w-72 px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {candidates.map((candidate) => {
                  const admissionWorkflowId = admissionByCandidateId.get(candidate.id)?.admission_workflow_id ?? null;
                  return (
                  <tr key={candidate.id} className={candidate.status === "aprovado" ? "align-top bg-emerald-50/50 hover:bg-emerald-50" : "align-top hover:bg-muted/30"}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{candidate.full_name}</p>
                      <p className="text-xs text-muted-foreground">Cadastrado em {formatDateTime(candidate.created_at)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.phone_redacted ? "Telefone restrito" : formatPhone(candidate.phone)}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{candidate.source}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={candidateStatusTone(candidate.status)} label={candidateStatusLabel(candidate.status)} />
                      {candidate.status === "aprovado" ? <p className="mt-1 text-xs font-medium text-emerald-700">{admissionWorkflowId ? "Admissão aberta para acompanhamento." : "Próxima ação: encaminhar para admissão."}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(candidate.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {candidate.status === "aprovado" ? (
                          <HrCandidateAdmissionActionButton workflowId={workflowId} candidate={candidate} admissionWorkflowId={admissionWorkflowId} className="whitespace-nowrap" />
                        ) : null}
                        <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                          <Link href={`/rh/vagas/${workflowId}/candidatos/${candidate.id}`}>
                            Abrir
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
