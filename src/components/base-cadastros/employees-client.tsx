"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { EmptyState } from "@/components/common/empty-state";
import {
  ErrorMessage,
  Field,
  FormActions,
  FormCard,
  LoadingTable,
  NewRecordButton,
  RecordStatus,
  RecordStatusBadge,
  RowActions,
  SelectField,
  TextInput
} from "@/components/base-cadastros/crud-components";

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

type EmployeeRecord = {
  id: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  departmentId?: string;
  departmentName: string;
  departmentCode: string;
  jobPositionId?: string;
  jobPositionName: string;
  jobPositionCode: string;
  fullName: string;
  preferredName: string;
  documentNumber: string;
  corporateEmail: string;
  personalEmail: string;
  phone: string;
  hireDate: string;
  terminationDate: string;
  status: RecordStatus;
};

type EmployeeForm = {
  unitId: string;
  departmentId: string;
  jobPositionId: string;
  fullName: string;
  preferredName: string;
  documentNumber: string;
  corporateEmail: string;
  personalEmail: string;
  phone: string;
  hireDate: string;
  terminationDate: string;
  status: RecordStatus;
};

const emptyForm: EmployeeForm = {
  unitId: "",
  departmentId: "",
  jobPositionId: "",
  fullName: "",
  preferredName: "",
  documentNumber: "",
  corporateEmail: "",
  personalEmail: "",
  phone: "",
  hireDate: "",
  terminationDate: "",
  status: "active"
};

// Mascaras progressivas (sem lib): formatam a partir dos digitos enquanto o usuario digita.
function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) {
    return digits.replace(/^(\d{0,2})/, "($1");
  }

  if (digits.length <= 6) {
    return digits.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  }

  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  }

  return digits.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

