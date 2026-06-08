"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CalendarClock, FileCheck2 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Card } from "@/components/ui/card";

type EmployeeTraining = {
  id: string;
  trainingTitle: string;
  trainingTypeLabel: string;
  status: string;
  statusLabel: string;
  assignedAt: string;
  dueDate: string;
  completedAt: string;
  expiresAt: string;
  hasCertificate: boolean;
  isMandatory: boolean;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
    needsRetraining: boolean;
    mandatoryPending: boolean;
  };
};

type TrainingsResponse = { ok: true; data: EmployeeTraining[] };

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Nao foi possivel carregar treinamentos.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "expired" || status === "cancelled") return "danger" as const;
  if (status === "retraining_required") return "warning" as const;
  if (status === "assigned" || status === "scheduled" || status === "in_progress") return "warning" as const;
  return "visual" as const;
}

export function HrEmployeeTrainingsCard({ employeeId }: { employeeId: string }) {
  const trainingsQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "trainings"],
    queryFn: async () => requestJson<TrainingsResponse>(`/api/hr/employees/${employeeId}/trainings?pageSize=100`)
  });

  const trainings = trainingsQuery.data?.data ?? [];

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Treinamentos</h3>
          <StatusBadge status="info" label={`${trainings.length} registro(s)`} />
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Capacitacoes atribuidas, presenca, certificados e validade.</p>
      </div>
      <div className="p-5">
        {trainingsQuery.isLoading ? <LoadingTable label="Carregando treinamentos..." /> : null}
        {trainingsQuery.error ? <ErrorMessage message={trainingsQuery.error instanceof Error ? trainingsQuery.error.message : "Nao foi possivel carregar os treinamentos do colaborador. Tente atualizar a pagina."} /> : null}
        {!trainingsQuery.isLoading && trainingsQuery.data && !trainings.length ? (
          <EmptyState title="Nenhum treinamento atribuido" description="Quando um treinamento for atribuido ao colaborador, ele aparecera aqui com prazo, conclusao e certificado." />
        ) : null}
        {trainings.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Treinamento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Atribuido</th>
                  <th className="px-4 py-3">Prazo</th>
                  <th className="px-4 py-3">Conclusao</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Certificado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trainings.map((training) => (
                  <tr key={training.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{training.trainingTitle || "-"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {training.isMandatory ? <StatusBadge status="warning" label="Obrigatorio" /> : null}
                        {training.expiration?.isExpired ? <StatusBadge status="danger" label="Vencido" /> : null}
                        {training.expiration?.expiresSoon ? <StatusBadge status="warning" label="Vence em breve" /> : null}
                        {training.expiration?.needsRetraining ? <StatusBadge status="warning" label="Reciclagem necessaria" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{training.trainingTypeLabel || "-"}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusTone(training.status)} label={training.statusLabel} /></td>
                    <td className="px-4 py-3"><CalendarClock className="mr-1 inline h-4 w-4 text-muted-foreground" />{formatDate(training.assignedAt)}</td>
                    <td className="px-4 py-3">{formatDate(training.dueDate)}</td>
                    <td className="px-4 py-3">{formatDate(training.completedAt)}</td>
                    <td className="px-4 py-3">{formatDate(training.expiresAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={training.hasCertificate ? "success" : "visual"} label={training.hasCertificate ? "Anexado" : "Pendente"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Certificados aparecem como vinculo de anexo quando informados pela rotina de verificacao.
        </div>
      </div>
    </Card>
  );
}
