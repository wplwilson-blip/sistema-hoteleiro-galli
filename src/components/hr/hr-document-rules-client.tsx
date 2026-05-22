"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, FileCog, Plus, PowerOff, RotateCcw, Save, Search, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RuleOption = {
  id: string;
  code: string;
  name: string;
  organizationId?: string | null;
  unitId?: string | null;
  departmentId?: string | null;
};

type DocumentRule = {
  id: string;
  organizationId: string | null;
  unitId: string | null;
  departmentId: string | null;
  jobPositionId: string | null;
  admissionType: string;
  documentTypeId: string;
  documentTypeName: string;
  documentTypeCode: string;
  unitName: string;
  departmentName: string;
  jobPositionName: string;
  scopeLabel: string;
  isRequired: boolean;
  dueDaysAfterAdmission: number | null;
  recurrenceMonths: number | null;
  priority: number;
  notes: string;
  status: "active" | "inactive" | "archived";
  updatedAt: string;
};

type RulesResponse = {
  ok: true;
  data: DocumentRule[];
  options: {
    units: RuleOption[];
    departments: RuleOption[];
    jobPositions: RuleOption[];
    documentTypes: RuleOption[];
  };
};

type RuleForm = {
  id: string;
  documentTypeId: string;
  unitId: string;
  departmentId: string;
  jobPositionId: string;
  admissionType: string;
  isRequired: string;
  dueDaysAfterAdmission: string;
  recurrenceMonths: string;
  priority: string;
  notes: string;
  status: "active" | "inactive" | "archived";
};

const emptyForm: RuleForm = {
  id: "",
  documentTypeId: "",
  unitId: "",
  departmentId: "",
  jobPositionId: "",
  admissionType: "",
  isRequired: "true",
  dueDaysAfterAdmission: "",
  recurrenceMonths: "",
  priority: "100",
  notes: "",
  status: "active"
};

const statusLabels: Record<DocumentRule["status"], string> = {
  active: "Ativa",
  inactive: "Inativa",
  archived: "Arquivada"
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message ?? "Não foi possível atualizar as regras documentais.");
  }

  return payload as T;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toPayload(form: RuleForm) {
  return {
    unitId: form.unitId,
    departmentId: form.departmentId,
    jobPositionId: form.jobPositionId,
    admissionType: form.admissionType,
    documentTypeId: form.documentTypeId,
    isRequired: form.isRequired === "true",
    dueDaysAfterAdmission: form.dueDaysAfterAdmission,
    recurrenceMonths: form.recurrenceMonths,
    priority: form.priority || "100",
    notes: form.notes,
    status: form.status
  };
}

function statusTone(status: DocumentRule["status"]) {
  return status === "active" ? ("success" as const) : ("visual" as const);
}

function requirementLabel(rule: DocumentRule) {
  return rule.isRequired ? "Obrigatório" : "Dispensado neste contexto";
}

function dueLabel(rule: DocumentRule) {
  if (rule.dueDaysAfterAdmission == null) return "Sem prazo automático";
  if (rule.dueDaysAfterAdmission === 0) return "No dia da admissão";
  return `${rule.dueDaysAfterAdmission} dia${rule.dueDaysAfterAdmission === 1 ? "" : "s"} após admissão`;
}

function recurrenceLabel(rule: DocumentRule) {
  if (!rule.recurrenceMonths) return "Sem recorrência definida";
  return `Renova a cada ${rule.recurrenceMonths} mês${rule.recurrenceMonths === 1 ? "" : "es"}`;
}

