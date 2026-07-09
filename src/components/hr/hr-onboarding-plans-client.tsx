"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Edit2, ListChecks, Plus, PowerOff, RotateCcw, Save, Search, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

type Option = { id: string; name: string; unitId?: string | null; departmentId?: string | null };
type Status = "active" | "inactive" | "archived";
type Plan = {
  id: string;
  unitId: string | null;
  departmentId: string | null;
  jobPositionId: string | null;
  admissionType: string;
  name: string;
  description: string;
  priority: number;
  status: Status;
  scopeLabel: string;
  updatedAt: string;
};
type PlanItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  ownerArea: string;
  responsibleProfileCode: string;
  dueDaysAfterStart: number | null;
  isRequired: boolean;
  isCritical: boolean;
  blocksOperationalRelease: boolean;
  relatedDocumentTypeId: string | null;
  relatedDocumentTypeName: string;
  sortOrder: number;
  status: Status;
};
type PlansResponse = { ok: true; data: Plan[]; options: { units: Option[]; departments: Option[]; jobPositions: Option[]; documentTypes: Option[] } };
type ItemsResponse = { ok: true; data: PlanItem[] };
type PlanForm = {
  id: string;
  name: string;
  description: string;
  unitId: string;
  departmentId: string;
  jobPositionId: string;
  admissionType: string;
  priority: string;
  status: Status;
};
type ItemForm = {
  id: string;
  title: string;
  description: string;
  category: string;
  ownerArea: string;
  responsibleProfileCode: string;
  dueDaysAfterStart: string;
  isRequired: string;
  isCritical: string;
  blocksOperationalRelease: string;
  relatedDocumentTypeId: string;
  sortOrder: string;
  status: Status;
};

const emptyPlanForm: PlanForm = {
  id: "",
  name: "",
  description: "",
  unitId: "",
  departmentId: "",
  jobPositionId: "",
  admissionType: "",
  priority: "100",
  status: "active"
};
const emptyItemForm: ItemForm = {
  id: "",
  title: "",
  description: "",
  category: "other",
  ownerArea: "RH",
  responsibleProfileCode: "",
  dueDaysAfterStart: "",
  isRequired: "true",
  isCritical: "false",
  blocksOperationalRelease: "false",
  relatedDocumentTypeId: "",
  sortOrder: "0",
  status: "active"
};
const statusLabels: Record<Status, string> = { active: "Ativo", inactive: "Inativo", archived: "Arquivado" };
const categoryLabels: Record<string, string> = {
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
const ownerAreaLabels: Record<string, string> = {
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
const emptyPlans: Plan[] = [];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? "Nao foi possivel atualizar planos de onboarding.");
  return payload as T;
}

function statusTone(status: Status) {
  return status === "active" ? ("success" as const) : ("visual" as const);
}

function toPlanPayload(form: PlanForm) {
  return {
    name: form.name,
    description: form.description,
    unitId: form.unitId,
    departmentId: form.departmentId,
    jobPositionId: form.jobPositionId,
    admissionType: form.admissionType,
    priority: form.priority || "100",
    status: form.status
  };
}

function toItemPayload(form: ItemForm) {
  return {
    title: form.title,
    description: form.description,
    category: form.category,
    ownerArea: form.ownerArea,
    responsibleProfileCode: form.responsibleProfileCode,
    dueDaysAfterStart: form.dueDaysAfterStart,
    isRequired: form.isRequired === "true",
    isCritical: form.isCritical === "true",
    blocksOperationalRelease: form.blocksOperationalRelease === "true",
    relatedDocumentTypeId: form.relatedDocumentTypeId,
    sortOrder: form.sortOrder || "0",
    status: form.status
  };
}

