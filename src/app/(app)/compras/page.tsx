import { ClipboardCheck, ClipboardList, FileCheck2, FileWarning, IdCard, ShoppingCart } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Solicitações de Compra",
    description: "Abrir e acompanhar solicitações de compra internas por unidade e departamento.",
    href: "/compras/solicitacoes",
    icon: ClipboardList
  },
  {
    title: "Cotações",
    description: "Registrar cotações, comparar propostas e acompanhar anexos enviados por fornecedores.",
    href: "/compras/cotacoes",
    icon: ShoppingCart
  },
  {
    title: "Pendências Documentais",
    description: "Acompanhar evidências críticas, regularizações, anexos ausentes e riscos documentais das cotações.",
    href: "/compras/pendencias-documentais",
    icon: FileWarning
  },
  {
    title: "Aprovações",
    description: "Analisar compras com cotação vencedora, registrar aprovação, reprovação ou devolução para revisão.",
    href: "/compras/aprovacoes",
    icon: ClipboardCheck
  },
  {
    title: "Fornecedores",
    description: "Acessar o cadastro de fornecedores usado nas compras e cotações.",
    href: "/cadastros/fornecedores",
    icon: IdCard,
    status: "Cadastro" as const
  },
  {
    title: "Evidências e documentos",
    description: "Abrir a visão documental para acompanhar evidências, anexos e regularizações das cotações.",
    href: "/compras/pendencias-documentais",
    icon: FileCheck2,
    status: "Disponível" as const
  }
];

export default function ComprasPage() {
  return (
    <ModuleDashboard
      title="Compras"
      description="Módulo para controlar solicitações, cotações, anexos, fornecedores e aprovações de compras internas."
      cards={cards}
    />
  );
}
