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

type UnitRecord = {
  id: string;
  code: string;
  name: string;
  status: RecordStatus;
};

type SupplierRecord = {
  id: string;
  organizationId: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  name: string;
  tradeName: string;
  documentType: "CNPJ" | "CPF" | "OTHER";
  documentNumber: string;
  email: string;
  phone: string;
  whatsapp: string;
  contactName: string;
  addressJson: unknown;
  bankDataJson: unknown;
  category: string;
  notes: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

type SupplierForm = {
  unitId: string;
  name: string;
  tradeName: string;
  documentType: "CNPJ" | "CPF" | "OTHER";
  documentNumber: string;
  email: string;
  phone: string;
  whatsapp: string;
  contactName: string;
  category: string;
  notes: string;
  status: RecordStatus;
};

type SupplierListResponse = {
  ok: true;
  suppliers: SupplierRecord[];
};

type UnitListResponse = {
  ok: true;
  units: UnitRecord[];
};

const emptyForm: SupplierForm = {
  unitId: "",
  name: "",
  tradeName: "",
  documentType: "OTHER",
  documentNumber: "",
  email: "",
  phone: "",
  whatsapp: "",
  contactName: "",
  category: "",
  notes: "",
  status: "active"
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

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

function supplierToForm(supplier: SupplierRecord): SupplierForm {
  return {
    unitId: supplier.unitId,
    name: supplier.name,
    tradeName: supplier.tradeName,
    documentType: supplier.documentType,
    documentNumber: supplier.documentNumber,
    email: supplier.email,
    phone: supplier.phone,
    whatsapp: supplier.whatsapp,
    contactName: supplier.contactName,
    category: supplier.category,
    notes: supplier.notes,
    status: supplier.status
  };
}

export function SuppliersClient() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RecordStatus>("all");

  const suppliersQuery = useQuery({
    queryKey: ["base", "suppliers"],
    queryFn: async () => requestJson<SupplierListResponse>("/api/base/suppliers")
  });

  const unitsQuery = useQuery({
    queryKey: ["base", "units"],
    queryFn: async () => requestJson<UnitListResponse>("/api/base/units")
  });

  const activeUnits = useMemo(() => (unitsQuery.data?.units ?? []).filter((unit) => unit.status === "active"), [unitsQuery.data?.units]);

  const saveMutation = useMutation({
    mutationFn: async (override?: { id?: string; payload: SupplierForm }) => {
      const payload = override?.payload ?? form;
      const targetId = override?.id ?? editing?.id;
      const url = targetId ? `/api/base/suppliers/${targetId}` : "/api/base/suppliers";
      const method = targetId ? "PATCH" : "POST";

      return requestJson(url, { method, body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      setError("");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["base", "suppliers"] });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Nao foi possivel salvar o fornecedor.")
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function openEdit(supplier: SupplierRecord) {
    setEditing(supplier);
    setForm(supplierToForm(supplier));
    setError("");
    setFormOpen(true);
  }

  function inactivate(supplier: SupplierRecord) {
    saveMutation.mutate({
      id: supplier.id,
      payload: {
        ...supplierToForm(supplier),
        status: "inactive"
      }
    });
  }

  const suppliers = useMemo(() => suppliersQuery.data?.suppliers ?? [], [suppliersQuery.data?.suppliers]);

  const filteredSuppliers = useMemo(() => {
    const term = normalizeSearchValue(search);

    return suppliers.filter((supplier) => {
      if (statusFilter !== "all" && supplier.status !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        supplier.name,
        supplier.tradeName,
        supplier.documentNumber,
        supplier.email,
        supplier.phone,
        supplier.whatsapp,
        supplier.contactName,
        supplier.category,
        supplier.unitCode,
        supplier.unitName
      ]
        .filter(Boolean)
        .some((value) => normalizeSearchValue(String(value)).includes(term));
    });
  }, [search, statusFilter, suppliers]);

  const getUnitLabel = (supplier: SupplierRecord) => {
    if (!supplier.unitId) {
      return "Global da organização";
    }

    return supplier.unitCode ? `${supplier.unitCode} - ${supplier.unitName}` : supplier.unitName || "Unidade não informada";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Field label="Buscar fornecedor">
              <TextInput
                value={search}
                placeholder="Nome, documento, e-mail, telefone ou contato"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
          </div>
          <div className="space-y-2">
            <Field label="Status">
              <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | RecordStatus)}>
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="archived">Arquivados</option>
              </SelectField>
            </Field>
          </div>
        </div>
        <NewRecordButton label="Novo fornecedor" onClick={openNew} />
      </div>

      {formOpen ? (
        <FormCard title={editing ? "Editar fornecedor" : "Novo fornecedor"} onCancel={() => setFormOpen(false)}>
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
                  <option value="">Fornecedor global da organização</option>
                  {activeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} - {unit.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label="Status">
                <SelectField value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RecordStatus })}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                  <option value="archived">Arquivado</option>
                </SelectField>
              </Field>
              <Field label="Nome">
                <TextInput value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Nome fantasia">
                <TextInput value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} />
              </Field>
              <Field label="Tipo de documento">
                <SelectField value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value as SupplierForm["documentType"] })}>
                  <option value="OTHER">Outro</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                </SelectField>
              </Field>
              <Field label="Documento/CNPJ">
                <TextInput value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} />
              </Field>
              <Field label="E-mail">
                <TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </Field>
              <Field label="Telefone">
                <TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <TextInput value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} />
              </Field>
              <Field label="Contato principal">
                <TextInput value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
              </Field>
              <Field label="Categoria">
                <TextInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
              </Field>
              <Field label="Observações" className="md:col-span-2">
                <TextArea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
            </div>
            <ErrorMessage message={error} />
            <FormActions isSaving={saveMutation.isPending} onCancel={() => setFormOpen(false)} submitLabel="Salvar fornecedor" />
          </form>
        </FormCard>
      ) : null}

      {suppliersQuery.isLoading ? <LoadingTable label="Carregando fornecedores..." /> : null}
      {suppliersQuery.error ? (
        <ErrorMessage message={suppliersQuery.error instanceof Error ? suppliersQuery.error.message : "Erro ao carregar fornecedores."} />
      ) : null}
      {unitsQuery.error ? <ErrorMessage message={unitsQuery.error instanceof Error ? unitsQuery.error.message : "Erro ao carregar unidades."} /> : null}
      {!suppliersQuery.isLoading && !filteredSuppliers.length ? (
        <EmptyState
          title="Nenhum fornecedor cadastrado"
          description="Cadastre fornecedores para liberar o registro de cotações em Compras."
        />
      ) : null}
      {filteredSuppliers.length ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Fornecedor</th>
                <th className="px-4 py-3 font-semibold">Documento</th>
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-muted/35">
                  <td className="px-4 py-3">
                    <p className="font-medium">{supplier.tradeName || supplier.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{supplier.name}</p>
                    {supplier.category ? <p className="mt-1 text-xs text-muted-foreground">{supplier.category}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>{supplier.documentType}</p>
                    <p className="mt-1">{supplier.documentNumber || "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>{supplier.email || "-"}</p>
                    <p className="mt-1">{supplier.phone || supplier.whatsapp || "-"}</p>
                    {supplier.contactName ? <p className="mt-1 text-xs">{supplier.contactName}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{getUnitLabel(supplier)}</td>
                  <td className="px-4 py-3">
                    <RecordStatusBadge status={supplier.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions onEdit={() => openEdit(supplier)} onInactivate={() => inactivate(supplier)} disableInactivate={supplier.status !== "active"} />
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
