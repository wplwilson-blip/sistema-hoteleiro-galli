import { ClipboardList, MessageSquareWarning, Search, UsersRound } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Passagem de turno futura",
    description: "Registro operacional de troca de turno da recepção será estruturado em sprint futura.",
    icon: ClipboardList
  },
  {
    title: "Ocorrências futuras",
    description: "Controle de ocorrências operacionais da recepção será criado posteriormente.",
    icon: MessageSquareWarning
  },
  {
    title: "Achados e perdidos futuro",
    description: "Registro e acompanhamento de itens encontrados ficará para sprint futura.",
    icon: Search
  },
  {
    title: "Observações de hóspedes futuro",
    description: "Observações operacionais de hóspedes serão tratadas sem criar fluxo de reservas.",
    icon: UsersRound
  }
];

export default function RecepcaoPage() {
  return (
    <ModuleDashboard
      title="Recepção"
      description="Dashboard de entrada para rotinas administrativas da recepção, sem funcionalidades de PMS ou reservas."
      cards={cards}
    />
  );
}
