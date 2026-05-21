import { PageTitle } from "@/components/common/page-title";
import { HrWorkflowInboxClient } from "@/components/hr/hr-workflow-inbox-client";

export default function RhInboxPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Fila de RH"
        description="Processos de RH que precisam de acompanhamento, decisao ou ajuste operacional."
      />
      <HrWorkflowInboxClient />
    </div>
  );
}
