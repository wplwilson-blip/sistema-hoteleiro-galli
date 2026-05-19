import { PageTitle } from "@/components/common/page-title";
import { HrWorkflowDetailClient } from "@/components/hr/hr-workflow-detail-client";

export default function RhWorkflowDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Detalhe do Workflow RH"
        description="Dossie operacional read-only com etapas, SLA, escalation, timeline e auditoria."
      />
      <HrWorkflowDetailClient workflowId={params.id} />
    </div>
  );
}