export function EmployeesClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Unidade ativa na queryKey: lista e opcoes (departments/positions agora escopados por
  // unidade no servidor) refazem fetch ao trocar a unidade no header.
  const activeUnitId = useAppStore((state) => state.activeUnit.id);

  const unitsQuery = useQuery({
    queryKey: ["base", "units"],
    queryFn: async () => requestJson<{ ok: true; units: UnitOption[] }>("/api/base/units")
  });
  const departmentsQuery = useQuery({
    queryKey: ["base", "departments", activeUnitId],
    queryFn: async () => requestJson<{ ok: true; departments: DepartmentOption[] }>("/api/base/departments")
  });
  const positionsQuery = useQuery({
    queryKey: ["base", "job-positions", activeUnitId],
    queryFn: async () => requestJson<{ ok: true; positions: JobPositionOption[] }>("/api/base/job-positions")
  });
  const employeesQuery = useQuery({
    queryKey: ["base", "employees", activeUnitId],
    queryFn: async () => requestJson<{ ok: true; employees: EmployeeRecord[] }>("/api/base/employees")
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
    [positionsQuery.data?.positions, form.unitId, form.departmentId]
  );

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: EmployeeForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/employees/${targetId}` : "/api/base/employees";
      const method = targetId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "employees"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar o colaborador.")
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, unitId: activeUnits[0]?.id ?? "" });
    setError("");
    setFormOpen(true);
  }

  function openEdit(employee: EmployeeRecord) {
    setEditing(employee);
    setForm({
      unitId: employee.unitId,
      departmentId: employee.departmentId ?? "",
      jobPositionId: employee.jobPositionId ?? "",
      fullName: employee.fullName,
      preferredName: employee.preferredName,
      documentNumber: employee.documentNumber,
      corporateEmail: employee.corporateEmail,
      personalEmail: employee.personalEmail,
      phone: employee.phone,
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
      status: employee.status
    });
    setError("");
    setFormOpen(true);
  }

  function toggleStatus(employee: EmployeeRecord) {
    const nextStatus: RecordStatus = employee.status === "active" ? "inactive" : "active";

    saveMutation.mutate({
      id: employee.id,
      payload: {
        unitId: employee.unitId,
        departmentId: employee.departmentId ?? "",
        jobPositionId: employee.jobPositionId ?? "",
        fullName: employee.fullName,
        preferredName: employee.preferredName,
        documentNumber: employee.documentNumber,
        corporateEmail: employee.corporateEmail,
        personalEmail: employee.personalEmail,
        phone: employee.phone,
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
        status: nextStatus
      }
    });
  }

  const employees = useMemo(() => employeesQuery.data?.employees ?? [], [employeesQuery.data?.employees]);
  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return employees;
    }

    return employees.filter((employee) =>
      [
        employee.fullName,
        employee.preferredName,
        employee.documentNumber,
        employee.departmentName,
        employee.departmentCode,
        employee.jobPositionName,
        employee.unitName
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [employees, search]);
  const isLoading = unitsQuery.isLoading || departmentsQuery.isLoading || positionsQuery.isLoading || employeesQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TextInput
          className="sm:max-w-md"
          placeholder="Buscar por nome, CPF, departamento ou cargo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <NewRecordButton label="Novo colaborador" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar colaborador" : "Novo colaborador"} onCancel={() => setFormOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(undefined);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Unidade">
                <SelectField
                  value={form.unitId}
                  onChange={(event) => setForm({ ...form, unitId: event.target.value, departmentId: "", jobPositionId: "" })}
                >
                  <option value="">Selecione</option>
                  {activeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Departamento">
                <SelectField
                  value={form.departmentId}
                  onChange={(event) => setForm({ ...form, departmentId: event.target.value, jobPositionId: "" })}
                >
                  <option value="">Sem departamento</option>
                  {availableDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Cargo">
                <SelectField value={form.jobPositionId} onChange={(event) => setForm({ ...form, jobPositionId: event.target.value })}>
                  <option value="">Sem cargo</option>
                  {availablePositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.code} - {position.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RecordStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </SelectField>
              </Field>
              <Field label="Nome completo">
                <TextInput required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
              </Field>
              <Field label="Nome preferencial">
                <TextInput value={form.preferredName} onChange={(event) => setForm({ ...form, preferredName: event.target.value })} />
              </Field>
              <Field label="CPF/documento">
                <TextInput
                  value={form.documentNumber}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  onChange={(event) => setForm({ ...form, documentNumber: formatCpf(event.target.value) })}
                />
              </Field>
              <Field label="Telefone">
                <TextInput
                  value={form.phone}
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })}
                />
              </Field>
              <Field label="E-mail corporativo">
                <TextInput
                  type="email"
                  value={form.corporateEmail}
                  onChange={(event) => setForm({ ...form, corporateEmail: event.target.value })}
                />
              </Field>
              <Field label="E-mail pessoal">
                <TextInput
                  type="email"
                  value={form.personalEmail}
                  onChange={(event) => setForm({ ...form, personalEmail: event.target.value })}
                />
              </Field>
              <Field label="Data de admissao">
                <TextInput type="date" value={form.hireDate} onChange={(event) => setForm({ ...form, hireDate: event.target.value })} />
              </Field>
              <Field label="Data de desligamento">
                <TextInput
                  type="date"
                  value={form.terminationDate}
                  onChange={(event) => setForm({ ...form, terminationDate: event.target.value })}
                />
              </Field>
            </div>
            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} />
          </form>
        </FormCard>
      ) : null}

      {isLoading ? <LoadingTable /> : null}
      {employeesQuery.error ? (
        <ErrorMessage message={employeesQuery.error instanceof Error ? employeesQuery.error.message : "Erro ao carregar colaboradores."} />
      ) : null}
      {!isLoading && !filteredEmployees.length ? (
        <EmptyState title="Nenhum colaborador encontrado" description="Cadastre colaboradores vinculados a unidade, departamento e cargo." />
      ) : null}
      {filteredEmployees.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Colaborador</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Departamento</th>
                <th className="px-4 py-3 font-semibold">Cargo</th>
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3">
                    <p className="font-medium">{employee.fullName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{employee.documentNumber || "Sem documento"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.unitCode || employee.unitName || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.departmentCode || employee.departmentName || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.jobPositionName || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.corporateEmail || employee.phone || "-"}</td>
                  <td className="px-4 py-3">
                    <RecordStatusBadge status={employee.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      onEdit={() => openEdit(employee)}
                      onInactivate={() => toggleStatus(employee)}
                      disableInactivate={saveMutation.isPending}
                      inactivateLabel={employee.status === "active" ? "Inativar" : "Ativar"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
