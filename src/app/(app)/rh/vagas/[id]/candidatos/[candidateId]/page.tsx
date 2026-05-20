import { PageTitle } from "@/components/common/page-title";
import { HrCandidateDetailClient } from "@/components/hr/hr-candidate-detail-client";

export default function RhCandidatoDetalhePage({ params }: { params: { id: string; candidateId: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Detalhe do Candidato" description="Status, entrevistas, score manual e parecer humano do candidato." />
      <HrCandidateDetailClient workflowId={params.id} candidateId={params.candidateId} />
    </div>
  );
}
