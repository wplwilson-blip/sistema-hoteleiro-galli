"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, LockKeyhole, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HrOnboardingItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  ownerArea: string;
  responsibleProfileCode: string | null;
  dueAt: string | null;
  daysUntilDue: number | null;
  completedAt: string | null;
  status: string;
  isRequired: boolean;
  isCritical: boolean;
  blocksOperationalRelease: boolean;
  notes: string | null;
  updatedAt: string;
  relatedDocument: {
    documentTypeId: string;
    name: string;
    category: string;
    employeeDocumentId: string | null;
    employeeDocumentStatus: string | null;
    validUntil: string | null;
    sensitiveRedacted: boolean;
  } | null;
};

type HrEmployeeOnboarding = {
  id: string;
  status: string;
  operationalReleaseStatus: string;
  startedAt: string | null;
  expectedReleaseAt: string | null;
  releasedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  notes: string | null;
  updatedAt: string;
  progress: {
    totalItems: number;
    resolvedItems: number;
    percent: number;
    criticalOpenItems: number;
    blockingOpenItems: number;
  };
  items: HrOnboardingItem[];
};

type HrOnboardingResponse = {
  ok: true;
  data: HrEmployeeOnboarding | null;
  applicablePlans?: Array<{
    id: string;
    name: string;
    description: string | null;
    priority: number;
    specificity: number;
    scopeLabel: string;
  }>;
  emptyState?: {
    title: string;
    description: string;
  };
  permissions: {
    canManageOnboarding?: boolean;
  };
};

type ActiveItemAction =
  | { action: "complete"; item: HrOnboardingItem }
  | { action: "waive"; item: HrOnboardingItem }
  | { action: "block"; item: HrOnboardingItem }
  | { action: "update_notes"; item: HrOnboardingItem }
  | null;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel atualizar o onboarding.");
  }

  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function onboardingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    not_started: "Nao iniciado",
    in_progress: "Em andamento",
    completed: "Concluido",
    cancelled: "Cancelado"
  };

  return labels[status] ?? status;
}

function releaseStatusLabel(status: string) {
  const labels: Record<string, string> = {
    blocked: "Bloqueado",
    partial: "Parcialmente liberado",
    released: "Liberado",
    critical_pending: "Pendencia critica"
  };

  return labels[status] ?? status;
}

function itemStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    in_progress: "Em andamento",
    completed: "Concluido",
    waived: "Dispensado",
    blocked: "Bloqueado",
    cancelled: "Cancelado"
  };

  return labels[status] ?? status;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    document: "Documento",
    training: "Treinamento",
    access: "Acesso",
    uniform: "Uniforme",
    epi: "EPI",
    equipment: "Equipamento",
    policy: "Politica interna",
    operational_orientation: "Orientacao operacional",
    manager_validation: "Validacao do gestor",
    other: "Outro"
  };

  return labels[category] ?? "Item operacional";
}

function ownerAreaLabel(ownerArea: string) {
  const labels: Record<string, string> = {
    RH: "RH",
    GESTOR: "Gestor",
    TI: "TI",
    GOVERNANCA: "Governanca",
    RECEPCAO: "Recepcao",
    COZINHA: "Cozinha",
    MANUTENCAO: "Manutencao",
    AB: "A&B",
    ADMINISTRATIVO: "Administrativo"
  };

  return labels[ownerArea] ?? ownerArea;
}

function itemTone(status: string) {
  if (status === "completed" || status === "waived") return "success" as const;
  if (status === "blocked") return "danger" as const;
  if (status === "pending" || status === "in_progress") return "warning" as const;
  return "visual" as const;
}

function releaseTone(status: string) {
  if (status === "released") return "success" as const;
  if (status === "critical_pending" || status === "blocked") return "danger" as const;
  if (status === "partial") return "warning" as const;
  return "visual" as const;
}

