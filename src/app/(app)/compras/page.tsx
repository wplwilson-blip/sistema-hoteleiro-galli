import { ClipboardCheck, ClipboardList, FileCheck2, IdCard, ShoppingCart } from "lucide-react";
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
    title: "Aprovações",
    description: "Aprovação da compra será tratada na Sprint 5D, sem execução nesta etapa.",
    href: "/compras/aprovacoes",
    icon: ClipboardCheck,
    status: "Em breve" as const
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
    description: "Propostas, PDFs, imagens e documentos anexados às cotações ficam centralizados no fluxo.",
    icon: FileCheck2,
    status: "Disponível" as const
  }
];

export default function ComprasPage() {
  return (
    <ModuleDashboard
      title="Compras"
      description="Módulo para controlar solicitações, cotações, anexos, fornecedores e futura aprovação de compras internas."
      cards={cards}
    />
  );
}
