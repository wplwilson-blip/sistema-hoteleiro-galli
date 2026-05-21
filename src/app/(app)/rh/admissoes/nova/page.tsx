import { PageTitle } from "@/components/common/page-title";
import { HrAdmissionCreateClient } from "@/components/hr/hr-admission-create-client";

export default function RhNovaAdmissaoPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Nova Admissao" description="Abertura administrativa de admissao, sem cadastro automatico de colaborador." />
      <HrAdmissionCreateClient />
    </div>
  );
}
