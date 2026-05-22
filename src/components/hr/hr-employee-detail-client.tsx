"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CalendarClock, History, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, LoadingTable } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HrEmployeeDocumentsCard } from "@/components/hr/hr-employee-documents-card";
import { HrEmployeeOnboardingCard } from "@/components/hr/hr-employee-onboarding-card";
import { cn } from "@/lib/utils";

type RelatedMeta = {
  id: string;
  code: string;
  name: string;
} | null;

type SensitiveEmployeeData = {
  documentNumber: string;
  personalEmail: string;
  phone: string;
  terminationDate: string;
};

type HrEmployeeDetail = {
  id: string;
  organizationId: string | null;
  unitId: string | null;
  unit: RelatedMeta;
  departmentId: string | null;
  department: RelatedMeta;
  jobPositionId: string | null;
  jobPosition: RelatedMeta;
  fullName: string;
  preferredName: string;
  corporateEmail: string;
  hireDate: string;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
  sensitive: SensitiveEmployeeData | null;
};

type HrEmployeePermissions = {
  canViewSensitive?: boolean;
  canViewDocuments?: boolean;
  canManageDocuments?: boolean;
  canViewSensitiveDocuments?: boolean;
  canVerifyDocuments?: boolean;
  canViewHistory?: boolean;
  canViewSensitiveHistory?: boolean;
};

type HrEmployeeDetailResponse = {
  ok: true;
  data: HrEmployeeDetail;
  permissions: HrEmployeePermissions;
};

type HrFunctionalEvent = {
  id: string;
  eventType: string;
  eventDate: string;
  title: string;
  description: string;
  severity: string;
  visibilityScope: string;
  isSensitive: boolean;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  redacted: boolean;
};

type HrHistoryResponse = {
  ok: true;
  data: HrFunctionalEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  permissions: {
    canViewSensitiveHistory?: boolean;
  };
};

type DetailTab = "summary" | "sensitive" | "documents" | "onboarding" | "history";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível carregar os dados de RH.");
  }

  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function formatDateTime(value: string | null | undefined) {
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

function metaLabel(meta: RelatedMeta, fallback = "-") {
  if (!meta) {
    return fallback;
  }

  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function recordStatusLabel(status: HrEmployeeDetail["status"]) {
  if (status === "active") return "Ativo";
  if (status === "inactive") return "Inativo";
  return "Arquivado";
}

function recordStatusTone(status: HrEmployeeDetail["status"]) {
  return status === "active" ? "success" : "visual";
}

function eventSeverityTone(severity: string) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "notice") return "info" as const;
  return "visual" as const;
}

function InfoTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="break-words text-sm font-medium text-foreground">{value || "-"}</p>
    </div>
  );
}

function RestrictedState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/45 p-4 text-sm text-muted-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 leading-5">{description}</p>
      </div>
    </div>
  );
}

