"use client";

import { ChevronDown, LogOut, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/common/notification-bell";
import { useAppStore } from "@/store/app-store";

export function AppHeader() {
  const { user, profile, units, activeUnit, setActiveUnit } = useAppStore();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-4 py-3 shadow-sm shadow-primary/5 backdrop-blur sm:flex-nowrap lg:px-6 xl:px-8">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="truncate">{activeUnit.name}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile.name}</p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
        <div className="relative hidden md:block">
          <select
            className="h-10 w-48 min-w-0 appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:ring-2 focus:ring-ring lg:w-52"
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
        <Button variant="outline" size="sm" className="border-border/90 bg-background hover:bg-muted" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
