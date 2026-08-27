"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/common/notification-bell";
import { ActiveUnitSwitcher } from "@/components/layout/active-unit-switcher";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { useAppStore } from "@/store/app-store";

export function AppHeader() {
  const user = useAppStore((state) => state.user);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
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
        <Button
          variant="outline"
          size="sm"
          className="border-border/90 bg-background hover:bg-muted"
          onClick={() => setChangePasswordOpen(true)}
          data-testid="trocar-senha"
        >
          <KeyRound className="h-4 w-4" />
          <span className="hidden sm:inline">Trocar senha</span>
        </Button>
        <Button variant="outline" size="sm" className="border-border/90 bg-background hover:bg-muted" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>

      {changePasswordOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setChangePasswordOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <ChangePasswordForm
              onDone={() => {
                setChangePasswordOpen(false);
                router.refresh();
              }}
              onCancel={() => setChangePasswordOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}
