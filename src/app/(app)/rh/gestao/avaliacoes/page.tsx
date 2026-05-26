import { PageTitle } from "@/components/common/page-title";
import { HrEvaluationTemplatesClient } from "@/components/hr/hr-evaluation-templates-client";

export default function RhEvaluationTemplatesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Modelos de avaliacao"
        description="Cadastro operacional de modelos, secoes e criterios usados nas avaliacoes do RH."
      />
      <HrEvaluationTemplatesClient />
    </div>
  );
}
