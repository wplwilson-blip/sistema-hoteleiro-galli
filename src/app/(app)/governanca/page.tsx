"use client";

import { BedDouble, ClipboardCheck, ListChecks, MessageSquareWarning, UserRoundCheck } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";
import { useAppStore } from "@/store/app-store";
import { canDo } from "@/lib/auth/permissions-ui";

const baseCards = [
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

// Porta OPERACIONAL do mapa de apartamentos: mesma tela de Cadastros, aberta direto na aba
// mapa. Nao ha' rota propria nem duplicacao de CRUD -- e' o mesmo componente e o mesmo GET.
const roomsMapCard = {
  title: "Mapa de Apartamentos",
  description: "Veja os apartamentos por andar e ala, com situação, tipo e comodidades.",
  icon: BedDouble,
  href: "/cadastros/apartamentos?view=mapa",
  status: "Disponível" as const
};

export default function GovernancaPage() {
  // Filtro de UI apenas -- o servidor barra de qualquer forma. Mas mostrar uma porta que
  // responde 403 ao ser aberta contraria o principio de navegacao do CORE-EMP-02 (§2): o
  // sistema leva o trabalho ate' o usuario, nao oferece caminho que nao leva a lugar nenhum.
  const permissions = useAppStore((state) => state.permissions);
  const cards = canDo(permissions, "BASE:rooms.view") ? [roomsMapCard, ...baseCards] : baseCards;

  return (
    <ModuleDashboard
      title="Governança"
      description="Entrada para o mapa de apartamentos, checklists, inspeções, equipes e ocorrências da governança."
      cards={cards}
    />
  );
}
