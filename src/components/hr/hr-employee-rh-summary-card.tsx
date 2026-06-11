"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PendingItem = {
  id: string;
  type: string;
  typeLabel: string;
  priority: "critical" | "high" | "medium" | "low";
  date: string;
  origin: string;
  href: string;
};

type PendingResponse = {
  ok: true;
  data: PendingItem[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
};

const modules = [
  { type: "documents", label: "Documentos", ok: "Todos os documentos entregues", warning: "documento(s) pendente(s)" },
  { type: "onboarding", label: "Onboarding", ok: "Concluído", warning: "etapa(s) pendente(s)" },
  { type: "evaluations", label: "Avaliações", ok: "Em dia", warning: "avaliação(ões) pendente(s)" },
  { type: "development", label: "Plano de Desenvolvimento (PDI)", ok: "Sem pendências", warning: "ação(ões) pendente(s)" },
  { type: "trainings", label: "Treinamentos", ok: "Todos válidos", warning: "treinamento(s) pendente(s)" },
  { type: "occupational", label: "Saúde Ocupacional", ok: "ASO e NRs em dia", warning: "pendência(s) ocupacional(is)" },
  { type: "movements", label: "Movimentações", ok: "Sem pendências", warning: "movimentação(ões) aguardando ação" },
  { type: "conduct", label: "Conduta", ok: "Sem ocorrências abertas", warning: "ocorrência(s) em revisão" },
  { type: "terminations", label: "Desligamento", ok: "Não aplicável", warning: "desligamento(s) em andamento" }
] as const;

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível carregar resumo RH.");
  return payload as T;
}

function tone(total: number, critical: number) {
  if (critical > 0) return "danger" as const;
  if (total > 0) return "warning" as const;
  return "success" as const;
}

function priorityWeight(priority: PendingItem["priority"]) {
  if (priority === "critical") return 20;
  if (priority === "high") return 12;
  if (priority === "medium") return 7;
  return 3;
}

function priorityTone(priority: PendingItem["priority"]) {
  if (priority === "critical") return "danger" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "medium") return "info" as const;
  return "visual" as const;
}

function priorityLabel(priority: PendingItem["priority"]) {
  if (priority === "critical") return "Crítico";
  if (priority === "high") return "Alerta";
  if (priority === "medium") return "Atenção";
  return "OK";
}

function moduleMessage(type: string, items: PendingItem[], fallback: string) {
  if (!items.length) return fallback;
  if (type === "documents") return `${items.length} documento(s) pendente(s)`;
  if (type === "onboarding") return `${items.length} etapa(s) pendente(s)`;
  if (type === "evaluations") return items.length === 1 ? "Avaliação pendente" : `${items.length} avaliações pendentes`;
  if (type === "development") return `${items.length} ação(ões) pendente(s)`;
  if (type === "trainings") {
    if (items.some((item) => item.priority === "critical" || item.typeLabel.toLowerCase().includes("vencido"))) return "Treinamento vencido";
    return "Treinamento pendente ou a vencer";
  }
  if (type === "occupational") {
    if (items.some((item) => item.priority === "critical")) return "ASO ou exame vencido";
    return "ASO ou NR vence em breve";
  }
  if (type === "movements") return "Movimentação aguardando aprovação";
  if (type === "conduct") return "Ocorrência em revisão";
  if (type === "terminations") return "Desligamento em andamento";
  return `${items.length} pendência(s)`;
}

function actionLabel(item: PendingItem) {
  if (item.type === "documents") return "Regularizar documento pendente";
  if (item.type === "onboarding") return item.typeLabel ? `Concluir ${item.typeLabel.replace(/^Onboarding:\s*/i, "").toLowerCase()}` : "Concluir etapa de onboarding";
  if (item.type === "evaluations") return "Finalizar avaliação pendente";
  if (item.type === "development") return "Atualizar ação do Plano de Desenvolvimento (PDI)";
  if (item.type === "trainings") return item.priority === "critical" ? "Regularizar treinamento vencido" : "Concluir treinamento obrigatório";
  if (item.type === "occupational") return item.priority === "critical" ? "Renovar ASO ou exame vencido" : "Acompanhar vencimento ocupacional";
  if (item.type === "movements") return "Aprovar ou efetivar movimentação";
  if (item.type === "conduct") return "Revisar ocorrência de conduta";
  if (item.type === "terminations") return "Acompanhar desligamento em andamento";
  return item.typeLabel;
}

