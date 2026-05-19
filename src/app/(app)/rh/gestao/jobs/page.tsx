import { PageTitle } from "@/components/common/page-title";
import { HrBackgroundJobsClient } from "@/components/hr/hr-background-jobs-client";

export default function RhJobsPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Monitoramento de Jobs RH" description="Acompanhamento read-only dos jobs background de RH." />
      <HrBackgroundJobsClient />
    </div>
  );
}
