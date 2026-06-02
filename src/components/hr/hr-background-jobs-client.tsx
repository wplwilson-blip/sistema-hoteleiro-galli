"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Filter, Search, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Job = {
  id: string;
  unit_id: string;
  job_type: string;
  status: string;
  priority: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  locked_at: string | null;
  correlation_id: string | null;
  created_at: string;
  updated_at: string;
};

type JobsResponse = { data: Job[] };

const statuses = ["pending", "scheduled", "running", "completed", "failed", "cancelled", "retrying"];
const jobTypes = ["sla_scan", "escalation_scan", "notification_dispatch", "audit_cleanup", "analytics_refresh", "dashboard_refresh", "training_expiration_scan", "occupational_expiration_scan"];
const priorities = ["low", "normal", "high", "critical"];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Não foi possível carregar processamentos.");
  return payload as T;
}

function buildJobsUrl(input: { status: string; type: string; priority: string; from: string; to: string }) {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.type) params.set("job_type", input.type);
  if (input.priority) params.set("priority", input.priority);
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  const query = params.toString();
  return query ? `/api/hr/background-jobs?${query}` : "/api/hr/background-jobs";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: string) {
  if (status === "failed") return "danger" as const;
  if (status === "retrying" || status === "pending" || status === "scheduled") return "warning" as const;
  if (status === "completed") return "success" as const;
  return "visual" as const;
}

function safePayloadLabel(payload: Record<string, unknown>) {
  const workflowId = payload.workflow_id;
  const summary = payload.summary;
  if (typeof workflowId === "string") return "Processo relacionado";
  if (typeof summary === "string") return summary;
  return "-";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    scheduled: "Agendado",
    running: "Em execucao",
    completed: "Concluido",
    failed: "Falhou",
    cancelled: "Cancelado",
    retrying: "Tentando novamente"
  };
  return labels[status] ?? status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    critical: "Critica"
  };
  return labels[priority] ?? priority;
}

function jobTypeLabel(type: string) {
  const labels: Record<string, string> = {
    sla_scan: "Verificacao de prazos",
    escalation_scan: "Alertas de prazo",
    notification_dispatch: "Envio de notificacoes",
    audit_cleanup: "Organizacao de auditoria",
    analytics_refresh: "Atualizacao de indicadores",
    dashboard_refresh: "Atualizacao do painel",
    training_expiration_scan: "Vencimentos de treinamentos",
    occupational_expiration_scan: "Vencimentos ocupacionais"
  };
  return labels[type] ?? type;
}

export function HrBackgroundJobsClient() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const jobsUrl = buildJobsUrl({ status, type, priority, from, to });
  const jobsQuery = useQuery({ queryKey: ["hr", "management", "jobs-page", jobsUrl], queryFn: async () => requestJson<JobsResponse>(jobsUrl) });
  const filteredJobs = useMemo(() => {
    const jobs = jobsQuery.data?.data ?? [];
    return jobs.filter((job) =>
      [job.id, job.job_type, job.status, job.priority, job.failure_reason, job.correlation_id, safePayloadLabel(job.payload)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  }, [jobsQuery.data?.data, search]);
  const hasFilters = Boolean(search || status || type || priority || from || to);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setType("");
    setPriority("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Filtros de processamentos</h2></div>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/rh/gestao">Gestão</Link></Button>{hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}><X className="h-4 w-4" />Limpar</Button> : null}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Buscar" className="xl:col-span-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rotina, status, erro ou processo" /></div></Field>
          <Field label="Status"><SelectField value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</SelectField></Field>
          <Field label="Tipo"><SelectField value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos</option>{jobTypes.map((item) => <option key={item} value={item}>{jobTypeLabel(item)}</option>)}</SelectField></Field>
          <Field label="Prioridade"><SelectField value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{priorities.map((item) => <option key={item} value={item}>{priorityLabel(item)}</option>)}</SelectField></Field>
          <Field label="De"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Ate"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        </div>
      </Card>

      {jobsQuery.isLoading ? <LoadingTable label="Carregando rotinas do RH..." /> : null}
      {jobsQuery.error ? <ErrorMessage message={jobsQuery.error instanceof Error ? jobsQuery.error.message : "Erro ao carregar rotinas do RH."} /> : null}
      {!jobsQuery.isLoading && !jobsQuery.error && !filteredJobs.length ? <EmptyState title="Nenhuma rotina encontrada" description="Ajuste os filtros ou confirme se existem rotinas de RH registradas." /> : null}

      {filteredJobs.length ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Rotinas internas</h2></div><p className="text-xs text-muted-foreground">Somente leitura. Reprocessamento manual nao esta disponivel nesta tela.</p></div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Rotina</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Tentativas</th><th className="px-4 py-3">Proxima execucao</th><th className="px-4 py-3">Inicio/Fim</th><th className="px-4 py-3">Erro</th><th className="px-4 py-3">Contexto</th><th className="px-4 py-3">Atualizacao</th></tr></thead>
              <tbody className="divide-y">{filteredJobs.map((job) => <tr key={job.id} className="align-top hover:bg-muted/30"><td className="px-4 py-3"><p className="font-medium">{jobTypeLabel(job.job_type)}</p><details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Rastreio tecnico</summary><p>{job.id}</p>{job.correlation_id ? <p>{job.correlation_id}</p> : null}</details></td><td className="px-4 py-3"><StatusBadge status={statusTone(job.status)} label={statusLabel(job.status)} /></td><td className="px-4 py-3"><StatusBadge status={job.priority === "critical" || job.priority === "high" ? "warning" : "visual"} label={priorityLabel(job.priority)} /></td><td className="px-4 py-3">{job.attempts}/{job.max_attempts}</td><td className="px-4 py-3 text-muted-foreground">{formatDateTime(job.scheduled_at)}</td><td className="px-4 py-3 text-muted-foreground"><p>Inicio: {formatDateTime(job.started_at)}</p><p>Fim: {formatDateTime(job.finished_at ?? job.failed_at)}</p></td><td className="px-4 py-3"><p className="max-w-56 break-words text-muted-foreground">{job.failure_reason ?? "-"}</p></td><td className="px-4 py-3 text-muted-foreground">{safePayloadLabel(job.payload)}</td><td className="px-4 py-3 text-muted-foreground">{formatDateTime(job.updated_at)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
