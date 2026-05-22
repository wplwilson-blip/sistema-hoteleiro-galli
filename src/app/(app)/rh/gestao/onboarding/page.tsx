import { PageTitle } from "@/components/common/page-title";
import { HrOnboardingPlansClient } from "@/components/hr/hr-onboarding-plans-client";

export default function RhOnboardingPlansPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Planos de onboarding"
        description="Crie checklists padrao para liberar colaboradores por unidade, departamento, cargo e rotina operacional."
      />
      <HrOnboardingPlansClient />
    </div>
  );
}
