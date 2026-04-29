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
  setSessionContext: (context: SessionContext) => void;
  setActiveUnit: (unitId: string) => void;
};

const units: Unit[] = [
  { id: "unit-matriz", name: "Matriz Corporativa" },
  { id: "unit-rio", name: "Hotel Rio Centro" },
  { id: "unit-sp", name: "Hotel São Paulo Jardins" }
];

export const useAppStore = create<AppState>((set) => ({
  user: {
    id: "user-demo",
    name: "Marina Costa",
    username: "marina.costa"
  },
  profile: {
    id: "profile-admin",
    name: "Gestora Administrativa"
  },
  units,
  activeUnit: units[0],
  setSessionContext: (context) =>
    set({
      user: context.user,
      profile: context.profile,
      units: context.units,
      activeUnit: context.activeUnit
    }),
  setActiveUnit: (unitId) =>
    set((state) => ({
      activeUnit: state.units.find((unit) => unit.id === unitId) ?? state.activeUnit
    }))
}));
