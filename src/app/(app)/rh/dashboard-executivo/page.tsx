import { PageTitle } from "@/components/common/page-title";
import { HrExecutiveDashboardClient } from "@/components/hr/hr-executive-dashboard-client";

export default function RhExecutiveDashboardPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Dashboard Executivo RH"
        description="Indicadores, riscos por unidade/departamento e leitura gerencial para Andreia e Wilson."
      />
      <HrExecutiveDashboardClient mode="executive" />
    </div>
  );
}
