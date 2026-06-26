"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, BriefcaseBusiness, Building2, CalendarClock, CheckCircle2, Filter, PlayCircle, Plus, Save, Search, Send, ShieldAlert, X, XCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextArea } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";

type RelatedMeta = { id: string; code: string; name: string; label: string } | null;

type MovementRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  movementType: MovementType;
  movementTypeLabel: string;
  status: MovementStatus;
  statusLabel: string;
  effectiveDate: string;
  oldUnit: RelatedMeta;
  newUnit: RelatedMeta;
  oldDepartment: RelatedMeta;
  newDepartment: RelatedMeta;
  oldJobPosition: RelatedMeta;
  newJobPosition: RelatedMeta;
  oldSalary: number | null;
  newSalary: number | null;
  reason: string;
  notes: string;
  isSensitive: boolean;
  approvals: MovementApproval[];
  redacted: boolean;
  updatedAt: string;
};

type MovementApproval = {
  id: string;
  action: string;
  actionLabel: string;
  comments: string;
  actorUserId: string;
  createdAt: string;
};

type MovementType = "promotion" | "transfer" | "job_position_change" | "department_change" | "unit_change" | "salary_change";
type MovementStatus = "draft" | "pending_approval" | "approved" | "rejected" | "implemented";
type MovementActionKey = "submit" | "approve" | "reject" | "implement";

type MovementsResponse = {
  ok: true;
  data: MovementRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type EmployeeOption = {
  id: string;
  fullName: string;
  preferredName: string;
  unitId: string | null;
  departmentId: string | null;
  jobPositionId: string | null;
  unit?: RelatedMeta;
  department?: RelatedMeta;
  jobPosition?: RelatedMeta;
};

type EmployeesResponse = { ok: true; data: EmployeeOption[] };
type UnitsResponse = { ok: true; units: Array<{ id: string; code: string; name: string }> };
type DepartmentsResponse = { ok: true; departments: Array<{ id: string; code: string; name: string; unitId: string }> };
type PositionsResponse = { ok: true; positions: Array<{ id: string; code: string; name: string; unitId: string; departmentId: string | null }> };

type MovementForm = {
  id: string;
  employeeId: string;
  movementType: MovementType;
  status: MovementStatus;
  effectiveDate: string;
  oldUnitId: string;
  newUnitId: string;
  oldDepartmentId: string;
  newDepartmentId: string;
  oldJobPositionId: string;
  newJobPositionId: string;
  oldSalary: string;
  newSalary: string;
  reason: string;
  notes: string;
};

const movementTypes: Array<{ value: MovementType; label: string }> = [
  { value: "promotion", label: "Promoção" },
  { value: "transfer", label: "Transferência" },
  { value: "unit_change", label: "Mudança de unidade" },
  { value: "department_change", label: "Mudança de departamento" },
  { value: "job_position_change", label: "Mudança de cargo" },
  { value: "salary_change", label: "Mudança salarial" }
];

const movementStatuses: Array<{ value: MovementStatus; label: string }> = [
  { value: "draft", label: "Rascunho" },
  { value: "pending_approval", label: "Aguardando aprovação" },
  { value: "approved", label: "Aprovada" },
  { value: "rejected", label: "Rejeitada" },
  { value: "implemented", label: "Efetivada" }
];

const emptyForm: MovementForm = {
  id: "",
  employeeId: "",
  movementType: "promotion",
  status: "draft",
  effectiveDate: "",
  oldUnitId: "",
  newUnitId: "",
  oldDepartmentId: "",
  newDepartmentId: "",
  oldJobPositionId: "",
  newJobPositionId: "",
  oldSalary: "",
  newSalary: "",
  reason: "",
  notes: ""
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message ?? "Não foi possível processar a movimentação funcional.");
  return payload as T;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", value.includes("T") ? undefined : { timeZone: "UTC" });
}

