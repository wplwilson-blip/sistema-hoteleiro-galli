"use client";

import { BedDouble, Building2, ClipboardList, CalendarCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";
import { useAppStore } from "@/store/app-store";
import { canDo } from "@/lib/auth/permissions-ui";

const baseCards = [
  {
    title: "Chamados",
    description: "Abertura e acompanhamento de chamados de manutenção serão ativados em próxima etapa.",
    icon: ClipboardList,
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

// Porta OPERACIONAL do mapa de apartamentos. Substitui o card placeholder "Quartos em
// manutencao" (Em breve): era a mesma intencao, com o mesmo icone, e manter os dois deixaria
// a tela com duas portas quase iguais -- uma funcionando e outra prometendo.
const roomsMapCard = {
  title: "Mapa de Apartamentos",
  description: "Veja os apartamentos por andar e ala, com situação, tipo e comodidades.",
  icon: BedDouble,
  href: "/cadastros/apartamentos?view=mapa",
  status: "Disponível" as const
};

export default function ManutencaoPage() {
  // Filtro de UI apenas -- o servidor barra de qualquer forma. Ver comentario equivalente em
  // governanca/page.tsx.
  const permissions = useAppStore((state) => state.permissions);
  const cards = canDo(permissions, "BASE:rooms.view") ? [roomsMapCard, ...baseCards] : baseCards;

  return (
    <ModuleDashboard
      title="Manutenção"
      description="Entrada para o mapa de apartamentos, chamados, áreas comuns e manutenção preventiva."
      cards={cards}
    />
  );
}
