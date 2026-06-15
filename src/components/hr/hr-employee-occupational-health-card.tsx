"use client";

import { useQuery } from "@tanstack/react-query";
import { HeartPulse, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Card } from "@/components/ui/card";

type OccupationalRecord = {
  id: string;
  recordType: string;
  recordTypeLabel: string;
  status: string;
  statusLabel: string;
  examDate: string;
  expiresAt: string;
  providerName: string;
  doctorName: string;
  hasAttachment: boolean;
  restrictionNotes: string;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
  };
};

type NrCertification = {
  id: string;
  nrCode: string;
  trainingName: string;
  issuedAt: string;
  expiresAt: string;
  status: string;
  statusLabel: string;
  hasCertificate: boolean;
  redacted: boolean;
  expiration?: {
    isExpired: boolean;
    expiresSoon: boolean;
  };
};

type OccupationalResponse = { ok: true; data: OccupationalRecord[] };
type NrResponse = { ok: true; data: NrCertification[] };

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Não foi possível carregar Saúde Ocupacional.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function statusTone(status: string) {
  if (status === "valid") return "success" as const;
  if (status === "expiring") return "warning" as const;
  if (status === "expired" || status === "cancelled") return "danger" as const;
  return "visual" as const;
}

function expirationState(value: string | null | undefined, status: string) {
  const date = value ? new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(date.getTime())) return { isExpired: status === "expired", expiresSoon: false };
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(today.getDate() + 30);
  return {
    isExpired: status === "expired" || date.getTime() < today.getTime(),
    expiresSoon: status !== "expired" && status !== "cancelled" && date.getTime() >= today.getTime() && date.getTime() <= limit.getTime()
  };
}

function recordExpiration(record: OccupationalRecord) {
  return record.expiration ?? expirationState(record.expiresAt, record.status);
}

function nrExpiration(nr: NrCertification) {
  return nr.expiration ?? expirationState(nr.expiresAt, nr.status);
}

function restrictedValue(value: string, redacted: boolean) {
  if (redacted) return "Informação restrita";
  return value || "-";
}

export function HrEmployeeOccupationalHealthCard({ employeeId }: { employeeId: string }) {
  const recordsQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "occupational"],
    queryFn: async () => requestJson<OccupationalResponse>(`/api/hr/employees/${employeeId}/occupational?pageSize=100`)
  });
  const nrQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "nr-certifications"],
    queryFn: async () => requestJson<NrResponse>(`/api/hr/employees/${employeeId}/nr-certifications?pageSize=100`)
  });

  const records = recordsQuery.data?.data ?? [];
  const nrs = nrQuery.data?.data ?? [];
  const activeRestrictions = records.filter((record) => record.recordType === "occupational_restriction" && record.status !== "cancelled").length;

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Saúde Ocupacional</h3>
              <StatusBadge status="warning" label="Dados restritos" />
              {activeRestrictions ? <StatusBadge status="warning" label={`${activeRestrictions} restrição(ões)`} /> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">ASOs, exames, restrições e certificações NR do colaborador. Arquivos e certificados ficam no dossiê oficial do RH, na aba Documentos.</p>
          </div>
          <StatusBadge status="info" label={`${records.length + nrs.length} registro(s)`} />
        </div>
      </div>
      <div className="space-y-5 p-5">
        {recordsQuery.isLoading || nrQuery.isLoading ? <LoadingTable label="Carregando Saúde Ocupacional..." /> : null}
        {recordsQuery.error ? <ErrorMessage message={recordsQuery.error instanceof Error ? recordsQuery.error.message : "Não foi possível carregar os registros ocupacionais. Tente atualizar a página."} /> : null}
        {nrQuery.error ? <ErrorMessage message={nrQuery.error instanceof Error ? nrQuery.error.message : "Não foi possível carregar as certificações NR. Tente atualizar a página."} /> : null}
        {!recordsQuery.isLoading && !nrQuery.isLoading && recordsQuery.data && nrQuery.data && !records.length && !nrs.length ? (
          <EmptyState title="Nenhum ASO registrado" description="ASOs, exames ocupacionais, restrições e certificações NR do colaborador aparecerão aqui." />
        ) : null}

        {records.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Médico</th>
                  <th className="px-4 py-3">Restrições</th>
                  <th className="px-4 py-3">Anexo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((record) => {
                  const expiration = recordExpiration(record);
                  return (
                  <tr key={record.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status="info" label={record.recordTypeLabel} />
                        {expiration.isExpired ? <StatusBadge status="danger" label="Vencido" /> : null}
                        {expiration.expiresSoon ? <StatusBadge status="warning" label="Vence em breve" /> : null}
                        {record.recordType === "occupational_restriction" && record.status !== "cancelled" ? <StatusBadge status="warning" label="Restrição ativa" /> : null}
                        {record.redacted ? <StatusBadge status="warning" label="Registro restrito" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatDate(record.examDate)}</td>
                    <td className="px-4 py-3">{formatDate(record.expiresAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusTone(record.status)} label={record.statusLabel} /></td>
                    <td className="px-4 py-3">{restrictedValue(record.providerName, record.redacted)}</td>
                    <td className="px-4 py-3">{restrictedValue(record.doctorName, record.redacted)}</td>
                    <td className="px-4 py-3">{restrictedValue(record.restrictionNotes, record.redacted)}</td>
                    <td className="px-4 py-3"><StatusBadge status={record.hasAttachment ? "success" : "visual"} label={record.hasAttachment ? "Anexado" : "Pendente"} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {nrs.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[820px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">NR</th>
                  <th className="px-4 py-3">Treinamento</th>
                  <th className="px-4 py-3">Emissão</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Certificado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {nrs.map((nr) => {
                  const expiration = nrExpiration(nr);
                  return (
                  <tr key={nr.id} className="align-top">
                    <td className="px-4 py-3"><StatusBadge status="info" label={nr.nrCode} /></td>
                    <td className="px-4 py-3">{nr.trainingName || "-"}</td>
                    <td className="px-4 py-3">{formatDate(nr.issuedAt)}</td>
                    <td className="px-4 py-3">{formatDate(nr.expiresAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusTone(nr.status)} label={nr.statusLabel} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {expiration.isExpired ? <StatusBadge status="danger" label="NR vencida" /> : null}
                        {expiration.expiresSoon ? <StatusBadge status="warning" label="NR a vencer" /> : null}
                        <StatusBadge status={nr.hasCertificate ? "success" : "visual"} label={nr.hasCertificate ? "Anexado" : "Pendente"} />
                        {nr.redacted ? <StatusBadge status="warning" label="Registro restrito" /> : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-md border bg-muted/35 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Dados ocupacionais são tratados como restritos. Conteúdos clínicos detalhados, laudos e diagnósticos não são exibidos nem enviados para a Vida Funcional. ASOs, exames e certificados NR devem ficar no dossiê oficial do RH, na aba Documentos.
        </div>
      </div>
    </Card>
  );
}
