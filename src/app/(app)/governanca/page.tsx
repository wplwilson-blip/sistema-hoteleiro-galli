import { ClipboardCheck, ListChecks, MessageSquareWarning, UserRoundCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Checklists",
    description: "Checklists operacionais da governança serão criados em próxima etapa.",
    icon: ListChecks,
    status: "Em breve" as const
  },
  {
    title: "Inspeções",
    description: "Inspeções com evidências e pendências serão estruturadas em próxima etapa.",
    icon: ClipboardCheck,
    status: "Em breve" as const
  },
  {
    title: "Camareiras",
    description: "Acompanhamento operacional de equipes será tratado em próxima etapa.",
    icon: UserRoundCheck,
    status: "Em breve" as const
  },
  {
    title: "Ocorrências",
    description: "Ocorrências da governança serão centralizadas em próxima etapa.",
    icon: MessageSquareWarning,
    status: "Em breve" as const
  }
];

export default function GovernancaPage() {
  return (
    <ModuleDashboard
      title="Governança"
      description="Entrada para checklists, inspeções, equipes e ocorrências da governança."
      cards={cards}
    />
  );
}
