import { PageTitle } from "@/components/common/page-title";
import { HrJobOpeningListClient } from "@/components/hr/hr-job-opening-list-client";

export default function RhVagasPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Vagas e candidatos" description="Acompanhamento das solicitações de vaga, candidatos, prazos e aprovações." />
      <HrJobOpeningListClient />
    </div>
  );
}
