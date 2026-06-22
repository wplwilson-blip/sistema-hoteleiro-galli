"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, CalendarDays, FileCheck2, RefreshCw, Search, ShieldCheck, Shirt, UserRoundCheck } from "lucide-react";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatAdmissionDate,
  getAdmissionProcessStatusView,
  getAdmissionWorkflowStatusView,
  getCandidateName,
  getDepartment,
  getExpectedStartDate,
  getJobTitle,
  getNextAdmissionAction,
  getUnitLabel,
  type AdmissionProcess,
  type AdmissionWorkflow
} from "@/components/hr/hr-admission-operational-shared";

type AdmissionProcessesResponse = {
  ok: boolean;
  data: AdmissionProcess[];
  pagination?: {
    total: number;
  };
};

type AdmissionWorkflowsResponse = {
  data: AdmissionWorkflow[];
  pagination?: {
    total: number;
  };
};

type AdmissionListEntry = {
  id: string;
  href: string;
  workflow: AdmissionWorkflow | null;
  process: AdmissionProcess | null;
  candidateName: string | null;
  updatedAt: string;
};

type CandidateDetailResponse = {
  data?: {
    candidate?: {
      full_name?: string | null;
    };
  };
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? payload?.message ?? "Não foi possível carregar as admissões.");
  }

  return response.json() as Promise<T>;
}

function buildEntries(processes: AdmissionProcess[], workflows: AdmissionWorkflow[], candidateNamesByProcessId: Record<string, string>) {
  const processByWorkflowId = new Map(processes.filter((process) => process.admission_workflow_id).map((process) => [process.admission_workflow_id, process]));
  const usedProcessIds = new Set<string>();

  const entries: AdmissionListEntry[] = workflows.map((workflow) => {
    const process = processByWorkflowId.get(workflow.id) ?? null;
    if (process) usedProcessIds.add(process.id);

    return {
      id: workflow.id,
      href: `/rh/admissoes/${workflow.id}`,
      workflow,
      process,
      candidateName: process ? candidateNamesByProcessId[process.id] ?? null : null,
      updatedAt: process?.updated_at ?? workflow.updated_at ?? workflow.created_at
    };
  });

  for (const process of processes) {
    if (usedProcessIds.has(process.id)) continue;

    entries.push({
      id: process.admission_workflow_id ?? process.id,
      href: `/rh/admissoes/${process.admission_workflow_id ?? process.id}`,
      workflow: null,
      process,
      candidateName: candidateNamesByProcessId[process.id] ?? null,
      updatedAt: process.updated_at ?? process.created_at
    });
  }

  return entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function ListStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BriefcaseBusiness }) {
  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdmissionListCard({ entry }: { entry: AdmissionListEntry }) {
  const { workflow, process } = entry;
  const status = process ? getAdmissionProcessStatusView(process.status) : getAdmissionWorkflowStatusView(workflow?.status);
  const candidateName = entry.candidateName || getCandidateName(workflow);
  const expectedStart = formatAdmissionDate(getExpectedStartDate(process, workflow));
  const nextAction = getNextAdmissionAction(process, [], workflow);

  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardContent className="p-4">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <UserRoundCheck className="h-4 w-4 text-primary" />
              <h2 className="min-w-0 break-words text-base font-semibold">Admissão — {candidateName}</h2>
              <StatusBadge status={status.tone} label={status.label} />
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <span className="min-w-0 break-words">Cargo: {getJobTitle(process, workflow)}</span>
              <span className="min-w-0 break-words">Setor: {getDepartment(process, workflow)}</span>
              <span className="min-w-0 break-words">Unidade: {getUnitLabel(workflow)}</span>
              <span className="min-w-0 break-words">Início previsto: {expectedStart}</span>
            </div>

            <p className="text-sm text-muted-foreground">Próxima ação: {nextAction}</p>
          </div>

          <Button asChild variant="outline" className="shrink-0">
            <Link href={entry.href}>
              Abrir admissão
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function HrAdmissionListClient() {
  const query = useQuery({
    queryKey: ["hr", "admissions", "operational-list"],
    queryFn: async () => {
      const [processes, workflows] = await Promise.all([
        requestJson<AdmissionProcessesResponse>("/api/hr/admission-processes?pageSize=100"),
        requestJson<AdmissionWorkflowsResponse>("/api/hr/workflows?workflow_type=admission&page_size=100")
      ]);
      const processList = processes.data ?? [];
      const candidateLookups = processList
        .filter((process) => process.source_job_opening_workflow_id && process.source_candidate_id)
        .map(async (process) => {
          const payload = await requestJson<CandidateDetailResponse>(`/api/hr/workflows/${process.source_job_opening_workflow_id}/candidates/${process.source_candidate_id}`);
          return {
            processId: process.id,
            name: payload.data?.candidate?.full_name?.trim() || null
          };
        });
      const candidateResults = await Promise.allSettled(candidateLookups);
      const candidateNamesByProcessId = candidateResults.reduce<Record<string, string>>((acc, result) => {
        if (result.status === "fulfilled" && result.value.name) acc[result.value.processId] = result.value.name;
        return acc;
      }, {});

      return {
        processes: processList,
        workflows: workflows.data ?? [],
        candidateNamesByProcessId
      };
    }
  });

  const entries = useMemo(
    () => buildEntries(query.data?.processes ?? [], query.data?.workflows ?? [], query.data?.candidateNamesByProcessId ?? {}),
    [query.data]
  );
  const inProgressCount = entries.filter((entry) => {
    const status = entry.process?.status ?? entry.workflow?.status;
    return status && !["completed", "cancelled", "rejected"].includes(status);
  }).length;
  const documentsCount = entries.filter((entry) => ["documents_requested", "documents_under_review"].includes(entry.process?.status ?? "")).length;
  const accountingCount = entries.filter((entry) => entry.process?.accounting_status === "in_progress" || entry.process?.status === "sent_to_accounting").length;
  const onboardingCount = entries.filter((entry) => ["onboarding_ready", "completed"].includes(entry.process?.status ?? "") || entry.process?.onboarding_status === "in_progress").length;

  if (query.isLoading) {
    return <LoadingTable label="Carregando admissões..." />;
  }

  if (query.error) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={query.error instanceof Error ? query.error.message : "Não foi possível carregar as admissões."} />
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ListStat label="Admissões em acompanhamento" value={inProgressCount} icon={BriefcaseBusiness} />
        <ListStat label="Com documentos em andamento" value={documentsCount} icon={FileCheck2} />
        <ListStat label="Em contabilidade" value={accountingCount} icon={ShieldCheck} />
        <ListStat label="Prontas para integração" value={onboardingCount} icon={Shirt} />
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Fila operacional de admissões</h2>
          <p className="mt-1 text-sm text-muted-foreground">Documentos, ASO, contabilidade, uniforme operacional e onboarding em acompanhamento.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/rh/vagas">
            <Search className="h-4 w-4" />
            Ver vagas
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Nenhuma admissão em andamento" description="Quando um candidato aprovado for encaminhado para admissão, o acompanhamento aparecerá aqui." />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <AdmissionListCard key={`${entry.id}-${entry.process?.id ?? "workflow"}`} entry={entry} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <CalendarDays className="h-4 w-4 text-primary" />
        Uniforme operacional aparece separado de EPI técnico. EPI técnico depende dos riscos da função e validação da Segurança do Trabalho.
      </div>
    </div>
  );
}
