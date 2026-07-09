"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileClock, FileText, Search, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";
import { formatDateOnlyUtc as formatDate } from "@/lib/format";

type HrRecordStatus = "active" | "inactive" | "archived";

type RelatedMeta = {
  id: string;
  code: string;
  name: string;
} | null;

type HrEmployeeListItem = {
  id: string;
  unitId: string | null;
  unit: RelatedMeta;
  departmentId: string | null;
  department: RelatedMeta;
  jobPositionId: string | null;
  jobPosition: RelatedMeta;
  fullName: string;
  preferredName: string;
  hireDate: string;
  status: HrRecordStatus;
  documentSummary: {
    total: number;
    pending: number;
    expired: number;
  };
};

type HrEmployeesResponse = {
  ok: true;
  data: HrEmployeeListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  permissions: {
    canViewSensitive?: boolean;
  };
};

const statusOptions: Array<{ value: HrRecordStatus; label: string }> = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "archived", label: "Arquivado" }
];

const pageSizeOptions = [10, 20, 50, 100];
const emptyEmployees: HrEmployeeListItem[] = [];

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível carregar os dados de RH.");
  }

  return payload as T;
}

function buildEmployeesUrl(input: {
  page: number;
  pageSize: number;
  search: string;
  status: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize)
  });

  if (input.search.trim()) params.set("search", input.search.trim());
  if (input.status) params.set("status", input.status);

  return `/api/hr/employees?${params.toString()}`;
}

function metaLabel(meta: RelatedMeta, fallback = "-") {
  if (!meta) {
    return fallback;
  }

  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function recordStatusLabel(status: HrRecordStatus) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return "Arquivado";
}

function recordStatusTone(status: HrRecordStatus) {
  return status === "active" ? "success" : "visual";
}

function DocumentSummary({ summary }: { summary: HrEmployeeListItem["documentSummary"] }) {
  if (!summary.total) {
    return <StatusBadge status="visual" label="Sem documentos" />;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <StatusBadge status="info" label={`${summary.total} docs`} />
      {summary.pending ? <StatusBadge status="warning" label={`${summary.pending} pendente${summary.pending === 1 ? "" : "s"}`} /> : null}
      {summary.expired ? <StatusBadge status="danger" label={`${summary.expired} vencido${summary.expired === 1 ? "" : "s"}`} /> : null}
      {!summary.pending && !summary.expired ? <StatusBadge status="success" label="Regular" /> : null}
    </div>
  );
}

export function HrEmployeesClient() {
  // Unidade ativa (header) e a fonte unica de escopo; entra na queryKey p/ refetch na troca.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const employeesQuery = useQuery({
    queryKey: ["hr", "employees", activeUnitId, { page, pageSize, search, status }],
    queryFn: async () => requestJson<HrEmployeesResponse>(buildEmployeesUrl({ page, pageSize, search, status }))
  });

  const employees = employeesQuery.data?.data ?? emptyEmployees;
  const pagination = employeesQuery.data?.pagination ?? { page, pageSize, total: 0, totalPages: 0 };
  const canViewSensitive = Boolean(employeesQuery.data?.permissions.canViewSensitive);

  function resetPage() {
    setPage(1);
  }

  function hasFilters() {
    return Boolean(search.trim() || status);
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="mb-4 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Filtros de consulta</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              A consulta respeita permissões de RH e oculta dados protegidos na listagem.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={canViewSensitive ? "info" : "visual"} label={canViewSensitive ? "Dados protegidos no detalhe" : "Listagem básica"} />
            {hasFilters() ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_240px_140px]">
          <Field label="Buscar">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                placeholder="Buscar por nome do colaborador"
                className="pl-9"
              />
            </div>
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

      {employeesQuery.isLoading ? <LoadingTable label="Carregando colaboradores..." /> : null}
      {employeesQuery.error ? (
        <ErrorMessage message={employeesQuery.error instanceof Error ? employeesQuery.error.message : "Erro ao carregar colaboradores."} />
      ) : null}

      {!employeesQuery.isLoading && !employees.length ? (
        <EmptyState
          title="Nenhum colaborador encontrado"
          description="Ajuste os filtros ou confirme se existem colaboradores dentro das unidades permitidas para o seu perfil."
        />
      ) : null}

      {employees.length ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="border-b p-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Colaboradores</h2>
                <p className="text-xs text-muted-foreground">
                  Exibindo {employees.length} de {pagination.total} registros
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)}</span>
              </div>
            </div>
          </div>

          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  <th className="px-4 py-3 font-semibold">Departamento</th>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Admissão</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Documentos</th>
                  <th className="px-4 py-3 text-right font-semibold">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-muted/35">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-foreground">{employee.fullName}</p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {employee.preferredName ? `Nome preferencial: ${employee.preferredName}` : "Sem nome preferencial"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{metaLabel(employee.unit)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{metaLabel(employee.department)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{metaLabel(employee.jobPosition)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(employee.hireDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={recordStatusTone(employee.status)} label={recordStatusLabel(employee.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <DocumentSummary summary={employee.documentSummary} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/rh/employees/${employee.id}`}>
                          <ShieldCheck className="h-4 w-4" />
                          Visualizar
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Resumo documental por colaborador.</span>
              <FileClock className="h-4 w-4" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || employeesQuery.isFetching}>
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= Math.max(pagination.totalPages, 1) || employeesQuery.isFetching}
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
