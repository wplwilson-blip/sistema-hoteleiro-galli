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

type DepartmentRecord = {
  id: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  code: string;
  name: string;
  description: string;
  status: RecordStatus;
};

type DepartmentForm = {
  unitId: string;
  code: string;
  name: string;
  description: string;
  status: RecordStatus;
};

const emptyForm: DepartmentForm = {
  unitId: "",
  code: "",
  name: "",
  description: "",
  status: "active"
};

const departmentCodeSuggestions = [
  { code: "ADM", name: "Administrativo Geral" },
  { code: "RH", name: "Recursos Humanos" },
  { code: "COM", name: "Compras" },
  { code: "CAP", name: "Contas a Pagar" },
  { code: "MAN", name: "Manutencao" },
  { code: "GOV", name: "Governanca" },
  { code: "REC", name: "Recepcao" },
  { code: "AB", name: "A&B" },
  { code: "DIR", name: "Diretoria" },
  { code: "TI", name: "Tecnologia / Sistema" }
];

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

export function DepartmentsClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DepartmentRecord | null>(null);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["base", "units"],
    queryFn: async () => requestJson<{ ok: true; units: UnitOption[] }>("/api/base/units")
  });
  const departmentsQuery = useQuery({
    queryKey: ["base", "departments"],
    queryFn: async () => requestJson<{ ok: true; departments: DepartmentRecord[] }>("/api/base/departments")
  });

  const activeUnits = useMemo(() => (unitsQuery.data?.units ?? []).filter((unit) => unit.status === "active"), [unitsQuery.data?.units]);

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: DepartmentForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/departments/${targetId}` : "/api/base/departments";
      const method = targetId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "departments"] });
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar o departamento.")
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, unitId: activeUnits[0]?.id ?? "" });
    setError("");
    setFormOpen(true);
  }

  function openEdit(department: DepartmentRecord) {
    setEditing(department);
    setForm({
      unitId: department.unitId,
      code: department.code,
      name: department.name,
      description: department.description,
      status: department.status
    });
    setError("");
    setFormOpen(true);
  }

  function inactivate(department: DepartmentRecord) {
    saveMutation.mutate({
      id: department.id,
      payload: {
        unitId: department.unitId,
        code: department.code,
        name: department.name,
        description: department.description,
        status: "inactive"
      }
    });
  }

  function normalizeDepartmentCode(value: string) {
    return value.trim().toUpperCase();
  }

  const departments = departmentsQuery.data?.departments ?? [];
  const isLoading = unitsQuery.isLoading || departmentsQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <NewRecordButton label="Novo departamento" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar departamento" : "Novo departamento"} onCancel={() => setFormOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(undefined);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Unidade">
                <SelectField value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}>
                  <option value="">Selecione</option>
                  {activeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Codigo">
                <TextInput
                  value={form.code}
                  required
                  placeholder="REC"
                  onBlur={(event) => setForm({ ...form, code: normalizeDepartmentCode(event.target.value) })}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                />
                <p className="text-xs text-muted-foreground">Use um codigo administrativo padrao, em maiusculo e sem espacos.</p>
              </Field>
              <Field label="Nome">
                <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RecordStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </SelectField>
              </Field>
              <Field label="Descricao" className="md:col-span-2">
                <TextArea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Sugestoes de codigos</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {departmentCodeSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.code}
                    type="button"
                    className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-card"
                    onClick={() => setForm({ ...form, code: suggestion.code, name: form.name || suggestion.name })}
                  >
                    <span className="font-semibold text-primary">{suggestion.code}</span>
                    <span className="truncate text-muted-foreground">{suggestion.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} />
          </form>
        </FormCard>
      ) : null}

      {isLoading ? <LoadingTable /> : null}
      {unitsQuery.error ? <ErrorMessage message={unitsQuery.error instanceof Error ? unitsQuery.error.message : "Erro ao carregar unidades."} /> : null}
      {departmentsQuery.error ? (
        <ErrorMessage message={departmentsQuery.error instanceof Error ? departmentsQuery.error.message : "Erro ao carregar departamentos."} />
      ) : null}
      {!isLoading && !departments.length ? (
        <EmptyState title="Nenhum departamento cadastrado" description="Cadastre departamentos por unidade, como REC, GOV, MNT, FIN e ADM." />
      ) : null}
      {departments.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Codigo</th>
                <th className="px-4 py-3 font-semibold">Departamento</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {departments.map((department) => (
                <tr key={department.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3 text-muted-foreground">{department.unitCode || department.unitName}</td>
                  <td className="px-4 py-3 font-medium">{department.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{department.name}</p>
                    {department.description ? <p className="mt-1 text-xs text-muted-foreground">{department.description}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <RecordStatusBadge status={department.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      onEdit={() => openEdit(department)}
                      onInactivate={() => inactivate(department)}
                      disableInactivate={department.status !== "active"}
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
