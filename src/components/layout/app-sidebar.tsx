"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileWarning,
  GraduationCap,
  HeartPulse,
  IdCard,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Shuffle,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  UserRound,
  Users,
  Utensils,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarLink = {
  type?: "link";
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  match?: "exact" | "prefix";
};

type SidebarSection = {
  type: "section";
  label: string;
};

type SidebarEntry = SidebarLink | SidebarSection;

type SidebarGroup = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  items: SidebarEntry[];
};

const mainItems: SidebarLink[] = [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }];

const menuGroups: SidebarGroup[] = [
  {
    label: "Cadastros",
    href: "/cadastros",
    icon: SlidersHorizontal,
    items: [
      { label: "Dashboard", href: "/cadastros", icon: LayoutDashboard, match: "exact" },
      { label: "Unidades", href: "/cadastros/unidades", icon: Building2 },
      { label: "Departamentos", href: "/cadastros/departamentos", icon: Tags },
      { label: "Cargos", href: "/cadastros/cargos", icon: BriefcaseBusiness },
      { label: "Colaboradores", href: "/cadastros/colaboradores", icon: UserRound },
      { label: "Usuários internos", href: "/cadastros/usuarios", icon: Users },
      { label: "Fornecedores", href: "/cadastros/fornecedores", icon: IdCard }
    ]
  },
  {
    label: "Compras",
    href: "/compras",
    icon: ShoppingCart,
    items: [
      { label: "Dashboard", href: "/compras", icon: LayoutDashboard, match: "exact" },
      { label: "Solicitações", href: "/compras/solicitacoes", icon: ClipboardList },
      { label: "Cotações", href: "/compras/cotacoes", icon: ClipboardCheck },
      { label: "Aprovações", href: "/compras/aprovacoes", icon: ShieldCheck },
      { label: "Pendências Documentais", href: "/compras/pendencias-documentais", icon: FileWarning }
    ]
  },
  {
    label: "RH",
    href: "/rh",
    icon: Users,
    items: [
      { type: "section", label: "GESTÃO RH" },
      { label: "Painel RH", href: "/rh", icon: LayoutDashboard, match: "exact" },
      { label: "Fila RH", href: "/rh/inbox", icon: Inbox },
      { type: "section", label: "RECRUTAMENTO E SELEÇÃO" },
      { label: "Vagas", href: "/rh/vagas", icon: BriefcaseBusiness },
      { type: "section", label: "ADMISSÃO" },
      { label: "Admissões", href: "/rh/admissoes", icon: ClipboardCheck, match: "exact" },
      { label: "Documentos RH", href: "/rh/pendencias-documentais", icon: FileWarning },
      { label: "Onboarding", href: "/rh/onboarding", icon: ClipboardCheck },
      { type: "section", label: "COLABORADORES" },
      { label: "Colaboradores", href: "/rh/employees", icon: UserRound },
      { type: "section", label: "DESENVOLVIMENTO" },
      { label: "Avaliações", href: "/rh/gestao/avaliacoes", icon: ListChecks, match: "exact" },
      { label: "Plano de Desenvolvimento (PDI)", href: "/rh/employees?tab=development", icon: ClipboardList },
      { label: "Treinamentos", href: "/rh/gestao/treinamentos", icon: GraduationCap, match: "exact" },
      { type: "section", label: "VIDA FUNCIONAL" },
      { label: "Movimentações", href: "/rh/gestao/movimentacoes", icon: Shuffle, match: "exact" },
      { label: "Saúde Ocupacional", href: "/rh/gestao/saude-ocupacional", icon: HeartPulse, match: "exact" },
      { type: "section", label: "CONDUTA" },
      { label: "Conduta", href: "/rh/gestao/conduta", icon: MessageSquareText, match: "exact" },
      { type: "section", label: "DESLIGAMENTO" },
      { label: "Desligamentos", href: "/rh/gestao/desligamentos", icon: LogOut, match: "exact" },
      { label: "Dashboard Executivo", href: "/rh/dashboard-executivo", icon: BarChart3, match: "exact" },
      { label: "Relatórios RH", href: "/rh/relatorios", icon: FileText, match: "exact" },
      { label: "Gestão RH", href: "/rh/gestao", icon: BarChart3, match: "exact" }
    ]
  },
  {
    label: "Recepção",
    href: "/recepcao",
    icon: BedDouble,
    items: [{ label: "Dashboard", href: "/recepcao", icon: LayoutDashboard }]
  },
  {
    label: "Manutenção",
    href: "/manutencao",
    icon: Wrench,
    items: [{ label: "Dashboard", href: "/manutencao", icon: LayoutDashboard }]
  },
  {
    label: "Governança",
    href: "/governanca",
    icon: ShieldCheck,
    items: [{ label: "Dashboard", href: "/governanca", icon: LayoutDashboard }]
  },
  {
    label: "A&B",
    href: "/ab",
    icon: Utensils,
    items: [{ label: "Dashboard", href: "/ab", icon: LayoutDashboard }]
  },
  {
    label: "Contas a Pagar",
    href: "/contas-a-pagar",
    icon: Landmark,
    items: [{ label: "Dashboard", href: "/contas-a-pagar", icon: LayoutDashboard }]
  },
  {
    label: "Administrativo",
    href: "/administrativo",
    icon: BriefcaseBusiness,
    items: [
      { label: "Dashboard", href: "/administrativo", icon: LayoutDashboard },
      { label: "Minha Operação", href: "/minha-operacao", icon: BedDouble }
    ]
  }
];

