import { PageTitle } from "@/components/common/page-title";
import { HrConductClient } from "@/components/hr/hr-conduct-client";

export default function HrConductPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Conduta e Ocorrencias"
        description="Advertencias, suspensoes, reclamacoes, elogios, orientacoes e conversas formais do RH."
      />
      <HrConductClient />
    </div>
  );
}
