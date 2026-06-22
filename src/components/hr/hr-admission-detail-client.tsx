"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  RefreshCw,
  Shirt,
  Stethoscope,
  UserRoundCheck
} from "lucide-react";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ADMISSION_BLOCKS,
  filterChecklistItemsForBlock,
  formatAdmissionDate,
  getAdmissionChecklistStatusView,
  getAdmissionProcessStatusView,
  getAdmissionWorkflowStatusView,
  getBlockStatus,
  getCandidateName,
  getDepartment,
  getExpectedStartDate,
  getJobTitle,
  getNextAdmissionAction,
  getUnitLabel,
  type AdmissionChecklistItem,
  type AdmissionProcess,
  type AdmissionWorkflow
} from "@/components/hr/hr-admission-operational-shared";

type WorkflowDetailResponse = {
  data: AdmissionWorkflow;
};

type AdmissionProcessLookupResponse = {
  ok: boolean;
  data: {
    process: AdmissionProcess | null;
  };
};

type AdmissionProcessDetailResponse = {
  ok: boolean;
  data: {
    process: AdmissionProcess;
    checklist: AdmissionChecklistItem[];
    summary?: unknown;
  };
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
    throw new Error(payload?.error?.message ?? payload?.message ?? "Não foi possível carregar a admissão.");
  }

  return response.json() as Promise<T>;
}

async function tryRequestJson<T>(url: string): Promise<T | null> {
  try {
    return await requestJson<T>(url);
  } catch {
    return null;
  }
}

function blockIcon(blockKey: string) {
  if (blockKey === "documents") return FileCheck2;
  if (blockKey === "occupational") return Stethoscope;
  if (blockKey === "uniform") return Shirt;
  if (blockKey === "onboarding") return UserRoundCheck;
  return ClipboardCheck;
}

function RequirementLabel({ required }: { required: boolean }) {
  return <StatusBadge status={required ? "warning" : "visual"} label={required ? "Obrigatório" : "Acompanhar"} />;
}

