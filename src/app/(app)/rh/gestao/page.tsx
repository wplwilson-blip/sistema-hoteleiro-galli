import { PageTitle } from "@/components/common/page-title";
import { HrManagementDashboardClient } from "@/components/hr/hr-management-dashboard-client";

export default function RhGestaoPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Gestao RH" description="Visao gerencial de workflows, SLAs, gargalos e saude operacional do RH." />
      <HrManagementDashboardClient />
    </div>
  );
}
