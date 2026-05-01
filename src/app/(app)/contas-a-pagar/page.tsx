import { ClipboardCheck, FileClock, IdCard, Landmark } from "lucide-react";
import { ModuleDashboard } from "@/components/common/module-dashboard";

const cards = [
  {
    title: "Pagamentos",
    description: "Controle administrativo de pagamentos será tratado sem virar financeiro completo.",
    icon: Landmark,
    status: "Em breve" as const
  },
  {
    title: "Aprovações de pagamento",
    description: "Aprovações de pagamento serão organizadas em próxima etapa.",
    icon: ClipboardCheck,
    status: "Em breve" as const
  },
  {
    title: "Documentos pendentes",
    description: "Documentos fiscais e pendências de pagamento serão estruturados em próxima etapa.",
    icon: FileClock,
    status: "Em breve" as const
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
      description="Entrada para pagamentos administrativos, aprovações e documentos pendentes."
      cards={cards}
    />
  );
}
