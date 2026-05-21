import { PageTitle } from "@/components/common/page-title";
import { HrBackgroundJobsClient } from "@/components/hr/hr-background-jobs-client";

export default function RhJobsPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Rotinas Automaticas do RH" description="Monitoramento das rotinas automaticas e processamentos internos do RH." />
      <HrBackgroundJobsClient />
    </div>
  );
}
