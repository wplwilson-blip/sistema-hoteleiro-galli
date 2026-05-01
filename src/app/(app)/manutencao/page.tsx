import { BedDouble, Building2, ClipboardList, CalendarCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Chamados futuros",
    description: "Abertura e acompanhamento de chamados de manutenção serão tratados em sprint futura.",
    icon: ClipboardList
  },
  {
    title: "Quartos em manutenção futuro",
    description: "Controle administrativo de UHs bloqueadas ou em manutenção será criado posteriormente.",
    icon: BedDouble
  },
  {
    title: "Áreas comuns futuro",
    description: "Chamados e evidências de áreas comuns ficarão para sprint específica.",
    icon: Building2
  },
  {
    title: "Preventivas futuras",
    description: "Agenda de manutenção preventiva será organizada em etapa posterior.",
    icon: CalendarCheck
  }
];

export default function ManutencaoPage() {
  return (
    <ModuleDashboard
      title="Manutenção"
      description="Dashboard de entrada para chamados, quartos, áreas comuns e manutenção preventiva."
      cards={cards}
    />
  );
}
