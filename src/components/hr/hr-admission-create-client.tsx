"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { ErrorMessage, Field, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

type RecordStatus = "active" | "inactive" | "archived";

type UnitOption = {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
};

type DepartmentOption = {
  id: string;
  unitId: string;
  code: string;
  name: string;
  status: RecordStatus;
};

type JobPositionOption = {
  id: string;
  unitId: string;
  departmentId?: string;
  code: string;
  name: string;
  status: RecordStatus;
};

type UserOption = {
  id: string;
  username: string;
  displayName: string;
  unitIds: string[];
  status: "active" | "inactive" | "blocked" | "pending";
};

type UsersResponse = {
  ok: true;
  users: UserOption[];
};

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

type WorkflowTemplatesResponse = {
  data: WorkflowTemplate[];
};

type CreateWorkflowResponse = {
  data: {
    id: string;
  };
  idempotency?: {
    status?: string;
    replayed?: boolean;
  };
};

type AdmissionForm = {
  unitId: string;
  candidateName: string;
  jobPositionId: string;
  departmentId: string;
  expectedStartDate: string;
  managerUserId: string;
  contractType: string;
  notes: string;
};

const emptyForm: AdmissionForm = {
  unitId: "",
  candidateName: "",
  jobPositionId: "",
  departmentId: "",
  expectedStartDate: "",
  managerUserId: "",
  contractType: "",
  notes: ""
};

const contractTypes = [
  "CLT",
  "Temporario",
  "Estagio",
  "Aprendiz",
  "Prestador administrativo"
];

const forbiddenNotesPattern = /\b(cpf|rg|ctps|pis|sal[aá]rio|banc[aá]rio|banco|ag[eê]ncia|conta|m[eé]dico|cid)\b/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(value));
}

function createIdempotencyKey() {
  return `admission-create-${crypto.randomUUID()}`;
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
    workflow_type: "admission",
    is_active: "true",
    include_system: "true"
  });
  if (unitId) params.set("unit_id", unitId);
  return `/api/hr/workflow-templates?${params.toString()}`;
}

function normalizeStepKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, "_").slice(0, 80);
}

function managerLabel(user: UserOption | undefined) {
  if (!user) return "";
  return user.displayName || user.username;
}