function ChecklistItemRow({ item }: { item: AdmissionChecklistItem }) {
  const status = getAdmissionChecklistStatusView(item.status);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 break-words text-sm font-medium">{item.title}</p>
            <RequirementLabel required={item.is_required} />
          </div>
          {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
          {item.notes ? <p className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">Observação: {item.notes}</p> : null}
          {item.waiver_reason ? <p className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">Dispensa: {item.waiver_reason}</p> : null}
        </div>
        <StatusBadge status={status.tone} label={status.label} />
      </div>
    </div>
  );
}

function AdmissionBlockCard({
  block,
  process,
  checklist
}: {
  block: (typeof ADMISSION_BLOCKS)[number];
  process: AdmissionProcess | null;
  checklist: AdmissionChecklistItem[];
}) {
  const items = filterChecklistItemsForBlock(block, checklist);
  const status = getBlockStatus(block.key, process, items);
  const Icon = blockIcon(block.key);

  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="break-words text-base">{block.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{block.description}</p>
            </div>
          </div>
          <StatusBadge status={status.tone} label={status.label} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => <ChecklistItemRow key={item.id} item={item} />)
        ) : (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">Sem tarefa registrada neste bloco.</div>
        )}
        {block.key === "uniform" ? (
          <p className="text-xs text-muted-foreground">Uniforme operacional é separado de EPI técnico. EPI técnico depende dos riscos da função e validação da Segurança do Trabalho.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AdmissionTimeline({ checklist, workflow }: { checklist: AdmissionChecklistItem[]; workflow: AdmissionWorkflow | null }) {
  const timelineItems =
    checklist.length > 0
      ? checklist.slice().sort((a, b) => a.sort_order - b.sort_order)
      : (workflow?.steps ?? []).slice().sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));

  if (!timelineItems.length) {
    return (
      <Card className="border-border/80 shadow-sm shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-lg">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">Sem etapas registradas para exibir agora.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm shadow-primary/5">
      <CardHeader>
        <CardTitle className="text-lg">Linha do tempo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {timelineItems.map((item, index) => {
          const isChecklist = "item_key" in item;
          const title = isChecklist ? item.title : item.title;
          const description = isChecklist ? item.description : item.description;
          const status = isChecklist ? getAdmissionChecklistStatusView(item.status) : getAdmissionWorkflowStatusView(item.status);

          return (
            <div key={item.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-xs font-semibold">{index + 1}</div>
                {index < timelineItems.length - 1 ? <div className="mt-2 h-full min-h-6 w-px bg-border" /> : null}
              </div>
              <div className="min-w-0 flex-1 rounded-md border bg-background p-3">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{title}</p>
                    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
                  </div>
                  <StatusBadge status={status.tone} label={status.label} />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

async function loadAdmissionDetail(id: string) {
  const workflowResponse = await tryRequestJson<WorkflowDetailResponse>(`/api/hr/workflows/${id}`);
  const workflow = workflowResponse?.data?.workflow_type === "admission" ? workflowResponse.data : null;

  let process: AdmissionProcess | null = null;
  let checklist: AdmissionChecklistItem[] = [];

  if (workflow) {
    const lookup = await requestJson<AdmissionProcessLookupResponse>(`/api/hr/admission-processes?workflowId=${workflow.id}`);
    process = lookup.data.process;
  }

  if (!process) {
    const processDetail = await tryRequestJson<AdmissionProcessDetailResponse>(`/api/hr/admission-processes/${id}`);
    if (processDetail?.data?.process) {
      process = processDetail.data.process;
      checklist = processDetail.data.checklist ?? [];
    }
  }

  if (process && checklist.length === 0) {
    const processDetail = await requestJson<AdmissionProcessDetailResponse>(`/api/hr/admission-processes/${process.id}`);
    checklist = processDetail.data.checklist ?? [];
  }

  let finalWorkflow = workflow;
  if (!finalWorkflow && process?.admission_workflow_id) {
    const processWorkflow = await tryRequestJson<WorkflowDetailResponse>(`/api/hr/workflows/${process.admission_workflow_id}`);
    finalWorkflow = processWorkflow?.data?.workflow_type === "admission" ? processWorkflow.data : null;
  }

  let candidateName: string | null = null;
  if (process?.source_job_opening_workflow_id && process.source_candidate_id) {
    const candidateDetail = await tryRequestJson<CandidateDetailResponse>(`/api/hr/workflows/${process.source_job_opening_workflow_id}/candidates/${process.source_candidate_id}`);
    candidateName = candidateDetail?.data?.candidate?.full_name?.trim() || null;
  }

  if (!finalWorkflow && !process) {
    throw new Error("Admissão não encontrada.");
  }

  return {
    workflow: finalWorkflow,
    process,
    checklist,
    candidateName
  };
}

export function HrAdmissionDetailClient({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["hr", "admissions", "operational-detail", id],
    queryFn: () => loadAdmissionDetail(id)
  });

  const checklist = useMemo(() => query.data?.checklist ?? [], [query.data?.checklist]);
  const process = query.data?.process ?? null;
  const workflow = query.data?.workflow ?? null;
  const status = process ? getAdmissionProcessStatusView(process.status) : getAdmissionWorkflowStatusView(workflow?.status);
  const candidateName = query.data?.candidateName || getCandidateName(workflow);
  const nextAction = useMemo(() => getNextAdmissionAction(process, checklist, workflow), [process, checklist, workflow]);

  if (query.isLoading) {
    return <LoadingTable label="Carregando admissão..." />;
  }

  if (query.error) {
    return (
      <div className="space-y-3">
        <Button asChild variant="outline">
          <Link href="/rh/admissoes">
            <ArrowLeft className="h-4 w-4" />
            Voltar para admissões
          </Link>
        </Button>
        <ErrorMessage message={query.error instanceof Error ? query.error.message : "Não foi possível carregar a admissão."} />
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/rh/admissoes">
            <ArrowLeft className="h-4 w-4" />
            Voltar para admissões
          </Link>
        </Button>
        {process?.source_job_opening_workflow_id ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/rh/workflows/${process.source_job_opening_workflow_id}`}>
              Ver vaga
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
        {process?.source_job_opening_workflow_id && process.source_candidate_id ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/rh/vagas/${process.source_job_opening_workflow_id}/candidatos/${process.source_candidate_id}`}>
              Ver candidato
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </div>

      <Card className="border-border/80 shadow-sm shadow-primary/5">
        <CardContent className="p-5">
          <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <BriefcaseBusiness className="h-5 w-5 text-primary" />
                <h1 className="min-w-0 break-words text-2xl font-semibold tracking-normal">Admissão — {candidateName}</h1>
                <StatusBadge status={status.tone} label={status.label} />
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Acompanhamento operacional de documentos, ASO, contabilidade, registro, uniforme operacional e onboarding.
              </p>
              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                <span className="min-w-0 break-words">Cargo: {getJobTitle(process, workflow)}</span>
                <span className="min-w-0 break-words">Setor: {getDepartment(process, workflow)}</span>
                <span className="min-w-0 break-words">Unidade: {getUnitLabel(workflow)}</span>
                <span className="min-w-0 break-words">Início previsto: {formatAdmissionDate(getExpectedStartDate(process, workflow))}</span>
              </div>
            </div>

            <div className="rounded-md border bg-muted/25 p-4 xl:w-80">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Próxima ação
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{nextAction}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {ADMISSION_BLOCKS.map((block) => (
          <AdmissionBlockCard key={block.key} block={block} process={process} checklist={checklist} />
        ))}
      </div>

      <AdmissionTimeline checklist={checklist} workflow={workflow} />

    </div>
  );
}