const footerItems: SidebarLink[] = [{ label: "Relatórios", href: "/relatorios", icon: FileText }];

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isLinkActive(pathname: string, item: SidebarLink) {
  return item.match === "exact" ? pathname === item.href : isPathActive(pathname, item.href);
}

function isSidebarLink(item: SidebarEntry): item is SidebarLink {
  return item.type !== "section";
}

function SidebarItem({ item, active }: { item: SidebarLink; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-primary text-primary-foreground shadow-sm shadow-primary/15 hover:bg-primary hover:text-primary-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-accent")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeGroups = useMemo(
    () =>
      menuGroups
        .filter((group) => isPathActive(pathname, group.href) || group.items.some((item) => isSidebarLink(item) && isLinkActive(pathname, item)))
        .map((group) => group.label),
    [pathname]
  );
  const [openGroups, setOpenGroups] = useState<string[]>(activeGroups);

  function toggleGroup(label: string) {
    setOpenGroups((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]));
  }

  useEffect(() => {
    const nav = navRef.current;
    const activeLink = nav?.querySelector<HTMLElement>('[aria-current="page"]');

    if (!nav || !activeLink) return;

    const targetScrollTop = activeLink.offsetTop - nav.clientHeight / 2 + activeLink.clientHeight / 2;
    nav.scrollTop = Math.max(0, targetScrollTop);
  }, [pathname, activeGroups]);

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-border/80 bg-card lg:flex">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-border/80 px-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white p-2 shadow-sm">
          <Image src="/brand/logo.png" alt="Hotel Galli" width={36} height={36} className="h-auto w-auto" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Hotel Galli</p>
          <p className="truncate text-xs text-muted-foreground">Sistema Administrativo</p>
        </div>
      </div>

      <nav ref={navRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {mainItems.map((item) => (
          <SidebarItem key={item.label} item={item} active={isLinkActive(pathname, item)} />
        ))}

        {menuGroups.map((group) => {
          const Icon = group.icon;
          const isGroupActive = isPathActive(pathname, group.href) || group.items.some((item) => isSidebarLink(item) && isLinkActive(pathname, item));
          const isOpen = openGroups.includes(group.label) || activeGroups.includes(group.label);

          return (
            <div key={group.label} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isGroupActive && "bg-muted text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen ? (
                <div className="ml-4 space-y-1 border-l border-border/80 pl-2">
                  {group.items.map((item) =>
                    isSidebarLink(item) ? (
                      <SidebarItem key={`${group.label}-${item.label}`} item={item} active={isLinkActive(pathname, item)} />
                    ) : (
                      <div key={`${group.label}-${item.label}`} className="px-3 pt-3 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </div>
                    )
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="border-t border-border/80 pt-2">
          {footerItems.map((item) => (
            <SidebarItem key={item.label} item={item} active={isLinkActive(pathname, item)} />
          ))}
        </div>
      </nav>
    </aside>
  );
}
