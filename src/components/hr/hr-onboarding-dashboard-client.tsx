"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, LockKeyhole, Search, ShieldAlert, UserCog, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateLocal as formatDate, formatDateTimeShortYear as formatDateTime } from "@/lib/format";

type QueueType = "blocked" | "critical" | "overdue" | "waiting_rh" | "waiting_manager" | "waiting_ti" | "almost_done";

type OnboardingQueueItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  unitName: string;
  departmentId: string;
  departmentName: string;
  status: string;
  statusLabel: string;
  operationalReleaseStatus: string;
  operationalReleaseLabel: string;
  progressPercent: number;
  totalItems: number;
  resolvedItems: number;
  openItems: number;
  criticalOpenItems: number;
  blockingOpenItems: number;
  overdueItems: number;
  ownerAreas: string[];
  primaryOwnerArea: string;
  primaryOwnerAreaLabel: string;
  nextAction: string;
  nextActionDueAt: string;
  startedAt: string;
  expectedReleaseAt: string;
  updatedAt: string;
  queueTypes: QueueType[];
  actionHref: string;
};

type OnboardingSummary = {
  totalInProgress: number;
  blocked: number;
  critical: number;
  overdue: number;
  waitingRh: number;
  waitingManager: number;
  waitingTi: number;
  almostDone: number;
  byOwnerArea: Array<{ ownerArea: string; ownerAreaLabel: string; total: number }>;
  byUnit: Array<{ unitId: string; unitName: string; total: number }>;
};

type OnboardingResponse = {
  ok: true;
  data: OnboardingQueueItem[];
  summary: OnboardingSummary;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const emptySummary: OnboardingSummary = {
  totalInProgress: 0,
  blocked: 0,
  critical: 0,
  overdue: 0,
  waitingRh: 0,
  waitingManager: 0,
  waitingTi: 0,
  almostDone: 0,
  byOwnerArea: [],
  byUnit: []
};

const ownerAreaOptions = [
  { value: "RH", label: "RH" },
  { value: "GESTOR", label: "Gestor" },
  { value: "TI", label: "TI" },
  { value: "GOVERNANCA", label: "Governança" },
  { value: "RECEPCAO", label: "Recepção" },
  { value: "COZINHA", label: "Cozinha" },
  { value: "MANUTENCAO", label: "Manutenção" },
  { value: "AB", label: "A&B" },
  { value: "ADMINISTRATIVO", label: "Administrativo" }
];

const queueTypeOptions: Array<{ value: QueueType; label: string }> = [
  { value: "blocked", label: "Bloqueados" },
  { value: "critical", label: "Pendência crítica" },
  { value: "overdue", label: "Atrasados" },
  { value: "waiting_rh", label: "Aguardando RH" },
  { value: "waiting_manager", label: "Aguardando gestor" },
  { value: "waiting_ti", label: "Aguardando TI" },
  { value: "almost_done", label: "Quase concluídos" }
];

const statusOptions = [
  { value: "not_started", label: "Não iniciado" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" }
];

const releaseStatusOptions = [
  { value: "blocked", label: "Bloqueado" },
  { value: "partial", label: "Parcialmente liberado" },
  { value: "released", label: "Liberado" },
  { value: "critical_pending", label: "Pendência crítica" }
];

const pageSizeOptions = [10, 20, 50, 100];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível carregar a fila de onboarding.");
  }

  return payload as T;
}

function buildUrl(input: {
  page: number;
  pageSize: number;
  search: string;
  ownerArea: string;
  status: string;
  releaseStatus: string;
  queueType: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize)
  });

  if (input.search.trim()) params.set("search", input.search.trim());
  if (input.ownerArea) params.set("ownerArea", input.ownerArea);
  if (input.status) params.set("status", input.status);
  if (input.releaseStatus) params.set("releaseStatus", input.releaseStatus);
  if (input.queueType) params.set("queueType", input.queueType);

  return `/api/hr/onboarding-dashboard?${params.toString()}`;
}

function releaseTone(status: string) {
  if (status === "released") return "success" as const;
  if (status === "blocked" || status === "critical_pending") return "danger" as const;
  if (status === "partial") return "warning" as const;
  return "visual" as const;
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "visual" as const;
  if (status === "in_progress") return "info" as const;
  return "warning" as const;
}

