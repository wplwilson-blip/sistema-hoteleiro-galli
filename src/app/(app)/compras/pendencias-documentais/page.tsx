import { PageTitle } from "@/components/common/page-title";
import { PurchaseDocumentationDashboardClient } from "@/components/purchases/purchase-documentation-dashboard-client";

export default function PendenciasDocumentaisCotacoesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Pendências Documentais de Cotações"
        description="Visão gerencial de evidências, regularizações e riscos documentais das cotações."
      />
      <PurchaseDocumentationDashboardClient />
    </div>
  );
}
