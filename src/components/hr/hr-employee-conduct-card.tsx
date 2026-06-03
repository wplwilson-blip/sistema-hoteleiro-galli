"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Card } from "@/components/ui/card";

type ConductRecord = {
  id: string;
  conductTypeLabel: string;
  status: string;
  statusLabel: string;
  occurrenceDate: string;
  title: string;
  actionTaken: string;
  severity: string;
  hasAttachment: boolean;
  evidenceCount: number;
  isSensitive: boolean;
  redacted: boolean;
  reviews: Array<{
    id: string;
    actionLabel: string;
    comments: string;
    createdAt: string;
  }>;
};

type ConductResponse = { ok: true; data: ConductRecord[] };

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Nao foi possivel carregar conduta.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function severityTone(severity: string) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "notice") return "info" as const;
  return "visual" as const;
}

function statusTone(status: string) {
  if (status === "cancelled") return "danger" as const;
  if (status === "reviewed") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  if (status === "rejected") return "danger" as const;
  return "visual" as const;
}

export function HrEmployeeConductCard({ employeeId }: { employeeId: string }) {
  const conductQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "conduct"],
    queryFn: async () => requestJson<ConductResponse>(`/api/hr/employees/${employeeId}/conduct?pageSize=100`)
  });
  const records = conductQuery.data?.data ?? [];

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Conduta</h3>
          <StatusBadge status="warning" label="Dados restritos" />
          <StatusBadge status="info" label={`${records.length} registro(s)`} />
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Advertencias, suspensoes, reclamacoes, elogios, orientacoes e conversas formais.</p>
      </div>
      <div className="p-5">
        {conductQuery.isLoading ? <LoadingTable label="Carregando conduta..." /> : null}
        {conductQuery.error ? <ErrorMessage message={conductQuery.error instanceof Error ? conductQuery.error.message : "Erro ao carregar conduta."} /> : null}
        {!conductQuery.isLoading && conductQuery.data && !records.length ? <EmptyState title="Nenhum registro de conduta" description="Registros formais de conduta do colaborador aparecerao aqui." /> : null}
        {records.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Severidade</th><th className="px-4 py-3">Titulo</th><th className="px-4 py-3">Acao tomada</th><th className="px-4 py-3">Evidencias</th><th className="px-4 py-3">Revisao</th></tr></thead>
              <tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{formatDate(record.occurrenceDate)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.conductTypeLabel} />{record.isSensitive ? <StatusBadge status="warning" label={record.redacted ? "Restrito" : "Sensivel"} /> : null}</div></td><td className="px-4 py-3"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /></td><td className="px-4 py-3"><StatusBadge status={severityTone(record.severity)} label={record.severity} /></td><td className="px-4 py-3">{record.title}</td><td className="px-4 py-3">{record.redacted ? "Informacao restrita" : record.actionTaken || "-"}</td><td className="px-4 py-3"><StatusBadge status={record.evidenceCount ? "success" : "visual"} label={`${record.evidenceCount ?? 0} evidencia(s)`} /></td><td className="px-4 py-3"><ConductTimeline reviews={record.reviews} /></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Registros sensiveis sao redigidos conforme permissao do usuario.
        </div>
      </div>
    </Card>
  );
}

function ConductTimeline({ reviews }: { reviews: ConductRecord["reviews"] }) {
  return (
    <div className="min-w-44 space-y-1 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Criado</p>
      {reviews.map((review) => (
        <p key={review.id}>{review.actionLabel} - {formatDate(review.createdAt)}</p>
      ))}
    </div>
  );
}
