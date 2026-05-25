import { PageTitle } from "@/components/common/page-title";
import { HrManagementDashboardClient } from "@/components/hr/hr-management-dashboard-client";

export default function RhGestaoPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Gestão do RH" description="Hub administrativo para indicadores, auditoria, rotinas e configurações do RH." />
      <HrManagementDashboardClient />
    </div>
  );
}
