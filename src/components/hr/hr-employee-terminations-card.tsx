"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LogOut } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Card } from "@/components/ui/card";

type ChecklistItem = {
  id: string;
  itemName: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt: string;
};

type TerminationRecord = {
  id: string;
  status: string;
  statusLabel: string;
  terminationTypeLabel: string;
  terminationReason: string;
  requestedAt: string;
  effectiveDate: string;
  checklist: ChecklistItem[];
  pendingCount: number;
  checklistCount: number;
  checklistCompletedCount: number;
  isSensitive: boolean;
  redacted: boolean;
};

type TerminationsResponse = { ok: true; data: TerminationRecord[] };

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Nao foi possivel carregar desligamentos.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function statusTone(status: string) {
  if (status === "implemented" || status === "approved") return "success" as const;
  if (status === "pending_review" || status === "draft") return "warning" as const;
  if (status === "cancelled") return "danger" as const;
  return "visual" as const;
}

export function HrEmployeeTerminationsCard({ employeeId }: { employeeId: string }) {
  const terminationsQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "terminations"],
    queryFn: async () => requestJson<TerminationsResponse>(`/api/hr/employees/${employeeId}/terminations?pageSize=100`)
  });
  const records = terminationsQuery.data?.data ?? [];
  const openPendencies = records.reduce((total, record) => total + record.pendingCount, 0);

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-center gap-2">
          <LogOut className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Desligamento</h3>
          <StatusBadge status="warning" label="Dados restritos" />
          <StatusBadge status="info" label={`${records.length} processo(s)`} />
          {openPendencies ? <StatusBadge status="warning" label={`${openPendencies} pendencia(s)`} /> : null}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Historico de desligamentos, status, checklist, motivo e data efetiva.</p>
      </div>
      <div className="p-5">
        {terminationsQuery.isLoading ? <LoadingTable label="Carregando desligamentos..." /> : null}
        {terminationsQuery.error ? <ErrorMessage message={terminationsQuery.error instanceof Error ? terminationsQuery.error.message : "Erro ao carregar desligamentos."} /> : null}
        {!terminationsQuery.isLoading && terminationsQuery.data && !records.length ? <EmptyState title="Nenhum desligamento registrado" description="Processos administrativos de desligamento do colaborador aparecerao aqui." /> : null}
        {records.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[960px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Solicitado</th><th className="px-4 py-3">Data efetiva</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Checklist</th></tr></thead>
              <tbody className="divide-y">{records.map((record) => <tr key={record.id} className="align-top"><td className="px-4 py-3">{formatDate(record.requestedAt)}</td><td className="px-4 py-3">{formatDate(record.effectiveDate)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge status="info" label={record.terminationTypeLabel} />{record.isSensitive ? <StatusBadge status="warning" label={record.redacted ? "Restrito" : "Sensivel"} /> : null}</div></td><td className="px-4 py-3"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /></td><td className="px-4 py-3">{record.terminationReason}</td><td className="px-4 py-3"><TerminationChecklist record={record} /></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Dados de desligamento sao sempre restritos e aparecem redigidos conforme permissao do usuario.
        </div>
      </div>
    </Card>
  );
}

function TerminationChecklist({ record }: { record: TerminationRecord }) {
  return (
    <div className="min-w-60 space-y-2">
      <div className="flex flex-wrap gap-1">
        <StatusBadge status={record.pendingCount ? "warning" : "success"} label={`${record.checklistCompletedCount}/${record.checklistCount} concluido(s)`} />
        {record.pendingCount ? <StatusBadge status="warning" label={`${record.pendingCount} pendente(s)`} /> : null}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {record.checklist.slice(0, 5).map((item) => (
          <p key={item.id} className={item.isCompleted ? "line-through" : ""}>{item.itemName}{item.isRequired ? " *" : ""}</p>
        ))}
        {record.checklist.length > 5 ? <p>+ {record.checklist.length - 5} item(ns)</p> : null}
      </div>
    </div>
  );
}
