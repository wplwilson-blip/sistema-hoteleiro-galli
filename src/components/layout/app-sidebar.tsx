"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Landmark,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Users,
  Utensils,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Cadastros", href: "/cadastros", icon: SlidersHorizontal },
  { label: "Unidades", href: "/cadastros/unidades", icon: Building2 },
  { label: "Departamentos", href: "/cadastros/departamentos", icon: Tags },
  { label: "Cargos", href: "/cadastros/cargos", icon: BriefcaseBusiness },
  { label: "Minha Operação", href: "/minha-operacao", icon: BedDouble },
  { label: "Aprovações", href: "#", icon: ClipboardCheck },
  { label: "Solicitações", href: "#", icon: ClipboardList },
  { label: "RH", href: "#", icon: Users },
  { label: "Contas a Pagar", href: "#", icon: Landmark },
  { label: "Compras", href: "#", icon: ShoppingCart },
  { label: "Manutenção", href: "#", icon: Wrench },
  { label: "Governança", href: "#", icon: ShieldCheck },
  { label: "A&B", href: "#", icon: Utensils },
  { label: "Administrativo", href: "#", icon: BriefcaseBusiness },
  { label: "Relatórios", href: "#", icon: FileText },
  { label: "Auditoria", href: "#", icon: BarChart3 },
  { label: "Configurações", href: "#", icon: Settings }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border/80 bg-card lg:block">
      <div className="flex h-20 items-center gap-3 border-b border-border/80 px-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white p-2 shadow-sm">
          <Image src="/brand/logo.png" alt="Hotel Galli" width={36} height={36} className="h-auto w-auto" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Hotel Galli</p>
          <p className="truncate text-xs text-muted-foreground">Sistema Administrativo</p>
        </div>
      </div>
      <nav className="space-y-1 px-3 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href !== "#" && pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive &&
                  "bg-primary text-primary-foreground shadow-sm shadow-primary/15 hover:bg-primary hover:text-primary-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-accent")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
