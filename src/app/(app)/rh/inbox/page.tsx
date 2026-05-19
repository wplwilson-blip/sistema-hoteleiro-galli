import { PageTitle } from "@/components/common/page-title";
import { HrWorkflowInboxClient } from "@/components/hr/hr-workflow-inbox-client";

export default function RhInboxPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Inbox Operacional RH"
        description="Fila diaria de workflows, SLAs e pendencias do RH administrativo."
      />
      <HrWorkflowInboxClient />
    </div>
  );
}
