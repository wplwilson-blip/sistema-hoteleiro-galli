import { PageTitle } from "@/components/common/page-title";
import { HrOnboardingDashboardClient } from "@/components/hr/hr-onboarding-dashboard-client";

export default function RhOnboardingPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Onboarding"
        description="Fila operacional para acompanhar liberações, bloqueios, pendências críticas e próximos passos dos colaboradores."
      />
      <HrOnboardingDashboardClient />
    </div>
  );
}
