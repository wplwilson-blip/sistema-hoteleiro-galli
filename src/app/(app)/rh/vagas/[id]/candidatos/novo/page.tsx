import { PageTitle } from "@/components/common/page-title";
import { HrCandidateCreateClient } from "@/components/hr/hr-candidate-create-client";

export default function RhNovoCandidatoPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle title="Novo Candidato" description="Cadastro leve de candidato para solicitacao de vaga, sem admissao automatica." />
      <HrCandidateCreateClient workflowId={params.id} />
    </div>
  );
}
