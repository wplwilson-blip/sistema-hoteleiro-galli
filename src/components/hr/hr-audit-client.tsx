"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Lock, Search, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuditLog = {
  id: string;
  unit_id: string;
  workflow_id: string | null;
  step_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  risk_level: string;
  request_id: string | null;
  correlation_id: string | null;
  created_at: string;
};

type AuditResponse = {
  data: AuditLog[];
  pagination: { page: number; page_size: number; total: number };
};

const actions = ["create_workflow", "execute_step", "approve_step", "reject_step", "return_step", "cancel_workflow"];
const risks = ["low", "medium", "high", "critical"];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel carregar auditoria.");
  return payload as T;
}

function buildAuditUrl(input: { action: string; risk: string; workflowId: string; from: string; to: string }) {
  const params = new URLSearchParams({ page: "1", page_size: "50" });
  if (input.action) params.set("action", input.action);
  if (input.risk) params.set("risk_level", input.risk);
  if (input.workflowId.trim()) params.set("workflow_id", input.workflowId.trim());
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  return `/api/hr/audit?${params.toString()}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    create_workflow: "Criacao",
    execute_step: "Execucao de etapa",
    approve_step: "Aprovacao",
    reject_step: "Rejeicao",
    return_step: "Devolucao",
    cancel_workflow: "Cancelamento"
  };
  return labels[action] ?? action;
}

function riskTone(risk: string) {
  if (risk === "critical" || risk === "high") return "danger" as const;
  if (risk === "medium") return "warning" as const;
  return "visual" as const;
}

export function HrAuditClient() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [risk, setRisk] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const auditUrl = buildAuditUrl({ action, risk, workflowId, from, to });
  const auditQuery = useQuery({ queryKey: ["hr", "management", "audit", auditUrl], queryFn: async () => requestJson<AuditResponse>(auditUrl) });
  const filteredRows = useMemo(() => {
    const rows = auditQuery.data?.data ?? [];
    return rows.filter((row) =>
      [row.action, row.entity_type, row.actor_user_id, row.request_id, row.workflow_id, row.unit_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase().trim())
    );
  }, [auditQuery.data?.data, search]);
  const hasFilters = Boolean(search || action || risk || workflowId || from || to);

  function clearFilters() {
    setSearch("");
    setAction("");
    setRisk("");
    setWorkflowId("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Filtros de auditoria</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao">Gestao</Link></Button>
            {hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}><X className="h-4 w-4" />Limpar</Button> : null}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Buscar" className="xl:col-span-2">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Acao, ator, request ou workflow" /></div>
          </Field>
          <Field label="Acao"><SelectField value={action} onChange={(event) => setAction(event.target.value)}><option value="">Todas</option>{actions.map((item) => <option key={item} value={item}>{actionLabel(item)}</option>)}</SelectField></Field>
          <Field label="Risco"><SelectField value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">Todos</option>{risks.map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field>
          <Field label="De"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="Ate"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Workflow ID" className="xl:col-span-2"><Input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} placeholder="UUID do workflow" /></Field>
        </div>
      </Card>

      {auditQuery.isLoading ? <LoadingTable label="Carregando auditoria RH..." /> : null}
      {auditQuery.error ? <ErrorMessage message={auditQuery.error instanceof Error ? auditQuery.error.message : "Erro ao carregar auditoria."} /> : null}
      {!auditQuery.isLoading && !auditQuery.error && !filteredRows.length ? <EmptyState title="Nenhum registro encontrado" description="Ajuste os filtros ou valide se existem eventos auditaveis no periodo." /> : null}

      {filteredRows.length ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4"><h2 className="text-sm font-semibold">Eventos auditaveis</h2><p className="text-xs text-muted-foreground">Exibindo {filteredRows.length} de {auditQuery.data?.pagination.total ?? filteredRows.length}</p></div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Acao</th><th className="px-4 py-3">Risco</th><th className="px-4 py-3">Ator</th><th className="px-4 py-3">Entidade</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Request</th></tr></thead>
              <tbody className="divide-y">{filteredRows.map((row) => <tr key={row.id} className="hover:bg-muted/30"><td className="px-4 py-3">{formatDateTime(row.created_at)}</td><td className="px-4 py-3"><StatusBadge status="info" label={actionLabel(row.action)} /></td><td className="px-4 py-3"><StatusBadge status={riskTone(row.risk_level)} label={row.risk_level} /></td><td className="px-4 py-3 text-muted-foreground">{row.actor_user_id ?? "-"}</td><td className="px-4 py-3">{row.entity_type}</td><td className="px-4 py-3 text-muted-foreground">{row.unit_id}</td><td className="px-4 py-3 text-muted-foreground">{row.workflow_id ?? "-"}</td><td className="px-4 py-3 text-muted-foreground">{row.request_id ?? "-"}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
