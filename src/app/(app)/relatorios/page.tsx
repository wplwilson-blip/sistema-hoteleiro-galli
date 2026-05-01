import { BarChart3, ClipboardList, Landmark, ShieldCheck, ShoppingCart, Users, Utensils, Wrench } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Compras",
    description: "Relatórios de solicitações, cotações, fornecedores e aprovações serão ativados em próxima etapa.",
    icon: ShoppingCart,
    status: "Em breve" as const
  },
  {
    title: "RH",
    description: "Relatórios de colaboradores, documentos e treinamentos serão ativados em próxima etapa.",
    icon: Users,
    status: "Em breve" as const
  },
  {
    title: "Manutenção",
    description: "Relatórios de chamados, preventivas e pendências serão ativados em próxima etapa.",
    icon: Wrench,
    status: "Em breve" as const
  },
  {
    title: "Governança",
    description: "Relatórios de checklists, inspeções e ocorrências serão ativados em próxima etapa.",
    icon: ShieldCheck,
    status: "Em breve" as const
  },
  {
    title: "A&B",
    description: "Relatórios de requisições, estoque e produção serão ativados em próxima etapa.",
    icon: Utensils,
    status: "Em breve" as const
  },
  {
    title: "Contas a Pagar",
    description: "Relatórios de pagamentos, documentos e fornecedores serão ativados em próxima etapa.",
    icon: Landmark,
    status: "Em breve" as const
  },
  {
    title: "Indicadores gerais",
    description: "Painéis consolidados serão tratados em próxima etapa de dashboards.",
    icon: BarChart3,
    status: "Em breve" as const
  },
  {
    title: "Operação",
    description: "Visão administrativa por unidade, departamento e fluxo operacional será ativada em próxima etapa.",
    icon: ClipboardList,
    status: "Em breve" as const
  }
];

export default function RelatoriosPage() {
  return (
    <ModuleDashboard
      title="Relatórios"
      description="Entrada para relatórios administrativos e indicadores por módulo."
      cards={cards}
      columns="three"
    />
  );
}
