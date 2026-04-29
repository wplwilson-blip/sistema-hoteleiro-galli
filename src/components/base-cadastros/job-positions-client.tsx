"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  TextArea,
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

type JobPositionRecord = {
  id: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  departmentId?: string;
  departmentName: string;
  departmentCode: string;
  code: string;
  name: string;
  description: string;
  isLeadership: boolean;
  status: RecordStatus;
};

type JobPositionForm = {
  unitId: string;
  departmentId: string;
  code: string;
  name: string;
  description: string;
  isLeadership: boolean;
  status: RecordStatus;
};

const emptyForm: JobPositionForm = {
  unitId: "",
  departmentId: "",
  code: "",
  name: "",
  description: "",
  isLeadership: false,
  status: "active"
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Nao foi possivel concluir a operacao.");
  }

  return payload;
}

export function JobPositionsClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<JobPositionRecord | null>(null);
  const [form, setForm] = useState<JobPositionForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
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
    queryFn: async () => requestJson<{ ok: true; positions: JobPositionRecord[] }>("/api/base/job-positions")
  });

  const activeUnits = useMemo(() => (unitsQuery.data?.units ?? []).filter((unit) => unit.status === "active"), [unitsQuery.data?.units]);
  const availableDepartments = useMemo(
    () =>
      (departmentsQuery.data?.departments ?? []).filter(
        (department) => department.status === "active" && (!form.unitId || department.unitId === form.unitId)
      ),
    [departmentsQuery.data?.departments, form.unitId]
  );

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: JobPositionForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/job-positions/${targetId}` : "/api/base/job-positions";
      const method = targetId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "job-positions"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar o cargo.")
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, unitId: activeUnits[0]?.id ?? "" });
    setError("");
    setFormOpen(true);
  }

  function openEdit(position: JobPositionRecord) {
    setEditing(position);
    setForm({
      unitId: position.unitId,
      departmentId: position.departmentId ?? "",
      code: position.code,
      name: position.name,
      description: position.description,
      isLeadership: position.isLeadership,
      status: position.status
    });
    setError("");
    setFormOpen(true);
  }

  function inactivate(position: JobPositionRecord) {
    saveMutation.mutate({
      id: position.id,
      payload: {
        unitId: position.unitId,
        departmentId: position.departmentId ?? "",
        code: position.code,
        name: position.name,
        description: position.description,
        isLeadership: position.isLeadership,
        status: "inactive"
      }
    });
  }

  const positions = positionsQuery.data?.positions ?? [];
  const isLoading = unitsQuery.isLoading || departmentsQuery.isLoading || positionsQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <NewRecordButton label="Novo cargo" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar cargo" : "Novo cargo"} onCancel={() => setFormOpen(false)}>
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
                  onChange={(event) => setForm({ ...form, unitId: event.target.value, departmentId: "" })}
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
                <SelectField value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
                  <option value="">Sem departamento</option>
                  {availableDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} - {department.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Codigo">
                <TextInput value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Nome do cargo">
                <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RecordStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </SelectField>
              </Field>
              <Field label="Nivel">
                <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isLeadership}
                    onChange={(event) => setForm({ ...form, isLeadership: event.target.checked })}
                  />
                  Lideranca
                </label>
              </Field>
              <Field label="Descricao" className="md:col-span-2">
                <TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </div>
            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} />
          </form>
        </FormCard>
      ) : null}

      {isLoading ? <LoadingTable /> : null}
      {positionsQuery.error ? (
        <ErrorMessage message={positionsQuery.error instanceof Error ? positionsQuery.error.message : "Erro ao carregar cargos."} />
      ) : null}
      {!isLoading && !positions.length ? (
        <EmptyState title="Nenhum cargo cadastrado" description="Cadastre os cargos por unidade e departamento conforme a estrutura operacional." />
      ) : null}
      {positions.length ? (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Departamento</th>
                <th className="px-4 py-3 font-semibold">Codigo</th>
                <th className="px-4 py-3 font-semibold">Cargo</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {positions.map((position) => (
                <tr key={position.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3 text-muted-foreground">{position.unitCode || position.unitName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{position.departmentCode || position.departmentName || "-"}</td>
                  <td className="px-4 py-3 font-medium">{position.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{position.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{position.isLeadership ? "Lideranca" : "Operacional"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RecordStatusBadge status={position.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      onEdit={() => openEdit(position)}
                      onInactivate={() => inactivate(position)}
                      disableInactivate={position.status !== "active"}
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
