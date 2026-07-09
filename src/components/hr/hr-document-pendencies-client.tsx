"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileClock,
  FileSearch,
  FileWarning,
  FolderOpen,
  Search,
  ShieldAlert
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateOnlyUtc as formatDate } from "@/lib/format";

type PendingType = "missing_required" | "pending" | "awaiting_review" | "rejected" | "expired" | "expiring_soon";
type QueueView = "admission" | "active" | "expirations" | "rejected" | "dossiers";

type PendingItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  unitName: string;
  departmentId: string;
  departmentName: string;
  documentTypeId: string;
  documentTypeName: string;
  pendingType: PendingType;
  pendingLabel: string;
  status: string;
  statusLabel: string;
  validUntil: string;
  daysUntilDue: number | null;
  isRequired: boolean;
  isSensitiveRedacted: boolean;
  actionHref: string;
};

type PendingSummary = {
  total: number;
  missingRequired: number;
  pending: number;
  awaitingReview: number;
  rejected: number;
  expired: number;
  expiringSoon: number;
  byUnit: Array<{ unitId: string; unitName: string; total: number }>;
  byDepartment: Array<{ departmentId: string; departmentName: string; total: number }>;
};

type PendingResponse = {
  ok: true;
  data: PendingItem[];
  summary: PendingSummary;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const pendingTypes: Array<{ value: PendingType; label: string }> = [
  { value: "missing_required", label: "Documento obrigatorio faltante" },
  { value: "pending", label: "Pendente" },
  { value: "awaiting_review", label: "Aguardando conferencia" },
  { value: "rejected", label: "Rejeitado" },
  { value: "expired", label: "Vencido" },
  { value: "expiring_soon", label: "Vence em breve" }
];

const statusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "received", label: "Enviado" },
  { value: "under_review", label: "Em analise" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "expired", label: "Vencido" },
  { value: "waived", label: "Dispensado" }
];

const pageSizeOptions = [10, 20, 50, 100];
const emptySummary: PendingSummary = {
  total: 0,
  missingRequired: 0,
  pending: 0,
  awaitingReview: 0,
  rejected: 0,
  expired: 0,
  expiringSoon: 0,
  byUnit: [],
  byDepartment: []
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel carregar as pendencias documentais.");
  }

  return payload as T;
}

function buildUrl(input: {
  page: number;
  pageSize: number;
  search: string;
  type: string;
  status: string;
  dueFrom: string;
  dueTo: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize)
  });

  if (input.type) params.set("type", input.type);
  if (input.status) params.set("status", input.status);
  if (input.dueFrom) params.set("dueFrom", input.dueFrom);
  if (input.dueTo) params.set("dueTo", input.dueTo);

  return `/api/hr/document-pendencies?${params.toString()}`;
}

function dueLabel(item: PendingItem) {
  if (!item.validUntil) return "Sem vencimento";
  if (item.daysUntilDue == null) return formatDate(item.validUntil);
  if (item.daysUntilDue < 0) return `Vencido ha ${Math.abs(item.daysUntilDue)} dia${Math.abs(item.daysUntilDue) === 1 ? "" : "s"}`;
  if (item.daysUntilDue === 0) return "Vence hoje";
  return `Vence em ${item.daysUntilDue} dia${item.daysUntilDue === 1 ? "" : "s"}`;
}

function pendingTone(type: PendingType) {
  if (type === "expired" || type === "rejected") return "danger" as const;
  if (type === "missing_required" || type === "pending" || type === "expiring_soon") return "warning" as const;
  if (type === "awaiting_review") return "info" as const;
  return "visual" as const;
}

function documentHref(item: PendingItem) {
  return `${item.actionHref}?tab=documents`;
}

function uniqueEmployees(items: PendingItem[]) {
  const employees = new Map<string, PendingItem>();
  for (const item of items) {
    if (!employees.has(item.employeeId)) employees.set(item.employeeId, item);
  }
  return Array.from(employees.values()).sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}

function classifySections(items: PendingItem[]) {
  const rejectedItems = items.filter((item) => item.pendingType === "rejected");
  const expirationItems = items.filter((item) => item.pendingType === "expired" || item.pendingType === "expiring_soon");
  const activeItems = items.filter((item) => item.pendingType !== "rejected" && item.pendingType !== "expired" && item.pendingType !== "expiring_soon");

  return {
    admissionItems: [] as PendingItem[],
    activeItems,
    expirationItems,
    rejectedItems,
    dossierEmployees: uniqueEmployees(items)
  };
}

function QueueSectionEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4">
      <EmptyState title={title} description={description} />
    </div>
  );
}

