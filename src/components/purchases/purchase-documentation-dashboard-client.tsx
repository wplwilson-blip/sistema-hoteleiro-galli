"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  ListChecks,
  Paperclip,
  Search,
  ShieldAlert,
  Trophy,
  X
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DashboardSeverity = "critical" | "high" | "medium" | "low" | "ok";
type PendencySeverity = Exclude<DashboardSeverity, "ok">;
type DocumentationClassification = "formal_sufficient" | "acceptable_with_reservation" | "fragile" | "critical";

type DashboardPendency = {
  code: string;
  label: string;
  severity: PendencySeverity;
};

type DashboardSummary = {
  totalQuotes: number;
  critical: number;
  fragile: number;
  acceptableWithReservation: number;
  formalSufficient: number;
  missingRequiredAttachment: number;
  emergencyPendingRegularization: number;
  regularizationOverdue: number;
  regularizationDueSoon: number;
  expiredQuotes: number;
  expiringSoon: number;
  limit: number;
};

type DocumentationDashboardItem = {
  quoteId: string;
  quoteNumber: string | null;
  requestId: string;
  requestCode: string | null;
  requestTitle: string;
  requestStatus: string;
  requestStatusLabel: string;
  approvalStatus: string | null;
  unitId: string;
  unitName: string | null;
  unitCode: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierDocumentNumber: string | null;
  status: string;
  statusLabel: string;
  totalAmount: number;
  totalAmountLabel: string;
  validUntil: string | null;
  quoteDate: string | null;
  createdAt: string;
  updatedAt: string;
  isSelected: boolean;
  quoteSourceType: string | null;
  quoteSourceTypeLabel: string;
  sourceContactChannel: string | null;
  sourceContactChannelLabel: string;
  sourceContactName: string | null;
  sourceReference: string | null;
  sourceUrl: string | null;
  evidenceType: string | null;
  evidenceTypeLabel: string;
  evidenceConfidence: string | null;
  requiresAttachment: boolean;
  requiresJustification: boolean;
  hasFormalEvidence: boolean;
  isVerbalQuote: boolean;
  isEmergencyQuote: boolean;
  emergencyReason: string | null;
  regularizationRequired: boolean;
  regularizationDeadline: string | null;
  activeAttachmentsCount: number;
  daysUntilExpiration: number | null;
  daysUntilRegularization: number | null;
  documentationClassification: DocumentationClassification;
  documentationClassificationLabel: string;
  documentationClassificationReason: string;
  pendencies: DashboardPendency[];
  severity: DashboardSeverity;
};

type UnitSummary = {
  unitId: string;
  unitName: string | null;
  unitCode: string | null;
  totalQuotes: number;
  critical: number;
  fragile: number;
  missingRequiredAttachment: number;
  regularizationOverdue: number;
  emergencyPendingRegularization: number;
  expiredQuotes: number;
  criticalFragilePercentage: number;
};

type PendencyRanking = {
  code: string;
  label: string;
  severity: PendencySeverity;
  count: number;
  percentage: number;
};

type SupplierRanking = {
  supplierId: string | null;
  supplierName: string;
  supplierDocumentNumber: string | null;
  quotesWithPendencies: number;
  totalPendencies: number;
  score: number;
  maxSeverity: DashboardSeverity;
};

type DashboardFilters = {
  createdFrom: string | null;
  createdTo: string | null;
  validUntilFrom: string | null;
  validUntilTo: string | null;
  regularizationFrom: string | null;
  regularizationTo: string | null;
};

type DashboardResponse = {
  ok: true;
  summary: DashboardSummary;
  items: DocumentationDashboardItem[];
  unitSummary: UnitSummary[];
  pendencyRanking: PendencyRanking[];
  supplierRanking: SupplierRanking[];
  filters: DashboardFilters;
};

const emptyDashboardItems: DocumentationDashboardItem[] = [];
const emptyUnitSummary: UnitSummary[] = [];
const emptyPendencyRanking: PendencyRanking[] = [];
const emptySupplierRanking: SupplierRanking[] = [];
const DETAIL_INITIAL_LIMIT = 15;
const MISSING_SUPPLIER_FILTER = "__missing_supplier__";

const severityOrder: Record<DashboardSeverity, number> = {
  ok: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const severityLabels: Record<DashboardSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  ok: "OK"
};

const severityBadgeStatus: Record<DashboardSeverity, "visual" | "warning" | "danger" | "success" | "info"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
  ok: "success"
};

