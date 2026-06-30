"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, Building2, CalendarClock, Check, ClipboardCheck, RotateCcw, Search, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorMessage, Field, LoadingTable, TextArea } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type ApprovalStatus = "pending" | "approved" | "rejected" | "returned_to_purchases";
type ApprovalLevel = "administrative_management" | "general_directorate";

type ApprovalQuote = {
  id: string;
  supplierName: string;
  supplierTradeName: string;
  supplierDocumentNumber: string;
  quoteNumber: string;
  totalAmount: number;
  totalAmountLabel: string;
  deliveryDays: number | string;
  paymentTerms: string;
  isSelected: boolean;
  statusLabel: string;
  evidence?: ApprovalQuoteEvidence | null;
  attachments: ApprovalAttachment[];
};

type ApprovalQuoteEvidence = {
  quoteSourceTypeLabel?: string | null;
  evidenceTypeLabel?: string | null;
  evidenceConfidence?: string | null;
  evidenceConfidenceLabel?: string | null;
  sourceContactName?: string | null;
  sourceContactChannelLabel?: string | null;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  sourceNotes?: string | null;
  evidenceMissingReason?: string | null;
  emergencyReason?: string | null;
  regularizationRequired?: boolean | null;
  regularizationDeadline?: string | null;
  hasFormalEvidence?: boolean | null;
  isVerbalQuote?: boolean | null;
  isEmergencyQuote?: boolean | null;
  documentaryClassification?: string | null;
  documentaryClassificationLabel?: string | null;
  documentaryClassificationSeverity?: "success" | "info" | "warning" | "danger" | null;
  documentaryClassificationReason?: string | null;
  requiresDirectorApproval?: boolean | null;
  auditAlerts?: string[];
};

type ApprovalAttachment = {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  description: string;
  createdAt: string;
  signedUrl?: string;
};

type ApprovalItem = {
  id: string;
  description: string;
  quantity: number;
  unitOfMeasureLabel: string;
  notes: string;
};

type ApprovalDecision = {
  id: string;
  decision: "approved" | "rejected" | "returned_to_purchases";
  approvalLevelLabel: string;
  justification: string;
  decidedByName: string;
  decidedAt: string;
};

type ApprovalRecord = {
  id: string;
  purchaseRequestId: string;
  snapshotNumber: number;
  isLegacyWithoutSnapshot?: boolean;
  unitName: string;
  unitCode: string;
  departmentName: string;
  departmentCode: string;
  requestedByName: string;
  requestNumber: string;
  title: string;
  justification: string;
  priorityLabel: string;
  requestTypeLabel: string;
  totalApprovedAmountLabel: string;
  approvalStatus: ApprovalStatus;
  approvalLevel: ApprovalLevel;
  approvalLevelLabel: string;
  approvalDecidedAt: string;
  approvalDecisionNotes: string;
  approvalDecidedByName: string;
  submittedAt: string;
  winningQuote: ApprovalQuote | null;
  recommendedQuote: ApprovalQuote | null;
  quotes: ApprovalQuote[];
  winnerDiffersFromRecommended: boolean;
  items: ApprovalItem[];
  decisions: ApprovalDecision[];
};

type ApprovalsResponse = {
  ok: true;
  approvals: ApprovalRecord[];
};

type DecisionFormState = {
  open: boolean;
  decision: "approved" | "rejected" | "returned_to_purchases";
  approval: ApprovalRecord | null;
  justification: string;
};

