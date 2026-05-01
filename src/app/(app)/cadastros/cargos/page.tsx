import { PageTitle } from "@/components/common/page-title";
import { JobPositionsClient } from "@/components/base-cadastros/job-positions-client";

export default function CargosPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Cargos" description="Cadastro de cargos por unidade e departamento, com marcação simples de liderança." />
      <JobPositionsClient />
    </div>
  );
}