export function HrOnboardingPlansClient() {
  const queryClient = useQueryClient();
  // Unidade ativa escopa a lista de planos no servidor (planos de rede / NULL seguem visiveis).
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);

  const plansQuery = useQuery({ queryKey: ["hr", "onboarding-plans", activeUnitId], queryFn: async () => requestJson<PlansResponse>("/api/hr/onboarding-plans") });
  const itemsQuery = useQuery({
    queryKey: ["hr", "onboarding-plans", selectedPlanId, "items"],
    queryFn: async () => requestJson<ItemsResponse>(`/api/hr/onboarding-plans/${selectedPlanId}/items`),
    enabled: Boolean(selectedPlanId)
  });
  const options = plansQuery.data?.options ?? { units: [], departments: [], jobPositions: [], documentTypes: [] };
  const plans = plansQuery.data?.data ?? emptyPlans;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const filteredDepartments = useMemo(() => options.departments.filter((item) => !planForm.unitId || !item.unitId || item.unitId === planForm.unitId), [options.departments, planForm.unitId]);
  const filteredJobPositions = useMemo(
    () => options.jobPositions.filter((item) => (!planForm.unitId || !item.unitId || item.unitId === planForm.unitId) && (!planForm.departmentId || !item.departmentId || item.departmentId === planForm.departmentId)),
    [options.jobPositions, planForm.departmentId, planForm.unitId]
  );
  const filteredPlans = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plans.filter((plan) => (!statusFilter || plan.status === statusFilter) && (!term || [plan.name, plan.description, plan.scopeLabel].join(" ").toLowerCase().includes(term)));
  }, [plans, search, statusFilter]);

  const planMutation = useMutation({
    mutationFn: async (input: PlanForm) => requestJson(input.id ? `/api/hr/onboarding-plans/${input.id}` : "/api/hr/onboarding-plans", { method: input.id ? "PATCH" : "POST", body: JSON.stringify(toPlanPayload(input)) }),
    onSuccess: async () => {
      setShowPlanForm(false);
      setPlanForm(emptyPlanForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "onboarding-plans"] });
    }
  });
  const itemMutation = useMutation({
    mutationFn: async (input: ItemForm) => requestJson(input.id ? `/api/hr/onboarding-plans/${selectedPlanId}/items/${input.id}` : `/api/hr/onboarding-plans/${selectedPlanId}/items`, { method: input.id ? "PATCH" : "POST", body: JSON.stringify(toItemPayload(input)) }),
    onSuccess: async () => {
      setShowItemForm(false);
      setItemForm(emptyItemForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "onboarding-plans", selectedPlanId, "items"] });
    }
  });

  function editPlan(plan: Plan) {
    setPlanForm({ id: plan.id, name: plan.name, description: plan.description, unitId: plan.unitId ?? "", departmentId: plan.departmentId ?? "", jobPositionId: plan.jobPositionId ?? "", admissionType: plan.admissionType, priority: String(plan.priority), status: plan.status });
    setShowPlanForm(true);
  }
  function editItem(item: PlanItem) {
    setItemForm({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      ownerArea: item.ownerArea,
      responsibleProfileCode: item.responsibleProfileCode,
      dueDaysAfterStart: item.dueDaysAfterStart == null ? "" : String(item.dueDaysAfterStart),
      isRequired: String(item.isRequired),
      isCritical: String(item.isCritical),
      blocksOperationalRelease: String(item.blocksOperationalRelease),
      relatedDocumentTypeId: item.relatedDocumentTypeId ?? "",
      sortOrder: String(item.sortOrder),
      status: item.status
    });
    setShowItemForm(true);
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Checklists padrao de onboarding</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Planos ativos com itens ativos aparecem para iniciar onboarding no detalhe do colaborador.</p>
          </div>
          <Button type="button" size="sm" onClick={() => { setPlanForm(emptyPlanForm); setShowPlanForm(true); }}>
            <Plus className="h-4 w-4" />
            Novo plano
          </Button>
        </div>
      </Card>

      {showPlanForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <form onSubmit={(event) => { event.preventDefault(); planMutation.mutate(planForm); }} className="space-y-4">
            <FormHeader title={planForm.id ? "Editar plano" : "Novo plano"} onClose={() => setShowPlanForm(false)} />
            <div className="grid gap-3 lg:grid-cols-4">
              <Field label="Nome do plano" className="lg:col-span-2"><Input value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
              <Field label="Status"><StatusSelect value={planForm.status} onChange={(status) => setPlanForm((current) => ({ ...current, status }))} /></Field>
              <Field label="Prioridade"><Input type="number" min={0} max={10000} value={planForm.priority} onChange={(event) => setPlanForm((current) => ({ ...current, priority: event.target.value }))} /></Field>
              <Field label="Unidade"><SelectField value={planForm.unitId} onChange={(event) => setPlanForm((current) => ({ ...current, unitId: event.target.value, departmentId: "", jobPositionId: "" }))}><option value="">Todas</option>{options.units.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</SelectField></Field>
              <Field label="Departamento"><SelectField value={planForm.departmentId} onChange={(event) => setPlanForm((current) => ({ ...current, departmentId: event.target.value, jobPositionId: "" }))}><option value="">Todos</option>{filteredDepartments.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</SelectField></Field>
              <Field label="Cargo"><SelectField value={planForm.jobPositionId} onChange={(event) => setPlanForm((current) => ({ ...current, jobPositionId: event.target.value }))}><option value="">Todos</option>{filteredJobPositions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</SelectField></Field>
              <Field label="Tipo de admissao"><Input value={planForm.admissionType} onChange={(event) => setPlanForm((current) => ({ ...current, admissionType: event.target.value.toLowerCase() }))} placeholder="ex.: efetiva" /></Field>
              <Field label="Descricao" className="lg:col-span-4"><TextArea value={planForm.description} onChange={(event) => setPlanForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} /></Field>
            </div>
            {planMutation.error ? <ErrorMessage message={planMutation.error instanceof Error ? planMutation.error.message : "Nao foi possivel salvar o plano."} /> : null}
            <FormActions disabled={planMutation.isPending || planForm.name.trim().length < 3} onCancel={() => setShowPlanForm(false)} label="Salvar plano" />
          </form>
        </Card>
      ) : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Buscar plano"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, contexto ou descricao" className="pl-9" /></div></Field>
          <Field label="Status"><SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="archived">Arquivados</option></SelectField></Field>
        </div>
      </Card>

      {plansQuery.isLoading ? <LoadingTable label="Carregando planos de onboarding..." /> : null}
      {plansQuery.error ? <ErrorMessage message={plansQuery.error instanceof Error ? plansQuery.error.message : "Erro ao carregar planos."} /> : null}
      {!plansQuery.isLoading && !plansQuery.error && !filteredPlans.length ? <EmptyState title="Nenhum plano de onboarding encontrado" description="Crie um plano para que o RH consiga iniciar checklists no detalhe do colaborador." /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="space-y-3">
          {filteredPlans.map((plan) => (
            <Card key={plan.id} className={cn("cursor-pointer border-border/80 p-4 shadow-sm shadow-primary/5", selectedPlanId === plan.id && "border-primary bg-primary/5")} onClick={() => setSelectedPlanId(plan.id)}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold">{plan.name}</h3><StatusBadge status={statusTone(plan.status)} label={statusLabels[plan.status]} /></div>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{plan.scopeLabel}</p>
                  {plan.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{plan.description}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">Atualizado em {formatDateTime(plan.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); editPlan(plan); }}><Edit2 className="h-4 w-4" />Editar</Button>
                  <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); planMutation.mutate({ ...emptyPlanForm, ...plan, unitId: plan.unitId ?? "", departmentId: plan.departmentId ?? "", jobPositionId: plan.jobPositionId ?? "", priority: String(plan.priority), status: plan.status === "active" ? "inactive" : "active" }); }}>
                    {plan.status === "active" ? <PowerOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    {plan.status === "active" ? "Inativar" : "Ativar"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          {!selectedPlan ? <EmptyState title="Selecione um plano" description="Escolha um plano para visualizar e manter os itens padrao do checklist." /> : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div><div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Itens do checklist padrão</h3></div><p className="mt-1 text-xs text-muted-foreground">{selectedPlan.name}</p></div>
                <Button type="button" size="sm" onClick={() => { setItemForm(emptyItemForm); setShowItemForm(true); }}><Plus className="h-4 w-4" />Novo item</Button>
              </div>
              {showItemForm ? (
                <Card className="border-border/80 p-4">
                  <form onSubmit={(event) => { event.preventDefault(); itemMutation.mutate(itemForm); }} className="space-y-3">
                    <FormHeader title={itemForm.id ? "Editar item" : "Novo item"} onClose={() => setShowItemForm(false)} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Titulo" className="md:col-span-2"><Input value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} required /></Field>
                      <Field label="Categoria"><SelectField value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
                      <Field label="Area responsavel"><SelectField value={itemForm.ownerArea} onChange={(event) => setItemForm((current) => ({ ...current, ownerArea: event.target.value }))}>{Object.entries(ownerAreaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField></Field>
                      <Field label="Prazo apos inicio"><Input type="number" min={0} max={3650} value={itemForm.dueDaysAfterStart} onChange={(event) => setItemForm((current) => ({ ...current, dueDaysAfterStart: event.target.value }))} /></Field>
                      <Field label="Ordem"><Input type="number" min={0} max={10000} value={itemForm.sortOrder} onChange={(event) => setItemForm((current) => ({ ...current, sortOrder: event.target.value }))} /></Field>
                      <Field label="Documento relacionado"><SelectField value={itemForm.relatedDocumentTypeId} onChange={(event) => setItemForm((current) => ({ ...current, relatedDocumentTypeId: event.target.value }))}><option value="">Nenhum</option>{options.documentTypes.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</SelectField></Field>
                      <Field label="Perfil responsavel"><Input value={itemForm.responsibleProfileCode} onChange={(event) => setItemForm((current) => ({ ...current, responsibleProfileCode: event.target.value.toUpperCase() }))} placeholder="HR_OPERATOR" /></Field>
                      <Field label="Obrigatorio"><BoolSelect value={itemForm.isRequired} trueLabel="Obrigatorio" falseLabel="Opcional" onChange={(value) => setItemForm((current) => ({ ...current, isRequired: value }))} /></Field>
                      <Field label="Criticidade"><BoolSelect value={itemForm.isCritical} trueLabel="Critico" falseLabel="Normal" onChange={(value) => setItemForm((current) => ({ ...current, isCritical: value }))} /></Field>
                      <Field label="Liberação"><BoolSelect value={itemForm.blocksOperationalRelease} trueLabel="Bloqueia liberacao" falseLabel="Nao bloqueia" onChange={(value) => setItemForm((current) => ({ ...current, blocksOperationalRelease: value }))} /></Field>
                      <Field label="Status"><StatusSelect value={itemForm.status} onChange={(status) => setItemForm((current) => ({ ...current, status }))} /></Field>
                      <Field label="Descricao" className="md:col-span-2"><TextArea value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} maxLength={2000} /></Field>
                    </div>
                    {itemMutation.error ? <ErrorMessage message={itemMutation.error instanceof Error ? itemMutation.error.message : "Nao foi possivel salvar o item."} /> : null}
                    <FormActions disabled={itemMutation.isPending || itemForm.title.trim().length < 3} onCancel={() => setShowItemForm(false)} label="Salvar item" />
                  </form>
                </Card>
              ) : null}
              {itemsQuery.isLoading ? <LoadingTable label="Carregando itens do checklist..." /> : null}
              {itemsQuery.error ? <ErrorMessage message={itemsQuery.error instanceof Error ? itemsQuery.error.message : "Erro ao carregar itens."} /> : null}
              {!itemsQuery.isLoading && !itemsQuery.error && !(itemsQuery.data?.data.length ?? 0) ? <EmptyState title="Plano sem itens" description="Cadastre itens para que este plano gere um checklist real no colaborador." /> : null}
              <div className="space-y-3">
                {itemsQuery.data?.data.map((item) => (
                  <article key={item.id} className="rounded-md border bg-background p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-semibold">{item.title}</h4><StatusBadge status={statusTone(item.status)} label={statusLabels[item.status]} />{item.isRequired ? <StatusBadge status="info" label="Obrigatorio" /> : null}{item.isCritical ? <StatusBadge status="danger" label="Critico" /> : null}{item.blocksOperationalRelease ? <StatusBadge status="warning" label="Bloqueia liberacao" /> : null}</div>
                        {item.description ? <p className="break-words text-sm leading-6 text-muted-foreground">{item.description}</p> : null}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{categoryLabels[item.category] ?? item.category}</span><span>{ownerAreaLabels[item.ownerArea] ?? item.ownerArea}</span><span>{item.dueDaysAfterStart == null ? "Sem prazo automatico" : `${item.dueDaysAfterStart} dia(s) apos inicio`}</span><span>Ordem {item.sortOrder}</span>{item.relatedDocumentTypeName ? <span>Documento: {item.relatedDocumentTypeName}</span> : null}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => editItem(item)}><Edit2 className="h-4 w-4" />Editar</Button><Button type="button" variant="outline" size="sm" onClick={() => itemMutation.mutate({ ...emptyItemForm, ...item, dueDaysAfterStart: item.dueDaysAfterStart == null ? "" : String(item.dueDaysAfterStart), isRequired: String(item.isRequired), isCritical: String(item.isCritical), blocksOperationalRelease: String(item.blocksOperationalRelease), relatedDocumentTypeId: item.relatedDocumentTypeId ?? "", sortOrder: String(item.sortOrder), status: item.status === "active" ? "inactive" : "active" })}>{item.status === "active" ? <PowerOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{item.status === "active" ? "Inativar" : "Ativar"}</Button></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function FormHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <Button type="button" variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" />Fechar</Button>
    </div>
  );
}

function FormActions({ disabled, onCancel, label }: { disabled: boolean; onCancel: () => void; label: string }) {
  return <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={disabled}><Save className="h-4 w-4" />{label}</Button></div>;
}

function StatusSelect({ value, onChange }: { value: Status; onChange: (status: Status) => void }) {
  return <SelectField value={value} onChange={(event) => onChange(event.target.value as Status)}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="archived">Arquivado</option></SelectField>;
}

function BoolSelect({ value, trueLabel, falseLabel, onChange }: { value: string; trueLabel: string; falseLabel: string; onChange: (value: string) => void }) {
  return <SelectField value={value} onChange={(event) => onChange(event.target.value)}><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></SelectField>;
}
