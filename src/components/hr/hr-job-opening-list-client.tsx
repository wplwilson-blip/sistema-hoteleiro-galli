"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BriefcaseBusiness, Filter, Search, UserPlus, UsersRound, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HrRecruitmentBreadcrumb } from "@/components/hr/hr-recruitment-navigation";
import { useAppStore } from "@/store/app-store";
import { formatDateTimeShortYear as formatDateTime } from "@/lib/format";

type StatusTone = "visual" | "warning" | "danger" | "success" | "info";

type WorkflowSla = {
  status?: string | null;
  due_at?: string | null;
  label?: string | null;
};

type WorkflowEscalation = {
  eligible?: boolean;
  overdue?: boolean;
  level?: number;
};

type WorkflowStep = {
  id: string;
  name: string;
  status: string;
  assigned_to: string | null;
  sla: WorkflowSla | null;
};

type JobOpeningWorkflow = {
  id: string;
  unit_id: string;
  unit?: {
    id: string;
    code: string | null;
    name: string | null;
  } | null;
  status: string;
  priority: string;
  current_step: WorkflowStep | null;
  sla: WorkflowSla | null;
  escalation: WorkflowEscalation | null;
  created_at: string;
  updated_at: string;
};

type WorkflowsResponse = {
  data: JobOpeningWorkflow[];
  pagination: { total: number };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberta",
  in_progress: "Em andamento",
  waiting_approval: "Em aprovacao",
  returned: "Devolvida",
  completed: "Encerrada",
  cancelled: "Cancelada",
  rejected: "Rejeitada"
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Critica"
};

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(value));
}

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível carregar vagas.");
  return payload as T;
}

function statusTone(status: string): StatusTone {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "waiting_approval" || status === "returned") return "warning";
  return "info";
}

function priorityTone(priority: string): StatusTone {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  return "visual";
}

function slaTone(status: string | null | undefined): StatusTone {
  if (status === "overdue" || status === "completed_late") return "danger";
  if (status === "warning") return "warning";
  if (status === "completed_on_time" || status === "on_time") return "success";
  return "visual";
}

function slaLabel(sla: WorkflowSla | null | undefined) {
  if (!sla?.status) return "Sem prazo";
  const labels: Record<string, string> = {
    on_time: "No prazo",
    warning: "Vencendo",
    overdue: "Vencido",
    completed_on_time: "Concluido no prazo",
    completed_late: "Concluido com atraso",
    cancelled: "Cancelado"
  };
  return labels[sla.status] ?? sla.status;
}

function unitDisplayName(workflow: JobOpeningWorkflow) {
  if (workflow.unit?.name) return workflow.unit.name;
  if (workflow.unit?.code) return workflow.unit.code;
  return "Unidade registrada";
}

function nextStepLabel(workflow: JobOpeningWorkflow) {
  const status = workflow.status;
  const stepName = workflow.current_step?.name.toLowerCase() ?? "";
  const stepStatus = workflow.current_step?.status ?? "";

  if (status === "completed") return "Vaga finalizada";
  if (status === "cancelled" || status === "rejected") return "Processo encerrado";
  if (status === "waiting_approval" || stepStatus === "waiting_approval" || stepName.includes("aprov")) return "Aprovar abertura";
  if (stepName.includes("admiss")) return "Acompanhar admissão";
  if (stepName.includes("candidat") || stepName.includes("entrevista") || stepName.includes("recrut")) return "Cadastrar ou avaliar candidatos";
  if (status === "open" || status === "in_progress") return "Cadastrar ou avaliar candidatos";
  if (status === "draft" || stepStatus === "pending") return "Revisar solicitação";
  return "Abrir detalhe e conferir etapa";
}

