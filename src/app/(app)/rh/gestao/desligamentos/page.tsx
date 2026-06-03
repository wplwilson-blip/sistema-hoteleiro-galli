import { PageTitle } from "@/components/common/page-title";
import { HrTerminationsClient } from "@/components/hr/hr-terminations-client";

export default function HrTerminationsPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Desligamentos"
        description="Solicitacoes, checklist, pendencias, aprovacao e efetivacao administrativa de desligamentos."
      />
      <HrTerminationsClient />
    </div>
  );
}