export function HrDocumentRulesClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState<RuleForm>(emptyForm);

  const rulesQuery = useQuery({
    queryKey: ["hr", "document-rules"],
    queryFn: async () => requestJson<RulesResponse>("/api/hr/document-rules")
  });

  const mutation = useMutation({
    mutationFn: async (input: RuleForm) => {
      const isEdit = Boolean(input.id);
      return requestJson(isEdit ? `/api/hr/document-rules/${input.id}` : "/api/hr/document-rules", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(toPayload(input))
      });
    },
    onSuccess: async () => {
      setShowForm(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "document-rules"] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "document-pendencies"] });
      await queryClient.invalidateQueries({ queryKey: ["hr", "operational-dashboard", "document-pendencies"] });
    }
  });

  const options = rulesQuery.data?.options ?? { units: [], departments: [], jobPositions: [], documentTypes: [] };
  const filteredDepartments = useMemo(
    () => options.departments.filter((department) => !form.unitId || !department.unitId || department.unitId === form.unitId),
    [form.unitId, options.departments]
  );
  const filteredJobPositions = useMemo(
    () =>
      options.jobPositions.filter(
        (position) =>
          (!form.unitId || !position.unitId || position.unitId === form.unitId) &&
          (!form.departmentId || !position.departmentId || position.departmentId === form.departmentId)
      ),
    [form.departmentId, form.unitId, options.jobPositions]
  );

  const filteredRules = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rulesQuery.data?.data ?? []).filter((rule) => {
      if (statusFilter && rule.status !== statusFilter) return false;
      if (!term) return true;
      return [rule.documentTypeName, rule.scopeLabel, rule.unitName, rule.departmentName, rule.jobPositionName, rule.notes]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rulesQuery.data?.data, search, statusFilter]);

  function startCreate() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(rule: DocumentRule) {
    setForm({
      id: rule.id,
      documentTypeId: rule.documentTypeId,
      unitId: rule.unitId ?? "",
      departmentId: rule.departmentId ?? "",
      jobPositionId: rule.jobPositionId ?? "",
      admissionType: rule.admissionType,
      isRequired: String(rule.isRequired),
      dueDaysAfterAdmission: rule.dueDaysAfterAdmission == null ? "" : String(rule.dueDaysAfterAdmission),
      recurrenceMonths: rule.recurrenceMonths == null ? "" : String(rule.recurrenceMonths),
      priority: String(rule.priority),
      notes: rule.notes,
      status: rule.status
    });
    setShowForm(true);
  }

  function patchStatus(rule: DocumentRule, status: DocumentRule["status"]) {
    mutation.mutate({
      ...emptyForm,
      id: rule.id,
      documentTypeId: rule.documentTypeId,
      unitId: rule.unitId ?? "",
      departmentId: rule.departmentId ?? "",
      jobPositionId: rule.jobPositionId ?? "",
      admissionType: rule.admissionType,
      isRequired: String(rule.isRequired),
      dueDaysAfterAdmission: rule.dueDaysAfterAdmission == null ? "" : String(rule.dueDaysAfterAdmission),
      recurrenceMonths: rule.recurrenceMonths == null ? "" : String(rule.recurrenceMonths),
      priority: String(rule.priority),
      notes: rule.notes,
      status
    });
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(form);
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileCog className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Obrigatoriedade por contexto</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Regras mais específicas vencem as gerais. Use para ajustar documentos por unidade, departamento, cargo ou tipo de admissão.
            </p>
          </div>
          <Button type="button" size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </div>
      </Card>

      {showForm ? (
        <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
          <form onSubmit={submitForm} className="space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-foreground">{form.id ? "Editar regra documental" : "Nova regra documental"}</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                }}
              >
                <X className="h-4 w-4" />
                Fechar
              </Button>
            </div>

            <div className="grid min-w-0 gap-3 lg:grid-cols-4">
              <Field label="Documento" className="lg:col-span-2">
                <SelectField value={form.documentTypeId} onChange={(event) => setForm((current) => ({ ...current, documentTypeId: event.target.value }))} required>
                  <option value="">Selecione o documento</option>
                  {options.documentTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Regra">
                <SelectField value={form.isRequired} onChange={(event) => setForm((current) => ({ ...current, isRequired: event.target.value }))}>
                  <option value="true">Obrigatório</option>
                  <option value="false">Dispensado neste contexto</option>
                </SelectField>
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RuleForm["status"] }))}>
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                  <option value="archived">Arquivada</option>
                </SelectField>
              </Field>
              <Field label="Unidade">
                <SelectField value={form.unitId} onChange={(event) => setForm((current) => ({ ...current, unitId: event.target.value, departmentId: "", jobPositionId: "" }))}>
                  <option value="">Todas</option>
                  {options.units.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Departamento">
                <SelectField value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, jobPositionId: "" }))}>
                  <option value="">Todos</option>
                  {filteredDepartments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Cargo">
                <SelectField value={form.jobPositionId} onChange={(event) => setForm((current) => ({ ...current, jobPositionId: event.target.value }))}>
                  <option value="">Todos</option>
                  {filteredJobPositions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Tipo de admissão">
                <Input
                  value={form.admissionType}
                  onChange={(event) => setForm((current) => ({ ...current, admissionType: event.target.value.toLowerCase() }))}
                  placeholder="ex.: efetiva"
                  maxLength={60}
                />
              </Field>
              <Field label="Prazo após admissão">
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  value={form.dueDaysAfterAdmission}
                  onChange={(event) => setForm((current) => ({ ...current, dueDaysAfterAdmission: event.target.value }))}
                  placeholder="Dias"
                />
              </Field>
              <Field label="Recorrência">
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={form.recurrenceMonths}
                  onChange={(event) => setForm((current) => ({ ...current, recurrenceMonths: event.target.value }))}
                  placeholder="Meses"
                />
              </Field>
              <Field label="Prioridade">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                />
              </Field>
              <Field label="Observação" className="lg:col-span-4">
                <TextArea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Explique quando esta regra deve ser usada, sem inserir dados pessoais."
                  maxLength={1000}
                />
              </Field>
            </div>

            {mutation.error ? <ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível salvar a regra."} /> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending || !form.documentTypeId}>
                <Save className="h-4 w-4" />
                Salvar regra
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Buscar regra">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Documento, unidade, departamento ou cargo" className="pl-9" />
            </div>
          </Field>
          <Field label="Status">
            <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="archived">Arquivadas</option>
            </SelectField>
          </Field>
        </div>
      </Card>

      {rulesQuery.isLoading ? <LoadingTable label="Carregando regras documentais..." /> : null}
      {rulesQuery.error ? <ErrorMessage message={rulesQuery.error instanceof Error ? rulesQuery.error.message : "Erro ao carregar regras documentais."} /> : null}

      {!rulesQuery.isLoading && !rulesQuery.error && !filteredRules.length ? (
        <EmptyState
          title="Nenhuma regra documental encontrada"
          description="Cadastre uma regra para transformar o catálogo documental em obrigatoriedade real por contexto operacional."
        />
      ) : null}

      {filteredRules.length ? (
        <Card className="min-w-0 overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Documento</th>
                  <th className="px-4 py-3 font-semibold">Contexto</th>
                  <th className="px-4 py-3 font-semibold">Regra</th>
                  <th className="px-4 py-3 font-semibold">Prazo</th>
                  <th className="px-4 py-3 font-semibold">Prioridade</th>
                  <th className="px-4 py-3 font-semibold">Atualização</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-muted/35">
                    <td className="px-4 py-3">
                      <p className="break-words font-medium text-foreground">{rule.documentTypeName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{rule.documentTypeCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="break-words text-foreground">{rule.scopeLabel}</p>
                      {rule.notes ? <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{rule.notes}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={rule.isRequired ? "warning" : "visual"} label={requirementLabel(rule)} />
                        <StatusBadge status={statusTone(rule.status)} label={statusLabels[rule.status]} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{dueLabel(rule)}</p>
                      <p className="mt-1 text-xs">{recurrenceLabel(rule)}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{rule.priority}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateTime(rule.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(rule)}>
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </Button>
                        {rule.status === "active" ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => patchStatus(rule, "inactive")} disabled={mutation.isPending}>
                            <PowerOff className="h-4 w-4" />
                            Inativar
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" onClick={() => patchStatus(rule, "active")} disabled={mutation.isPending}>
                            <RotateCcw className="h-4 w-4" />
                            Ativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
