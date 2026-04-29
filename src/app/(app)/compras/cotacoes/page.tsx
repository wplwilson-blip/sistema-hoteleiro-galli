import { PageTitle } from "@/components/common/page-title";
import { PurchaseQuotesClient } from "@/components/purchases/purchase-quotes-client";

export default function ComprasCotacoesPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Cota\u00e7\u00f5es" description="Gerencie as cota\u00e7\u00f5es das solicita\u00e7\u00f5es de compra." />
      <PurchaseQuotesClient />
    </div>
  );
}
