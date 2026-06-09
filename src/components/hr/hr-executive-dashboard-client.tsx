"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Building2, Download, FileText, Filter, ShieldAlert, UserRound, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type IndicatorData = {
  headcountTotal: number;
  activeEmployees: number;
  inactiveEmployees: number;
  admissions: number;
  terminations: number;
  turnoverSimple: number;
  evaluationsPending: number;
  developmentPlansPending: number;
  trainingsExpired: number;
  trainingsExpiring: number;
  asoExpired: number;
  asoExpiring: number;
  nrExpired: number;
  nrExpiring: number;
  movementsInProgress: number;
  conductOpen: number;
  terminationsInProgress: number;
};

type UnitRow = {
  unitId: string;
  unitLabel: string;
  employees: number;
  trainingsExpired: number;
  asoExpired: number;
  nrExpired: number;
  evaluationsPending: number;
  terminations: number;
  warnings: number;
  movements: number;
};

type DashboardResponse = {
  ok: true;
  data: {
    generatedAt: string;
    indicators: IndicatorData;
    byUnit: UnitRow[];
  };
};

type Pendency = {
  id: string;
  type: string;
  typeLabel: string;
  employeeId: string;
  employeeName: string;
  departmentLabel: string;
  unitLabel: string;
  priority: "critical" | "high" | "medium" | "low";
  date: string;
  origin: string;
  href: string;
};

type PendingResponse = {
  ok: true;
  data: Pendency[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
};

type UnitOption = { id: string; code: string; name: string };
type UnitsResponse = { ok: true; units: UnitOption[] };
type ActionOwner = "hr" | "manager" | "employee";
type ActionView = "employee" | "action";

const reportTypes = [
  ["colaboradores", "Colaboradores"],
  ["treinamentos", "Treinamentos"],
  ["saude_ocupacional", "Saude Ocupacional"],
  ["movimentacoes", "Movimentacoes"],
  ["conduta", "Conduta"],
  ["desligamentos", "Desligamentos"]
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel carregar consolidado do RH.");
  return payload as T;
}

function buildUrl(path: string, params: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function priorityTone(priority: string) {
  if (priority === "critical") return "danger" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "medium") return "info" as const;
  return "visual" as const;
}

function priorityLabel(priority: string) {
  if (priority === "critical") return "Critica";
  if (priority === "high") return "Alta";
  if (priority === "medium") return "Media";
  return "Baixa";
}

function priorityRank(priority: Pendency["priority"]) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function irregularityLevel(priority: Pendency["priority"]) {
  return priority === "critical" ? "critical" : "attention";
}

function irregularityTone(level: string) {
  return level === "critical" ? "danger" as const : "warning" as const;
}

function irregularityLabel(level: string) {
  return level === "critical" ? "Critico" : "Atencao";
}

function actionOwner(item: Pendency): ActionOwner {
  if (item.type === "evaluations" || item.type === "development" || item.type === "movements" || item.type === "conduct") return "manager";
  if (item.type === "onboarding") return "employee";
  return "hr";
}

function actionOwnerLabel(item: Pendency) {
  const owner = actionOwner(item);
  if (owner === "hr") return "RH";
  if (owner === "employee") return "Colaborador";
  return item.departmentLabel && item.departmentLabel !== "Sem departamento" ? `Gestor - ${item.departmentLabel}` : "Gestor";
}

function nextActionText(item: Pendency) {
  const label = item.typeLabel.toLowerCase();
  if (item.type === "documents") return "Solicitar documento pendente.";
  if (item.type === "trainings" && label.includes("reciclagem")) return "Agendar reciclagem obrigatoria.";
  if (item.type === "trainings") return label.includes("vencido") ? "Agendar treinamento obrigatorio." : "Cobrar conclusao do treinamento.";
  if (item.type === "occupational" && label.includes("aso")) return "Agendar exame ocupacional.";
  if (item.type === "occupational" && label.includes("nr")) return "Renovar certificacao obrigatoria.";
  if (item.type === "evaluations") return "Realizar avaliacao pendente.";
  if (item.type === "development") return "Concluir acao de desenvolvimento.";
  if (item.type === "movements") return "Aprovar ou efetivar movimentacao.";
  if (item.type === "conduct") return "Revisar ocorrencia pendente.";
  if (item.type === "terminations") return "Concluir checklist obrigatorio.";
  if (item.type === "onboarding") return "Concluir etapa de onboarding.";
  return "Verificar pendencia.";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[11px] font-semibold text-muted-foreground"
      aria-label={text}
    >
      ?
    </span>
  );
}