function dueLabel(item: HrOnboardingItem) {
  if (!item.dueAt) return "Sem prazo definido";
  if (item.daysUntilDue === null) return formatDate(item.dueAt);
  if (item.daysUntilDue < 0) return `Atrasado ha ${Math.abs(item.daysUntilDue)} dia(s)`;
  if (item.daysUntilDue === 0) return "Vence hoje";
  return `Vence em ${item.daysUntilDue} dia(s)`;
}

function actionLabel(action: NonNullable<ActiveItemAction>["action"]) {
  if (action === "complete") return "Concluir item";
  if (action === "waive") return "Dispensar item";
  if (action === "block") return "Bloquear item";
  return "Registrar observacao";
}

function actionDescription(action: NonNullable<ActiveItemAction>["action"]) {
  if (action === "waive") return "Informe uma justificativa objetiva para a dispensa.";
  if (action === "block") return "Informe o motivo operacional do bloqueio.";
  if (action === "complete") return "Registre uma observacao opcional antes de concluir.";
  return "Atualize a observacao operacional deste item.";
}

export function HrEmployeeOnboardingCard({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<ActiveItemAction>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const onboardingQuery = useQuery({
    queryKey: ["hr", "employees", employeeId, "onboarding"],
    queryFn: async () => requestJson<HrOnboardingResponse>(`/api/hr/employees/${employeeId}/onboarding`)
  });

  const onboarding = onboardingQuery.data?.data ?? null;
  const applicablePlans = onboardingQuery.data?.applicablePlans ?? [];
  const emptyState = onboardingQuery.data?.emptyState;
  const canManageOnboarding = Boolean(onboardingQuery.data?.permissions.canManageOnboarding);

  const groupedItems = useMemo(() => {
    const items = onboarding?.items ?? [];
    return {
      open: items.filter((item) => !["completed", "waived", "cancelled"].includes(item.status)),
      done: items.filter((item) => ["completed", "waived", "cancelled"].includes(item.status))
    };
  }, [onboarding?.items]);

  const actionMutation = useMutation({
    mutationFn: async ({ itemId, action, notes }: { itemId: string; action: NonNullable<ActiveItemAction>["action"] | "start"; notes?: string }) =>
      requestJson(`/api/hr/employees/${employeeId}/onboarding/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ action, notes })
      }),
    onSuccess: async () => {
      setActiveAction(null);
      setActionNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId, "onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId, "history"] })
      ]);
    }
  });

  const startMutation = useMutation({
    mutationFn: async (planId: string) =>
      requestJson(`/api/hr/employees/${employeeId}/onboarding`, {
        method: "POST",
        body: JSON.stringify(planId ? { planId } : {})
      }),
    onSuccess: async () => {
      setSelectedPlanId("");
      await queryClient.invalidateQueries({ queryKey: ["hr", "employees", employeeId, "onboarding"] });
    }
  });

  function openAction(action: NonNullable<ActiveItemAction>["action"], item: HrOnboardingItem) {
    setActiveAction({ action, item });
    setActionNotes(item.notes ?? "");
  }

  function submitActiveAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAction) return;
    actionMutation.mutate({ itemId: activeAction.item.id, action: activeAction.action, notes: actionNotes });
  }

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Onboarding operacional</h3>
              {onboarding ? <StatusBadge status={releaseTone(onboarding.operationalReleaseStatus)} label={releaseStatusLabel(onboarding.operationalReleaseStatus)} /> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Checklist de liberacao operacional do colaborador, com pendencias por area, criticidade e prazos.
            </p>
          </div>
          {onboarding ? (
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="info" label={onboardingStatusLabel(onboarding.status)} />
              <StatusBadge status={onboarding.progress.criticalOpenItems ? "danger" : "success"} label={`${onboarding.progress.criticalOpenItems} critica(s)`} />
              <StatusBadge status={onboarding.progress.blockingOpenItems ? "warning" : "success"} label={`${onboarding.progress.blockingOpenItems} bloqueante(s)`} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {onboardingQuery.isLoading ? <LoadingTable label="Carregando onboarding operacional..." /> : null}
        {onboardingQuery.error ? (
          <ErrorMessage message={onboardingQuery.error instanceof Error ? onboardingQuery.error.message : "Nao foi possivel carregar o onboarding."} />
        ) : null}
        {actionMutation.error ? (
          <ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Nao foi possivel atualizar o item do onboarding."} />
        ) : null}
        {startMutation.error ? (
          <ErrorMessage message={startMutation.error instanceof Error ? startMutation.error.message : "Nao foi possivel iniciar o onboarding."} />
        ) : null}

        {!onboardingQuery.isLoading && !onboardingQuery.error && !onboarding ? (
          <div className="space-y-4 rounded-md border bg-muted/20 p-4">
            <EmptyState
              title={emptyState?.title ?? "Onboarding ainda nao iniciado"}
              description={
                emptyState?.description ??
                "Quando houver um checklist operacional criado para este colaborador, o RH podera acompanhar prazos, responsaveis, itens criticos e liberacao operacional por aqui."
              }
            />

            {applicablePlans.length ? (
              <div className="mx-auto w-full max-w-2xl rounded-md border bg-background p-4">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-foreground">Plano de onboarding</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Escolha o roteiro operacional que sera copiado para o checklist real deste colaborador.
                  </p>
                </div>
                <Field label="Plano aplicavel">
                  <SelectField
                    value={selectedPlanId || (applicablePlans.length === 1 ? applicablePlans[0].id : "")}
                    onChange={(event) => setSelectedPlanId(event.target.value)}
                    disabled={!canManageOnboarding || startMutation.isPending}
                  >
                    {applicablePlans.length > 1 ? <option value="">Selecione um plano</option> : null}
                    {applicablePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {plan.scopeLabel}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                <div className="mt-3 space-y-2">
                  {applicablePlans.slice(0, 3).map((plan) => (
                    <div key={plan.id} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{plan.name}</p>
                        <StatusBadge status="info" label={plan.scopeLabel} />
                        <StatusBadge status="visual" label={`Prioridade ${plan.priority}`} />
                      </div>
                      {plan.description ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{plan.description}</p> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {canManageOnboarding ? (
                    <Button
                      type="button"
                      onClick={() => startMutation.mutate(selectedPlanId || (applicablePlans.length === 1 ? applicablePlans[0].id : ""))}
                      disabled={startMutation.isPending || (!selectedPlanId && applicablePlans.length !== 1)}
                    >
                      <PlayCircle className="h-4 w-4" />
                      Iniciar onboarding
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                      <LockKeyhole className="h-4 w-4" />
                      Inicio restrito ao RH autorizado
                    </div>
                  )}
                </div>
              </div>
            ) : canManageOnboarding ? (
              <div className="mx-auto w-full max-w-2xl rounded-md border bg-background p-4">
                <h4 className="text-sm font-semibold text-foreground">Checklist padrão do hotel</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Nenhum plano específico foi encontrado para este cargo ou setor. Inicie o checklist padrão para acompanhar documentos, uniforme, acessos, orientações e liberação operacional.
                </p>
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={() => startMutation.mutate("")} disabled={startMutation.isPending}>
                    <PlayCircle className="h-4 w-4" />
                    Iniciar checklist padrão
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {onboarding ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Progresso</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{onboarding.progress.percent}%</p>
                <p className="text-xs text-muted-foreground">
                  {onboarding.progress.resolvedItems} de {onboarding.progress.totalItems} item(ns)
                </p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Liberacao</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{releaseStatusLabel(onboarding.operationalReleaseStatus)}</p>
                <p className="text-xs text-muted-foreground">Status informado pelo RH</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Previsao</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(onboarding.expectedReleaseAt)}</p>
                <p className="text-xs text-muted-foreground">Liberacao esperada</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Pendencias</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{groupedItems.open.length} em aberto</p>
                <p className="text-xs text-muted-foreground">{groupedItems.done.length} resolvida(s)</p>
              </div>
            </div>

            {onboarding.progress.blockingOpenItems ? (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Existem itens criticos ou bloqueantes em aberto. A liberacao operacional deve ser revisada pelo RH antes de considerar o colaborador plenamente liberado.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              {[...groupedItems.open, ...groupedItems.done].map((item) => (
                <article key={item.id} className={cn("rounded-md border bg-background p-4", item.status === "completed" && "bg-muted/20")}>
                  <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="break-words text-sm font-semibold text-foreground">{item.title}</h4>
                        <StatusBadge status={itemTone(item.status)} label={itemStatusLabel(item.status)} />
                        {item.isCritical ? <StatusBadge status="danger" label="Critico" /> : null}
                        {item.blocksOperationalRelease ? <StatusBadge status="warning" label="Bloqueia liberacao" /> : null}
                        {item.isRequired ? <StatusBadge status="info" label="Obrigatorio" /> : null}
                      </div>
                      {item.description ? <p className="break-words text-sm leading-6 text-muted-foreground">{item.description}</p> : null}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Area: {ownerAreaLabel(item.ownerArea)}</span>
                        <span>Categoria: {categoryLabel(item.category)}</span>
                        <span>Prazo: {dueLabel(item)}</span>
                        {item.responsibleProfileCode ? <span>Perfil responsavel: {item.responsibleProfileCode}</span> : null}
                      </div>
                      {item.notes ? <p className="break-words text-sm leading-6 text-muted-foreground">Observacao: {item.notes}</p> : null}
                      {item.relatedDocument ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/25 p-2 text-xs text-muted-foreground">
                          <FileText className="h-4 w-4 text-primary" />
                          <span>Documento relacionado: {item.relatedDocument.name}</span>
                          {item.relatedDocument.employeeDocumentStatus ? <StatusBadge status="visual" label={item.relatedDocument.employeeDocumentStatus} /> : null}
                          {item.relatedDocument.sensitiveRedacted ? <StatusBadge status="warning" label="Arquivo protegido" /> : null}
                        </div>
                      ) : null}
                    </div>

                    {canManageOnboarding ? (
                      <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                        {item.status === "pending" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => actionMutation.mutate({ itemId: item.id, action: "start", notes: item.notes ?? undefined })}
                            disabled={actionMutation.isPending}
                          >
                            <PlayCircle className="h-4 w-4" />
                            Iniciar
                          </Button>
                        ) : null}
                        {!["completed", "waived", "cancelled"].includes(item.status) ? (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => openAction("complete", item)} disabled={actionMutation.isPending}>
                              <CheckCircle2 className="h-4 w-4" />
                              Concluir
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => openAction("waive", item)} disabled={actionMutation.isPending}>
                              <ShieldAlert className="h-4 w-4" />
                              Dispensar
                            </Button>
                            <Button type="button" variant="danger" size="sm" onClick={() => openAction("block", item)} disabled={actionMutation.isPending}>
                              <XCircle className="h-4 w-4" />
                              Bloquear
                            </Button>
                          </>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={() => openAction("update_notes", item)} disabled={actionMutation.isPending}>
                          Observacao
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                        <LockKeyhole className="h-4 w-4" />
                        Acao restrita ao RH autorizado
                      </div>
                    )}
                  </div>

                  {activeAction?.item.id === item.id ? (
                    <form onSubmit={submitActiveAction} className="mt-3 rounded-md border bg-muted/25 p-3">
                      <Field label={actionLabel(activeAction.action)}>
                        <TextArea
                          value={actionNotes}
                          onChange={(event) => setActionNotes(event.target.value)}
                          maxLength={1000}
                          required={activeAction.action === "waive" || activeAction.action === "block"}
                          disabled={actionMutation.isPending}
                          placeholder={actionDescription(activeAction.action)}
                        />
                      </Field>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setActiveAction(null)} disabled={actionMutation.isPending}>
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={actionMutation.isPending || ((activeAction.action === "waive" || activeAction.action === "block") && actionNotes.trim().length < 3)}
                        >
                          Salvar
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
