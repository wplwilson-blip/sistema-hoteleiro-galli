import { PageTitle } from "@/components/common/page-title";
import { HrExecutiveDashboardClient } from "@/components/hr/hr-executive-dashboard-client";

export default function RhPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Painel do RH"
        description="Situacao geral, riscos, acoes prioritarias e caminhos rapidos para a rotina diaria do RH."
      />
      <HrExecutiveDashboardClient />
    </div>
  );
}
