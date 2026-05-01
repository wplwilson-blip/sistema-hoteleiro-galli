import { BarChart3, ClipboardList, Landmark, ShieldCheck, ShoppingCart, Users, Utensils, Wrench } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Compras",
    description: "Relatórios futuros de solicitações, cotações, fornecedores e aprovações.",
    icon: ShoppingCart
  },
  {
    title: "RH",
    description: "Relatórios futuros de colaboradores, documentos e treinamentos.",
    icon: Users
  },
  {
    title: "Manutenção",
    description: "Relatórios futuros de chamados, preventivas e pendências.",
    icon: Wrench
  },
  {
    title: "Governança",
    description: "Relatórios futuros de checklists, inspeções e ocorrências.",
    icon: ShieldCheck
  },
  {
    title: "A&B",
    description: "Relatórios futuros de requisições, estoque e produção.",
    icon: Utensils
  },
  {
    title: "Contas a Pagar",
    description: "Relatórios futuros de pagamentos, documentos e fornecedores.",
    icon: Landmark
  },
  {
    title: "Indicadores gerais",
    description: "Painéis consolidados serão tratados em sprint específica de dashboards.",
    icon: BarChart3
  },
  {
    title: "Operação",
    description: "Visão administrativa por unidade, departamento e fluxo operacional.",
    icon: ClipboardList
  }
];

export default function RelatoriosPage() {
  return (
    <ModuleDashboard
      title="Relatórios"
      description="Dashboard de entrada para relatórios administrativos e indicadores futuros por módulo."
      cards={cards}
      columns="three"
    />
  );
}
