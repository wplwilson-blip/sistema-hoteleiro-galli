import { PageTitle } from "@/components/common/page-title";
import { HrCandidateListClient } from "@/components/hr/hr-candidate-list-client";

export default function RhVagaCandidatosPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Candidatos da Vaga" description="Lista operacional de candidatos vinculados a uma solicitacao de vaga." />
      <HrCandidateListClient workflowId={params.id} />
    </div>
  );
}
