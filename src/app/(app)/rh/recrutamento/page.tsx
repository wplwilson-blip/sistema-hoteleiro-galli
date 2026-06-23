import { PageTitle } from "@/components/common/page-title";
import { HrRecruitmentDashboardClient } from "@/components/hr/hr-recruitment-dashboard-client";

export default function RhRecruitmentDashboardPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Dashboard de Recrutamento" description="Visão operacional de vagas, candidatos, entrevistas, decisões e admissões." />
      <HrRecruitmentDashboardClient />
    </div>
  );
}
