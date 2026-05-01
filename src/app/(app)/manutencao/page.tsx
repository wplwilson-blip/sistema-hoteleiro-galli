import { BedDouble, Building2, ClipboardList, CalendarCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Chamados",
    description: "Abertura e acompanhamento de chamados de manutenção serão ativados em próxima etapa.",
    icon: ClipboardList,
    status: "Em breve" as const
  },
  {
    title: "Quartos em manutenção",
    description: "Controle administrativo de UHs bloqueadas ou em manutenção será criado em próxima etapa.",
    icon: BedDouble,
    status: "Em breve" as const
  },
  {
    title: "Áreas comuns",
    description: "Chamados e evidências de áreas comuns serão ativados em próxima etapa.",
    icon: Building2,
    status: "Em breve" as const
  },
  {
    title: "Preventivas",
    description: "Agenda de manutenção preventiva será organizada em próxima etapa.",
    icon: CalendarCheck,
    status: "Em breve" as const
  }
];

export default function ManutencaoPage() {
  return (
    <ModuleDashboard
      title="Manutenção"
      description="Entrada para chamados, quartos, áreas comuns e manutenção preventiva."
      cards={cards}
    />
  );
}
