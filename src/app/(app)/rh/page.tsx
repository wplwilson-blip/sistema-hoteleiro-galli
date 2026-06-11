import { PageTitle } from "@/components/common/page-title";
import { HrExecutiveDashboardClient } from "@/components/hr/hr-executive-dashboard-client";

export default function RhPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Painel do RH"
        description="Rotina diaria da Viviane: pendencias criticas, proximas acoes e caminhos rapidos para resolver o que precisa de atencao hoje."
      />
      <HrExecutiveDashboardClient />
    </div>
  );
}
