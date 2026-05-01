import { ClipboardList, Package, Soup, MessageSquareWarning } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Requisições",
    description: "Requisições internas de A&B serão criadas em próxima etapa.",
    icon: ClipboardList,
    status: "Em breve" as const
  },
  {
    title: "Estoque",
    description: "Visão administrativa de estoque será organizada em próxima etapa.",
    icon: Package,
    status: "Em breve" as const
  },
  {
    title: "Produção",
    description: "Controles de produção e rotinas de cozinha serão planejados em próxima etapa.",
    icon: Soup,
    status: "Em breve" as const
  },
  {
    title: "Ocorrências",
    description: "Ocorrências operacionais de A&B serão registradas em próxima etapa.",
    icon: MessageSquareWarning,
    status: "Em breve" as const
  }
];

export default function AbPage() {
  return (
    <ModuleDashboard
      title="A&B"
      description="Entrada para requisições, estoque, produção e ocorrências de alimentos e bebidas."
      cards={cards}
    />
  );
}