function PendenciesTable({ items }: { items: PendingItem[] }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[1240px] text-left text-sm">
        <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Colaborador</th>
            <th className="px-4 py-3 font-semibold">Documento</th>
            <th className="px-4 py-3 font-semibold">Situacao</th>
            <th className="px-4 py-3 font-semibold">Vencimento</th>
            <th className="px-4 py-3 font-semibold">Unidade</th>
            <th className="px-4 py-3 font-semibold">Departamento</th>
            <th className="px-4 py-3 text-right font-semibold">Acoes</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/35">
              <td className="px-4 py-3">
                <p className="break-words font-medium text-foreground">{item.employeeName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Pendencia documental</p>
              </td>
              <td className="px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium text-foreground">{item.documentTypeName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.isRequired ? <StatusBadge status="warning" label="Obrigatorio" /> : <StatusBadge status="visual" label="Opcional" />}
                    {item.isSensitiveRedacted ? <StatusBadge status="visual" label="Restrito" /> : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={pendingTone(item.pendingType)} label={item.pendingLabel} />
                  <StatusBadge status="visual" label={item.statusLabel} />
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <p>{formatDate(item.validUntil)}</p>
                <p className="mt-1 text-xs">{dueLabel(item)}</p>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{item.unitName}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.departmentName}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm">
                    <Link href={documentHref(item)}>
                      Analisar pendencia
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={documentHref(item)}>Abrir dossie completo</Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DossierDirectory({ items }: { items: PendingItem[] }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.employeeId} className="rounded-md border bg-background p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">{item.employeeName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.departmentName}</p>
              <p className="text-xs text-muted-foreground">{item.unitName}</p>
            </div>
            <StatusBadge status="visual" label="Dossie" />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            O dossie completo reune todos os documentos do colaborador. Use esta area para consulta oficial, nao como fila de correcao.
          </p>
          <div className="mt-3 flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={documentHref(item)}>
                Abrir dossie completo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function HrDocumentPendenciesClient() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [queueView, setQueueView] = useState<QueueView>("expirations");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pendenciesQuery = useQuery({
    queryKey: ["hr", "document-pendencies", { page, pageSize, type, status, dueFrom, dueTo }],
    queryFn: async () => requestJson<PendingResponse>(buildUrl({ page, pageSize, search, type, status, dueFrom, dueTo }))
  });

  const summary = pendenciesQuery.data?.summary ?? emptySummary;
  const pagination = pendenciesQuery.data?.pagination ?? { page, pageSize, total: 0, totalPages: 0 };
  const filteredItems = useMemo(() => {
    const items = pendenciesQuery.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.employeeName, item.documentTypeName, item.unitName, item.departmentName, item.pendingLabel]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [pendenciesQuery.data?.data, search]);
  const sections = useMemo(() => classifySections(filteredItems), [filteredItems]);
  const queueViews: Array<{ value: QueueView; label: string; count: number; description: string }> = [
    { value: "admission", label: "Admissao", count: sections.admissionItems.length, description: "Pendencias admissionais quando houver origem estruturada disponivel." },
    { value: "active", label: "Colaboradores ativos", count: sections.activeItems.length, description: "Documentos faltantes, pendentes ou aguardando conferencia." },
    { value: "expirations", label: "Vencimentos", count: sections.expirationItems.length, description: "Documentos vencidos ou com validade proxima." },
    { value: "rejected", label: "Reprovados", count: sections.rejectedItems.length, description: "Itens rejeitados ou que precisam de correcao." },
    { value: "dossiers", label: "Dossies", count: sections.dossierEmployees.length, description: "Consulta do dossie oficial por colaborador." }
  ];
  const activeQueueDescription = queueViews.find((view) => view.value === queueView)?.description ?? "";

  function resetPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setType("");
    setStatus("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
  }

  const hasFilters = Boolean(search.trim() || type || status || dueFrom || dueTo);

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
              <FileSearch className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Onde estou?</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Voce esta na fila operacional de documentos do RH. Use esta tela para acompanhar pendencias, vencimentos e correcoes. O dossie completo continua sendo a consulta oficial do colaborador.
              </p>
            </div>
          </div>
        </Card>
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">O que fazer agora?</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Priorize documentos de admissao, documentos vencidos e itens reprovados. Para consulta completa, abra o dossie do colaborador.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Total na fila" value={String(summary.total)} icon={FileWarning} tone={summary.total ? "warning" : "neutral"} />
        <StatCard title="Obrigatorios faltantes" value={String(summary.missingRequired)} icon={ShieldAlert} tone={summary.missingRequired ? "danger" : "neutral"} />
        <StatCard title="Aguardando conferencia" value={String(summary.awaitingReview)} icon={CheckCircle2} tone={summary.awaitingReview ? "info" : "neutral"} />
        <StatCard title="Rejeitados" value={String(summary.rejected)} icon={FileWarning} tone={summary.rejected ? "danger" : "neutral"} />
        <StatCard title="Vencidos" value={String(summary.expired)} icon={CalendarClock} tone={summary.expired ? "danger" : "neutral"} />
        <StatCard title="Vencendo em breve" value={String(summary.expiringSoon)} icon={FileClock} tone={summary.expiringSoon ? "warning" : "neutral"} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Filtros da fila documental</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Esta visao mostra pendencias operacionais sem expor arquivos, caminhos tecnicos ou documentos pessoais sensiveis.
            </p>
          </div>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_160px_160px_140px]">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Colaborador, documento ou unidade" className="pl-9" />
            </div>
          </Field>
          <Field label="Tipo">
            <SelectField
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                resetPage();
              }}
            >
              <option value="">Todos</option>
              {pendingTypes.map((option) => (
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
              <option value="">Todos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Vence de">
            <Input
              type="date"
              value={dueFrom}
              onChange={(event) => {
                setDueFrom(event.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Vence ate">
            <Input
              type="date"
              value={dueTo}
              onChange={(event) => {
                setDueTo(event.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Por pagina">
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

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Fila por contexto operacional</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Pendencia e item de trabalho; dossie e arquivo oficial completo. Algumas classificacoes dependem de dados estruturados que serao evoluidos em fase futura.
            </p>
          </div>
          <StatusBadge status="visual" label={`Exibindo ${filteredItems.length} de ${pagination.total}`} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {queueViews.map((view) => (
            <button
              key={view.value}
              type="button"
              onClick={() => setQueueView(view.value)}
              className={`rounded-md border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/5 ${queueView === view.value ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10" : "bg-background"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{view.label}</span>
                <StatusBadge status={view.count ? "info" : "visual"} label={String(view.count)} />
              </span>
              <span className="mt-1 block text-xs leading-4 text-muted-foreground">{view.description}</span>
            </button>
          ))}
        </div>
      </Card>

      {pendenciesQuery.isLoading ? <LoadingTable label="Carregando pendencias documentais..." /> : null}
      {pendenciesQuery.error ? <ErrorMessage message={pendenciesQuery.error instanceof Error ? pendenciesQuery.error.message : "Erro ao carregar pendencias documentais."} /> : null}

      {!pendenciesQuery.isLoading && !pendenciesQuery.error && !filteredItems.length ? (
        <EmptyState title="Nenhuma pendencia documental encontrada" description="Ajuste os filtros ou confirme se os dossies dos colaboradores estao regulares para as unidades permitidas." />
      ) : null}

      {filteredItems.length ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">{queueViews.find((view) => view.value === queueView)?.label ?? "Fila operacional"}</h2>
                <p className="text-xs text-muted-foreground">{activeQueueDescription}</p>
              </div>
              <StatusBadge status="visual" label={`Pagina ${pagination.page} de ${Math.max(pagination.totalPages, 1)}`} />
            </div>
          </div>

          {queueView === "admission" ? (
            <QueueSectionEmpty title="Nenhuma pendencia de admissao no momento." description="A API atual da fila traz pendencias de colaboradores ativos. Pendencias admissionais serao separadas quando houver origem/processo estruturado." />
          ) : null}
          {queueView === "active" ? (
            sections.activeItems.length ? <PendenciesTable items={sections.activeItems} /> : <QueueSectionEmpty title="Nenhuma pendencia de colaborador ativo." description="Nao ha documentos faltantes, pendentes ou aguardando conferencia nos filtros atuais." />
          ) : null}
          {queueView === "expirations" ? (
            sections.expirationItems.length ? <PendenciesTable items={sections.expirationItems} /> : <QueueSectionEmpty title="Nenhum vencimento proximo." description="Nao ha documentos vencidos ou vencendo em breve nos filtros atuais." />
          ) : null}
          {queueView === "rejected" ? (
            sections.rejectedItems.length ? <PendenciesTable items={sections.rejectedItems} /> : <QueueSectionEmpty title="Nenhum documento reprovado." description="Nao ha documentos rejeitados ou pendentes de correcao nos filtros atuais." />
          ) : null}
          {queueView === "dossiers" ? (
            sections.dossierEmployees.length ? <DossierDirectory items={sections.dossierEmployees} /> : <QueueSectionEmpty title="Use a busca para localizar um dossie." description="Digite colaborador, documento, unidade ou departamento para reduzir a lista de dossies." />
          ) : null}

          <div className="flex flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">O dossie completo reune todos os documentos do colaborador. Para resolver uma pendencia, use primeiro a acao contextual da fila.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || pendenciesQuery.isFetching}>
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= Math.max(pagination.totalPages, 1) || pendenciesQuery.isFetching}
              >
                Proxima
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
