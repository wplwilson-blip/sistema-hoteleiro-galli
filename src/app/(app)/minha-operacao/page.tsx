import { Bell, CheckSquare, ClipboardList, ShieldCheck, Wrench } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ModuleCard } from "@/components/common/module-card";
import { PageTitle } from "@/components/common/page-title";

const items = [
  { title: "Minhas pendências", description: "3 itens aguardando ação do usuário fictício.", icon: CheckSquare },
  { title: "Minhas solicitações", description: "8 solicitações abertas ou em acompanhamento.", icon: ClipboardList },
  { title: "Minhas aprovações", description: "5 aprovações pendentes na unidade ativa.", icon: ShieldCheck },
  { title: "Meus chamados", description: "2 chamados críticos vinculados ao usuário.", icon: Wrench },
  { title: "Minhas notificações", description: "6 notificações in-app não lidas.", icon: Bell }
];

export default function MinhaOperacaoPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Minha Operação"
        description="Resumo visual fictício das filas vinculadas ao usuário, unidade e perfil ativos."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <ModuleCard key={item.title} title={item.title} description={item.description} icon={item.icon} status="Simulado" />
        ))}
      </section>

      <EmptyState
        title="Nenhuma integração real nesta sprint"
        description="Os dados desta página são fictícios. Banco, RLS, workflow real e autenticação ficam para sprints futuras."
      />
    </div>
  );
}
