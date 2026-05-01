import { FileText, GraduationCap, UserPlus, UserRound } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Colaboradores",
    description: "Acesso ao cadastro de colaboradores já disponível no Módulo Base.",
    href: "/cadastros/colaboradores",
    icon: UserRound,
    status: "Disponível" as const
  },
  {
    title: "Admissões",
    description: "Fluxo de admissão e integração de colaboradores será ativado em próxima etapa.",
    icon: UserPlus,
    status: "Em breve" as const
  },
  {
    title: "Documentos",
    description: "Controle de documentos de RH e vencimentos será organizado em próxima etapa.",
    icon: FileText,
    status: "Em breve" as const
  },
  {
    title: "Treinamentos",
    description: "Registro de treinamentos, reciclagens e evidências será ativado em próxima etapa.",
    icon: GraduationCap,
    status: "Em breve" as const
  }
];

export default function RhPage() {
  return (
    <ModuleDashboard
      title="RH"
      description="Entrada para rotinas de colaboradores, admissões, documentos e treinamentos do hotel."
      cards={cards}
    />
  );
}
