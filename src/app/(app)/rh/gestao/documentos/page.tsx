import { PageTitle } from "@/components/common/page-title";
import { HrDocumentRulesClient } from "@/components/hr/hr-document-rules-client";

export default function RhDocumentRulesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Regras documentais"
        description="Defina quando um documento passa a ser obrigatório por unidade, departamento, cargo ou tipo de admissão."
      />
      <HrDocumentRulesClient />
    </div>
  );
}