function formatOperationalDeadline(minutes: number | null) {
  if (!minutes) return null;

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${minutes} min`;
}

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function HrAdmissionCreateClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeUnit, user } = useAppStore();
  const [form, setForm] = useState<AdmissionForm>({
    ...emptyForm,
    unitId: isUuid(activeUnit?.id) ? activeUnit.id : ""
  });
  const [error, setError] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["base", "units"],
    queryFn: async () => requestJson<{ ok: true; units: UnitOption[] }>("/api/base/units")
  });
  const departmentsQuery = useQuery({
    queryKey: ["base", "departments"],
    queryFn: async () => requestJson<{ ok: true; departments: DepartmentOption[] }>("/api/base/departments")
  });
  const positionsQuery = useQuery({
    queryKey: ["base", "job-positions"],
    queryFn: async () => requestJson<{ ok: true; positions: JobPositionOption[] }>("/api/base/job-positions")
  });
  const usersQuery = useQuery({
    queryKey: ["base", "users"],
    queryFn: async () => requestJson<UsersResponse>("/api/base/users")
  });
  const templatesQuery = useQuery({
    queryKey: ["hr", "workflow-templates", "admission", form.unitId],
    queryFn: async () => requestJson<WorkflowTemplatesResponse>(templateUrl(form.unitId)),
    enabled: Boolean(form.unitId)
  });

  const activeUnits = useMemo(() => (unitsQuery.data?.units ?? []).filter((unit) => unit.status === "active"), [unitsQuery.data?.units]);
  const availableDepartments = useMemo(
    () =>
      (departmentsQuery.data?.departments ?? []).filter(
        (department) => department.status === "active" && (!form.unitId || department.unitId === form.unitId)
      ),
    [departmentsQuery.data?.departments, form.unitId]
  );
  const availablePositions = useMemo(
    () =>
      (positionsQuery.data?.positions ?? []).filter(
        (position) =>
          position.status === "active" &&
          (!form.unitId || position.unitId === form.unitId) &&
          (!form.departmentId || !position.departmentId || position.departmentId === form.departmentId)
      ),
    [positionsQuery.data?.positions, form.departmentId, form.unitId]
  );
  const availableManagers = useMemo(
    () =>
      (usersQuery.data?.users ?? []).filter(
        (item) => item.status === "active" && (!form.unitId || !item.unitIds.length || item.unitIds.includes(form.unitId))
      ),
    [form.unitId, usersQuery.data?.users]
  );
  const selectedTemplate = useMemo(() => {
    const templates = templatesQuery.data?.data ?? [];
    return templates.find((template) => template.workflow_type === "admission" && (template.steps?.length ?? 0) > 0) ?? null;
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateForm();
      if (validationError) {
        throw new Error(validationError);
      }

      const steps = (selectedTemplate?.steps ?? [])
        .slice()
        .sort((left, right) => left.order_index - right.order_index)
        .map((step, index) => ({
          step_key: normalizeStepKey(step.step_key || `ADMISSION_STEP_${index + 1}`),
          title: step.name,
          step_order: index + 1,
          requires_approval: step.requires_approval,
          sla_minutes: step.default_sla_minutes ?? undefined
        }));

      const description = [
        `Candidato: ${compactText(form.candidateName)}`,
        `Gestor solicitante: ${managerLabel(selectedManager)}`,
        `Cargo pretendido: ${selectedPosition?.name ?? ""}`,
        `Departamento: ${selectedDepartment?.name ?? ""}`,
        `Data prevista de inicio: ${form.expectedStartDate}`
      ].join("\n");

      const payload = {
        workflow_type: "admission",
        title: `Admissao - ${selectedPosition?.name ?? "Cargo pretendido"}`,
        description,
        employee_id: null,
        unit_id: form.unitId,
        priority: "normal",
        sla_minutes: selectedTemplate?.default_sla_minutes ?? undefined,
        metadata: {
          admission_date: form.expectedStartDate,
          job_position: selectedPosition?.name,
          department: selectedDepartment?.name,
          contract_type: form.contractType,
          notes: form.notes.trim() || undefined
        },
        steps
      };

      return requestJson<CreateWorkflowResponse>("/api/hr/workflows", {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey()
        },
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
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel abrir a admissao.");
    }
  });

  function validateForm() {
    if (!form.unitId) return "Informe a unidade.";
    if (!compactText(form.candidateName)) return "Informe o nome do candidato.";
    if (!form.departmentId || !selectedDepartment) return "Informe o departamento.";
    if (!form.jobPositionId || !selectedPosition) return "Informe o cargo pretendido.";
    if (!form.expectedStartDate) return "Informe a data prevista de inicio.";
    if (!form.managerUserId || !selectedManager) return "Informe o gestor solicitante.";
    if (!form.contractType) return "Informe o tipo de contratacao.";
    if (!selectedTemplate || !(selectedTemplate.steps?.length ?? 0)) return "Roteiro de admissao ativo com etapas nao encontrado.";
    if (form.notes && forbiddenNotesPattern.test(form.notes)) {
      return "As observacoes nao devem conter CPF, RG, salario, dados bancarios ou dados medicos.";
    }
    return "";
  }

  function updateForm<K extends keyof AdmissionForm>(key: K, value: AdmissionForm[K]) {
    setError("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  const isLoadingLookups = unitsQuery.isLoading || departmentsQuery.isLoading || positionsQuery.isLoading || usersQuery.isLoading;
  const lookupError =
    unitsQuery.error ?? departmentsQuery.error ?? positionsQuery.error ?? usersQuery.error ?? templatesQuery.error;
  const templateStepCount = selectedTemplate?.steps?.length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="info" label="Processo formal" />
              <StatusBadge status="visual" label="Sem criar colaborador automaticamente" />
              {selectedTemplate ? <StatusBadge status="success" label={`Roteiro: ${selectedTemplate.name}`} /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              A admissao sera aberta como processo de RH, sem folha, ponto, salario, documentos digitalizados ou cadastro automatico de colaborador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/rh/inbox">
                <ArrowLeft className="h-4 w-4" />
                Voltar para fila
              </Link>
            </Button>
          </div>
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
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Dados da admissao</h2>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Field label="Unidade">
              <SelectField
                value={form.unitId}
                onChange={(event) => {
                  updateForm("unitId", event.target.value);
                  setForm((current) => ({ ...current, departmentId: "", jobPositionId: "", managerUserId: "" }));
                }}
                disabled={isLoadingLookups || createMutation.isPending}
                required
              >
                <option value="">Selecione</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? `${unit.code} - ${unit.name}` : unit.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Nome do candidato">
              <Input
                value={form.candidateName}
                onChange={(event) => updateForm("candidateName", event.target.value)}
                maxLength={120}
                placeholder="Nome para controle interno da admissao"
                disabled={createMutation.isPending}
                required
              />
            </Field>
            <Field label="Departamento">
              <SelectField
                value={form.departmentId}
                onChange={(event) => {
                  updateForm("departmentId", event.target.value);
                  setForm((current) => ({ ...current, jobPositionId: "" }));
                }}
                disabled={!form.unitId || isLoadingLookups || createMutation.isPending}
                required
              >
                <option value="">Selecione</option>
                {availableDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.code ? `${department.code} - ${department.name}` : department.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Cargo pretendido">
              <SelectField
                value={form.jobPositionId}
                onChange={(event) => updateForm("jobPositionId", event.target.value)}
                disabled={!form.departmentId || isLoadingLookups || createMutation.isPending}
                required
              >
                <option value="">Selecione</option>
                {availablePositions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.code ? `${position.code} - ${position.name}` : position.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Data prevista de inicio">
              <Input
                type="date"
                value={form.expectedStartDate}
                onChange={(event) => updateForm("expectedStartDate", event.target.value)}
                disabled={createMutation.isPending}
                required
              />
            </Field>
            <Field label="Gestor solicitante">
              <SelectField
                value={form.managerUserId}
                onChange={(event) => updateForm("managerUserId", event.target.value)}
                disabled={!form.unitId || isLoadingLookups || createMutation.isPending}
                required
              >
                <option value="">Selecione</option>
                {availableManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {managerLabel(manager)}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Tipo de contratacao">
              <SelectField
                value={form.contractType}
                onChange={(event) => updateForm("contractType", event.target.value)}
                disabled={createMutation.isPending}
                required
              >
                <option value="">Selecione</option>
                {contractTypes.map((contractType) => (
                  <option key={contractType} value={contractType}>
                    {contractType}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Observacoes operacionais" className="md:col-span-2">
              <TextArea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                maxLength={500}
                placeholder="Somente orientacoes operacionais. Nao informe CPF, RG, salario, dados bancarios ou dados medicos."
                disabled={createMutation.isPending}
              />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Roteiro da admissao</h2>
            </div>
            {templatesQuery.isLoading ? (
              <div className="flex items-center rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                Carregando roteiro da admissao...
              </div>
            ) : selectedTemplate ? (
              <div className="space-y-2">
                <StatusBadge status="success" label={`${templateStepCount} etapas encontradas`} />
                <div className="space-y-2">
                  {(selectedTemplate.steps ?? [])
                    .slice()
                    .sort((left, right) => left.order_index - right.order_index)
                    .map((step) => (
                      <div key={step.step_key} className="rounded-md border bg-background px-3 py-2 text-sm">
                        <p className="font-medium">{step.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {step.requires_approval ? "Requer aprovacao" : "Etapa operacional"}
                          {formatOperationalDeadline(step.default_sla_minutes) ? ` · prazo previsto ${formatOperationalDeadline(step.default_sla_minutes)}` : ""}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Roteiro de admissao ativo com etapas nao encontrado. A abertura fica bloqueada para preservar o processo correto.
              </div>
            )}
          </Card>

          <Card className="min-w-0 border-border/80 p-4 shadow-sm shadow-primary/5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">LGPD e escopo</h2>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Nao informe documentos, salario, dados bancarios, endereco completo, dados medicos, foto ou assinatura.</p>
              <p>O colaborador nao sera criado automaticamente nesta etapa.</p>
              <p>Dados complementares de cargo, departamento e gestor permanecem limitados ao escopo administrativo desta etapa.</p>
            </div>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/rh/inbox">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending || isLoadingLookups || templatesQuery.isLoading}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Abrir admissao
            </Button>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>A criacao usa protecao contra envio duplicado e mantem o cadastro de colaborador fora desta etapa.</p>
          </div>
        </div>
      </form>
    </div>
  );
}
