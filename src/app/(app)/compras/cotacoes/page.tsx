import { PageTitle } from "@/components/common/page-title";
import { PurchaseQuotesClient } from "@/components/purchases/purchase-quotes-client";

export default function ComprasCotacoesPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Cotações" description="Gerencie as cotações das solicitações de compra." />
      <PurchaseQuotesClient />
    </div>
  );
}
