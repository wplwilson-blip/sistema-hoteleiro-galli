import { ClipboardList, Package, Soup, MessageSquareWarning } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Requisições futuras",
    description: "Requisições internas de A&B serão criadas em sprint futura.",
    icon: ClipboardList
  },
  {
    title: "Estoque futuro",
    description: "Visão administrativa de estoque ficará para etapa posterior.",
    icon: Package
  },
  {
    title: "Produção futura",
    description: "Controles de produção e rotinas de cozinha serão planejados depois.",
    icon: Soup
  },
  {
    title: "Ocorrências futuras",
    description: "Ocorrências operacionais de A&B serão registradas em sprint futura.",
    icon: MessageSquareWarning
  }
];

export default function AbPage() {
  return (
    <ModuleDashboard
      title="A&B"
      description="Dashboard de entrada para requisições, estoque, produção e ocorrências de alimentos e bebidas."
      cards={cards}
    />
  );
}
