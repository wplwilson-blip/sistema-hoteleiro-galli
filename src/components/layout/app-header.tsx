"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/common/notification-bell";
import { ActiveUnitSwitcher } from "@/components/layout/active-unit-switcher";
import { useAppStore } from "@/store/app-store";

export function AppHeader() {
  const user = useAppStore((state) => state.user);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-4 py-3 shadow-sm shadow-primary/5 backdrop-blur sm:flex-nowrap lg:px-6 xl:px-8">
      <div className="min-w-0 flex-1">
        <ActiveUnitSwitcher />
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
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
