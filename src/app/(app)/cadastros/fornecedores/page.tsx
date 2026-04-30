import { PageTitle } from "@/components/common/page-title";
import { SuppliersClient } from "@/components/base-cadastros/suppliers-client";

export default function FornecedoresPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Fornecedores" description="Cadastre e mantenha fornecedores ativos para compras e cotações." />
      <SuppliersClient />
    </div>
  );
}
