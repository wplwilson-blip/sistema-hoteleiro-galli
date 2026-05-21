import { PageTitle } from "@/components/common/page-title";
import { HrOperationalDashboardClient } from "@/components/hr/hr-operational-dashboard-client";

export default function RhPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Painel do RH"
        description="Visao das pendencias, prazos e decisoes do RH administrativo para a rotina diaria."
      />
      <HrOperationalDashboardClient />
    </div>
  );
}
