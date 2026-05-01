import { ClipboardCheck, ListChecks, MessageSquareWarning, UserRoundCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Checklists futuros",
    description: "Checklists operacionais da governança serão criados em sprint futura.",
    icon: ListChecks
  },
  {
    title: "Inspeções futuras",
    description: "Inspeções com evidências e pendências serão estruturadas posteriormente.",
    icon: ClipboardCheck
  },
  {
    title: "Camareiras futuras",
    description: "Acompanhamento operacional de equipes será tratado em etapa específica.",
    icon: UserRoundCheck
  },
  {
    title: "Ocorrências futuras",
    description: "Ocorrências da governança serão centralizadas em sprint futura.",
    icon: MessageSquareWarning
  }
];

export default function GovernancaPage() {
  return (
    <ModuleDashboard
      title="Governança"
      description="Dashboard de entrada para checklists, inspeções, equipes e ocorrências da governança."
      cards={cards}
    />
  );
}
