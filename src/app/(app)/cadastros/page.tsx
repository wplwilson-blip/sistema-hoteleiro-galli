import { BedDouble, BriefcaseBusiness, Building2, IdCard, ShieldCheck, Tags, UserRound, Users } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Unidades",
    description: "Cadastro das unidades da rede hoteleira.",
    href: "/cadastros/unidades",
    icon: Building2
  },
  {
    title: "Departamentos",
    description: "Estrutura departamental por unidade.",
    href: "/cadastros/departamentos",
    icon: Tags
  },
  {
    title: "Cargos",
    description: "Cargos e posições por departamento.",
    href: "/cadastros/cargos",
    icon: BriefcaseBusiness
  },
  {
    title: "Colaboradores",
    description: "Cadastro estrutural dos colaboradores vinculados às unidades, departamentos e cargos.",
    href: "/cadastros/colaboradores",
    icon: UserRound
  },
  {
    title: "Usuários internos",
    description: "Controle de acesso dos usuários por perfil e unidades permitidas.",
    href: "/cadastros/usuarios",
    icon: Users
  },
  {
    title: "Fornecedores",
    description: "Cadastro de fornecedores usados em compras, cotações, manutenção, A&B e rotinas administrativas.",
    href: "/cadastros/fornecedores",
    icon: IdCard
  },
  {
    title: "Perfis e permissões",
    description: "Matriz granular de acesso será organizada em próxima etapa.",
    icon: ShieldCheck,
    status: "Em breve" as const
  },
  {
    title: "UHs e quartos",
    description: "Estrutura operacional de quartos será detalhada em próxima etapa.",
    icon: BedDouble,
    status: "Em breve" as const
  }
];

export default function CadastrosPage() {
  return (
    <ModuleDashboard
      title="Cadastros"
      description="Módulo Base para manter unidades, departamentos, cargos, usuários, colaboradores e fornecedores usados pelos fluxos administrativos."
      cards={cards}
      columns="three"
    />
  );
}
