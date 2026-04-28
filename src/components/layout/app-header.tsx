"use client";

import { ChevronDown, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/common/notification-bell";
import { useAppStore } from "@/store/app-store";

export function AppHeader() {
  const { user, profile, units, activeUnit, setActiveUnit } = useAppStore();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-card/95 px-5 shadow-sm shadow-primary/5 backdrop-blur lg:px-8">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="truncate">{activeUnit.name}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile.name}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <select
            className="h-10 min-w-52 appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:ring-2 focus:ring-ring"
            value={activeUnit.id}
            onChange={(event) => setActiveUnit(event.target.value)}
            aria-label="Unidade ativa"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        </div>
        <NotificationBell />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-5">{user.name}</p>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
        </div>
        <Button variant="outline" size="sm" className="border-border/90 bg-background hover:bg-muted" asChild>
          <a href="/login">
            <LogOut className="h-4 w-4" />
            Sair
          </a>
        </Button>
      </div>
    </header>
  );
}