const classificationOptions: Array<{ value: DocumentationClassification; label: string }> = [
  { value: "critical", label: "Crítica" },
  { value: "fragile", label: "Frágil" },
  { value: "acceptable_with_reservation", label: "Aceitável com ressalva" },
  { value: "formal_sufficient", label: "Formal suficiente" }
];

const classificationBadgeStatus: Record<DocumentationClassification, "visual" | "warning" | "danger" | "success" | "info"> = {
  critical: "danger",
  fragile: "warning",
  acceptable_with_reservation: "info",
  formal_sufficient: "success"
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível carregar os dados.");
  }

  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatPercentage(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatDays(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }

  if (value < 0) {
    return `${Math.abs(value)} dia${Math.abs(value) === 1 ? "" : "s"} vencido${Math.abs(value) === 1 ? "" : "s"}`;
  }

  if (value === 0) {
    return "Hoje";
  }

  return `${value} dia${value === 1 ? "" : "s"}`;
}

function uniqueOptions(items: DocumentationDashboardItem[], key: keyof DocumentationDashboardItem) {
  return Array.from(new Set(items.map((item) => item[key]).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right));
}

function getUnitLabel(unit: { unitId: string; unitCode: string | null; unitName: string | null }) {
  return [unit.unitCode, unit.unitName].filter(Boolean).join(" - ") || unit.unitId;
}

function getSupplierFilterKey(supplierId: string | null | undefined) {
  return supplierId || MISSING_SUPPLIER_FILTER;
}

function getSupplierDisplayName(item: DocumentationDashboardItem) {
  return item.supplierName || "Fornecedor não informado";
}

function isNotInformed(value: string | null | undefined) {
  return !value;
}

function getDetailPriority(item: DocumentationDashboardItem) {
  const hasOverdue = item.pendencies.some((pendency) => pendency.code === "regularization_overdue" || pendency.code === "quote_expired");
  const dueSoonPenalty = item.daysUntilExpiration != null && item.daysUntilExpiration >= 0 ? Math.max(0, 7 - item.daysUntilExpiration) : 0;
  return severityOrder[item.severity] * 100 + (hasOverdue ? 20 : 0) + dueSoonPenalty;
}

