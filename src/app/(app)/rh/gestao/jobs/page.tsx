import { PageTitle } from "@/components/common/page-title";
import { HrBackgroundJobsClient } from "@/components/hr/hr-background-jobs-client";

export default function RhJobsPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Rotinas automáticas do RH" description="Monitoramento das rotinas automáticas e processamentos internos do RH." />
      <HrBackgroundJobsClient />
    </div>
  );
}
