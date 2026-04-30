import { ClipboardCheck, FileClock, IdCard, Landmark } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Pagamentos futuros",
    description: "Controle administrativo de pagamentos será tratado sem virar financeiro completo.",
    icon: Landmark
  },
  {
    title: "Aprovações futuras",
    description: "Aprovações de pagamento serão organizadas em sprint própria.",
    icon: ClipboardCheck
  },
  {
    title: "Documentos pendentes futuros",
    description: "Documentos fiscais e pendências de pagamento serão estruturados depois.",
    icon: FileClock
  },
  {
    title: "Fornecedores",
    description: "Acesso ao cadastro de fornecedores já disponível no Módulo Base.",
    href: "/cadastros/fornecedores",
    icon: IdCard,
    status: "Cadastro" as const
  }
];

export default function ContasAPagarPage() {
  return (
    <ModuleDashboard
      title="Contas a Pagar"
      description="Dashboard de entrada para pagamentos futuros, aprovações e documentos pendentes."
      cards={cards}
    />
  );
}
