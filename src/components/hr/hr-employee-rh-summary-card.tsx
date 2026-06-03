"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PendingItem = {
  id: string;
  type: string;
  typeLabel: string;
  priority: "critical" | "high" | "medium" | "low";
  origin: string;
  href: string;
};

type PendingResponse = {
  ok: true;
  data: PendingItem[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
};

const modules = [
  ["documents", "Documentos"],
  ["onboarding", "Onboarding"],
  ["evaluations", "Avaliacoes"],
  ["development", "PDI"],
  ["trainings", "Treinamentos"],
  ["occupational", "Saude ocupacional"],
  ["movements", "Movimentacoes"],
  ["conduct", "Conduta"],
  ["terminations", "Desligamentos"]
];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Nao foi possivel carregar resumo RH.");
  return payload as T;
}

function tone(total: number, critical: number) {
  if (critical > 0) return "danger" as const;
  if (total > 0) return "warning" as const;
  return "success" as const;
}

export function HrEmployeeRhSummaryCard({ employeeId }: { employeeId: string }) {
  const query = useQuery({
    queryKey: ["hr", "employees", employeeId, "rh-summary"],
    queryFn: async () => requestJson<PendingResponse>(`/api/hr/pending-center?employeeId=${employeeId}`)
  });
  const counts = useMemo(() => {
    const items = query.data?.data ?? [];
    const grouped: Record<string, { total: number; critical: number; href: string }> = {};
    for (const [type] of modules) grouped[type] = { total: 0, critical: 0, href: `/rh/employees/${employeeId}` };
    for (const item of items) {
      grouped[item.type] ??= { total: 0, critical: 0, href: item.href };
      grouped[item.type].total += 1;
      grouped[item.type].href = item.href;
      if (item.priority === "critical" || item.priority === "high") grouped[item.type].critical += 1;
    }
    return grouped;
  }, [employeeId, query.data?.data]);

  return (
    <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Resumo RH</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Situacao consolidada do colaborador nos modulos administrativos do RH.</p>
        </div>
        <StatusBadge status={query.data?.summary.total ? "warning" : "success"} label={`${query.data?.summary.total ?? 0} pendencia(s)`} />
      </div>
      {query.isLoading ? <LoadingTable label="Carregando resumo RH..." /> : null}
      {query.error ? <ErrorMessage message={query.error instanceof Error ? query.error.message : "Erro ao carregar resumo RH."} /> : null}
      {!query.isLoading && !query.error ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {modules.map(([type, label]) => {
            const value = counts[type] ?? { total: 0, critical: 0, href: `/rh/employees/${employeeId}` };
            return (
              <div key={type} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value.total}</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={tone(value.total, value.critical)} label={value.total ? "Acompanhar" : "Ok"} />
                  {value.total ? <Button asChild variant="outline" size="sm"><Link href={value.href}>Abrir</Link></Button> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
