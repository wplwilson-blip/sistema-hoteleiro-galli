"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { ErrorMessage, Field, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

type RecordStatus = "active" | "inactive" | "archived";

type UnitOption = { id: string; code: string; name: string; status: RecordStatus };
type DepartmentOption = { id: string; unitId: string; code: string; name: string; status: RecordStatus };
type JobPositionOption = { id: string; unitId: string; departmentId?: string; code: string; name: string; status: RecordStatus };
type UserOption = { id: string; username: string; displayName: string; unitIds: string[]; status: "active" | "inactive" | "blocked" | "pending" };
type UsersResponse = { ok: true; users: UserOption[] };

type WorkflowTemplateStep = {
  step_key: string;
  name: string;
  order_index: number;
  default_sla_minutes: number | null;
  requires_approval: boolean;
};

type WorkflowTemplate = {
  id: string;
  name: string;
  workflow_type: string;
  default_sla_minutes: number | null;
  steps?: WorkflowTemplateStep[];
};

type WorkflowTemplatesResponse = { data: WorkflowTemplate[] };
type CreateWorkflowResponse = { data: { id: string } };

type JobOpeningForm = {
  unitId: string;
  departmentId: string;
  jobPositionId: string;
  requestedQuantity: string;
  urgency: string;
  reason: string;
  managerUserId: string;
  requestedStartDate: string;
  justification: string;
  notes: string;
};

const emptyForm: JobOpeningForm = {
  unitId: "",
  departmentId: "",
  jobPositionId: "",
  requestedQuantity: "1",
  urgency: "normal",
  reason: "",
  managerUserId: "",
  requestedStartDate: "",
  justification: "",
  notes: ""
};

const urgencyOptions = [
  { value: "low", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Critica" }
];

const reasonOptions = [
  "Substituicao",
  "Aumento de demanda",
  "Nova funcao",
  "Reforco operacional",
  "Banco preventivo"
];

const forbiddenTextPattern = /\b(cpf|rg|ctps|pis|sal[aá]rio|benef[ií]cio|banc[aá]rio|banco|ag[eê]ncia|conta|m[eé]dico|cid)\b/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(value));
}

function createIdempotencyKey() {
  return `job-opening-create-${crypto.randomUUID()}`;
}

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function managerLabel(user: UserOption | undefined) {
  if (!user) return "";
  return user.displayName || user.username;
}

function normalizeStepKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, "_").slice(0, 80);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "Nao foi possivel concluir a operacao.");
  }

  return payload as T;
}

function templateUrl(unitId: string) {
  const params = new URLSearchParams({
    workflow_type: "job_opening",
    is_active: "true",
    include_system: "true"
  });
  if (unitId) params.set("unit_id", unitId);
  return `/api/hr/workflow-templates?${params.toString()}`;
}