function moneyLabel(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function metaLabel(meta: RelatedMeta | undefined | null, fallback = "-") {
  if (!meta) return fallback;
  return [meta.code, meta.name].filter(Boolean).join(" - ") || fallback;
}

function statusTone(status: MovementStatus) {
  if (status === "implemented" || status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "pending_approval") return "warning" as const;
  return "visual" as const;
}

function movementStatusDescription(status: MovementStatus) {
  if (status === "draft") return "Ainda não enviado para aprovação.";
  if (status === "pending_approval") return "Aguardando análise da liderança/RH.";
  if (status === "approved") return "Aprovado e pronto para efetivação.";
  if (status === "rejected") return "Rejeitado. Revise o motivo antes de criar nova solicitação.";
  return "Movimentação aplicada na carreira e na vida funcional.";
}

function movementActionConfirmation(action: MovementActionKey) {
  if (action === "submit") return "Enviar esta movimentação para aprovação? Depois disso, ela não deve ser tratada como rascunho.";
  if (action === "approve") return "Aprovar esta movimentação? Ela ficará pronta para efetivação.";
  if (action === "reject") return "Rejeitar esta movimentação? O motivo informado ficará registrado no histórico.";
  return "Efetivar esta movimentação? Após a efetivação, ela será registrada na carreira e na vida funcional do colaborador.";
}

function buildMovementsUrl(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `/api/hr/movements${query ? `?${query}` : ""}`;
}

function toPayload(form: MovementForm) {
  return {
    employeeId: form.employeeId,
    movementType: form.movementType,
    status: form.status,
    effectiveDate: form.effectiveDate,
    oldUnitId: form.oldUnitId,
    newUnitId: form.newUnitId,
    oldDepartmentId: form.oldDepartmentId,
    newDepartmentId: form.newDepartmentId,
    oldJobPositionId: form.oldJobPositionId,
    newJobPositionId: form.newJobPositionId,
    oldSalary: form.oldSalary,
    newSalary: form.newSalary,
    reason: form.reason,
    notes: form.notes,
    isSensitive: form.movementType === "salary_change",
    visibilityScope: form.movementType === "salary_change" ? "restricted" : "unit"
  };
}

export function HrMovementsClient() {
  const queryClient = useQueryClient();
  // Unidade ativa (header) escopa a LISTA. Sem filtro manual de unidade na lista.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);
  const [filters, setFilters] = useState({ employeeId: "", departmentId: "", movementType: "", status: "", from: "", to: "", search: "" });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MovementForm>(emptyForm);
  const [commentsByAction, setCommentsByAction] = useState<Record<string, string>>({});

  const movementsQuery = useQuery({
    queryKey: ["hr", "movements", activeUnitId, filters],
    queryFn: async () => requestJson<MovementsResponse>(buildMovementsUrl(filters))
  });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees", "movement-options", activeUnitId], queryFn: async () => requestJson<EmployeesResponse>("/api/hr/employees?pageSize=100") });
  // base/units ja e aggregate. departments/job-positions de DESTINO usam opt-out ?scope=aggregate
  // (transferencia entre hoteis precisa enxergar unidades alem da ativa). Sao da rede inteira,
  // por isso NAO entram na queryKey por unidade ativa.
  const unitsQuery = useQuery({ queryKey: ["base", "units", "movement-options"], queryFn: async () => requestJson<UnitsResponse>("/api/base/units") });
  const departmentsQuery = useQuery({ queryKey: ["base", "departments", "movement-destination"], queryFn: async () => requestJson<DepartmentsResponse>("/api/base/departments?scope=aggregate") });
  const positionsQuery = useQuery({ queryKey: ["base", "positions", "movement-destination"], queryFn: async () => requestJson<PositionsResponse>("/api/base/job-positions?scope=aggregate") });

  const mutation = useMutation({
    mutationFn: async (input: MovementForm) =>
      requestJson(input.id ? `/api/hr/movements/${input.id}` : "/api/hr/movements", {
        method: input.id ? "PATCH" : "POST",
        body: JSON.stringify(toPayload(input))
      }),
    onSuccess: async () => {
      setShowForm(false);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["hr", "movements"] });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { id: string; action: MovementActionKey; comments?: string }) =>
      requestJson(`/api/hr/movements/${input.id}/${input.action}`, {
        method: "POST",
        body: JSON.stringify({ comments: input.comments ?? "" })
      }),
    onSuccess: async () => {
      setCommentsByAction({});
      await queryClient.invalidateQueries({ queryKey: ["hr", "movements"] });
    }
  });

  const selectedEmployee = useMemo(() => (employeesQuery.data?.data ?? []).find((employee) => employee.id === form.employeeId), [employeesQuery.data?.data, form.employeeId]);
  const departmentOptions = useMemo(() => departmentsQuery.data?.departments ?? [], [departmentsQuery.data?.departments]);
  // Filtro de departamento da LISTA: restrito a unidade ativa (a lista ja e escopada por ela).
  // (departmentOptions e a fonte agregada usada no destino do formulario.)
  const filteredDepartmentOptions = useMemo(
    () => departmentOptions.filter((department) => !activeUnitId || department.unitId === activeUnitId),
    [departmentOptions, activeUnitId]
  );
  const positionOptions = positionsQuery.data?.positions ?? [];
  const rows = useMemo(() => movementsQuery.data?.data ?? [], [movementsQuery.data?.data]);
  const summary = useMemo(() => {
    const byType = movementTypes.map((type) => ({
      ...type,
      total: rows.filter((row) => row.movementType === type.value).length
    }));

    return {
      total: movementsQuery.data?.pagination.total ?? rows.length,
      pendingApproval: rows.filter((row) => row.status === "pending_approval").length,
      approved: rows.filter((row) => row.status === "approved").length,
      implemented: rows.filter((row) => row.status === "implemented").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
      byType
    };
  }, [movementsQuery.data?.pagination.total, rows]);

  function updateForm<K extends keyof MovementForm>(key: K, value: MovementForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectEmployee(employeeId: string) {
    const employee = (employeesQuery.data?.data ?? []).find((item) => item.id === employeeId);
    setForm((current) => ({
      ...current,
      employeeId,
      oldUnitId: employee?.unitId ?? "",
      oldDepartmentId: employee?.departmentId ?? "",
      oldJobPositionId: employee?.jobPositionId ?? ""
    }));
  }

  function startEdit(row: MovementRow) {
    setForm({
      id: row.id,
      employeeId: row.employeeId,
      movementType: row.movementType,
      status: row.status,
      effectiveDate: row.effectiveDate,
      oldUnitId: row.oldUnit?.id ?? "",
      newUnitId: row.newUnit?.id ?? "",
      oldDepartmentId: row.oldDepartment?.id ?? "",
      newDepartmentId: row.newDepartment?.id ?? "",
      oldJobPositionId: row.oldJobPosition?.id ?? "",
      newJobPositionId: row.newJobPosition?.id ?? "",
      oldSalary: row.oldSalary == null ? "" : String(row.oldSalary),
      newSalary: row.newSalary == null ? "" : String(row.newSalary),
      reason: row.reason,
      notes: row.notes
    });
    setShowForm(true);
  }

  const showUnitFields = form.movementType === "transfer" || form.movementType === "unit_change";
  const showDepartmentFields = form.movementType === "department_change";
  const showJobFields = form.movementType === "promotion" || form.movementType === "job_position_change";
  const showSalaryFields = form.movementType === "salary_change";

  function actionCommentKey(row: MovementRow) {
    return `${row.id}:comment`;
  }

  function runAction(row: MovementRow, action: MovementActionKey) {
    if (!window.confirm(movementActionConfirmation(action))) return;
    const key = actionCommentKey(row);
    actionMutation.mutate({ id: row.id, action, comments: commentsByAction[key] });
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Carreira administrativa</h2>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Registre movimentações funcionais com aprovação simples e rastreabilidade na Vida Funcional, sem impacto automático em folha ou ponto.
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => { setForm(emptyForm); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            Nova movimentação
          </Button>
        </div>
      </Card>

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MovementStatCard title="Total de movimentações" value={summary.total} icon={BarChart3} tone="info" hasError={Boolean(movementsQuery.error)} />
        <MovementStatCard title="Aguardando aprovação" value={summary.pendingApproval} icon={ShieldAlert} tone={summary.pendingApproval ? "warning" : "visual"} hasError={Boolean(movementsQuery.error)} />
        <MovementStatCard title="Aprovadas" value={summary.approved} icon={CheckCircle2} tone={summary.approved ? "success" : "visual"} hasError={Boolean(movementsQuery.error)} />
        <MovementStatCard title="Efetivadas" value={summary.implemented} icon={PlayCircle} tone={summary.implemented ? "success" : "visual"} hasError={Boolean(movementsQuery.error)} />
        <MovementStatCard title="Rejeitadas" value={summary.rejected} icon={XCircle} tone={summary.rejected ? "danger" : "visual"} hasError={Boolean(movementsQuery.error)} />
      </div>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Movimentações por tipo</h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.byType.map((type) => (
            <StatusBadge key={type.value} status={type.total ? "info" : "visual"} label={`${type.label}: ${type.total}`} />
          ))}
        </div>
      </Card>

      <Card className="border-border/80 p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Filtros</h2>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SelectField value={filters.departmentId} onChange={(event) => setFilters((current) => ({ ...current, departmentId: event.target.value }))}>
            <option value="">Todos os departamentos</option>
            {filteredDepartmentOptions.map((department) => (
              <option key={department.id} value={department.id}>{[department.code, department.name].filter(Boolean).join(" - ")}</option>
            ))}
          </SelectField>
          <SelectField value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}>
            <option value="">Todos os colaboradores</option>
            {(employeesQuery.data?.data ?? []).map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>
            ))}
          </SelectField>
          <SelectField value={filters.movementType} onChange={(event) => setFilters((current) => ({ ...current, movementType: event.target.value }))}>
            <option value="">Todos os tipos</option>
            {movementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </SelectField>
          <SelectField value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">Todos os status</option>
            {movementStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </SelectField>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          <Input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar motivo" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
          </div>
        </div>
      </Card>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
          <Card className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto border-border/80 p-4 shadow-xl shadow-primary/10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold">{form.id ? "Editar movimentação" : "Nova movimentação funcional"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Movimentações nascem como rascunho. Depois devem ser enviadas para aprovação e só então efetivadas.</p>
              <p className="mt-1 text-xs text-muted-foreground">Campos sensíveis, como salário, ficam restritos por permissão.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={closeForm}>
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Colaborador">
              <SelectField value={form.employeeId} onChange={(event) => selectEmployee(event.target.value)}>
                <option value="">Selecione</option>
                {(employeesQuery.data?.data ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.preferredName || employee.fullName}</option>
                ))}
              </SelectField>
            </Field>
            <Field label="Tipo">
              <SelectField value={form.movementType} onChange={(event) => updateForm("movementType", event.target.value as MovementType)}>
                {movementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </SelectField>
            </Field>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Status automático</span>
                <StatusBadge status={statusTone(form.status)} label={movementStatuses.find((status) => status.value === form.status)?.label ?? form.status} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{movementStatusDescription(form.status)}</p>
            </div>
            <Field label="Data efetiva">
              <Input type="date" value={form.effectiveDate} onChange={(event) => updateForm("effectiveDate", event.target.value)} />
            </Field>
            <Field label="Motivo">
              <Input value={form.reason} onChange={(event) => updateForm("reason", event.target.value)} placeholder="Motivo operacional" />
            </Field>
            <Field label="Observação">
              <TextArea value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Observação administrativa opcional" />
            </Field>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {showUnitFields ? (
              <>
                <Field label="Unidade anterior"><SelectField value={form.oldUnitId} onChange={(event) => updateForm("oldUnitId", event.target.value)}><option value="">Selecione</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
                <Field label="Unidade nova"><SelectField value={form.newUnitId} onChange={(event) => updateForm("newUnitId", event.target.value)}><option value="">Selecione</option>{(unitsQuery.data?.units ?? []).map((unit) => <option key={unit.id} value={unit.id}>{[unit.code, unit.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
              </>
            ) : null}
            {showDepartmentFields ? (
              <>
                <Field label="Departamento anterior"><SelectField value={form.oldDepartmentId} onChange={(event) => updateForm("oldDepartmentId", event.target.value)}><option value="">Selecione</option>{departmentOptions.map((department) => <option key={department.id} value={department.id}>{[department.code, department.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
                <Field label="Departamento novo"><SelectField value={form.newDepartmentId} onChange={(event) => updateForm("newDepartmentId", event.target.value)}><option value="">Selecione</option>{departmentOptions.map((department) => <option key={department.id} value={department.id}>{[department.code, department.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
              </>
            ) : null}
            {showJobFields ? (
              <>
                <Field label="Cargo anterior"><SelectField value={form.oldJobPositionId} onChange={(event) => updateForm("oldJobPositionId", event.target.value)}><option value="">Selecione</option>{positionOptions.map((position) => <option key={position.id} value={position.id}>{[position.code, position.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
                <Field label="Cargo novo"><SelectField value={form.newJobPositionId} onChange={(event) => updateForm("newJobPositionId", event.target.value)}><option value="">Selecione</option>{positionOptions.map((position) => <option key={position.id} value={position.id}>{[position.code, position.name].filter(Boolean).join(" - ")}</option>)}</SelectField></Field>
              </>
            ) : null}
            {showSalaryFields ? (
              <>
                <Field label="Salário anterior"><Input type="number" min="0" step="0.01" value={form.oldSalary} onChange={(event) => updateForm("oldSalary", event.target.value)} /></Field>
                <Field label="Salário novo"><Input type="number" min="0" step="0.01" value={form.newSalary} onChange={(event) => updateForm("newSalary", event.target.value)} /></Field>
              </>
            ) : null}
          </div>

          {selectedEmployee ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status="info" label={`Unidade atual: ${metaLabel(selectedEmployee.unit)}`} />
              <StatusBadge status="visual" label={`Departamento atual: ${metaLabel(selectedEmployee.department)}`} />
              <StatusBadge status="visual" label={`Cargo atual: ${metaLabel(selectedEmployee.jobPosition)}`} />
            </div>
          ) : null}

          {mutation.error ? <div className="mt-3"><ErrorMessage message={mutation.error instanceof Error ? mutation.error.message : "Não foi possível salvar."} /></div> : null}
          {actionMutation.error ? <div className="mt-3"><ErrorMessage message={actionMutation.error instanceof Error ? actionMutation.error.message : "Não foi possível executar a ação."} /></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
              <Save className="h-4 w-4" />
              Salvar rascunho
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={closeForm}>Cancelar</Button>
          </div>
        </Card>
        </div>
      ) : null}

      {movementsQuery.isLoading ? <LoadingTable label="Carregando movimentações funcionais..." /> : null}
      {movementsQuery.error ? <ErrorMessage message={movementsQuery.error instanceof Error ? movementsQuery.error.message : "Erro ao carregar movimentações."} /> : null}
      {!movementsQuery.isLoading && !movementsQuery.error && !rows.length ? (
        <EmptyState title="Nenhuma movimentação funcional registrada" description="Promoções, transferências e mudanças administrativas do colaborador aparecerão aqui." />
      ) : null}

      {rows.length ? (
        <Card className="overflow-hidden border-border/80 shadow-sm shadow-primary/5">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data efetiva</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Departamento</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.employeeName || "-"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.reason || (row.redacted ? "Motivo restrito" : "-")}</div>
                      <MovementTimeline approvals={row.approvals} />
                    </td>
                    <td className="px-4 py-3"><StatusBadge status="info" label={row.movementTypeLabel} />{row.isSensitive ? <div className="mt-1"><StatusBadge status="warning" label="Restrito" /></div> : null}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusBadge status={statusTone(row.status)} label={row.statusLabel} />
                        <p className="max-w-[220px] text-xs leading-5 text-muted-foreground">{movementStatusDescription(row.status)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" />{formatDate(row.effectiveDate)}</div></td>
                    <td className="px-4 py-3">{row.newUnit?.label || row.oldUnit?.label || "-"}</td>
                    <td className="px-4 py-3">{row.newDepartment?.label || row.oldDepartment?.label || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEdit(row)} disabled={row.status !== "draft"}>Editar rascunho</Button>
                          <Button asChild variant="outline" size="sm"><Link href={`/rh/employees/${row.employeeId}?tab=career`}>Carreira<ArrowRight className="h-4 w-4" /></Link></Button>
                        </div>
                        <MovementActions row={row} commentsByAction={commentsByAction} setCommentsByAction={setCommentsByAction} onAction={runAction} pending={actionMutation.isPending} />
                      </div>
                      {row.movementType === "salary_change" ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {row.redacted ? "Informação restrita" : `${moneyLabel(row.oldSalary)} para ${moneyLabel(row.newSalary)}`}
                        </p>
                      ) : null}
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

function MovementTimeline({ approvals }: { approvals: MovementApproval[] }) {
  if (!approvals.length) return null;

  return (
    <div className="mt-3 space-y-1 border-l pl-3">
      {approvals.map((approval) => (
        <div key={approval.id} className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{approval.actionLabel}</span>
          <span> em {formatDate(approval.createdAt)}</span>
          {approval.comments ? <span> - {approval.comments}</span> : null}
        </div>
      ))}
    </div>
  );
}

function MovementStatCard({
  title,
  value,
  icon: Icon,
  tone,
  hasError = false
}: {
  title: string;
  value: number;
  icon: typeof BarChart3;
  tone: "visual" | "info" | "warning" | "success" | "danger";
  hasError?: boolean;
}) {
  return (
    <Card className="min-w-0 border-border/80 p-3 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2">
        <StatusBadge status={hasError ? "danger" : tone} label={hasError ? "Erro ao carregar" : value ? "Acompanhar" : "Sem pendência"} />
      </div>
    </Card>
  );
}

function MovementActions({
  row,
  commentsByAction,
  setCommentsByAction,
  onAction,
  pending
}: {
  row: MovementRow;
  commentsByAction: Record<string, string>;
  setCommentsByAction: Dispatch<SetStateAction<Record<string, string>>>;
  onAction: (row: MovementRow, action: MovementActionKey) => void;
  pending: boolean;
}) {
  const allActions: Array<{ key: MovementActionKey; label: string; icon: typeof Send; visible: boolean; variant?: "default" | "outline" }> = [
    { key: "submit", label: "Enviar para aprovação", icon: Send, visible: row.status === "draft", variant: "default" },
    { key: "approve", label: "Aprovar movimentação", icon: CheckCircle2, visible: row.status === "pending_approval", variant: "default" },
    { key: "reject", label: "Rejeitar movimentação", icon: XCircle, visible: row.status === "pending_approval", variant: "outline" },
    { key: "implement", label: "Efetivar movimentação", icon: PlayCircle, visible: row.status === "approved", variant: "default" }
  ];
  const actions = allActions.filter((action) => action.visible);

  if (!actions.length) return null;
  const commentKey = `${row.id}:comment`;
  const comment = commentsByAction[commentKey] ?? "";

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      {actions.some((action) => action.key === "reject" || action.key === "submit" || action.key === "approve" || action.key === "implement") ? (
        <Input
          value={comment}
          onChange={(event) =>
            setCommentsByAction((current) => ({
              ...current,
              [commentKey]: event.target.value
            }))
          }
          placeholder={actions[0].key === "reject" ? "Motivo da rejeição" : "Comentário opcional"}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              type="button"
              variant={action.variant ?? "outline"}
              size="sm"
              onClick={() => onAction(row, action.key)}
              disabled={pending || (action.key === "reject" && !comment.trim())}
            >
              <Icon className="h-4 w-4" />
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