export function HrEmployeeRhSummaryCard({ employeeId }: { employeeId: string }) {
  const query = useQuery({
    queryKey: ["hr", "employees", employeeId, "rh-summary"],
    queryFn: async () => requestJson<PendingResponse>(`/api/hr/pending-center?employeeId=${employeeId}`)
  });
  const items = useMemo(() => query.data?.data ?? [], [query.data?.data]);
  const counts = useMemo(() => {
    const grouped: Record<string, { total: number; critical: number; high: number; items: PendingItem[]; href: string }> = {};
    for (const moduleConfig of modules) grouped[moduleConfig.type] = { total: 0, critical: 0, high: 0, items: [], href: `/rh/employees/${employeeId}` };
    for (const item of items) {
      grouped[item.type] ??= { total: 0, critical: 0, high: 0, items: [], href: item.href };
      grouped[item.type].total += 1;
      grouped[item.type].href = item.href;
      grouped[item.type].items.push(item);
      if (item.priority === "critical") grouped[item.type].critical += 1;
      if (item.priority === "high") grouped[item.type].high += 1;
    }
    return grouped;
  }, [employeeId, items]);
  const score = useMemo(() => Math.max(0, 100 - items.reduce((total, item) => total + priorityWeight(item.priority), 0)), [items]);
  const status = useMemo(() => {
    const hasCriticalModule =
      (counts.documents?.total ?? 0) > 0 ||
      (counts.terminations?.total ?? 0) > 0 ||
      (counts.trainings?.critical ?? 0) > 0 ||
      (counts.occupational?.critical ?? 0) > 0 ||
      items.some((item) => item.priority === "critical");
    if (hasCriticalModule) return { label: "Critico", tone: "danger" as const, description: "Existe pendencia que exige acao imediata do RH." };
    if (items.some((item) => item.priority === "high" || item.priority === "medium")) return { label: "Atencao", tone: "warning" as const, description: "Existem pontos em aberto para acompanhamento." };
    return { label: "Regular", tone: "success" as const, description: "Nenhuma pendencia operacional relevante encontrada." };
  }, [counts, items]);
  const nextActions = useMemo(() => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...items].sort((a, b) => order[a.priority] - order[b.priority] || (a.date || "9999").localeCompare(b.date || "9999")).slice(0, 5);
  }, [items]);

  return (
    <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Resumo Executivo do Colaborador</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Checklist de saude operacional do colaborador: pendencias, vencimentos e acoes prioritarias.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status.tone} label={status.label} />
          <StatusBadge status={score >= 95 ? "success" : score >= 80 ? "info" : score >= 60 ? "warning" : "danger"} label={`Conformidade RH: ${score}%`} />
          <StatusBadge status={query.data?.summary.total ? "warning" : "success"} label={`${query.data?.summary.total ?? 0} pendencia(s)`} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{status.description}</p>
      {query.isLoading ? <LoadingTable label="Carregando resumo RH..." /> : null}
      {query.error ? <ErrorMessage message={query.error instanceof Error ? query.error.message : "Nao foi possivel carregar o resumo executivo. Tente atualizar a pagina."} /> : null}
      {!query.isLoading && !query.error ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {modules.map((moduleConfig) => {
            const value = counts[moduleConfig.type] ?? { total: 0, critical: 0, high: 0, items: [], href: `/rh/employees/${employeeId}` };
            return (
              <div key={moduleConfig.type} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{moduleConfig.label}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-foreground">{moduleMessage(moduleConfig.type, value.items, moduleConfig.ok)}</p>
                  </div>
                  {value.total ? <AlertTriangle className="h-4 w-4 shrink-0 text-primary" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={tone(value.total, value.critical)} label={value.total ? "Acompanhar" : "Ok"} />
                  {value.total ? <Button asChild variant="outline" size="sm"><Link href={value.href}>Abrir</Link></Button> : null}
                </div>
              </div>
            );
          })}
          </div>

          <div className="rounded-md border bg-muted/25 p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Proximas Acoes</h4>
            </div>
            {nextActions.length ? (
              <div className="mt-3 space-y-2">
                {nextActions.map((item, index) => (
                  <div key={`${item.type}:${item.id}`} className="flex min-w-0 flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{index + 1}. {actionLabel(item)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.origin} | {item.typeLabel}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusBadge status={priorityTone(item.priority)} label={priorityLabel(item.priority)} />
                      <Button asChild variant="outline" size="sm"><Link href={item.href}>Abrir</Link></Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma acao imediata. O colaborador esta regular nos modulos consolidados do RH.</p>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