export function HrEmployeeDetailClient({ employeeId }: { employeeId: string }) {
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
  const [historyPage, setHistoryPage] = useState(1);

  const detailQuery = useQuery({
    queryKey: ["hr", "employees", employeeId],
    queryFn: async () => requestJson<HrEmployeeDetailResponse>(`/api/hr/employees/${employeeId}`)
  });

  const employee = detailQuery.data?.data ?? null;
  const permissions = detailQuery.data?.permissions ?? {};
  const canViewSensitive = Boolean(permissions.canViewSensitive);
  const canViewDocuments = Boolean(permissions.canViewDocuments);
  const canManageDocuments = Boolean(permissions.canManageDocuments);
  const canViewSensitiveDocuments = Boolean(permissions.canViewSensitiveDocuments);
  const canVerifyDocuments = Boolean(permissions.canVerifyDocuments);
  const canViewHistory = Boolean(permissions.canViewHistory);
  const canViewSensitiveHistory = Boolean(permissions.canViewSensitiveHistory);

  const tabs = useMemo(
    () =>
      [
        { value: "summary" as const, label: "Resumo", enabled: true },
        { value: "sensitive" as const, label: "Dados sensiveis", enabled: canViewSensitive },
        { value: "documents" as const, label: "Documentos", enabled: canViewDocuments },
        { value: "onboarding" as const, label: "Onboarding", enabled: true },
        { value: "history" as const, label: "Histórico", enabled: canViewHistory }
      ].filter((tab) => tab.enabled),
    [canViewDocuments, canViewHistory, canViewSensitive]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab("summary");
    }
  }, [activeTab, tabs]);

  const historyQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "history", historyPage],
    queryFn: async () => requestJson<HrHistoryResponse>(`/api/hr/employees/${employeeId}/history?page=${historyPage}&pageSize=20`),
    enabled: Boolean(employee && canViewHistory && activeTab === "history")
  });

  if (detailQuery.isLoading) {
    return <LoadingTable label="Carregando prontuario administrativo..." />;
  }

  if (detailQuery.error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/rh/employees">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <ErrorMessage message={detailQuery.error instanceof Error ? detailQuery.error.message : "Não foi possível carregar o colaborador."} />
      </div>
    );
  }

  if (!employee) {
    return <EmptyState title="Colaborador nao encontrado" description="O colaborador nao existe ou esta fora das unidades permitidas." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/employees">
              <ArrowLeft className="h-4 w-4" />
              Voltar para colaboradores
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-semibold text-foreground">{employee.fullName}</h2>
              <StatusBadge status={recordStatusTone(employee.status)} label={recordStatusLabel(employee.status)} />
              <StatusBadge status="info" label={metaLabel(employee.unit, "Sem unidade")} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Consulta administrativa protegida por permissao de RH e escopo de unidade.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={canViewSensitive ? "info" : "visual"} label={canViewSensitive ? "Dados sensiveis permitidos" : "Dados sensiveis ocultos"} />
          <StatusBadge status={canViewDocuments ? "success" : "visual"} label={canViewDocuments ? "Documentos liberados" : "Documentos restritos"} />
          <StatusBadge status={canViewHistory ? "success" : "visual"} label={canViewHistory ? "Histórico liberado" : "Histórico restrito"} />
        </div>
      </div>

      <Card className="border-border/80 p-3 shadow-sm shadow-primary/5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              variant={activeTab === tab.value ? "default" : "outline"}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      {activeTab === "summary" ? (
        <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">Resumo administrativo</h3>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoTile label="Nome completo" value={employee.fullName} icon={UserRound} />
            <InfoTile label="Nome preferencial" value={employee.preferredName || "-"} icon={UserRound} />
            <InfoTile label="Status" value={recordStatusLabel(employee.status)} icon={ShieldCheck} />
            <InfoTile label="Unidade" value={metaLabel(employee.unit)} icon={Building2} />
            <InfoTile label="Departamento" value={metaLabel(employee.department)} icon={Building2} />
            <InfoTile label="Cargo" value={metaLabel(employee.jobPosition)} icon={UserRound} />
            <InfoTile label="E-mail corporativo" value={employee.corporateEmail || "-"} icon={Mail} />
            <InfoTile label="Data de admissao" value={formatDate(employee.hireDate)} icon={CalendarClock} />
            <InfoTile label="Ultima atualizacao" value={formatDateTime(employee.updatedAt)} icon={CalendarClock} />
          </div>
        </Card>
      ) : null}

      {activeTab === "sensitive" ? (
        canViewSensitive && employee.sensitive ? (
          <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Dados sensiveis</h3>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InfoTile label="Documento pessoal" value={employee.sensitive.documentNumber || "-"} icon={ShieldCheck} />
              <InfoTile label="Telefone" value={employee.sensitive.phone || "-"} icon={UserRound} />
              <InfoTile label="E-mail pessoal" value={employee.sensitive.personalEmail || "-"} icon={Mail} />
              <InfoTile label="Data de desligamento" value={formatDate(employee.sensitive.terminationDate)} icon={CalendarClock} />
            </div>
          </Card>
        ) : (
          <RestrictedState title="Dados restritos" description="Seu perfil nao possui permissao para visualizar dados sensiveis deste colaborador." />
        )
      ) : null}

      {activeTab === "documents" ? (
        canViewDocuments ? (
          <HrEmployeeDocumentsCard
            employeeId={employeeId}
            canViewSensitiveDocuments={canViewSensitiveDocuments}
            canManageDocuments={canManageDocuments}
            canVerifyDocuments={canVerifyDocuments}
          />
        ) : (
          <RestrictedState title="Documentos restritos" description="Seu perfil nao possui permissao para consultar documentos de RH deste colaborador." />
        )
      ) : null}

      {activeTab === "onboarding" ? <HrEmployeeOnboardingCard employeeId={employeeId} /> : null}

      {activeTab === "history" ? (
        canViewHistory ? (
          <Card className="border-border/80 p-5 shadow-sm shadow-primary/5">
            <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold">Histórico funcional</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Histórico funcional sem dados sensíveis por padrão.</p>
              </div>
              <StatusBadge
                status={canViewSensitiveHistory ? "info" : "visual"}
                label={canViewSensitiveHistory ? "Histórico sensível permitido" : "Histórico redigido"}
              />
            </div>

            {historyQuery.isLoading ? <LoadingTable label="Carregando historico funcional..." /> : null}
            {historyQuery.error ? (
              <ErrorMessage message={historyQuery.error instanceof Error ? historyQuery.error.message : "Não foi possível carregar histórico."} />
            ) : null}
            {!historyQuery.isLoading && historyQuery.data && !historyQuery.data.data.length ? (
              <EmptyState title="Nenhum evento funcional encontrado" description="Ainda nao existem eventos funcionais registrados para este colaborador." />
            ) : null}
            {historyQuery.data?.data.length ? (
              <div className="space-y-3">
                {historyQuery.data.data.map((event) => (
                  <article key={event.id} className={cn("rounded-md border bg-background p-4", event.redacted && "bg-muted/35")}>
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={eventSeverityTone(event.severity)} label={event.severity} />
                          <StatusBadge status="visual" label={event.status} />
                          {event.isSensitive ? <StatusBadge status="warning" label={event.redacted ? "Sensivel redigido" : "Sensivel"} /> : null}
                        </div>
                        <h4 className="mt-2 break-words text-sm font-semibold text-foreground">{event.title}</h4>
                        {event.description ? <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{event.description}</p> : null}
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.eventDate)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Tipo: {event.eventType}</span>
                      <span>Origem: {event.sourceModule}</span>
                      {event.sourceEntityType ? <span>Entidade: {event.sourceEntityType}</span> : null}
                    </div>
                  </article>
                ))}
                <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Pagina {historyQuery.data.pagination.page} de {Math.max(historyQuery.data.pagination.totalPages, 1)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                      disabled={historyPage <= 1 || historyQuery.isFetching}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((current) => current + 1)}
                      disabled={historyPage >= Math.max(historyQuery.data.pagination.totalPages, 1) || historyQuery.isFetching}
                    >
                      Proxima
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        ) : (
          <RestrictedState title="Histórico restrito" description="Seu perfil não possui permissão para consultar histórico funcional deste colaborador." />
        )
      ) : null}

    </div>
  );
}
