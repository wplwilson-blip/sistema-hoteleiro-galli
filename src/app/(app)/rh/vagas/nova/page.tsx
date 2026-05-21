import { PageTitle } from "@/components/common/page-title";
import { HrJobOpeningCreateClient } from "@/components/hr/hr-job-opening-create-client";

export default function RhNovaVagaPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Nova Vaga" description="Abertura formal de solicitacao de vaga para acompanhamento do RH." />
      <HrJobOpeningCreateClient />
    </div>
  );
}
