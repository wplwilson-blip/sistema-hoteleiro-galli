import { PageTitle } from "@/components/common/page-title";
import { HrOperationalDashboardClient } from "@/components/hr/hr-operational-dashboard-client";

export default function RhPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="RH Operacional"
        description="Visao de pendencias, workflows e SLAs para acompanhamento diario do RH administrativo."
      />
      <HrOperationalDashboardClient />
    </div>
  );
}
