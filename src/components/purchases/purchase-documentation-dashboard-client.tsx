"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ClipboardList, FileText, Paperclip, Search, ShieldAlert, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DashboardSeverity = "critical" | "high" | "medium" | "low" | "ok";
type DocumentationClassification = "formal_sufficient" | "acceptable_with_reservation" | "fragile" | "critical";

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
  documentationClassification: DocumentationClassification;
  documentationClassificationLabel: string;
  documentationClassificationReason: string;
  pendencies: string[];
  severity: DashboardSeverity;
};

type DashboardResponse = {
  ok: true;
  summary: DashboardSummary;
  items: DocumentationDashboardItem[];
};

const emptyDashboardItems: DocumentationDashboardItem[] = [];

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

function uniqueOptions(items: DocumentationDashboardItem[], key: keyof DocumentationDashboardItem) {
  return Array.from(new Set(items.map((item) => item[key]).filter(Boolean) as string[])).sort((left, right) => left.localeCompare(right));
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
    item.pendencies.join(" ")
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
}) {
  return Boolean(
    filters.search.trim() ||
      filters.unit !== "all" ||
      filters.classification !== "all" ||
      filters.severity !== "all" ||
      filters.quoteStatus !== "all" ||
      filters.pendency !== "all"
  );
}

export function PurchaseDocumentationDashboardClient() {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
  const [pendencyFilter, setPendencyFilter] = useState("all");

  const dashboardQuery = useQuery({
    queryKey: ["purchases", "documentation-dashboard"],
    queryFn: async () => requestJson<DashboardResponse>("/api/purchases/documentation-dashboard")
  });

  const items = dashboardQuery.data?.items ?? emptyDashboardItems;
  const summary = dashboardQuery.data?.summary;

  const filterOptions = useMemo(() => {
    const units = Array.from(
      new Map(
        items.map((item) => [
          item.unitId,
          {
            id: item.unitId,
            label: [item.unitCode, item.unitName].filter(Boolean).join(" - ") || item.unitId
          }
        ])
      ).values()
    ).sort((left, right) => left.label.localeCompare(right.label));
    const statusLabelsByValue = new Map(items.map((item) => [item.status, item.statusLabel]));
    const statuses = uniqueOptions(items, "status").map((status) => ({ value: status, label: statusLabelsByValue.get(status) ?? status }));
    const pendencies = Array.from(new Set(items.flatMap((item) => item.pendencies))).sort((left, right) => left.localeCompare(right));

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
        if (pendencyFilter !== "all" && !item.pendencies.includes(pendencyFilter)) return false;
        return true;
      }),
    [classificationFilter, items, normalizedSearch, pendencyFilter, quoteStatusFilter, severityFilter, unitFilter]
  );

  const filters = { search, unit: unitFilter, classification: classificationFilter, severity: severityFilter, quoteStatus: quoteStatusFilter, pendency: pendencyFilter };

  function clearFilters() {
    setSearch("");
    setUnitFilter("all");
    setClassificationFilter("all");
    setSeverityFilter("all");
    setQuoteStatusFilter("all");
    setPendencyFilter("all");
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
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative min-w-0 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar cotação, solicitação, unidade ou fornecedor" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cotação, solicitação, unidade ou fornecedor" className="pl-9" />
          </div>

          <SelectField aria-label="Filtrar por unidade" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
            <option value="all">Todas as unidades</option>
            {filterOptions.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por classificacao documental" value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
            <option value="all">Todas as classificações</option>
            {classificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por severidade" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
            <option value="all">Todas as severidades</option>
            {Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>

          <SelectField aria-label="Filtrar por status da cotacao" value={quoteStatusFilter} onChange={(event) => setQuoteStatusFilter(event.target.value)}>
            <option value="all">Todos os status</option>
            {filterOptions.statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </SelectField>
        </div>

        <div className="mt-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SelectField aria-label="Filtrar por pendencia documental" value={pendencyFilter} onChange={(event) => setPendencyFilter(event.target.value)} className="lg:max-w-md">
            <option value="all">Todas as pendências</option>
            {filterOptions.pendencies.map((pendency) => <option key={pendency} value={pendency}>{pendency}</option>)}
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

      <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
        <div className="max-w-full overflow-x-auto">
          <table className="min-w-[1180px] text-left text-sm">
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
                <th className="px-4 py-3 font-medium">Regularização</th>
                <th className="px-4 py-3 font-medium">Pendências</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredItems.map((item) => (
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
                  <td className="px-4 py-3"><p className="max-w-36 break-words">{[item.unitCode, item.unitName].filter(Boolean).join(" - ") || "-"}</p></td>
                  <td className="px-4 py-3">
                    <div className="max-w-44 space-y-1">
                      <p className="break-words font-medium text-foreground">{item.supplierName || "-"}</p>
                      <p className="break-words text-xs text-muted-foreground">{item.supplierDocumentNumber || ""}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{item.totalAmountLabel}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-40 space-y-1">
                      <p className="break-words">{item.quoteSourceTypeLabel}</p>
                      <p className="break-words text-xs text-muted-foreground">{item.sourceContactChannelLabel}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-48 space-y-2">
                      <StatusBadge status={classificationBadgeStatus[item.documentationClassification]} label={item.documentationClassificationLabel} />
                      <p className="break-words text-xs text-muted-foreground">{item.evidenceTypeLabel}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.activeAttachmentsCount}</td>
                  <td className="px-4 py-3">{formatDate(item.validUntil)}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-36 space-y-1">
                      <p>{item.regularizationRequired ? formatDate(item.regularizationDeadline) : "-"}</p>
                      {item.isEmergencyQuote ? <StatusBadge status="warning" label="Emergência" /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-72 flex-wrap gap-1.5">
                      {item.pendencies.length ? item.pendencies.map((pendency) => <StatusBadge key={pendency} status={severityBadgeStatus[item.severity]} label={pendency} />) : <StatusBadge status="success" label="Sem pendência" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length ? <div className="border-t p-6 text-center text-sm text-muted-foreground">Nenhuma cotação encontrada para os filtros selecionados.</div> : null}
      </Card>

      <p className="text-xs text-muted-foreground">A V1 analisa até {summary.limit} cotações mais recentes das unidades acessíveis.</p>
    </div>
  );
}