const emptyDecisionState: DecisionFormState = {
  open: false,
  decision: "approved",
  approval: null,
  justification: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getApprovalStatusLabel(status: ApprovalStatus) {
  if (status === "approved") {
    return "Compra aprovada";
  }

  if (status === "rejected") {
    return "Compra reprovada";
  }
  if (status === "returned_to_purchases") {
    return "Devolvida para Compras";
  }

  return "Aguardando aprovação";
}

function getApprovalStatusTone(status: ApprovalStatus) {
  if (status === "approved") {
    return "success" as const;
  }

  if (status === "rejected") {
    return "danger" as const;
  }
  if (status === "returned_to_purchases") {
    return "info" as const;
  }

  return "warning" as const;
}

function buildUnitLabel(approval: ApprovalRecord) {
  return approval.unitCode ? `${approval.unitCode} - ${approval.unitName}` : approval.unitName || "Unidade não informada";
}

function buildDepartmentLabel(approval: ApprovalRecord) {
  return approval.departmentCode ? `${approval.departmentCode} - ${approval.departmentName}` : approval.departmentName || "Departamento não informado";
}

function getDossierSourceLabel(approval: ApprovalRecord) {
  return approval.isLegacyWithoutSnapshot ? "Registro legado" : `Dossiê formal #${approval.snapshotNumber}`;
}

function getDossierSourceTone(approval: ApprovalRecord) {
  return approval.isLegacyWithoutSnapshot ? "info" : "success";
}

function quoteSupplierLabel(quote: ApprovalQuote | null) {
  if (!quote) {
    return "-";
  }

  return quote.supplierTradeName || quote.supplierName || "Fornecedor não informado";
}

function normalizeVisibleText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isCriticalEvidenceAlert(alert: string) {
  const normalized = normalizeVisibleText(alert);
  return normalized.includes("critica") || normalized.includes("sem evidencia");
}

function getApprovalEvidenceRisk(approval: ApprovalRecord) {
  const evidences = approval.quotes.map((quote) => quote.evidence).filter(Boolean) as ApprovalQuoteEvidence[];

  if (
    evidences.some(
      (evidence) =>
        evidence.requiresDirectorApproval ||
        evidence.documentaryClassification === "critical" ||
        evidence.documentaryClassificationSeverity === "danger"
    )
  ) {
    return {
      tone: "danger" as const,
      label: "Evidência crítica",
      description: "Atenção: este dossiê possui evidência documental crítica. Revise anexos, justificativas e alçada antes da decisão."
    };
  }

  if (
    evidences.some(
      (evidence) =>
        evidence.documentaryClassification === "fragile" ||
        evidence.documentaryClassificationSeverity === "warning"
    )
  ) {
    return {
      tone: "warning" as const,
      label: "Evidência frágil",
      description: "Este dossiê possui evidência documental frágil. A pendência não impede automaticamente a decisão, mas exige análise gerencial."
    };
  }

  return null;
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: number; icon: LucideIcon }) {
  return (
    <Card className="p-4 shadow-sm shadow-primary/5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function DossierInfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
        {value || "-"}
      </p>
    </div>
  );
}

function ApprovalCardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
        {value || "-"}
      </p>
    </div>
  );
}

