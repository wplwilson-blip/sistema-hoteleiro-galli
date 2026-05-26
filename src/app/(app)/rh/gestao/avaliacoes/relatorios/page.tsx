import { PageTitle } from "@/components/common/page-title";
import { HrEvaluationReportsClient } from "@/components/hr/hr-evaluation-reports-client";

export default function RhEvaluationReportsPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Relatórios de avaliações" description="Acompanhamento operacional de avaliações, devolutivas, ciência e PDIs vinculados." />
      <HrEvaluationReportsClient />
    </div>
  );
}
