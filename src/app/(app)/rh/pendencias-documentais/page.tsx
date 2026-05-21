import { PageTitle } from "@/components/common/page-title";
import { HrDocumentPendenciesClient } from "@/components/hr/hr-document-pendencies-client";

export default function RhDocumentPendenciesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Pendências documentais"
        description="Fila operacional para acompanhar documentos faltantes, vencidos, rejeitados e aguardando conferência."
      />
      <HrDocumentPendenciesClient />
    </div>
  );
}
