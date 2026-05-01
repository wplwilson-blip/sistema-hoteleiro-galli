"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

type UnitRecord = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  status: RecordStatus;
};

type UnitForm = Omit<UnitRecord, "id">;

const emptyForm: UnitForm = {
  code: "",
  name: "",
  city: "",
  state: "",
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

export function UnitsClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UnitRecord | null>(null);
  const [form, setForm] = useState<UnitForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");

  const unitsQuery = useQuery({
    queryKey: ["base", "units"],
    queryFn: async () => requestJson<{ ok: true; units: UnitRecord[] }>("/api/base/units")
  });

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: UnitForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/units/${targetId}` : "/api/base/units";
      const method = targetId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "units"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar a unidade.")
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function openEdit(unit: UnitRecord) {
    setEditing(unit);
    setForm({
      code: unit.code,
      name: unit.name,
      city: unit.city,
      state: unit.state,
      status: unit.status
    });
    setError("");
    setFormOpen(true);
  }

  function inactivate(unit: UnitRecord) {
    saveMutation.mutate({
      id: unit.id,
      payload: {
        code: unit.code,
        name: unit.name,
        city: unit.city,
        state: unit.state,
        status: "inactive"
      }
    });
  }

  const units = unitsQuery.data?.units ?? [];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <NewRecordButton label="Nova unidade" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar unidade" : "Nova unidade"} onCancel={() => setFormOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(undefined);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Codigo da unidade">
                <TextInput value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} />
              </Field>
              <Field label="Nome da unidade">
                <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Cidade">
                <TextInput value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
              </Field>
              <Field label="Estado">
                <TextInput value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RecordStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </SelectField>
              </Field>
            </div>
            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} />
          </form>
        </FormCard>
      ) : null}

      {unitsQuery.isLoading ? <LoadingTable /> : null}
      {unitsQuery.error ? <ErrorMessage message={unitsQuery.error instanceof Error ? unitsQuery.error.message : "Erro ao carregar unidades."} /> : null}
      {!unitsQuery.isLoading && !units.length ? (
        <EmptyState title="Nenhuma unidade cadastrada" description="Cadastre a primeira unidade operacional da rede." />
      ) : null}
      {units.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Codigo</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Cidade/Estado</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {units.map((unit) => (
                <tr key={unit.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3 font-medium">{unit.code}</td>
                  <td className="px-4 py-3">{unit.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{[unit.city, unit.state].filter(Boolean).join(" / ")}</td>
                  <td className="px-4 py-3">
                    <RecordStatusBadge status={unit.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions onEdit={() => openEdit(unit)} onInactivate={() => inactivate(unit)} disableInactivate={unit.status !== "active"} />
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
