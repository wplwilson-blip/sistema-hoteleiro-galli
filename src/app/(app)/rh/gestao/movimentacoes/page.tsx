import { PageTitle } from "@/components/common/page-title";
import { HrMovementsClient } from "@/components/hr/hr-movements-client";

export default function RhMovementsPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Movimentações Funcionais"
        description="Controle operacional de carreira: promoções, transferências e mudanças administrativas do colaborador."
      />
      <HrMovementsClient />
    </div>
  );
}