function QuoteBox({ title, quote, tone = "default" }: { title: string; quote: ApprovalQuote | null; tone?: "default" | "success" }) {
  const evidence = quote?.evidence ?? null;

  return (
    <div className={cn("rounded-md border p-4", tone === "success" ? "border-emerald-200 bg-emerald-50/70" : "bg-background")}>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {quote ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-semibold text-foreground">{quote.quoteNumber}</p>
            <StatusBadge status="visual" label={quote.statusLabel} />
          </div>
          <p className="break-words text-sm text-foreground">{quoteSupplierLabel(quote)}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Total: {quote.totalAmountLabel}</span>
            <span>Prazo: {quote.deliveryDays || "-"} dias</span>
            <span>Pagamento: {quote.paymentTerms || "-"}</span>
          </div>
          {evidence ? (
            <div className="space-y-2 rounded-md border bg-background/70 p-3 text-xs text-muted-foreground">
              <div className="grid gap-1 sm:grid-cols-2">
                <span>Classificação: <strong className="font-medium text-foreground">{evidence.documentaryClassificationLabel || "-"}</strong></span>
                <span>Origem: <strong className="font-medium text-foreground">{evidence.quoteSourceTypeLabel || "-"}</strong></span>
                <span>Evidência: <strong className="font-medium text-foreground">{evidence.evidenceTypeLabel || "-"}</strong></span>
                <span>Confiabilidade: <strong className="font-medium text-foreground">{evidence.evidenceConfidenceLabel || "-"}</strong></span>
                <span>Contato/canal: <strong className="font-medium text-foreground">{[evidence.sourceContactName, evidence.sourceContactChannelLabel].filter(Boolean).join(" / ") || "-"}</strong></span>
                <span>Referência: <strong className="font-medium text-foreground">{evidence.sourceReference || "-"}</strong></span>
                <span>Regularização: <strong className="font-medium text-foreground">{evidence.regularizationRequired ? evidence.regularizationDeadline || "Necessária" : "Não"}</strong></span>
              </div>
              {evidence.documentaryClassificationReason ? (
                <p className="break-words">Motivo da classificação: <span className="text-foreground">{evidence.documentaryClassificationReason}</span></p>
              ) : null}
              {evidence.requiresDirectorApproval ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                  Evidência crítica: aprovação restrita à Diretoria.
                </div>
              ) : null}
              {evidence.sourceUrl ? (
                <a className="inline-flex break-all font-medium text-primary underline-offset-4 hover:underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                  {evidence.sourceUrl}
                </a>
              ) : null}
              {evidence.sourceNotes || evidence.evidenceMissingReason || evidence.emergencyReason ? (
                <div className="space-y-1">
                  {evidence.sourceNotes ? <p className="break-words">Observações: <span className="text-foreground">{evidence.sourceNotes}</span></p> : null}
                  {evidence.evidenceMissingReason ? <p className="break-words">Ausência de evidência: <span className="text-foreground">{evidence.evidenceMissingReason}</span></p> : null}
                  {evidence.emergencyReason ? <p className="break-words">Emergência: <span className="text-foreground">{evidence.emergencyReason}</span></p> : null}
                </div>
              ) : null}
              {evidence.auditAlerts?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {evidence.auditAlerts.map((alert) => (
                    <StatusBadge key={alert} status={isCriticalEvidenceAlert(alert) ? "danger" : "warning"} label={alert} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Não localizada.</p>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function AttachmentsList({ attachments }: { attachments: ApprovalAttachment[] }) {
  if (!attachments.length) {
    return <p className="text-sm text-muted-foreground">Nenhum anexo cadastrado.</p>;
  }
  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="rounded-md border bg-muted/20 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-semibold text-foreground">{attachment.fileName}</p>
              <p className="text-xs text-muted-foreground">{attachment.fileMimeType} • {formatFileSize(attachment.fileSizeBytes)} • {formatDateTime(attachment.createdAt)}</p>
              {attachment.description ? <p className="break-words text-xs text-muted-foreground">Descrição: {attachment.description}</p> : null}
            </div>
            {attachment.signedUrl ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={attachment.signedUrl} target="_blank" rel="noreferrer">Abrir</a>
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PurchaseApprovalsClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApprovalStatus>("pending");
  const [levelFilter, setLevelFilter] = useState<"all" | ApprovalLevel>("all");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [decisionState, setDecisionState] = useState<DecisionFormState>(emptyDecisionState);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const approvalsQuery = useQuery({
    queryKey: ["purchases", "approvals"],
    queryFn: async () => requestJson<ApprovalsResponse>("/api/purchases/approvals")
  });

  const approvals = useMemo(() => approvalsQuery.data?.approvals ?? [], [approvalsQuery.data?.approvals]);

  const summary = useMemo(
    () => ({
      pending: approvals.filter((approval) => approval.approvalStatus === "pending").length,
      approved: approvals.filter((approval) => approval.approvalStatus === "approved").length,
      rejected: approvals.filter((approval) => approval.approvalStatus === "rejected").length,
      returned: approvals.filter((approval) => approval.approvalStatus === "returned_to_purchases").length,
      administrative: approvals.filter((approval) => approval.approvalLevel === "administrative_management").length,
      directorate: approvals.filter((approval) => approval.approvalLevel === "general_directorate").length
    }),
    [approvals]
  );

  const filteredApprovals = useMemo(() => {
    const term = search.trim().toLowerCase();

    return approvals.filter((approval) => {
      if (statusFilter !== "all" && approval.approvalStatus !== statusFilter) {
        return false;
      }

      if (levelFilter !== "all" && approval.approvalLevel !== levelFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        approval.requestNumber,
        approval.title,
        approval.requestedByName,
        approval.winningQuote?.supplierName,
        approval.winningQuote?.supplierTradeName,
        approval.recommendedQuote?.supplierName,
        approval.recommendedQuote?.supplierTradeName
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [approvals, levelFilter, search, statusFilter]);

  const selectedApproval = filteredApprovals.find((approval) => approval.id === selectedApprovalId) ?? null;
  const selectedApprovalEvidenceRisk = selectedApproval ? getApprovalEvidenceRisk(selectedApproval) : null;

  const decisionMutation = useMutation({
    mutationFn: async (input: { approval: ApprovalRecord; decision: "approved" | "rejected" | "returned_to_purchases"; justification: string }) =>
      requestJson<{ ok: true; message: string }>(`/api/purchases/approvals/${input.approval.purchaseRequestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision: input.decision, justification: input.justification })
      }),
    onSuccess: async (payload) => {
      setError("");
      setFeedback(payload.message);
      setDecisionState(emptyDecisionState);
      setSelectedApprovalId("");
      await queryClient.invalidateQueries({ queryKey: ["purchases", "approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["purchases", "requests"] });
      await queryClient.invalidateQueries({ queryKey: ["purchases", "quotes"] });
    },
    onError: (mutationError) => {
      setFeedback("");
      setError(mutationError instanceof Error ? mutationError.message : "Não foi possível registrar a decisão.");
    }
  });

  function openDecision(approval: ApprovalRecord, decision: "approved" | "rejected" | "returned_to_purchases") {
    setError("");
    setFeedback("");
    setDecisionState({ open: true, approval, decision, justification: "" });
  }

  function submitDecision() {
    if (!decisionState.approval) {
      return;
    }

    if ((decisionState.decision === "rejected" || decisionState.decision === "returned_to_purchases") && !decisionState.justification.trim()) {
      setError(decisionState.decision === "rejected" ? "Informe a justificativa para reprovar a compra." : "Informe o que Compras precisa revisar.");
      return;
    }

    decisionMutation.mutate({
      approval: decisionState.approval,
      decision: decisionState.decision,
      justification: decisionState.justification.trim()
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="Aguardando aprovação" value={summary.pending} icon={ClipboardCheck} />
        <SummaryCard title="Aprovadas" value={summary.approved} icon={Check} />
        <SummaryCard title="Reprovadas" value={summary.rejected} icon={Ban} />
        <SummaryCard title="Devolvidas" value={summary.returned} icon={RotateCcw} />
        <SummaryCard title="Gerência Administrativa" value={summary.administrative} icon={ShieldCheck} />
        <SummaryCard title="Diretoria Geral" value={summary.directorate} icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm shadow-primary/5 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
        <Field label="Buscar">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número, título, fornecedor ou solicitante" />
          </div>
        </Field>
        <Field label="Status">
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ApprovalStatus)}>
            <option value="all">Todos</option>
            <option value="pending">Aguardando aprovação</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
            <option value="returned_to_purchases">Devolvidas para Compras</option>
          </select>
        </Field>
        <Field label="Alçada">
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as "all" | ApprovalLevel)}>
            <option value="all">Todas</option>
            <option value="administrative_management">Gerência Administrativa</option>
            <option value="general_directorate">Diretoria Geral</option>
          </select>
        </Field>
      </div>

      {feedback ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{feedback}</div> : null}
      {error ? <ErrorMessage message={error} /> : null}

      {approvalsQuery.isLoading ? <LoadingTable label="Carregando aprovações..." /> : null}
      {approvalsQuery.error ? <ErrorMessage message={approvalsQuery.error instanceof Error ? approvalsQuery.error.message : "Erro ao carregar aprovações."} /> : null}

      {!approvalsQuery.isLoading && !filteredApprovals.length ? (
        <EmptyState
          title="Nenhuma compra aguardando aprovação."
          description="Compras com cotação vencedora aparecerão aqui quando forem enviadas para decisão."
        />
      ) : null}

      {filteredApprovals.length ? (
        <div className="space-y-3">
          <section className="space-y-3">
            {filteredApprovals.map((approval) => {
              const isSelected = selectedApproval?.id === approval.id;
              const departmentLabel = approval.departmentName || approval.departmentCode ? buildDepartmentLabel(approval) : "";
              const evidenceRisk = getApprovalEvidenceRisk(approval);

              return (
                <article
                  key={approval.id}
                  className={cn(
                    "w-full rounded-lg border bg-card text-left shadow-sm shadow-primary/5 transition-colors hover:border-primary/30",
                    isSelected && "border-primary bg-primary/5"
                  )}
                >
                  <button type="button" className="w-full p-4 text-left" onClick={() => setSelectedApprovalId(approval.id)}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{approval.requestNumber}</p>
                        <StatusBadge status={getDossierSourceTone(approval)} label={getDossierSourceLabel(approval)} />
                        <StatusBadge status={getApprovalStatusTone(approval.approvalStatus)} label={getApprovalStatusLabel(approval.approvalStatus)} />
                        </div>
                        <div className="space-y-1">
                        <p className="break-words text-sm font-medium text-foreground">{approval.title}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>Unidade: {buildUnitLabel(approval)}</span>
                            {departmentLabel ? <span>Departamento: {departmentLabel}</span> : null}
                            <span>Fornecedor: {quoteSupplierLabel(approval.winningQuote)}</span>
                          </div>
                    </div>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
                      <p className="text-base font-semibold text-foreground">{approval.totalApprovedAmountLabel}</p>
                    </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <ApprovalCardMetric label="Valor total" value={approval.totalApprovedAmountLabel} />
                      <ApprovalCardMetric label="Alçada" value={approval.approvalLevelLabel} />
                      <ApprovalCardMetric label="Envio" value={formatDateTime(approval.submittedAt)} />
                      <ApprovalCardMetric label="Dossiê formal" value={getApprovalStatusLabel(approval.approvalStatus)} />
                    </div>
                    {evidenceRisk ? (
                      <div className={cn("mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs", evidenceRisk.tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{evidenceRisk.description}</span>
                      </div>
                    ) : null}
                    {approval.winnerDiffersFromRecommended ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Vencedora diferente da recomendada.
                    </div>
                    ) : null}
                  </button>
                  <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    {approval.isLegacyWithoutSnapshot ? (
                      <div className="flex min-w-0 items-start gap-2 text-xs text-sky-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Registro legado sem dossiê formal. Consulte o histórico, mas novas decisões exigem reenvio formal.</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Fotografia formal do envio para aprovação.</p>
                    )}
                    <Button type="button" size="sm" onClick={() => setSelectedApprovalId(approval.id)} data-testid="aprovacao-ver-dossie">
                      <Search className="h-4 w-4" />
                      Ver dossiê
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      ) : null}

      {selectedApproval ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-2 py-3 backdrop-blur-sm sm:px-4 sm:py-6" role="presentation" onClick={() => setSelectedApprovalId("")}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-dossier-title"
            className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Dossiê formal de aprovação</p>
                <h2 id="approval-dossier-title" className="mt-1 truncate text-lg font-semibold text-foreground">
                  {selectedApproval.requestNumber}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={getApprovalStatusTone(selectedApproval.approvalStatus)} label={getApprovalStatusLabel(selectedApproval.approvalStatus)} />
                  <StatusBadge status={getDossierSourceTone(selectedApproval)} label={getDossierSourceLabel(selectedApproval)} />
                  <StatusBadge status="info" label={selectedApproval.approvalLevelLabel} />
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedApprovalId("")}>
                <Ban className="h-4 w-4" />
                Fechar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              <div className="space-y-4">
                <Card className="p-5 shadow-sm shadow-primary/5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Detalhe da aprovação administrativa</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{selectedApproval.requestNumber}</h2>
                        <StatusBadge status={getApprovalStatusTone(selectedApproval.approvalStatus)} label={getApprovalStatusLabel(selectedApproval.approvalStatus)} />
                        <StatusBadge status={getDossierSourceTone(selectedApproval)} label={getDossierSourceLabel(selectedApproval)} />
                        <StatusBadge status="info" label={selectedApproval.approvalLevelLabel} />
                      </div>
                      <h3 className="break-words text-base font-semibold">{selectedApproval.title}</h3>
                      <p className="break-words text-sm text-muted-foreground">{selectedApproval.justification}</p>
                      <p className="break-words text-xs leading-5 text-muted-foreground">
                        Esta decisão valida administrativamente a compra e seu dossiê documental. Ela não representa pagamento financeiro. Revise fornecedor, valores, evidências, anexos e alçada antes da decisão.
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Unidade: {buildUnitLabel(selectedApproval)}</span>
                        <span>Departamento: {buildDepartmentLabel(selectedApproval)}</span>
                        <span>Solicitante: {selectedApproval.requestedByName || "-"}</span>
                      </div>
                      <div className="grid gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-4">
                        <DossierInfoTile label="Valor" value={selectedApproval.totalApprovedAmountLabel} icon={WalletCards} />
                        <DossierInfoTile label="Unidade" value={buildUnitLabel(selectedApproval)} icon={Building2} />
                        <DossierInfoTile label="Solicitante" value={selectedApproval.requestedByName || "-"} icon={UserRound} />
                        <DossierInfoTile label="Envio formal" value={formatDateTime(selectedApproval.submittedAt)} icon={CalendarClock} />
                      </div>
                    </div>
                    {selectedApproval.approvalStatus === "pending" && !selectedApproval.isLegacyWithoutSnapshot ? (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Decisão administrativa</p>
                        <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => openDecision(selectedApproval, "approved")} data-testid="aprovacao-aprovar">
                          <Check className="h-4 w-4" />
                          Aprovar
                        </Button>
                        <Button type="button" variant="outline" onClick={() => openDecision(selectedApproval, "returned_to_purchases")}>
                          <RotateCcw className="h-4 w-4" />
                          Devolver para Compras
                        </Button>
                        <Button type="button" variant="danger" onClick={() => openDecision(selectedApproval, "rejected")}>
                          <Ban className="h-4 w-4" />
                          Reprovar
                        </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Card>

                {selectedApprovalEvidenceRisk ? (
                  <div className={cn("flex items-start gap-2 rounded-md border px-4 py-3 text-sm", selectedApprovalEvidenceRisk.tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">{selectedApprovalEvidenceRisk.label}</p>
                      <p className="text-xs">{selectedApprovalEvidenceRisk.description}</p>
                    </div>
                  </div>
                ) : null}

                {selectedApproval.winnerDiffersFromRecommended ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    A cotação vencedora selecionada é diferente da cotação recomendada pelo sistema. Avalie a justificativa operacional antes de decidir.
                  </div>
                ) : null}

                {selectedApproval.isLegacyWithoutSnapshot ? (
                  <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Esta aprovação é anterior ao dossiê formal. Ela aparece para consulta histórica, mas não permite decisão nesta tela; para nova decisão, a compra precisa ser reenviada formalmente para aprovação.</span>
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <QuoteBox title="Cotação vencedora" quote={selectedApproval.winningQuote} tone="success" />
                  <QuoteBox title="Cotação recomendada pelo sistema" quote={selectedApproval.recommendedQuote} />
                </div>

                <Card className="p-5 shadow-sm shadow-primary/5">
                  <h3 className="text-sm font-semibold">Anexos da cotação vencedora</h3>
                  <div className="mt-4">
                    <AttachmentsList attachments={selectedApproval.winningQuote?.attachments ?? []} />
                  </div>
                </Card>

                <Card className="p-5 shadow-sm shadow-primary/5">
                  <h3 className="text-sm font-semibold">Comparativo completo das cotações</h3>
                  <div className="mt-4 space-y-3">
                    {selectedApproval.quotes.map((quote) => (
                      <div key={quote.id} className={cn("rounded-md border bg-background p-4", quote.isSelected && "border-emerald-300 bg-emerald-50/60")}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">{quote.quoteNumber}</p>
                              <StatusBadge status="visual" label={quote.statusLabel} />
                              {quote.isSelected ? <StatusBadge status="success" label="Vencedora" /> : null}
                              {selectedApproval.recommendedQuote?.id === quote.id ? <StatusBadge status="info" label="Recomendada" /> : null}
                            </div>
                            <p className="break-words text-sm text-foreground">{quoteSupplierLabel(quote)}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>Total: {quote.totalAmountLabel}</span>
                              <span>Prazo: {quote.deliveryDays || "-"} dias</span>
                              <span>Pagamento: {quote.paymentTerms || "-"}</span>
                              {quote.evidence ? (
                                <>
                                  <span>Origem: {quote.evidence.quoteSourceTypeLabel || "-"}</span>
                                  <span>Evidência: {quote.evidence.evidenceTypeLabel || "-"}</span>
                                  <span>Classificação: {quote.evidence.documentaryClassificationLabel || quote.evidence.evidenceConfidenceLabel || "-"}</span>
                                </>
                              ) : null}
                            </div>
                            {quote.evidence?.auditAlerts?.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {quote.evidence.auditAlerts.map((alert) => (
                                  <StatusBadge key={alert} status={isCriticalEvidenceAlert(alert) ? "danger" : "warning"} label={alert} />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3">
                          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Anexos</p>
                          <AttachmentsList attachments={quote.attachments} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5 shadow-sm shadow-primary/5">
                  <h3 className="text-sm font-semibold">Itens solicitados</h3>
                  <div className="mt-4 max-w-full overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Descrição</th>
                          <th className="px-3 py-2 font-semibold">Qtd</th>
                          <th className="px-3 py-2 font-semibold">Unidade</th>
                          <th className="px-3 py-2 font-semibold">Obs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedApproval.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2">{item.description}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.unitOfMeasureLabel}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.notes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="p-5 shadow-sm shadow-primary/5">
                  <h3 className="text-sm font-semibold">Histórico de decisão</h3>
                  {selectedApproval.decisions.length ? (
                    <div className="mt-4 space-y-3">
                      {selectedApproval.decisions.map((decision) => (
                        <div key={decision.id} className="rounded-md border bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                              status={decision.decision === "approved" ? "success" : decision.decision === "rejected" ? "danger" : "info"}
                              label={decision.decision === "approved" ? "Compra aprovada" : decision.decision === "rejected" ? "Compra reprovada" : "Devolvida para Compras"}
                            />
                            <StatusBadge status="info" label={decision.approvalLevelLabel} />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {formatDateTime(decision.decidedAt)} por {decision.decidedByName || "Usuário não informado"}
                          </p>
                          {decision.justification ? <p className="mt-2 break-words text-sm text-foreground">{decision.justification}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Nenhuma decisão registrada.</p>
                  )}
                </Card>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {decisionState.open && decisionState.approval ? (
        <div className="fixed inset-0 z-[70] bg-black/50 px-4 py-6 backdrop-blur-sm" role="presentation" onClick={() => setDecisionState(emptyDecisionState)}>
          <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full rounded-lg border bg-card p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {decisionState.decision === "approved" ? "Aprovar compra" : decisionState.decision === "rejected" ? "Reprovar compra" : "Devolver para Compras"}
                </p>
                <h3 className="text-lg font-semibold">{decisionState.approval.requestNumber}</h3>
                <p className="text-sm text-muted-foreground">{decisionState.approval.title}</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Esta ação registra uma decisão administrativa sobre a continuidade da compra e não executa pagamento financeiro.
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <Label>{decisionState.decision === "approved" ? "Observação opcional" : "Justificativa obrigatória"}</Label>
                <TextArea
                  rows={4}
                  value={decisionState.justification}
                  onChange={(event) => setDecisionState((current) => ({ ...current, justification: event.target.value }))}
                  placeholder={decisionState.decision === "approved" ? "Observação para histórico da aprovação" : decisionState.decision === "rejected" ? "Explique o motivo da reprovação" : "Explique o que Compras precisa revisar antes de reenviar para aprovação"}
                />
              </div>

              {error ? <div className="mt-4"><ErrorMessage message={error} /></div> : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDecisionState(emptyDecisionState)}>
                  Cancelar
                </Button>
                <Button type="button" variant={decisionState.decision === "rejected" ? "danger" : "default"} onClick={submitDecision} disabled={decisionMutation.isPending} data-testid="aprovacao-confirmar">
                  {decisionState.decision === "approved" ? <Check className="h-4 w-4" /> : decisionState.decision === "rejected" ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  Confirmar {decisionState.decision === "approved" ? "aprovação" : decisionState.decision === "rejected" ? "reprovação" : "devolução"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
