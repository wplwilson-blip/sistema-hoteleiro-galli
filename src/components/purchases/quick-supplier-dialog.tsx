"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ErrorMessage, Field, SelectField, TextArea, TextInput } from "@/components/base-cadastros/crud-components";
import { Button } from "@/components/ui/button";

export type QuickSupplierRecord = {
  id: string;
  name: string;
  tradeName: string;
  documentType?: string;
  documentNumber: string;
  phone?: string;
  whatsapp?: string;
  unitId: string;
  status: string;
};

type SupplierApiRecord = {
  id: string;
  name: string;
  trade_name: string;
  document_type: string;
  document_number: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  contact_name?: string;
  category?: string;
  status: string;
  unit_id: string;
};

type QuickSupplierDialogProps = {
  open: boolean;
  unitId?: string;
  onClose: () => void;
  onCreated: (supplier: QuickSupplierRecord, message?: string) => void;
};

type QuickSupplierForm = {
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
};

class SupplierRequestError extends Error {
  status: number;
  supplier?: QuickSupplierRecord;

  constructor(message: string, status: number, supplier?: QuickSupplierRecord) {
    super(message);
    this.status = status;
    this.supplier = supplier;
  }
}

const initialForm: QuickSupplierForm = {
  name: "",
  tradeName: "",
  documentType: "CNPJ",
  documentNumber: "",
  email: "",
  phone: "",
  whatsapp: "",
  contactName: "",
  category: "",
  notes: ""
};

function mapSupplierFromApi(supplier: SupplierApiRecord): QuickSupplierRecord {
  return {
    id: supplier.id,
    name: supplier.name,
    tradeName: supplier.trade_name ?? "",
    documentType: supplier.document_type,
    documentNumber: supplier.document_number ?? "",
    phone: supplier.phone ?? "",
    whatsapp: supplier.whatsapp ?? "",
    unitId: supplier.unit_id ?? "",
    status: supplier.status
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new SupplierRequestError(
      payload.message ?? "Não foi possível concluir a operação.",
      response.status,
      payload.supplier ? mapSupplierFromApi(payload.supplier as SupplierApiRecord) : undefined
    );
  }

  return payload;
}

export function QuickSupplierDialog({ open, unitId, onClose, onCreated }: QuickSupplierDialogProps) {
  const [form, setForm] = useState<QuickSupplierForm>(initialForm);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = useMemo(() => {
    return form.name.trim().length >= 2 && form.documentType && form.documentNumber.trim().length > 0;
  }, [form.documentNumber, form.documentType, form.name]);

  if (!open) {
    return null;
  }

  function updateField<K extends keyof QuickSupplierForm>(key: K, value: QuickSupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setSuccessMessage("");
  }

  function closeDialog() {
    if (isSaving) {
      return;
    }

    setForm(initialForm);
    setError("");
    setSuccessMessage("");
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setError("Informe nome, tipo de documento e documento do fornecedor.");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const payload = await requestJson<{ ok: true; supplier: SupplierApiRecord }>("/api/base/suppliers", {
        method: "POST",
        body: JSON.stringify({
          unitId: unitId ?? "",
          name: form.name,
          tradeName: form.tradeName,
          documentType: form.documentType,
          documentNumber: form.documentNumber,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp,
          contactName: form.contactName,
          category: form.category,
          notes: form.notes,
          status: "active"
        })
      });

      setSuccessMessage("Fornecedor cadastrado com sucesso.");
      onCreated(mapSupplierFromApi(payload.supplier), "Fornecedor cadastrado com sucesso.");
      setForm(initialForm);
    } catch (submitError) {
      if (submitError instanceof SupplierRequestError && submitError.status === 409 && submitError.supplier) {
        onCreated(submitError.supplier, "Este CNPJ/CPF já está cadastrado. O fornecedor existente foi selecionado para a cotação.");
        setForm(initialForm);
        setError("");
        return;
      }

      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 px-4 py-6 backdrop-blur-sm" role="presentation" onClick={closeDialog}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-supplier-title"
          className="max-h-[calc(100vh-3rem)] w-full overflow-y-auto rounded-xl border bg-background shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
            <div className="space-y-1">
              <h3 id="quick-supplier-title" className="text-lg font-semibold text-foreground">
                Cadastrar novo fornecedor
              </h3>
              <p className="text-sm text-muted-foreground">Cadastre o fornecedor sem sair da cotação. Após salvar, ele será selecionado automaticamente.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closeDialog} disabled={isSaving}>
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </div>

          <form className="space-y-5 px-6 py-5" onSubmit={submit}>
            {error ? <ErrorMessage message={error} /> : null}
            {successMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{successMessage}</p> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Razão social / Nome do fornecedor">
                <TextInput value={form.name} onChange={(event) => updateField("name", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Nome fantasia">
                <TextInput value={form.tradeName} onChange={(event) => updateField("tradeName", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Tipo de documento">
                <SelectField value={form.documentType} onChange={(event) => updateField("documentType", event.target.value as QuickSupplierForm["documentType"])} disabled={isSaving}>
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                  <option value="OTHER">Outro</option>
                </SelectField>
              </Field>
              <Field label="CNPJ/CPF">
                <TextInput value={form.documentNumber} onChange={(event) => updateField("documentNumber", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="E-mail">
                <TextInput type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Telefone">
                <TextInput value={form.phone} onChange={(event) => updateField("phone", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="WhatsApp">
                <TextInput value={form.whatsapp} onChange={(event) => updateField("whatsapp", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Pessoa de contato">
                <TextInput value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Categoria" className="md:col-span-2">
                <TextInput value={form.category} onChange={(event) => updateField("category", event.target.value)} disabled={isSaving} />
              </Field>
              <Field label="Observações" className="md:col-span-2">
                <TextArea rows={3} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} disabled={isSaving} />
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || !canSubmit}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar fornecedor
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
