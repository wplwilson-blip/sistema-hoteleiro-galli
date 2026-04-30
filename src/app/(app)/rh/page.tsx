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
    title: "Admissões futuras",
    description: "Fluxo de admissão e integração de colaboradores será tratado em sprint futura.",
    icon: UserPlus
  },
  {
    title: "Documentos futuros",
    description: "Controle de documentos de RH e vencimentos será organizado em etapa posterior.",
    icon: FileText
  },
  {
    title: "Treinamentos futuros",
    description: "Registro de treinamentos, reciclagens e evidências ficará para sprint futura.",
    icon: GraduationCap
  }
];

export default function RhPage() {
  return (
    <ModuleDashboard
      title="RH"
      description="Dashboard de entrada para rotinas de colaboradores, admissões, documentos e treinamentos."
      cards={cards}
    />
  );
}
