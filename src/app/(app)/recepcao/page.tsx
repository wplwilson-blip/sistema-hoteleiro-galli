import { ClipboardList, MessageSquareWarning, Search, UsersRound } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Passagem de turno",
    description: "Registro operacional de troca de turno da recepção será ativado em próxima etapa.",
    icon: ClipboardList,
    status: "Em breve" as const
  },
  {
    title: "Ocorrências",
    description: "Controle de ocorrências operacionais da recepção será criado em próxima etapa.",
    icon: MessageSquareWarning,
    status: "Em breve" as const
  },
  {
    title: "Achados e perdidos",
    description: "Registro e acompanhamento de itens encontrados será ativado em próxima etapa.",
    icon: Search,
    status: "Em breve" as const
  },
  {
    title: "Observações de hóspedes",
    description: "Observações operacionais de hóspedes serão tratadas sem criar fluxo de reservas.",
    icon: UsersRound,
    status: "Em breve" as const
  }
];

export default function RecepcaoPage() {
  return (
    <ModuleDashboard
      title="Recepção"
      description="Entrada para rotinas administrativas da recepção, sem funcionalidades de PMS ou reservas."
      cards={cards}
    />
  );
}