export function HrJobOpeningListClient() {
  const { activeUnit } = useAppStore();
  const activeUnitId = isUuid(activeUnit?.id) ? activeUnit.id : undefined;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [unitId, setUnitId] = useState(activeUnitId ?? "");

  const workflowsUrl = buildUrl("/api/hr/workflows", { workflow_type: "job_opening", page_size: 80, unit_id: unitId || undefined, status: status || undefined });
  const workflowsQuery = useQuery({ queryKey: ["hr", "job-openings", workflowsUrl], queryFn: async () => requestJson<WorkflowsResponse>(workflowsUrl) });

  const filteredWorkflows = useMemo(() => {
    const workflows = workflowsQuery.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return workflows;
    return workflows.filter((workflow) =>
      [workflow.id, unitDisplayName(workflow), workflow.status, workflow.priority, workflow.current_step?.name, workflow.current_step?.assigned_to]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [search, workflowsQuery.data?.data]);

  const waitingApproval = filteredWorkflows.filter((workflow) => workflow.status === "waiting_approval" || workflow.current_step?.status === "waiting_approval").length;
  const inRecruitment = filteredWorkflows.filter((workflow) => workflow.current_step?.name.toLowerCase().includes("recrutamento")).length;
  const openTotal = filteredWorkflows.filter((workflow) => !["completed", "cancelled", "rejected"].includes(workflow.status)).length;
  const closedTotal = filteredWorkflows.filter((workflow) => workflow.status === "completed").length;
  const overdueTotal = filteredWorkflows.filter((workflow) => workflow.sla?.status === "overdue").length;
  const warningTotal = filteredWorkflows.filter((workflow) => workflow.sla?.status === "warning").length;
  const hasFilters = Boolean(search || status || unitId);
  const counterText = `${openTotal} vagas abertas · ${waitingApproval} aguardando aprovação · ${inRecruitment} em recrutamento · ${closedTotal} encerradas · ${warningTotal} vencendo · ${overdueTotal} vencidas`;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setUnitId(activeUnitId ?? "");
  }

  return (
    <div className="space-y-5">
      <HrRecruitmentBreadcrumb items={[{ label: "Vagas" }]} />

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label={activeUnit?.name ? `Unidade ativa: ${activeUnit.name}` : "Todas as unidades acessiveis"} />
              <StatusBadge status="visual" label={`Exibindo ${filteredWorkflows.length} de ${workflowsQuery.data?.pagination.total ?? filteredWorkflows.length}`} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Solicitacoes formais de vaga com candidatos e entrevistas vinculados ao processo.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/rh/vagas/nova">
              <BriefcaseBusiness className="h-4 w-4" />
              Nova Vaga
            </Link>
          </Button>
        </div>
      </Card>

      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{counterText}</div>

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
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Etapa, status, unidade" />
            </div>
          </Field>
          <Field label="Status">
            <SelectField value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
          </Field>
          <Field label="Unidade">
            <Input value={unitId} onChange={(event) => setUnitId(event.target.value)} placeholder="Unidade ativa ou codigo interno" />
          </Field>
        </div>
      </Card>

      {workflowsQuery.isLoading ? <LoadingTable label="Carregando solicitacoes de vaga..." /> : null}
      {workflowsQuery.error ? <ErrorMessage message={workflowsQuery.error instanceof Error ? workflowsQuery.error.message : "Erro ao carregar vagas."} /> : null}
      {!workflowsQuery.isLoading && !workflowsQuery.error && !filteredWorkflows.length ? (
        <EmptyState title="Nenhuma vaga encontrada" description="Abra uma nova vaga ou ajuste os filtros operacionais." />
      ) : null}

      {filteredWorkflows.length ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1440px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Vaga</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Urgencia</th>
                  <th className="px-4 py-3">Prazo</th>
                  <th className="px-4 py-3">Etapa atual</th>
                  <th className="px-4 py-3">Proximo passo</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Atualizacao</th>
                  <th className="px-4 py-3 text-right">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredWorkflows.map((workflow) => (
                  <tr key={workflow.id} className="align-top hover:bg-muted/30">
                    <td className="px-4 py-3"><p className="font-medium">Solicitacao de vaga</p><p className="text-xs text-muted-foreground">Criada em {formatDateTime(workflow.created_at)}</p></td>
                    <td className="px-4 py-3"><StatusBadge status={statusTone(workflow.status)} label={statusLabels[workflow.status] ?? workflow.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={priorityTone(workflow.priority)} label={priorityLabels[workflow.priority] ?? workflow.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge status={slaTone(workflow.sla?.status)} label={slaLabel(workflow.sla)} /></td>
                    <td className="px-4 py-3"><p>{workflow.current_step?.name ?? "Sem etapa atual"}</p><p className="text-xs text-muted-foreground">{workflow.current_step?.assigned_to ?? "Responsável não informado"}</p></td>
                    <td className="px-4 py-3">
                      <StatusBadge status="info" label={nextStepLabel(workflow)} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{unitDisplayName(workflow)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(workflow.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                          <Link href={`/rh/vagas/${workflow.id}/candidatos`}>
                            <UsersRound className="h-4 w-4" />
                            Candidatos
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                          <Link href={`/rh/vagas/${workflow.id}/candidatos/novo`}>
                            <UserPlus className="h-4 w-4" />
                            Novo
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                          <Link href={`/rh/workflows/${workflow.id}`}>
                            Ver
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