function matchesSearch(item: DocumentationDashboardItem, search: string) {
  if (!search) {
    return true;
  }

  return [
    item.quoteNumber,
    item.requestCode,
    item.requestTitle,
    item.unitName,
    item.unitCode,
    item.supplierName,
    item.supplierDocumentNumber,
    item.quoteSourceTypeLabel,
    item.evidenceTypeLabel,
    item.pendencies.map((pendency) => pendency.label).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function hasFilter(filters: {
  search: string;
  unit: string;
  classification: string;
  severity: string;
  quoteStatus: string;
  pendency: string;
  supplier: string;
  criticalOnly: boolean;
  createdFrom: string;
  createdTo: string;
  validUntilFrom: string;
  validUntilTo: string;
  regularizationFrom: string;
  regularizationTo: string;
}) {
  return Boolean(
    filters.search.trim() ||
      filters.unit !== "all" ||
      filters.classification !== "all" ||
      filters.severity !== "all" ||
      filters.quoteStatus !== "all" ||
      filters.pendency !== "all" ||
      filters.supplier !== "all" ||
      filters.criticalOnly ||
      filters.createdFrom ||
      filters.createdTo ||
      filters.validUntilFrom ||
      filters.validUntilTo ||
      filters.regularizationFrom ||
      filters.regularizationTo
  );
}

function buildDashboardUrl(filters: DashboardFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/api/purchases/documentation-dashboard?${query}` : "/api/purchases/documentation-dashboard";
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportItemsToCsv(items: DocumentationDashboardItem[]) {
  const headers = [
    "Unidade",
    "Cotação",
    "Solicitação",
    "Fornecedor",
    "Documento fornecedor",
    "Status",
    "Valor",
    "Origem",
    "Tipo de evidência",
    "Classificação",
    "Severidade",
    "Anexos ativos",
    "Validade",
    "Dias até vencimento",
    "Regularização",
    "Dias até regularização",
    "Pendências"
  ];
  const rows = items.map((item) => [
    getUnitLabel(item),
    item.quoteNumber || item.quoteId,
    item.requestCode || item.requestId,
    item.supplierName || "Fornecedor não informado",
    item.supplierDocumentNumber || "",
    item.statusLabel,
    item.totalAmountLabel,
    item.quoteSourceTypeLabel,
    item.evidenceTypeLabel,
    item.documentationClassificationLabel,
    severityLabels[item.severity],
    item.activeAttachmentsCount,
    formatDate(item.validUntil),
    formatDays(item.daysUntilExpiration),
    item.regularizationRequired ? formatDate(item.regularizationDeadline) : "",
    item.regularizationRequired ? formatDays(item.daysUntilRegularization) : "",
    item.pendencies.map((pendency) => pendency.label).join(" | ")
  ]);
  const csv = `\ufeff${[headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pendencias-documentais-cotacoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function PurchaseDocumentationDashboardClient() {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
  const [pendencyFilter, setPendencyFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [visibleDetailCount, setVisibleDetailCount] = useState(DETAIL_INITIAL_LIMIT);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [validUntilFrom, setValidUntilFrom] = useState("");
  const [validUntilTo, setValidUntilTo] = useState("");
  const [regularizationFrom, setRegularizationFrom] = useState("");
  const [regularizationTo, setRegularizationTo] = useState("");

  const dateFilters = useMemo<DashboardFilters>(
    () => ({
      createdFrom: createdFrom || null,
      createdTo: createdTo || null,
      validUntilFrom: validUntilFrom || null,
      validUntilTo: validUntilTo || null,
      regularizationFrom: regularizationFrom || null,
      regularizationTo: regularizationTo || null
    }),
    [createdFrom, createdTo, regularizationFrom, regularizationTo, validUntilFrom, validUntilTo]
  );
  const dashboardUrl = useMemo(() => buildDashboardUrl(dateFilters), [dateFilters]);

  const dashboardQuery = useQuery({
    queryKey: ["purchases", "documentation-dashboard", dateFilters],
    queryFn: async () => requestJson<DashboardResponse>(dashboardUrl)
  });

  const items = dashboardQuery.data?.items ?? emptyDashboardItems;
  const summary = dashboardQuery.data?.summary;
  const unitSummary = dashboardQuery.data?.unitSummary ?? emptyUnitSummary;
  const pendencyRanking = dashboardQuery.data?.pendencyRanking ?? emptyPendencyRanking;
  const supplierRanking = dashboardQuery.data?.supplierRanking ?? emptySupplierRanking;

  const filterOptions = useMemo(() => {
    const units = Array.from(
      new Map(
        items.map((item) => [
          item.unitId,
          {
            id: item.unitId,
            label: getUnitLabel(item)
          }
        ])
      ).values()
    ).sort((left, right) => left.label.localeCompare(right.label));
    const statusLabelsByValue = new Map(items.map((item) => [item.status, item.statusLabel]));
    const statuses = uniqueOptions(items, "status").map((status) => ({ value: status, label: statusLabelsByValue.get(status) ?? status }));
    const pendencies = Array.from(new Map(items.flatMap((item) => item.pendencies).map((pendency) => [pendency.code, pendency])).values()).sort((left, right) =>
      left.label.localeCompare(right.label)
    );

    return { units, statuses, pendencies };
  }, [items]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesSearch(item, normalizedSearch)) return false;
        if (unitFilter !== "all" && item.unitId !== unitFilter) return false;
        if (classificationFilter !== "all" && item.documentationClassification !== classificationFilter) return false;
        if (severityFilter !== "all" && item.severity !== severityFilter) return false;
        if (quoteStatusFilter !== "all" && item.status !== quoteStatusFilter) return false;
        if (pendencyFilter !== "all" && !item.pendencies.some((pendency) => pendency.code === pendencyFilter)) return false;
        if (supplierFilter !== "all" && getSupplierFilterKey(item.supplierId) !== supplierFilter) return false;
        if (criticalOnly && item.documentationClassification !== "critical" && !item.pendencies.some((pendency) => pendency.code === "critical_evidence")) return false;
        return true;
      }),
    [classificationFilter, criticalOnly, items, normalizedSearch, pendencyFilter, quoteStatusFilter, severityFilter, supplierFilter, unitFilter]
  );

  const detailItems = useMemo(
    () =>
      [...filteredItems].sort((left, right) => {
        const priorityDiff = getDetailPriority(right) - getDetailPriority(left);
        return priorityDiff || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [filteredItems]
  );
  const visibleDetailItems = detailItems.slice(0, visibleDetailCount);
  const canShowMoreDetails = visibleDetailItems.length < detailItems.length;
  const selectedSupplierRanking = supplierFilter === "all" ? null : supplierRanking.find((supplier) => getSupplierFilterKey(supplier.supplierId) === supplierFilter) ?? null;

  useEffect(() => {
    setVisibleDetailCount(DETAIL_INITIAL_LIMIT);
  }, [filteredItems]);
  const filters = {
    search,
    unit: unitFilter,
    classification: classificationFilter,
    severity: severityFilter,
    quoteStatus: quoteStatusFilter,
    pendency: pendencyFilter,
    supplier: supplierFilter,
    criticalOnly,
    createdFrom,
    createdTo,
    validUntilFrom,
    validUntilTo,
    regularizationFrom,
    regularizationTo
  };

  function clearFilters() {
    setSearch("");
    setUnitFilter("all");
    setClassificationFilter("all");
    setSeverityFilter("all");
    setQuoteStatusFilter("all");
    setPendencyFilter("all");
    setSupplierFilter("all");
    setCriticalOnly(false);
    setVisibleDetailCount(DETAIL_INITIAL_LIMIT);
    setCreatedFrom("");
    setCreatedTo("");
    setValidUntilFrom("");
    setValidUntilTo("");
    setRegularizationFrom("");
    setRegularizationTo("");
  }

  if (dashboardQuery.isLoading) {
    return <LoadingTable label="Carregando pendências documentais..." />;
  }

  if (dashboardQuery.isError) {
    return <ErrorMessage message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Não foi possível carregar o dashboard."} />;
  }

  if (!summary || !items.length) {
    return <EmptyState title="Nenhuma cotação encontrada" description="Ainda não há cotações nas unidades acessíveis para análise documental." />;
  }

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Cotações analisadas" value={String(summary.totalQuotes)} icon={ClipboardList} />
        <StatCard title="Evidência crítica" value={String(summary.critical)} icon={ShieldAlert} tone="danger" />
        <StatCard title="Evidência frágil" value={String(summary.fragile)} icon={AlertTriangle} tone="warning" />
        <StatCard title="Sem anexo obrigatório" value={String(summary.missingRequiredAttachment)} icon={Paperclip} tone="warning" />
        <StatCard title="Emergência pendente" value={String(summary.emergencyPendingRegularization)} icon={FileText} tone="danger" />
        <StatCard title="Regularização vencida" value={String(summary.regularizationOverdue)} icon={CalendarClock} tone="danger" />
        <StatCard title="Regularização próxima" value={String(summary.regularizationDueSoon)} icon={CalendarClock} tone="warning" />
        <StatCard title="Cotações vencidas/próximas" value={`${summary.expiredQuotes}/${summary.expiringSoon}`} icon={CalendarClock} tone="info" />
      </div>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Filtros gerenciais</p>
            <p className="text-xs text-muted-foreground">Período principal usa a data de criação da cotação. Validade e regularização são filtros auxiliares.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={criticalOnly ? "default" : "outline"} size="sm" onClick={() => setCriticalOnly((current) => !current)}>
              <ShieldAlert className="h-4 w-4" />
              Evidência crítica
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportItemsToCsv(filteredItems)} disabled={!filteredItems.length}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Criadas de
            <Input type="date" aria-label="Criadas de" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Criadas até
            <Input type="date" aria-label="Criadas até" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Validade de
            <Input type="date" aria-label="Validade de" value={validUntilFrom} onChange={(event) => setValidUntilFrom(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Validade até
            <Input type="date" aria-label="Validade até" value={validUntilTo} onChange={(event) => setValidUntilTo(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Regularização de
            <Input type="date" aria-label="Regularização de" value={regularizationFrom} onChange={(event) => setRegularizationFrom(event.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Regularização até
            <Input type="date" aria-label="Regularização até" value={regularizationTo} onChange={(event) => setRegularizationTo(event.target.value)} />
          </label>
        </div>

        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative min-w-0 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar cotação, solicitação, unidade ou fornecedor" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cotação, solicitação, unidade ou fornecedor" className="pl-9" />
          </div>

          <SelectField aria-label="Filtrar por unidade" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
            <option value="all">Todas as unidades</option>
            {filterOptions.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por classificação documental" value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
            <option value="all">Todas as classificações</option>
            {classificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por severidade" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
            <option value="all">Todas as severidades</option>
            {Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por status da cotação" value={quoteStatusFilter} onChange={(event) => setQuoteStatusFilter(event.target.value)}>
            <option value="all">Todos os status</option>
            {filterOptions.statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </SelectField>
        </div>

        <div className="mt-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SelectField aria-label="Filtrar por pendência documental" value={pendencyFilter} onChange={(event) => setPendencyFilter(event.target.value)} className="lg:max-w-md">
            <option value="all">Todas as pendências</option>
            {filterOptions.pendencies.map((pendency) => <option key={pendency.code} value={pendency.code}>{pendency.label}</option>)}
          </SelectField>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Exibindo {filteredItems.length} de {items.length}</span>
            {hasFilter(filters) ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Limpar
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Visão por unidade</h2>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[820px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Críticas</th>
                <th className="px-3 py-2 text-right font-medium">Frágeis</th>
                <th className="px-3 py-2 text-right font-medium">Sem anexo</th>
                <th className="px-3 py-2 text-right font-medium">Reg. vencida</th>
                <th className="px-3 py-2 text-right font-medium">Emergência</th>
                <th className="px-3 py-2 text-right font-medium">% crítica/frágil</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {unitSummary.map((unit) => (
                <tr key={unit.unitId}>
                  <td className="px-3 py-2 font-medium">{getUnitLabel(unit)}</td>
                  <td className="px-3 py-2 text-right">{unit.totalQuotes}</td>
                  <td className="px-3 py-2 text-right">{unit.critical}</td>
                  <td className="px-3 py-2 text-right">{unit.fragile}</td>
                  <td className="px-3 py-2 text-right">{unit.missingRequiredAttachment}</td>
                  <td className="px-3 py-2 text-right">{unit.regularizationOverdue}</td>
                  <td className="px-3 py-2 text-right">{unit.emergencyPendingRegularization}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatPercentage(unit.criticalFragilePercentage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Ranking de pendências</h2>
          </div>
          <div className="space-y-2">
            {pendencyRanking.length ? pendencyRanking.map((pendency) => (
              <div key={pendency.code} className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{pendency.label}</p>
                  <p className="text-xs text-muted-foreground">{formatPercentage(pendency.percentage)} das cotações analisadas</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={severityBadgeStatus[pendency.severity]} label={severityLabels[pendency.severity]} />
                  <span className="text-sm font-semibold">{pendency.count}</span>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sem pendências no período consultado.</p>}
          </div>
        </Card>

        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Fornecedores com mais pendências documentais</h2>
                <p className="text-xs text-muted-foreground">Clique em um fornecedor para reduzir o detalhamento sem alterar a exportação filtrada.</p>
              </div>
            </div>
            {supplierFilter !== "all" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSupplierFilter("all")}>Limpar fornecedor</Button>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1.5fr)_72px_80px_72px_92px] gap-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Fornecedor</span>
              <span className="text-right">Cotações</span>
              <span className="text-right">Pendências</span>
              <span className="text-right">Pontos</span>
              <span className="text-right">Severidade</span>
            </div>
            {supplierRanking.length ? supplierRanking.map((supplier) => {
              const supplierKey = getSupplierFilterKey(supplier.supplierId);
              const isActive = supplierFilter === supplierKey;

              return (
                <button
                  key={supplierKey}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSupplierFilter(isActive ? "all" : supplierKey)}
                  className={`grid w-full grid-cols-[minmax(0,1.5fr)_72px_80px_72px_92px] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${isActive ? "border-primary bg-primary/5" : "bg-background"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{supplier.supplierName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{supplier.supplierDocumentNumber || "Documento não informado"}</span>
                  </span>
                  <span className="text-right text-muted-foreground">{supplier.quotesWithPendencies}</span>
                  <span className="text-right text-muted-foreground">{supplier.totalPendencies}</span>
                  <span className="text-right font-medium text-foreground">{supplier.score}</span>
                  <span className="justify-self-end"><StatusBadge status={severityBadgeStatus[supplier.maxSeverity]} label={severityLabels[supplier.maxSeverity]} /></span>
                </button>
              );
            }) : <p className="text-sm text-muted-foreground">Sem fornecedores com pendências no período consultado.</p>}
          </div>
        </Card>
      </div>

      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Legenda de severidade documental</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(severityLabels).map(([value, label]) => (
            <StatusBadge key={value} status={severityBadgeStatus[value as DashboardSeverity]} label={label} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A severidade é documental e operacional. Ela não representa aprovação financeira nem avaliação formal de fornecedor.</p>
      </Card>

      <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
        <div className="border-b p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Cotações detalhadas</h2>
              <p className="text-xs text-muted-foreground">Use os filtros acima ou clique nos rankings para reduzir a lista. A exportação CSV usa todas as cotações filtradas, não apenas as visíveis.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {selectedSupplierRanking ? (
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Fornecedor: {selectedSupplierRanking.supplierName}</span>
              ) : null}
              <span>Exibindo {visibleDetailItems.length} de {detailItems.length} cotações filtradas</span>
            </div>
          </div>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[1420px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Severidade</th>
                <th className="px-4 py-3 font-medium">Cotação</th>
                <th className="px-4 py-3 font-medium">Solicitação</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Evidência</th>
                <th className="px-4 py-3 text-center font-medium">Anexos</th>
                <th className="px-4 py-3 font-medium">Validade</th>
                <th className="px-4 py-3 font-medium">Dias venc.</th>
                <th className="px-4 py-3 font-medium">Regularização</th>
                <th className="px-4 py-3 font-medium">Dias reg.</th>
                <th className="px-4 py-3 font-medium">Pendências</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleDetailItems.map((item) => (
                <tr key={item.quoteId} className="align-top transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3"><StatusBadge status={severityBadgeStatus[item.severity]} label={severityLabels[item.severity]} /></td>
                  <td className="px-4 py-3">
                    <div className="max-w-40 space-y-1">
                      <p className="break-words font-medium text-foreground">{item.quoteNumber || item.quoteId}</p>
                      <StatusBadge status={item.isSelected ? "success" : "info"} label={item.statusLabel} />
                      <p className="text-xs text-muted-foreground">Criada em {formatDateTime(item.createdAt)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-48 space-y-1">
                      <p className="break-words font-medium text-foreground">{item.requestCode || item.requestId}</p>
                      <p className="break-words text-xs text-muted-foreground">{item.requestTitle || "-"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3"><p className="max-w-36 break-words">{getUnitLabel(item)}</p></td>
                  <td className="px-4 py-3">
                    <div className="max-w-44 space-y-0.5">
                      <p className="break-words font-medium text-foreground">{getSupplierDisplayName(item)}</p>
                      {item.supplierDocumentNumber ? <p className="break-words text-xs text-muted-foreground">{item.supplierDocumentNumber}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{item.totalAmountLabel}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-40 space-y-0.5">
                      <p className={isNotInformed(item.quoteSourceType) ? "break-words text-xs text-muted-foreground" : "break-words text-sm text-foreground"}>{item.quoteSourceTypeLabel}</p>
                      {!isNotInformed(item.sourceContactChannel) ? <p className="break-words text-xs text-muted-foreground">{item.sourceContactChannelLabel}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-48 space-y-1.5">
                      <StatusBadge status={classificationBadgeStatus[item.documentationClassification]} label={item.documentationClassificationLabel} />
                      <p className={isNotInformed(item.evidenceType) ? "break-words text-xs text-muted-foreground" : "break-words text-xs text-foreground"}>{item.evidenceTypeLabel}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.activeAttachmentsCount}</td>
                  <td className="px-4 py-3">{formatDate(item.validUntil)}</td>
                  <td className="px-4 py-3">{formatDays(item.daysUntilExpiration)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-36 space-y-1">
                      <p>{item.regularizationRequired ? formatDate(item.regularizationDeadline) : "-"}</p>
                      {item.isEmergencyQuote ? <StatusBadge status="warning" label="Emergência" /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{item.regularizationRequired ? formatDays(item.daysUntilRegularization) : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-72 flex-wrap gap-1.5">
                      {item.pendencies.length ? item.pendencies.map((pendency) => <StatusBadge key={pendency.code} status={severityBadgeStatus[pendency.severity]} label={pendency.label} />) : <StatusBadge status="success" label="Sem pendência" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!detailItems.length ? <div className="border-t p-6 text-center text-sm text-muted-foreground">Nenhuma cotação encontrada para os filtros selecionados.</div> : null}
        {detailItems.length ? (
          <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>Mostrando {visibleDetailItems.length} de {detailItems.length}. O CSV exporta todas as cotações filtradas.</span>
            <div className="flex flex-wrap gap-2">
              {canShowMoreDetails ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setVisibleDetailCount((current) => Math.min(current + DETAIL_INITIAL_LIMIT, detailItems.length))}>Mostrar mais</Button>
              ) : null}
              {canShowMoreDetails ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setVisibleDetailCount(detailItems.length)}>Ver todos</Button>
              ) : null}
              {visibleDetailItems.length > DETAIL_INITIAL_LIMIT ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleDetailCount(DETAIL_INITIAL_LIMIT)}>Recolher</Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      <p className="text-xs text-muted-foreground">A V2 analisa até {summary.limit} cotações mais recentes das unidades acessíveis após os filtros server-side de data.</p>
    </div>
  );
}
