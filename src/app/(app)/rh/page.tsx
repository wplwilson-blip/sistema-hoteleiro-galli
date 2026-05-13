import { FileText, GraduationCap, History, UserMinus, UserPlus, UserRound } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Colaboradores",
    description: "Consultar colaboradores com filtros, escopo de unidade e protecao de dados sensiveis.",
    href: "/rh/employees",
    icon: UserRound
  },
  {
    title: "Documentos",
    description: "Acompanhar documentos logicos de RH, pendencias e vencimentos por colaborador.",
    icon: FileText,
    status: "Em breve" as const
  },
  {
    title: "Historico",
    description: "Consultar eventos funcionais administrativos com redacao para dados restritos.",
    icon: History,
    status: "Em breve" as const
  },
  {
    title: "Admissoes",
    description: "Fluxo administrativo de admissao e integracao sera planejado em etapa futura.",
    icon: UserPlus,
    status: "Em breve" as const
  },
  {
    title: "Desligamentos",
    description: "Registro administrativo de desligamentos ficara para uma etapa propria.",
    icon: UserMinus,
    status: "Em breve" as const
  },
  {
    title: "Treinamentos",
    description: "Registros de treinamento e evidencias ficarao para uma frente propria.",
    icon: GraduationCap,
    status: "Em breve" as const
  }
];

export default function RhPage() {
  return (
    <ModuleDashboard
      title="RH"
      description="Entrada segura para consultas administrativas de colaboradores, documentos e historico funcional."
      cards={cards}
    />
  );
}
