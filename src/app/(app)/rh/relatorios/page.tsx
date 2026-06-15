import { PageTitle } from "@/components/common/page-title";
import { HrExecutiveDashboardClient } from "@/components/hr/hr-executive-dashboard-client";

export default function RhReportsPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Relatórios RH"
        description="Filtros, consultas e exportacoes CSV para conferencia operacional do RH."
      />
      <HrExecutiveDashboardClient mode="reports" />
    </div>
  );
}
