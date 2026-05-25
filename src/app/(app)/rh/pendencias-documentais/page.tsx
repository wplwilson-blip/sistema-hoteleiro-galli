import { PageTitle } from "@/components/common/page-title";
import { HrDocumentPendenciesClient } from "@/components/hr/hr-document-pendencies-client";

export default function RhDocumentPendenciesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Documentos"
        description="Fila operacional para acompanhar pendências documentais, vencimentos, rejeições e conferências."
      />
      <HrDocumentPendenciesClient />
    </div>
  );
}
