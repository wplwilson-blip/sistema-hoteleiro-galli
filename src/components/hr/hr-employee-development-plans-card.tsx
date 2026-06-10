"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleHelp, Clock, ListChecks, PlusCircle, RotateCcw } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DevelopmentPlan = {
  id: string;
  employeeId: string;
  evaluationId: string | null;
  title: string;
  reason?: string;
  status: string;
  dueAt: string;
  reviewAt: string;
  responsibleUserId: string | null;
  redacted: boolean;
  items?: DevelopmentPlanItem[];
};

type DevelopmentPlanItem = {
  id: string;
  title: string;
  description: string;
  actionType: string;
  dueAt: string;
  responsibleUserId: string | null;
  status: string;
  completionNotes: string;
  completedAt: string;
};

type Evaluation = {
  id: string;
  templateName: string;
  periodStart: string;
  periodEnd: string;
};

type ListResponse<T> = { ok: true; data: T[] };
type DetailResponse<T> = { ok: true; data: T };

function HelpHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <CircleHelp className="h-3.5 w-3.5" />
    </span>
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Não foi possível atualizar o Plano de Desenvolvimento (PDI).");
  return payload as T;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em andamento",
    under_review: "Em revisão",
    completed: "Concluído",
    cancelled: "Cancelado",
    pending: "Pendente",
    waived: "Dispensado",
    overdue: "Atrasado"
  };
  return labels[status] ?? status;
}

function statusTone(status: string) {
  if (status === "completed" || status === "waived") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  if (status === "overdue") return "warning" as const;
  return "info" as const;
}

function actionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    training: "Treinamento",
    coaching: "Acompanhamento",
    observation: "Observacao",
    procedure_review: "Revisao de procedimento",
    operational_practice: "Pratica operacional",
    other: "Outra acao"
  };
  return labels[type] ?? type;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function isClosedItem(status: string) {
  return ["completed", "waived", "cancelled"].includes(status);
}

