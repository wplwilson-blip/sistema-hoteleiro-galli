import Link from "next/link";
import {
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  IdCard,
  ShieldCheck,
  Tags,
  Users
} from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const modules = [
  {
    title: "Unidades",
    description: "Cadastro das unidades da rede hoteleira.",
    href: "/cadastros/unidades",
    icon: Building2,
    enabled: true
  },
  {
    title: "Departamentos",
    description: "Estrutura departamental por unidade.",
    href: "/cadastros/departamentos",
    icon: Tags,
    enabled: true
  },
  {
    title: "Cargos",
    description: "Cargos e posicoes por departamento.",
    href: "/cadastros/cargos",
    icon: BriefcaseBusiness,
    enabled: true
  },
  {
    title: "Usuarios",
    description: "Gestao de acessos entra em sprint propria.",
    icon: Users,
    enabled: false
  },
  {
    title: "Perfis e permissoes",
    description: "Matriz granular prevista para Sprint 4C.",
    icon: ShieldCheck,
    enabled: false
  },
  {
    title: "UHs/Quartos",
    description: "Estrutura operacional sera detalhada em sprint posterior.",
    icon: BedDouble,
    enabled: false
  },
  {
    title: "Fornecedores",
    description: "Cadastro integrado a compras fica fora desta sprint.",
    icon: IdCard,
    enabled: false
  }
];

export default function CadastrosPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Cadastros"
        description="Modulo Base para manter unidades, departamentos e cargos usados pelos fluxos administrativos."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          const content = (
            <Card
              className={cn(
                "h-full border-border/80 p-5 shadow-sm shadow-primary/5 transition-colors",
                module.enabled ? "hover:border-primary/30 hover:bg-card" : "opacity-70"
              )}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <StatusBadge status={module.enabled ? "success" : "visual"} label={module.enabled ? "Disponivel" : "Em breve"} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{module.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
                </div>
                {module.enabled ? <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" /> : null}
              </div>
            </Card>
          );

          return module.enabled && module.href ? (
            <Link key={module.title} href={module.href}>
              {content}
            </Link>
          ) : (
            <div key={module.title}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

