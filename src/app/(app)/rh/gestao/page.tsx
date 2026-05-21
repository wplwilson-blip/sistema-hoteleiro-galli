import { PageTitle } from "@/components/common/page-title";
import { HrManagementDashboardClient } from "@/components/hr/hr-management-dashboard-client";

export default function RhGestaoPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Gestão RH" description="Visão gerencial dos processos, prazos, gargalos e saúde operacional do RH." />
      <HrManagementDashboardClient />
    </div>
  );
}
