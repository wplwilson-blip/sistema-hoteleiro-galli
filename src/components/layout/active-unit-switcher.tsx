"use client";

import { ChevronDown, Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";

export function ActiveUnitSwitcher() {
  const units = useAppStore((state) => state.units);
  const activeUnit = useAppStore((state) => state.activeUnit);
  const profile = useAppStore((state) => state.profile);
  const activeUnitError = useAppStore((state) => state.activeUnitError);
  const setActiveUnit = useAppStore((state) => state.setActiveUnit);
  const clearActiveUnitError = useAppStore((state) => state.clearActiveUnitError);

  const [isSwitching, setIsSwitching] = useState(false);

  // Limpa o erro ao desmontar (nao vaza mensagem entre telas/usuarios).
  useEffect(() => {
    return () => clearActiveUnitError();
  }, [clearActiveUnitError]);

  // Auto-dismiss do erro depois de alguns segundos.
  useEffect(() => {
    if (!activeUnitError) {
      return;
    }

    const timer = setTimeout(() => clearActiveUnitError(), 4000);
    return () => clearTimeout(timer);
  }, [activeUnitError, clearActiveUnitError]);

  async function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    // Guard explicito: nao confiar so no disabled para evitar troca dupla.
    if (isSwitching) {
      return;
    }

    const nextUnitId = event.target.value;
    if (!nextUnitId || nextUnitId === activeUnit.id) {
      return;
    }

    clearActiveUnitError();
    setIsSwitching(true);
    try {
      await setActiveUnit(nextUnitId);
    } finally {
      setIsSwitching(false);
    }
  }

  const hasActiveUnitName = Boolean(activeUnit?.name);
  const isMultiUnit = units.length > 1;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MapPin className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{hasActiveUnitName ? activeUnit.name : "Selecione uma unidade"}</span>
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile.name}</p>

      {isMultiUnit ? (
        <div className="relative mt-2 w-full md:mt-1 md:w-52">
          <label htmlFor="active-unit-select" className="sr-only">
            Trocar unidade ativa
          </label>
          <select
            id="active-unit-select"
            className="h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            value={activeUnit.id}
            onChange={handleChange}
            disabled={isSwitching}
            aria-busy={isSwitching}
            aria-label="Trocar unidade ativa"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code ? `${unit.code} - ${unit.name}` : unit.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      ) : null}

      {activeUnitError ? (
        <p role="status" aria-live="polite" className="mt-1 text-xs text-destructive">
          {activeUnitError}
        </p>
      ) : null}
    </div>
  );
}