function queueTypeLabel(type: QueueType) {
  return queueTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function queueTypeTone(type: QueueType) {
  if (type === "blocked" || type === "critical") return "danger" as const;
  if (type === "overdue") return "warning" as const;
  if (type === "almost_done") return "success" as const;
  return "info" as const;
}

export function HrOnboardingDashboardClient() {
  const [search, setSearch] = useState("");
  const [ownerArea, setOwnerArea] = useState("");
  const [status, setStatus] = useState("");
  const [releaseStatus, setReleaseStatus] = useState("");
  const [queueType, setQueueType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const dashboardQuery = useQuery({
    queryKey: ["hr", "onboarding-dashboard", { page, pageSize, search, ownerArea, status, releaseStatus, queueType }],
    queryFn: async () => requestJson<OnboardingResponse>(buildUrl({ page, pageSize, search, ownerArea, status, releaseStatus, queueType }))
  });

  const summary = dashboardQuery.data?.summary ?? emptySummary;
  const items = dashboardQuery.data?.data ?? [];
  const pagination = dashboardQuery.data?.pagination ?? { page, pageSize, total: 0, totalPages: 0 };
  const hasFilters = Boolean(search.trim() || ownerArea || status || releaseStatus || queueType);

  const topOwnerAreas = useMemo(() => summary.byOwnerArea.slice(0, 5), [summary.byOwnerArea]);

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setOwnerArea("");
    setStatus("");
    setReleaseStatus("");
    setQueueType("");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard title="Em andamento" value={String(summary.totalInProgress)} icon={UsersRound} tone={summary.totalInProgress ? "info" : "neutral"} />
        <StatCard title="Bloqueados" value={String(summary.blocked)} icon={LockKeyhole} tone={summary.blocked ? "danger" : "neutral"} />
        <StatCard title="Críticos" value={String(summary.critical)} icon={ShieldAlert} tone={summary.critical ? "danger" : "neutral"} />
        <StatCard title="Atrasados" value={String(summary.overdue)} icon={CalendarClock} tone={summary.overdue ? "warning" : "neutral"} />
        <StatCard title="Aguardando RH" value={String(summary.waitingRh)} icon={UserCog} tone={summary.waitingRh ? "info" : "neutral"} />
        <StatCard title="Aguardando gestor" value={String(summary.waitingManager)} icon={UserCog} tone={summary.waitingManager ? "warning" : "neutral"} />
        <StatCard title="Aguardando TI" value={String(summary.waitingTi)} icon={UserCog} tone={summary.waitingTi ? "info" : "neutral"} />
        <StatCard title="Quase concluídos" value={String(summary.almostDone)} icon={CheckCircle2} tone={summary.almostDone ? "info" : "neutral"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Filtros da fila de onboarding</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Acompanhe pendências operacionais sem expor documentos, arquivos ou dados sensíveis do colaborador.
            </p>
          </div>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_190px_190px_140px]">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="Colaborador, unidade ou próxima ação"
                className="pl-9"
              />
            </div>
          </Field>
          <Field label="Área responsável">
            <SelectField
              value={ownerArea}
              onChange={(event) => {
                setOwnerArea(event.target.value);
                resetPage();
              }}
            >
              <option value="">Todas</option>
              {ownerAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Fila">
            <SelectField
              value={queueType}
              onChange={(event) => {
                setQueueType(event.target.value);
                resetPage();
              }}
            >
              <option value="">Todas</option>
              {queueTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Status">
            <SelectField
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                resetPage();
              }}
            >
              <option value="">Abertos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Liberação">
            <SelectField
              value={releaseStatus}
              onChange={(event) => {
                setReleaseStatus(event.target.value);
                resetPage();
              }}
            >
              <option value="">Todas</option>
              {releaseStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Por página">
            <SelectField
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
      </Card>

      {dashboardQuery.isLoading ? <LoadingTable label="Carregando fila operacional de onboarding..." /> : null}
      {dashboardQuery.error ? (
        <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Erro ao carregar a fila de onboarding."} />
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.error && !items.length ? (
        <EmptyState
          title="Nenhum onboarding encontrado"
          description="Ajuste os filtros ou confirme se existem onboardings em andamento nas unidades permitidas."
        />
      ) : null}

      {items.length ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Fila operacional</h2>
                <p className="text-xs text-muted-foreground">
                  Exibindo {items.length} de {pagination.total} onboardings
                </p>
              </div>
              <StatusBadge status="visual" label={`Página ${pagination.page} de ${Math.max(pagination.totalPages, 1)}`} />
            </div>
          </div>

          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Progresso</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold">Pendências</th>
                  <th className="px-4 py-3 font-semibold">Próxima ação</th>
                  <th className="px-4 py-3 font-semibold">Área</th>
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  <th className="px-4 py-3 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/35">
                    <td className="px-4 py-3">
                      <p className="break-words font-medium text-foreground">{item.employeeName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.departmentName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[150px]">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-foreground">{item.progressPercent}%</span>
                          <span className="text-muted-foreground">
                            {item.resolvedItems}/{item.totalItems}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, item.progressPercent))}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={statusTone(item.status)} label={item.statusLabel} />
                        <StatusBadge status={releaseTone(item.operationalReleaseStatus)} label={item.operationalReleaseLabel} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={item.openItems ? "warning" : "success"} label={`${item.openItems} aberta(s)`} />
                        <StatusBadge status={item.criticalOpenItems ? "danger" : "success"} label={`${item.criticalOpenItems} crítica(s)`} />
                        <StatusBadge status={item.overdueItems ? "danger" : "success"} label={`${item.overdueItems} atrasada(s)`} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[260px] break-words font-medium text-foreground">{item.nextAction}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.nextActionDueAt ? `Prazo: ${formatDate(item.nextActionDueAt)}` : `Atualizado em ${formatDateTime(item.updatedAt)}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status="info" label={item.primaryOwnerAreaLabel} />
                        {item.queueTypes.slice(0, 2).map((type) => (
                          <StatusBadge key={type} status={queueTypeTone(type)} label={queueTypeLabel(type)} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.unitName}</td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={item.actionHref}>
                          Abrir colaborador
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">A fila calcula prioridades sem alterar status ou liberação no banco.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || dashboardQuery.isFetching}>
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= Math.max(pagination.totalPages, 1) || dashboardQuery.isFetching}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {topOwnerAreas.length ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Distribuição por área responsável</h2>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {topOwnerAreas.map((area) => (
              <div key={area.ownerArea || "none"} className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">{area.ownerAreaLabel}</p>
                <p className="mt-1 text-xl font-semibold">{area.total}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
