import { PageTitle } from "@/components/common/page-title";
import { HrWorkflowDetailClient } from "@/components/hr/hr-workflow-detail-client";

export default function RhWorkflowDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Detalhe do Processo de RH"
        description="Resumo operacional com etapas, prazos, historico e registros de auditoria."
      />
      <HrWorkflowDetailClient workflowId={params.id} />
    </div>
  );
}
