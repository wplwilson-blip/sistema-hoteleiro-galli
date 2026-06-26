"use client";

import { create } from "zustand";
import type { SessionContext } from "@/lib/auth/types";

type Unit = {
  id: string;
  name: string;
  code?: string;
};

type AppState = {
  user: {
    id: string;
    name: string;
    username: string;
  };
  profile: {
    id: string;
    name: string;
  };
  units: Unit[];
  activeUnit: Unit;
  activeUnitError: string | null;
  setSessionContext: (context: SessionContext) => void;
  setActiveUnit: (unitId: string) => Promise<void>;
};

// Estado inicial NEUTRO (sem mock). Nunca undefined, para nada quebrar no 1o paint
// antes da hidratacao (footgun 1). E sobrescrito por setSessionContext (seed sincrono
// no AppProviders a partir do SessionContext do SSR).
const emptyUnit: Unit = { id: "", name: "" };

export const useAppStore = create<AppState>((set, get) => ({
  user: {
    id: "",
    name: "",
    username: ""
  },
  profile: {
    id: "",
    name: ""
  },
  units: [],
  activeUnit: emptyUnit,
  activeUnitError: null,
  setSessionContext: (context) =>
    set({
      user: context.user,
      profile: context.profile,
      units: context.units,
      activeUnit: context.activeUnit,
      activeUnitError: null
    }),
  setActiveUnit: async (unitId) => {
    if (!unitId || unitId === get().activeUnit.id) {
      return;
    }

    try {
      const response = await fetch("/api/auth/active-unit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        // 403 / erro: NAO troca a unidade; registra o erro (select controlado reverte).
        set({ activeUnitError: payload.message ?? "Nao foi possivel trocar a unidade ativa." });
        return;
      }

      const context = payload.user as SessionContext;
      set({
        user: context.user,
        profile: context.profile,
        units: context.units,
        activeUnit: context.activeUnit,
        activeUnitError: null
      });
    } catch {
      set({ activeUnitError: "Nao foi possivel trocar a unidade ativa." });
    }
  }
}));