export function HrJobOpeningCreateClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeUnit, user } = useAppStore();
  const [form, setForm] = useState<JobOpeningForm>({
    ...emptyForm,
    unitId: isUuid(activeUnit?.id) ? activeUnit.id : ""
  });
  const [error, setError] = useState("");

  const unitsQuery = useQuery({ queryKey: ["base", "units"], queryFn: async () => requestJson<{ ok: true; units: UnitOption[] }>("/api/base/units") });
  const departmentsQuery = useQuery({ queryKey: ["base", "departments"], queryFn: async () => requestJson<{ ok: true; departments: DepartmentOption[] }>("/api/base/departments") });
  const positionsQuery = useQuery({ queryKey: ["base", "job-positions"], queryFn: async () => requestJson<{ ok: true; positions: JobPositionOption[] }>("/api/base/job-positions") });
  const usersQuery = useQuery({ queryKey: ["base", "users"], queryFn: async () => requestJson<UsersResponse>("/api/base/users") });
  const templatesQuery = useQuery({
    queryKey: ["hr", "workflow-templates", "job_opening", form.unitId],
    queryFn: async () => requestJson<WorkflowTemplatesResponse>(templateUrl(form.unitId)),
    enabled: Boolean(form.unitId)
  });

  const activeUnits = useMemo(() => (unitsQuery.data?.units ?? []).filter((unit) => unit.status === "active"), [unitsQuery.data?.units]);
  const availableDepartments = useMemo(
    () => (departmentsQuery.data?.departments ?? []).filter((department) => department.status === "active" && (!form.unitId || department.unitId === form.unitId)),
    [departmentsQuery.data?.departments, form.unitId]
  );
  const availablePositions = useMemo(
    () =>
      (positionsQuery.data?.positions ?? []).filter(
        (position) => position.status === "active" && (!form.unitId || position.unitId === form.unitId) && (!form.departmentId || !position.departmentId || position.departmentId === form.departmentId)
      ),
    [form.departmentId, form.unitId, positionsQuery.data?.positions]
  );
  const availableManagers = useMemo(
    () => (usersQuery.data?.users ?? []).filter((item) => item.status === "active" && (!form.unitId || !item.unitIds.length || item.unitIds.includes(form.unitId))),
    [form.unitId, usersQuery.data?.users]
  );
  const selectedTemplate = useMemo(() => {
    const templates = templatesQuery.data?.data ?? [];
    return templates.find((template) => template.workflow_type === "job_opening" && (template.steps?.length ?? 0) > 0) ?? null;
  }, [templatesQuery.data?.data]);
  const selectedDepartment = availableDepartments.find((department) => department.id === form.departmentId);
  const selectedPosition = availablePositions.find((position) => position.id === form.jobPositionId);
  const selectedManager = availableManagers.find((manager) => manager.id === form.managerUserId);

  useEffect(() => {
    if (!form.unitId && activeUnits.length) {
      setForm((current) => ({ ...current, unitId: activeUnits[0].id }));
    }
  }, [activeUnits, form.unitId]);

  useEffect(() => {
    if (!form.managerUserId && user?.id && availableManagers.some((manager) => manager.id === user.id)) {
      setForm((current) => ({ ...current, managerUserId: user.id }));
    }
  }, [availableManagers, form.managerUserId, user?.id]);

  function validateForm() {
    const quantity = Number(form.requestedQuantity);
    if (!form.unitId) return "Informe a unidade.";
    if (!form.departmentId || !selectedDepartment) return "Informe o departamento.";
    if (!form.jobPositionId || !selectedPosition) return "Informe o cargo.";
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return "Informe uma quantidade entre 1 e 100.";
    if (!form.urgency) return "Informe a urgencia.";
    if (!form.reason) return "Informe o motivo da vaga.";
    if (!form.managerUserId || !selectedManager) return "Informe o gestor solicitante.";
    if (!form.requestedStartDate) return "Informe a data desejada.";
    if (compactText(form.justification).length < 10) return "Informe uma justificativa operacional.";
    if (!selectedTemplate || !(selectedTemplate.steps?.length ?? 0)) return "Template job_opening ativo com etapas nao encontrado.";
    if (forbiddenTextPattern.test(`${form.justification} ${form.notes}`)) {
      return "Nao informe salario, beneficios, documentos, dados bancarios ou dados medicos.";
    }
    return "";
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateForm();
      if (validationError) throw new Error(validationError);

      const steps = (selectedTemplate?.steps ?? [])
        .slice()
        .sort((left, right) => left.order_index - right.order_index)
        .map((step, index) => ({
          step_key: normalizeStepKey(step.step_key || `JOB_OPENING_STEP_${index + 1}`),
          title: step.name,
          step_order: index + 1,
          requires_approval: step.requires_approval,
          sla_minutes: step.default_sla_minutes ?? undefined
        }));

      const quantity = Number(form.requestedQuantity);
      const description = [
        `Departamento: ${selectedDepartment?.name}`,
        `Cargo: ${selectedPosition?.name}`,
        `Quantidade: ${quantity}`,
        `Urgencia: ${form.urgency}`,
        `Motivo: ${form.reason}`,
        `Gestor solicitante: ${managerLabel(selectedManager)}`,
        `Data desejada: ${form.requestedStartDate}`
      ].join("\n");

      const payload = {
        workflow_type: "job_opening",
        title: `Vaga - ${selectedPosition?.name ?? "Cargo"}`,
        description,
        employee_id: null,
        unit_id: form.unitId,
        priority: form.urgency === "critical" ? "critical" : form.urgency === "high" ? "high" : "normal",
        sla_minutes: selectedTemplate?.default_sla_minutes ?? undefined,
        metadata: {
          department: selectedDepartment?.name,
          department_id: selectedDepartment?.id,
          job_position: selectedPosition?.name,
          job_position_id: selectedPosition?.id,
          requested_quantity: quantity,
          urgency: form.urgency,
          reason: form.reason,
          requested_start_date: form.requestedStartDate,
          manager_user_id: form.managerUserId,
          justification: compactText(form.justification),
          notes: compactText(form.notes) || undefined
        },
        steps
      };

      return requestJson<CreateWorkflowResponse>("/api/hr/workflows", {
        method: "POST",
        headers: { "Idempotency-Key": createIdempotencyKey() },
        body: JSON.stringify(payload)
      });
    },
    onSuccess: async (result) => {
      setError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hr", "workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["hr", "analytics"] })
      ]);
      router.push(`/rh/workflows/${result.data.id}`);
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel abrir a vaga.")
  });

  function updateForm<K extends keyof JobOpeningForm>(key: K, value: JobOpeningForm[K]) {
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  const isLoadingLookups = unitsQuery.isLoading || departmentsQuery.isLoading || positionsQuery.isLoading || usersQuery.isLoading;
  const lookupError = unitsQuery.error ?? departmentsQuery.error ?? positionsQuery.error ?? usersQuery.error ?? templatesQuery.error;

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label="Solicitacao formal" />
              <StatusBadge status="visual" label="Candidatos vinculados depois da abertura" />
              {selectedTemplate ? <StatusBadge status="success" label={`Roteiro: ${selectedTemplate.name}`} /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              A vaga sera aberta para aprovacao e acompanhamento operacional. Candidatos e entrevistas podem ser vinculados depois da abertura.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/rh/vagas">
              <ArrowLeft className="h-4 w-4" />
              Voltar para Vagas
            </Link>
          </Button>
        </div>
      </Card>

      {lookupError ? <ErrorMessage message={lookupError instanceof Error ? lookupError.message : "Nao foi possivel carregar dados auxiliares."} /> : null}
      {error ? <ErrorMessage message={error} /> : null}

      <form
        className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!createMutation.isPending) createMutation.mutate();
        }}
      >
        <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Dados da vaga</h2>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label="Unidade">
              <SelectField value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value, departmentId: "", jobPositionId: "", managerUserId: "" }))} disabled={isLoadingLookups || createMutation.isPending} required>
                <option value="">Selecione</option>
                {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.code ? `${unit.code} - ${unit.name}` : unit.name}</option>)}
              </SelectField>
            </Field>
            <Field label="Departamento">
              <SelectField value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, jobPositionId: "" }))} disabled={!form.unitId || isLoadingLookups || createMutation.isPending} required>
                <option value="">Selecione</option>
                {availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.code ? `${department.code} - ${department.name}` : department.name}</option>)}
              </SelectField>
            </Field>
            <Field label="Cargo">
              <SelectField value={form.jobPositionId} onChange={(event) => updateForm("jobPositionId", event.target.value)} disabled={!form.departmentId || isLoadingLookups || createMutation.isPending} required>
                <option value="">Selecione</option>
                {availablePositions.map((position) => <option key={position.id} value={position.id}>{position.code ? `${position.code} - ${position.name}` : position.name}</option>)}
              </SelectField>
            </Field>
            <Field label="Quantidade">
              <Input type="number" min={1} max={100} value={form.requestedQuantity} onChange={(event) => updateForm("requestedQuantity", event.target.value)} disabled={createMutation.isPending} required />
            </Field>
            <Field label="Urgencia">
              <SelectField value={form.urgency} onChange={(event) => updateForm("urgency", event.target.value)} disabled={createMutation.isPending} required>
                {urgencyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>
            </Field>
            <Field label="Motivo da vaga">
              <SelectField value={form.reason} onChange={(event) => updateForm("reason", event.target.value)} disabled={createMutation.isPending} required>
                <option value="">Selecione</option>
                {reasonOptions.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </SelectField>
            </Field>
            <Field label="Gestor solicitante">
              <SelectField value={form.managerUserId} onChange={(event) => updateForm("managerUserId", event.target.value)} disabled={!form.unitId || isLoadingLookups || createMutation.isPending} required>
                <option value="">Selecione</option>
                {availableManagers.map((manager) => <option key={manager.id} value={manager.id}>{managerLabel(manager)}</option>)}
              </SelectField>
            </Field>
            <Field label="Data desejada">
              <Input type="date" value={form.requestedStartDate} onChange={(event) => updateForm("requestedStartDate", event.target.value)} disabled={createMutation.isPending} required />
            </Field>
            <Field label="Justificativa" className="md:col-span-2">
              <TextArea value={form.justification} onChange={(event) => updateForm("justification", event.target.value)} maxLength={800} placeholder="Explique a necessidade operacional da vaga. Nao informe salario, beneficios ou dados pessoais." disabled={createMutation.isPending} required />
            </Field>
            <Field label="Observacoes operacionais" className="md:col-span-2">
              <TextArea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} maxLength={500} placeholder="Opcional. Nao informe dados sensiveis ou informacoes de candidatos." disabled={createMutation.isPending} />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Etapas previstas</h2>
            </div>
            {templatesQuery.isLoading ? (
              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                Carregando template job_opening...
              </div>
            ) : selectedTemplate ? (
              <div className="space-y-2">
                <StatusBadge status="success" label={`${selectedTemplate.steps?.length ?? 0} etapas encontradas`} />
                {(selectedTemplate.steps ?? []).slice().sort((left, right) => left.order_index - right.order_index).map((step) => (
                  <div key={step.step_key} className="rounded-md border bg-background px-3 py-2 text-sm">
                    <p className="font-medium">{step.name}</p>
                    <p className="text-xs text-muted-foreground">{step.requires_approval ? "Requer aprovacao" : "Etapa operacional"}{step.default_sla_minutes ? ` · prazo previsto ${step.default_sla_minutes} min` : ""}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Template job_opening ativo com etapas nao encontrado. A abertura fica bloqueada para nao inventar fluxo.
              </div>
            )}
          </Card>

          <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Escopo e LGPD</h2>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Nao informe salario, beneficios, dados pessoais de candidatos, documentos, anexos ou dados medicos.</p>
              <p>A solicitacao fica registrada para acompanhamento do RH, com candidatos e entrevistas vinculados ao processo quando necessario.</p>
            </div>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild type="button" variant="outline"><Link href="/rh/vagas">Cancelar</Link></Button>
            <Button type="submit" disabled={createMutation.isPending || isLoadingLookups || templatesQuery.isLoading}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
              Abrir vaga
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
