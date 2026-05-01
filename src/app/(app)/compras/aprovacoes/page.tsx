import { PageTitle } from "@/components/common/page-title";
import { PurchaseApprovalsClient } from "@/components/purchases/purchase-approvals-client";

export default function AprovacoesComprasPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Aprovações de compras"
        description="Compras com cotação vencedora aguardando decisão de aprovação."
      />
      <PurchaseApprovalsClient />
    </div>
  );
}
