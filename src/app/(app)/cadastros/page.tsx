import Link from "next/link";
import {
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  IdCard,
  ShieldCheck,
  Tags,
  UserRound,
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
    description: "Cargos e posi\u00e7\u00f5es por departamento.",
    href: "/cadastros/cargos",
    icon: BriefcaseBusiness,
    enabled: true
  },
  {
    title: "Colaboradores",
    description: "Cadastro estrutural dos colaboradores vinculados \u00e0s unidades, departamentos e cargos.",
    href: "/cadastros/colaboradores",
    icon: UserRound,
    enabled: true
  },
  {
    title: "Usu\u00e1rios internos",
    description: "Controle de acessos dos colaboradores ao sistema, com v\u00ednculo a perfil e unidades permitidas.",
    href: "/cadastros/usuarios",
    icon: Users,
    enabled: true
  },
  {
    title: "Fornecedores",
    description: "Cadastro de fornecedores utilizados em compras, cota\u00e7\u00f5es, manuten\u00e7\u00e3o, A&B e rotinas administrativas.",
    href: "/cadastros/fornecedores",
    icon: IdCard,
    enabled: true
  },
  {
    title: "Perfis e permiss\u00f5es",
    description: "Matriz granular prevista para Sprint 4C.",
    icon: ShieldCheck,
    enabled: false
  },
  {
    title: "UHs/Quartos",
    description: "Estrutura operacional ser\u00e1 detalhada em sprint posterior.",
    icon: BedDouble,
    enabled: false
  }
];

export default function CadastrosPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Cadastros"
        description="M\u00f3dulo Base para manter unidades, departamentos, cargos e fornecedores usados pelos fluxos administrativos."
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
                <StatusBadge status={module.enabled ? "success" : "visual"} label={module.enabled ? "Dispon\u00edvel" : "Em breve"} />
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
