import { PageTitle } from "@/components/common/page-title";
import { PurchaseRequestsClient } from "@/components/purchases/purchase-requests-client";

export default function SolicitacoesComprasPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Solicitações de compra"
        description="Registre e acompanhe as necessidades de compra das unidades e departamentos."
      />
      <PurchaseRequestsClient />
    </div>
  );
}

