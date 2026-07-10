"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getSupplierSummaryParts,
  normalizeDocumentSearch,
  normalizeSearchValue,
  type SupplierRecord
} from "@/components/purchases/purchase-quotes-utils";

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  disabled
}: {
  suppliers: SupplierRecord[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
  const selectedSupplierSummary = selectedSupplier ? getSupplierSummaryParts(selectedSupplier).join(" • ") : "";
  const normalizedTerm = normalizeSearchValue(term);
  const documentTerm = normalizeDocumentSearch(term);
  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!normalizedTerm && !documentTerm) {
      return true;
    }

    const text = normalizeSearchValue([supplier.name, supplier.tradeName, supplier.documentNumber, supplier.phone, supplier.whatsapp].filter(Boolean).join(" "));
    const documentText = normalizeDocumentSearch([supplier.documentNumber, supplier.phone, supplier.whatsapp].filter(Boolean).join(" "));

    return text.includes(normalizedTerm) || Boolean(documentTerm && documentText.includes(documentTerm));
  });

  function selectSupplier(supplierId: string) {
    onChange(supplierId);
    setTerm("");
    setOpen(false);
  }

  return (
    <div className={cn("relative min-w-0 flex-1", open && "z-[80]")}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="h-auto min-h-10 w-full justify-start px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{selectedSupplier ? selectedSupplier.name : "Selecione um fornecedor"}</p>
          {selectedSupplier ? (
            <p className="mt-1 truncate text-xs font-normal text-muted-foreground">
              {selectedSupplierSummary}
            </p>
          ) : null}
        </div>
      </Button>

      {open ? (
        <div className="absolute left-0 top-full z-[90] mt-2 w-full min-w-[min(32rem,calc(100vw-3rem))] overflow-hidden rounded-md border border-border bg-background p-0 shadow-xl shadow-black/15">
          <div className="border-b border-border bg-background p-3">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Buscar por razão social, nome fantasia, CNPJ/CPF ou telefone"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[22rem] overflow-y-auto bg-background p-2">
            {filteredSuppliers.length ? (
              filteredSuppliers.map((supplier) => {
                const summary = getSupplierSummaryParts(supplier).join(" • ");

                return (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => selectSupplier(supplier.id)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <Check className={supplier.id === value ? "mt-0.5 h-4 w-4 shrink-0 text-primary" : "mt-0.5 h-4 w-4 shrink-0 text-transparent"} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="block truncate text-sm font-semibold text-foreground" title={supplier.name}>
                        {supplier.name}
                      </span>
                      {summary ? (
                        <span className="block truncate text-xs leading-5 text-muted-foreground" title={summary}>
                          {summary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum fornecedor encontrado.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
