import { AlertTriangle, Bed, ClipboardCheck, FileClock, ShoppingCart, Workflow } from "lucide-react";
import { PageTitle } from "@/components/common/page-title";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ModuleCard } from "@/components/common/module-card";

const stats = [
  { title: "Aprovações pendentes", value: "18", icon: ClipboardCheck, tone: "warning" as const },
  { title: "Solicitações abertas", value: "42", icon: Workflow, tone: "info" as const },
  { title: "Chamados críticos", value: "7", icon: AlertTriangle, tone: "danger" as const },
  { title: "UHs bloqueadas", value: "11", icon: Bed, tone: "neutral" as const },
  { title: "Documentos vencendo", value: "9", icon: FileClock, tone: "warning" as const },
  { title: "Compras em aprovação", value: "14", icon: ShoppingCart, tone: "info" as const }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Dashboard"
        description="Visão consolidada fictícia para acompanhamento inicial da rede e unidades."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-border/80 bg-card p-5 shadow-sm shadow-primary/5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Fluxo operacional</h2>
            <StatusBadge status="visual" label="Sprint 1" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ModuleCard title="Solicitações" description="Fila visual de demandas internas." status="Aberto" />
            <ModuleCard title="Aprovações" description="Pendências por perfil e alçada." status="Pendente" />
            <ModuleCard title="Evidências" description="Base futura para anexos e execução." status="Previsto" />
          </div>
        </div>

        <div className="rounded-lg border border-border/80 bg-card p-5 shadow-sm shadow-primary/5">
          <h2 className="mb-4 text-base font-semibold">Alertas fictícios</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/70 px-3 py-2">
              <span>Unidade ativa com documentos vencendo</span>
              <StatusBadge status="warning" label="Atenção" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/70 px-3 py-2">
              <span>Chamados críticos aguardando execução</span>
              <StatusBadge status="danger" label="Crítico" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