function DecisionCard({ title, value, description, tooltip, tone = "neutral" }: { title: string; value: string; description: string; tooltip: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/70"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/70"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50/70"
          : tone === "info"
            ? "border-sky-200 bg-sky-50/70"
            : "border-border bg-background";
  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <InfoHint text={tooltip} />
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function HrExecutiveDashboardClient() {
  const [unitId, setUnitId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [actionOwnerFilter, setActionOwnerFilter] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [actionUrgencyFilter, setActionUrgencyFilter] = useState("");
  const [actionDepartmentFilter, setActionDepartmentFilter] = useState("");
  const [actionView, setActionView] = useState<ActionView>("employee");
  const params = { unitId };
  const dashboardQuery = useQuery({ queryKey: ["hr", "executive-dashboard", params], queryFn: async () => requestJson<DashboardResponse>(buildUrl("/api/hr/executive-dashboard", params)) });
  const pendingQuery = useQuery({ queryKey: ["hr", "pending-center", params], queryFn: async () => requestJson<PendingResponse>(buildUrl("/api/hr/pending-center", params)) });
  const unitsQuery = useQuery({ queryKey: ["base", "units", "executive-dashboard"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const indicators = dashboardQuery.data?.data.indicators;
  const byUnit = dashboardQuery.data?.data.byUnit ?? [];

  const baseActionItems = useMemo(
    () =>
      (pendingQuery.data?.data ?? [])
        .filter((item) => item.priority === "critical" || item.priority === "high" || item.priority === "medium")
        .sort((first, second) => priorityRank(first.priority) - priorityRank(second.priority) || first.date.localeCompare(second.date)),
    [pendingQuery.data?.data]
  );

  const actionItems = useMemo(
    () =>
      baseActionItems
        .filter((item) => !actionOwnerFilter || actionOwner(item) === actionOwnerFilter)
        .filter((item) => !actionTypeFilter || item.type === actionTypeFilter)
        .filter((item) => !actionUrgencyFilter || irregularityLevel(item.priority) === actionUrgencyFilter)
        .filter((item) => !actionDepartmentFilter || item.departmentLabel === actionDepartmentFilter),
    [actionDepartmentFilter, actionOwnerFilter, actionTypeFilter, actionUrgencyFilter, baseActionItems]
  );

  const employeeActionGroups = useMemo(() => {
    const groups = new Map<string, { employeeId: string; employeeName: string; departmentLabel: string; items: Pendency[] }>();
    for (const item of actionItems) {
      const key = item.employeeId || item.id;
      const current = groups.get(key);
      if (current) current.items.push(item);
      else groups.set(key, { employeeId: item.employeeId, employeeName: item.employeeName, departmentLabel: item.departmentLabel, items: [item] });
    }
    return Array.from(groups.values())
      .map((group) => {
        const sortedItems = [...group.items].sort((first, second) => priorityRank(first.priority) - priorityRank(second.priority) || first.date.localeCompare(second.date));
        return { ...group, worstItem: sortedItems[0], count: sortedItems.length };
      })
      .sort((first, second) => priorityRank(first.worstItem.priority) - priorityRank(second.worstItem.priority) || second.count - first.count);
  }, [actionItems]);

  const departments = useMemo(
    () => Array.from(new Set(baseActionItems.map((item) => item.departmentLabel).filter(Boolean))).sort(),
    [baseActionItems]
  );

  const riskByDepartment = useMemo(() => {
    return departments
      .map((department) => {
        const items = baseActionItems.filter((item) => item.departmentLabel === department);
        const critical = items.filter((item) => item.priority === "critical").length;
        const status = critical > 0 ? "critical" : items.length > 1 ? "attention" : "regular";
        const reason =
          status === "critical"
            ? `${critical} pendencia critica exige acao imediata.`
            : status === "attention"
              ? `${items.length} pendencias pedem acompanhamento.`
              : "Apenas acompanhamento pontual nos filtros atuais.";
        return { department, total: items.length, status, reason };
      })
      .sort((first, second) => {
        const rank = { critical: 0, attention: 1, regular: 2 };
        return rank[first.status as keyof typeof rank] - rank[second.status as keyof typeof rank] || second.total - first.total;
      });
  }, [baseActionItems, departments]);

  const pendencies = useMemo(() => (pendingQuery.data?.data ?? []).filter((item) => !typeFilter || item.type === typeFilter), [pendingQuery.data?.data, typeFilter]);
  const actionDepartments = departments;
  const actionHrTotal = baseActionItems.filter((item) => actionOwner(item) === "hr").length;
  const actionManagerTotal = baseActionItems.filter((item) => actionOwner(item) === "manager").length;
  const actionEmployeeTotal = baseActionItems.filter((item) => actionOwner(item) === "employee").length;
  const actionCriticalTotal = baseActionItems.filter((item) => irregularityLevel(item.priority) === "critical").length;
  const actionAttentionTotal = baseActionItems.filter((item) => irregularityLevel(item.priority) === "attention").length;
  const attentionDepartments = riskByDepartment.filter((item) => item.status !== "regular").length;
  const complianceScore = indicators ? Math.max(0, Math.min(100, Math.round(100 - ((actionCriticalTotal * 2 + actionAttentionTotal) / Math.max(indicators.activeEmployees, 1)) * 10))) : 0;
  const complianceTone = complianceScore < 75 ? "danger" : complianceScore < 90 ? "warning" : "success";
  const topActions = baseActionItems.slice(0, 5);

  return (
    <div className="space-y-4">
      <Card id="dashboard-executivo" className="scroll-mt-4 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Painel RH de Decisao</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Situacao geral, riscos por departamento e o que precisa ser resolvido agora.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectField value={unitId} onChange={(event) => setUnitId(event.target.value)}>
              <option value="">Todas as unidades</option>
              {(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      {dashboardQuery.isLoading || pendingQuery.isLoading ? <LoadingTable label="Carregando situacao do RH..." /> : null}
      {dashboardQuery.error ? <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Nao foi possivel carregar o painel do RH. Tente atualizar a pagina."} /> : null}
      {pendingQuery.error ? <ErrorMessage message={pendingQuery.error instanceof Error ? pendingQuery.error.message : "Nao foi possivel carregar pendencias do RH. Tente atualizar a pagina."} /> : null}

      {indicators ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Situacao Geral do RH</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DecisionCard
              title="Conformidade RH"
              value={`${complianceScore}%`}
              description="Regularidade geral nos principais controles."
              tooltip="Mostra o quanto os colaboradores estao regulares em documentos, treinamentos, saude ocupacional e pendencias."
              tone={complianceTone}
            />
            <DecisionCard
              title="Criticos hoje"
              value={String(actionCriticalTotal)}
              description="Pendencias que exigem acao imediata."
              tooltip="Pendencias criticas, como ASO vencido, NR vencida, treinamento vencido ou documento obrigatorio pendente."
              tone={actionCriticalTotal ? "danger" : "success"}
            />
            <DecisionCard
              title="Acoes pendentes"
              value={String(baseActionItems.length)}
              description="Itens com proximo passo definido."
              tooltip="Lista pratica do que precisa ser resolvido, quem resolve e onde clicar."
              tone={baseActionItems.length ? "warning" : "success"}
            />
            <DecisionCard
              title="Departamentos em atencao"
              value={String(attentionDepartments)}
              description="Areas com risco operacional no momento."
              tooltip="Departamentos com pendencias criticas ou volume de pendencias que merece acompanhamento."
              tone={attentionDepartments ? "warning" : "success"}
            />
          </div>
        </Card>
      ) : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Mapa de Risco por Departamento</h2>
          <InfoHint text="Mostra onde esta o maior risco operacional para o RH agir primeiro." />
        </div>
        {!riskByDepartment.length ? (
          <EmptyState title="Nenhum departamento em risco nos filtros atuais" description="Quando houver pendencias, o mapa indicara onde agir primeiro." />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {riskByDepartment.slice(0, 9).map((item) => (
              <div key={item.department} className="rounded-md border bg-background p-3" title={item.reason}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.department}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.total} pendencia{item.total === 1 ? "" : "s"}</p>
                  </div>
                  <StatusBadge status={item.status === "critical" ? "danger" : item.status === "attention" ? "warning" : "success"} label={item.status === "critical" ? "Critico" : item.status === "attention" ? "Atencao" : "Regular"} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{item.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card id="centro-acao-rh" className="scroll-mt-4 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Centro de Acao RH</h2>
              <InfoHint text="Lista pratica do que precisa ser resolvido, quem resolve e onde clicar." />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Quem precisa de atencao e qual e o proximo passo, sem duplicar listas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectField value={actionOwnerFilter} onChange={(event) => setActionOwnerFilter(event.target.value)}>
              <option value="">Todos os responsaveis</option>
              <option value="hr">RH</option>
              <option value="manager">Gestor</option>
              <option value="employee">Colaborador</option>
            </SelectField>
            <SelectField value={actionTypeFilter} onChange={(event) => setActionTypeFilter(event.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="documents">Documentos</option>
              <option value="onboarding">Onboarding</option>
              <option value="evaluations">Avaliacoes</option>
              <option value="development">PDI</option>
              <option value="trainings">Treinamentos</option>
              <option value="occupational">Saude Ocupacional</option>
              <option value="movements">Movimentacoes</option>
              <option value="conduct">Conduta</option>
              <option value="terminations">Desligamentos</option>
            </SelectField>
            <SelectField value={actionUrgencyFilter} onChange={(event) => setActionUrgencyFilter(event.target.value)}>
              <option value="">Todas as urgencias</option>
              <option value="critical">Critico</option>
              <option value="attention">Atencao</option>
            </SelectField>
            <SelectField value={actionDepartmentFilter} onChange={(event) => setActionDepartmentFilter(event.target.value)}>
              <option value="">Todos os departamentos</option>
              {actionDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
            </SelectField>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border bg-background p-3"><p className="text-xs text-muted-foreground">Acoes RH</p><p className="mt-1 text-2xl font-semibold">{actionHrTotal}</p></div>
          <div className="rounded-md border bg-background p-3"><p className="text-xs text-muted-foreground">Acoes gestores</p><p className="mt-1 text-2xl font-semibold">{actionManagerTotal}</p></div>
          <div className="rounded-md border bg-background p-3"><p className="text-xs text-muted-foreground">Acoes colaboradores</p><p className="mt-1 text-2xl font-semibold">{actionEmployeeTotal}</p></div>
          <div className="rounded-md border bg-red-50/60 p-3"><p className="text-xs text-muted-foreground">Criticas</p><p className="mt-1 text-2xl font-semibold">{actionCriticalTotal}</p></div>
          <div className="rounded-md border bg-amber-50/60 p-3"><p className="text-xs text-muted-foreground">Atencao</p><p className="mt-1 text-2xl font-semibold">{actionAttentionTotal}</p></div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={actionView === "employee" ? "default" : "outline"} onClick={() => setActionView("employee")}>Por colaborador</Button>
          <Button type="button" size="sm" variant={actionView === "action" ? "default" : "outline"} onClick={() => setActionView("action")}>Por acao</Button>
        </div>

        {!pendingQuery.isLoading && !pendingQuery.error && !actionItems.length ? (
          <EmptyState title="Nenhuma acao pendente nos filtros atuais" description="Quando houver algo para RH, gestores ou colaboradores resolverem, o proximo passo aparecera aqui." />
        ) : null}

        {actionView === "employee" && employeeActionGroups.length ? (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Departamento</th><th className="px-4 py-3">Pior risco</th><th className="px-4 py-3">Pendencias</th><th className="px-4 py-3">Responsavel principal</th><th className="px-4 py-3">Acao</th></tr>
              </thead>
              <tbody className="divide-y">
                {employeeActionGroups.slice(0, 50).map((group) => (
                  <tr key={group.employeeId} className="align-top">
                    <td className="px-4 py-3 font-medium">{group.employeeName}</td>
                    <td className="px-4 py-3">{group.departmentLabel}</td>
                    <td className="px-4 py-3">{group.worstItem.typeLabel}</td>
                    <td className="px-4 py-3">{group.count === 1 ? "1 pendencia" : `${group.count} pendencias`}</td>
                    <td className="px-4 py-3">{actionOwnerLabel(group.worstItem)}</td>
                    <td className="px-4 py-3"><Button asChild variant="outline" size="sm"><Link href={`/rh/employees/${group.employeeId}`}><UserRound className="h-4 w-4" />Abrir colaborador</Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {actionView === "action" && actionItems.length ? (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Problema</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Responsavel</th><th className="px-4 py-3">Proxima acao</th><th className="px-4 py-3">Urgencia</th><th className="px-4 py-3">Acao</th></tr>
              </thead>
              <tbody className="divide-y">
                {actionItems.slice(0, 50).map((item) => {
                  const level = irregularityLevel(item.priority);
                  return (
                    <tr key={`action:${item.type}:${item.id}`} className="align-top">
                      <td className="px-4 py-3">{item.typeLabel}</td>
                      <td className="px-4 py-3"><p className="font-medium">{item.employeeName}</p><p className="mt-1 text-xs text-muted-foreground">{item.departmentLabel}</p></td>
                      <td className="px-4 py-3">{actionOwnerLabel(item)}</td>
                      <td className="px-4 py-3">{nextActionText(item)}</td>
                      <td className="px-4 py-3"><StatusBadge status={irregularityTone(level)} label={irregularityLabel(level)} /></td>
                      <td className="px-4 py-3"><Button asChild variant="outline" size="sm"><Link href={`/rh/employees/${item.employeeId}`}><UserRound className="h-4 w-4" />Abrir colaborador</Link></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Proximas Acoes</h2>
          </div>
          {!topActions.length ? (
            <EmptyState title="Nenhuma acao urgente agora" description="O RH nao possui pendencias criticas ou de atencao nos filtros atuais." />
          ) : (
            <div className="mt-3 space-y-2">
              {topActions.map((item) => {
                const level = irregularityLevel(item.priority);
                return (
                  <div key={`top:${item.type}:${item.id}`} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{nextActionText(item)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.employeeName} - {item.departmentLabel}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={irregularityTone(level)} label={irregularityLabel(level)} />
                      <Button asChild variant="outline" size="sm"><Link href={`/rh/employees/${item.employeeId}`}>Abrir colaborador</Link></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Atalhos inteligentes</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Caminhos rapidos para resolver pendencias sem procurar no menu.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button asChild variant="outline" size="sm"><Link href="/rh/employees">Ver colaborador</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="#centro-acao-rh">Abrir pendencias</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/treinamentos">Abrir treinamentos</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/saude-ocupacional">Abrir saude ocupacional</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/conduta">Abrir conduta</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/rh/gestao/desligamentos">Abrir desligamentos</Link></Button>
          </div>
        </Card>
      </div>

      <details className="rounded-lg border bg-card p-4 shadow-sm shadow-primary/5">
        <summary className="cursor-pointer text-sm font-semibold">Indicadores detalhados e relatorios</summary>
        {indicators ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard title="Headcount total" value={String(indicators.headcountTotal)} icon={UsersRound} tone="info" />
            <StatCard title="Ativos" value={String(indicators.activeEmployees)} icon={UsersRound} tone="info" />
            <StatCard title="Inativos" value={String(indicators.inactiveEmployees)} icon={UsersRound} tone="neutral" />
            <StatCard title="Admissoes 30d" value={String(indicators.admissions)} icon={UsersRound} tone={indicators.admissions ? "info" : "neutral"} />
            <StatCard title="Desligamentos" value={String(indicators.terminations)} icon={ShieldAlert} tone={indicators.terminations ? "warning" : "neutral"} />
            <StatCard title="Turnover simples" value={`${indicators.turnoverSimple}%`} icon={BarChart3} tone={indicators.turnoverSimple ? "warning" : "neutral"} />
            <StatCard title="Avaliacoes pendentes" value={String(indicators.evaluationsPending)} icon={FileText} tone={indicators.evaluationsPending ? "warning" : "neutral"} />
            <StatCard title="PDIs pendentes" value={String(indicators.developmentPlansPending)} icon={FileText} tone={indicators.developmentPlansPending ? "warning" : "neutral"} />
            <StatCard title="Treinamentos vencidos" value={String(indicators.trainingsExpired)} icon={AlertTriangle} tone={indicators.trainingsExpired ? "danger" : "neutral"} />
            <StatCard title="Treinamentos a vencer" value={String(indicators.trainingsExpiring)} icon={AlertTriangle} tone={indicators.trainingsExpiring ? "warning" : "neutral"} />
            <StatCard title="ASOs vencidos" value={String(indicators.asoExpired)} icon={ShieldAlert} tone={indicators.asoExpired ? "danger" : "neutral"} />
            <StatCard title="ASOs a vencer" value={String(indicators.asoExpiring)} icon={ShieldAlert} tone={indicators.asoExpiring ? "warning" : "neutral"} />
            <StatCard title="NRs vencidas" value={String(indicators.nrExpired)} icon={ShieldAlert} tone={indicators.nrExpired ? "danger" : "neutral"} />
            <StatCard title="NRs a vencer" value={String(indicators.nrExpiring)} icon={ShieldAlert} tone={indicators.nrExpiring ? "warning" : "neutral"} />
            <StatCard title="Movimentacoes" value={String(indicators.movementsInProgress)} icon={BarChart3} tone={indicators.movementsInProgress ? "info" : "neutral"} />
            <StatCard title="Conduta aberta" value={String(indicators.conductOpen)} icon={ShieldAlert} tone={indicators.conductOpen ? "warning" : "neutral"} />
            <StatCard title="Desligamentos em andamento" value={String(indicators.terminationsInProgress)} icon={ShieldAlert} tone={indicators.terminationsInProgress ? "warning" : "neutral"} />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
            <div className="border-b p-4">
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Indicadores por Unidade</h2></div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Colaboradores</th><th className="px-4 py-3">Trein. vencidos</th><th className="px-4 py-3">ASOs vencidos</th><th className="px-4 py-3">NRs vencidas</th><th className="px-4 py-3">Avaliacoes</th><th className="px-4 py-3">Deslig.</th><th className="px-4 py-3">Advert.</th><th className="px-4 py-3">Mov.</th></tr></thead>
                <tbody className="divide-y">{byUnit.map((unit) => <tr key={unit.unitId}><td className="px-4 py-3 font-medium">{unit.unitLabel}</td><td className="px-4 py-3">{unit.employees}</td><td className="px-4 py-3">{unit.trainingsExpired}</td><td className="px-4 py-3">{unit.asoExpired}</td><td className="px-4 py-3">{unit.nrExpired}</td><td className="px-4 py-3">{unit.evaluationsPending}</td><td className="px-4 py-3">{unit.terminations}</td><td className="px-4 py-3">{unit.warnings}</td><td className="px-4 py-3">{unit.movements}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>

          <Card id="relatorios-rh" className="scroll-mt-4 border-border/80 p-4 shadow-sm shadow-primary/5">
            <div className="flex items-center gap-2"><Download className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Relatorios RH</h2></div>
            <p className="mt-1 text-xs text-muted-foreground">Exportacao simples dos dados consolidados da visao atual.</p>
            <div className="mt-3 grid gap-2">
              {reportTypes.map(([type, label]) => (
                <Button key={type} asChild variant="outline" size="sm">
                  <a href={buildUrl("/api/hr/consolidated-reports", { type, unitId })}>
                    <Download className="h-4 w-4" />
                    Exportar {label}
                  </a>
                </Button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="mt-4 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Fila completa de pendencias</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">Consulta detalhada para auditoria ou conferencias. Use o Centro de Acao para a rotina diaria.</p>
            </div>
            <SelectField value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">Todas as origens</option>
              <option value="documents">Documentos</option>
              <option value="onboarding">Onboarding</option>
              <option value="evaluations">Avaliacoes</option>
              <option value="development">PDI</option>
              <option value="trainings">Treinamentos</option>
              <option value="occupational">Saude Ocupacional</option>
              <option value="movements">Movimentacoes</option>
              <option value="conduct">Conduta</option>
              <option value="terminations">Desligamentos</option>
            </SelectField>
          </div>
          {!pendingQuery.isLoading && !pendencies.length ? <EmptyState title="Nenhuma pendencia encontrada" description="Quando houver documentos, treinamentos, saude ocupacional ou processos pendentes, eles aparecerao aqui." /> : null}
          {pendencies.length ? (
            <div className="mt-4 overflow-x-auto rounded-md border">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Unidade</th><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Acao</th></tr></thead>
                <tbody className="divide-y">{pendencies.slice(0, 50).map((item) => <tr key={`${item.type}:${item.id}`}><td className="px-4 py-3">{item.typeLabel}</td><td className="px-4 py-3">{item.employeeName}</td><td className="px-4 py-3">{item.unitLabel}</td><td className="px-4 py-3"><StatusBadge status={priorityTone(item.priority)} label={priorityLabel(item.priority)} /></td><td className="px-4 py-3">{formatDate(item.date)}</td><td className="px-4 py-3">{item.origin}</td><td className="px-4 py-3"><Button asChild variant="outline" size="sm"><Link href={item.href}>Abrir</Link></Button></td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </details>
    </div>
  );
}