function isOverdueItem(item: DevelopmentPlanItem) {
  if (!item.dueAt || isClosedItem(item.status)) return false;
  return item.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const due = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function nextDueLabel(days: number | null) {
  if (days == null) return "Sem próxima ação";
  if (days < 0) return `${Math.abs(days)} dia(s) em atraso`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} dia(s)`;
}

function buildPlanSummary(items: DevelopmentPlanItem[] = []) {
  const completed = items.filter((item) => item.status === "completed").length;
  const open = items.filter((item) => !isClosedItem(item.status)).length;
  const overdue = items.filter(isOverdueItem).length;
  const next = items
    .filter((item) => !isClosedItem(item.status) && item.dueAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return {
    total: items.length,
    completed,
    open,
    overdue,
    next,
    nextInDays: next ? daysUntil(next.dueAt) : null,
    progress: items.length ? Math.round((completed / items.length) * 100) : 0
  };
}

export function HrEmployeeDevelopmentPlansCard({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [planForm, setPlanForm] = useState({ title: "", reason: "", dueAt: "", evaluationId: "" });
  const [itemForm, setItemForm] = useState({ title: "", description: "", actionType: "operational_practice", dueAt: "" });
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});

  const plansQuery = useQuery({
    queryKey: ["hr", "development-plans", employeeId],
    queryFn: async () => requestJson<ListResponse<DevelopmentPlan>>(`/api/hr/development-plans?employeeId=${employeeId}&pageSize=50`)
  });

  const evaluationsQuery = useQuery({
    queryKey: ["hr", "employee-evaluations", employeeId, "pdi-options"],
    queryFn: async () => requestJson<ListResponse<Evaluation>>(`/api/hr/employee-evaluations?employeeId=${employeeId}&pageSize=50`),
    enabled: showCreate
  });

  const selectedPlan = plansQuery.data?.data.find((plan) => plan.id === selectedPlanId) ?? plansQuery.data?.data[0] ?? null;

  const detailQuery = useQuery({
    queryKey: ["hr", "development-plan", selectedPlan?.id],
    queryFn: async () => requestJson<DetailResponse<DevelopmentPlan>>(`/api/hr/development-plans/${selectedPlan?.id}`),
    enabled: Boolean(selectedPlan?.id)
  });

  const detail = detailQuery.data?.data ?? null;
  const planSummary = buildPlanSummary(detail?.items ?? []);

  function refreshPlans() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hr", "development-plans", employeeId] }),
      queryClient.invalidateQueries({ queryKey: ["hr", "development-plan", selectedPlan?.id] })
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      requestJson<DetailResponse<DevelopmentPlan>>("/api/hr/development-plans", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          title: planForm.title,
          reason: planForm.reason,
          dueAt: planForm.dueAt ? `${planForm.dueAt}T12:00:00.000Z` : undefined,
          evaluationId: planForm.evaluationId || undefined
        })
      }),
    onSuccess: async (payload) => {
      setShowCreate(false);
      setSelectedPlanId(payload.data.id);
      setPlanForm({ title: "", reason: "", dueAt: "", evaluationId: "" });
      await refreshPlans();
    }
  });

  const createItemMutation = useMutation({
    mutationFn: async () =>
      requestJson(`/api/hr/development-plans/${detail?.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          title: itemForm.title,
          description: itemForm.description,
          actionType: itemForm.actionType,
          dueAt: itemForm.dueAt ? `${itemForm.dueAt}T12:00:00.000Z` : undefined
        })
      }),
    onSuccess: async () => {
      setShowItemForm(false);
      setItemForm({ title: "", description: "", actionType: "operational_practice", dueAt: "" });
      await refreshPlans();
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ item, status }: { item: DevelopmentPlanItem; status: "completed" | "in_progress" }) =>
      requestJson(`/api/hr/development-plans/${detail?.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          completionNotes: status === "completed" ? completionNotes[item.id]?.trim() || "Concluído no acompanhamento do Plano de Desenvolvimento (PDI)." : undefined
        })
      }),
    onSuccess: async () => {
      setCompletionNotes({});
      await refreshPlans();
    }
  });

  return (
    <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
      <div className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">Desenvolvimento</h3>
              <StatusBadge status="visual" label="Plano de Desenvolvimento (PDI) não é advertência" />
              <HelpHint text="Plano simples de ações para desenvolver ou acompanhar pontos combinados." />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Use o Plano de Desenvolvimento (PDI) para combinar ações práticas de melhoria, prazos e acompanhamento. Ele não representa punição disciplinar.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setShowCreate((current) => !current)}>
            <PlusCircle className="h-4 w-4" />
            Novo Plano de Desenvolvimento (PDI)
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {plansQuery.isLoading ? <LoadingTable label="Carregando PDIs..." /> : null}
        {plansQuery.error ? <ErrorMessage message={plansQuery.error instanceof Error ? plansQuery.error.message : "Nao foi possivel carregar PDIs."} /> : null}
        {createMutation.error ? <ErrorMessage message={createMutation.error instanceof Error ? createMutation.error.message : "Não foi possível criar o Plano de Desenvolvimento (PDI)."} /> : null}
        {createItemMutation.error ? <ErrorMessage message={createItemMutation.error instanceof Error ? createItemMutation.error.message : "Não foi possível criar item do Plano de Desenvolvimento (PDI)."} /> : null}
        {updateItemMutation.error ? <ErrorMessage message={updateItemMutation.error instanceof Error ? updateItemMutation.error.message : "Não foi possível atualizar item do Plano de Desenvolvimento (PDI)."} /> : null}

        {showCreate ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
            className="rounded-md border bg-muted/25 p-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Titulo">
                <Input value={planForm.title} onChange={(event) => setPlanForm((current) => ({ ...current, title: event.target.value }))} required />
              </Field>
              <Field label="Prazo">
                <Input type="date" value={planForm.dueAt} onChange={(event) => setPlanForm((current) => ({ ...current, dueAt: event.target.value }))} />
              </Field>
              <Field label="Avaliacao vinculada">
                <SelectField value={planForm.evaluationId} onChange={(event) => setPlanForm((current) => ({ ...current, evaluationId: event.target.value }))}>
                  <option value="">Sem avaliação vinculada</option>
                  {(evaluationsQuery.data?.data ?? []).map((evaluation) => (
                    <option key={evaluation.id} value={evaluation.id}>
                      {evaluation.templateName || "Avaliacao"} - {formatDate(evaluation.periodStart)} a {formatDate(evaluation.periodEnd)}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Motivo">
                <TextArea value={planForm.reason} onChange={(event) => setPlanForm((current) => ({ ...current, reason: event.target.value }))} maxLength={3000} />
              </Field>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createMutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || planForm.title.trim().length < 3}>
                Criar Plano de Desenvolvimento (PDI)
              </Button>
            </div>
          </form>
        ) : null}

        {!plansQuery.isLoading && !plansQuery.error && !(plansQuery.data?.data ?? []).length ? (
          <EmptyState
            title="Nenhum plano de desenvolvimento aberto."
            description="Use o Plano de Desenvolvimento (PDI) para combinar ações práticas de melhoria, prazos e responsáveis."
          />
        ) : null}

        {(plansQuery.data?.data ?? []).length ? (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2">
              {(plansQuery.data?.data ?? []).map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold">{plan.title}</p>
                    <StatusBadge status={statusTone(plan.status)} label={statusLabel(plan.status)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Prazo: {formatDate(plan.dueAt)}</p>
                  {plan.reason ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plan.reason}</p> : null}
                </button>
              ))}
            </div>

            <div className="min-w-0 rounded-md border bg-background p-4">
              {!detail ? <LoadingTable label="Carregando Plano de Desenvolvimento (PDI) selecionado..." /> : null}
              {detail?.redacted ? <EmptyState title="Plano de Desenvolvimento (PDI) protegido" description="Seu perfil pode ver o registro, mas o conteúdo sensível está restrito." /> : null}
              {detail && !detail.redacted ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{detail.title}</h4>
                    <StatusBadge status={statusTone(detail.status)} label={statusLabel(detail.status)} />
                    {detail.evaluationId ? <StatusBadge status="info" label="Originado da avaliação" /> : null}
                  </div>
                  {detail.reason ? <p className="break-words text-sm leading-6 text-muted-foreground">{detail.reason}</p> : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Prazo: {formatDate(detail.dueAt)}</span>
                    <span>Revisao: {formatDate(detail.reviewAt)}</span>
                  </div>
                  {detail.evaluationId ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/rh/employees/${employeeId}?tab=evaluations&evaluationId=${detail.evaluationId}`}>Abrir avaliação de origem</Link>
                    </Button>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <ListChecks className="h-4 w-4 text-primary" />
                        Ações
                      </div>
                      <p className="mt-2 text-xl font-semibold">{planSummary.total}</p>
                      <p className="text-xs text-muted-foreground">{planSummary.open} aberta(s)</p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        Conclusão
                      </div>
                      <p className="mt-2 text-xl font-semibold">{planSummary.completed}</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${planSummary.progress}%` }} />
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        Atrasos
                      </div>
                      <p className="mt-2 text-xl font-semibold">{planSummary.overdue}</p>
                      <p className="text-xs text-muted-foreground">Visível para acompanhamento, sem cobrança automática.</p>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Clock className="h-4 w-4 text-primary" />
                        Próxima ação
                      </div>
                      <p className="mt-2 text-sm font-semibold">{planSummary.next?.title ?? "Sem ação aberta"}</p>
                      <p className="text-xs text-muted-foreground">{nextDueLabel(planSummary.nextInDays)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between gap-2 border-t pt-3">
                    <h5 className="text-sm font-semibold">Acoes acordadas</h5>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowItemForm((current) => !current)}>
                      Nova acao
                    </Button>
                  </div>

                  {showItemForm ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        createItemMutation.mutate();
                      }}
                      className="rounded-md border bg-muted/25 p-3"
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Acao">
                          <Input value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} required />
                        </Field>
                        <Field label="Tipo">
                          <SelectField value={itemForm.actionType} onChange={(event) => setItemForm((current) => ({ ...current, actionType: event.target.value }))}>
                            <option value="operational_practice">Pratica operacional</option>
                            <option value="training">Treinamento</option>
                            <option value="coaching">Acompanhamento</option>
                            <option value="observation">Observacao</option>
                            <option value="procedure_review">Revisao de procedimento</option>
                            <option value="other">Outra acao</option>
                          </SelectField>
                        </Field>
                        <Field label="Prazo">
                          <Input type="date" value={itemForm.dueAt} onChange={(event) => setItemForm((current) => ({ ...current, dueAt: event.target.value }))} />
                        </Field>
                        <Field label="Descricao">
                          <TextArea value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} maxLength={3000} />
                        </Field>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setShowItemForm(false)} disabled={createItemMutation.isPending}>
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={createItemMutation.isPending || itemForm.title.trim().length < 3}>
                          Criar acao
                        </Button>
                      </div>
                    </form>
                  ) : null}

                  {detail.items?.length ? (
                    <div className="space-y-2">
                      {detail.items.map((item) => (
                        <div key={item.id} className={cn("rounded-md border bg-muted/20 p-3", isOverdueItem(item) ? "border-destructive/40 bg-destructive/5" : null)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 break-words text-sm font-medium">{item.title}</p>
                            <StatusBadge status={statusTone(item.status)} label={statusLabel(item.status)} />
                            {isOverdueItem(item) ? <StatusBadge status="danger" label="Atrasado" /> : null}
                            <StatusBadge status="visual" label={actionTypeLabel(item.actionType)} />
                          </div>
                          {item.description ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.description}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Prazo: {formatDate(item.dueAt)}</span>
                            <span>Conclusão: {formatDate(item.completedAt)}</span>
                            <span>Responsável: {item.responsibleUserId ? "Definido" : "Não informado"}</span>
                          </div>
                          {item.completionNotes ? <p className="mt-2 rounded-md border bg-background p-2 text-xs text-muted-foreground">Observação: {item.completionNotes}</p> : null}
                          {!isClosedItem(item.status) ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                              <Input
                                value={completionNotes[item.id] ?? ""}
                                onChange={(event) => setCompletionNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                                placeholder="Observação simples da conclusão"
                              />
                              <Button type="button" size="sm" onClick={() => updateItemMutation.mutate({ item, status: "completed" })} disabled={updateItemMutation.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                                Marcar como concluído
                              </Button>
                            </div>
                          ) : item.status === "completed" ? (
                            <div className="mt-3 flex justify-end">
                              <Button type="button" variant="outline" size="sm" onClick={() => updateItemMutation.mutate({ item, status: "in_progress" })} disabled={updateItemMutation.isPending}>
                                <RotateCcw className="h-4 w-4" />
                                Reabrir
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Nenhuma ação registrada" description="Adicione ações simples para acompanhar o desenvolvimento combinado." />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
