import { PageTitle } from "@/components/common/page-title";
import { HrEmployeeDetailClient } from "@/components/hr/hr-employee-detail-client";

export default function RhEmployeeDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Prontuario administrativo"
        description="Visualizacao segura do resumo funcional, documentos logicos e historico administrativo do colaborador."
      />
      <HrEmployeeDetailClient employeeId={params.id} />
    </div>
  );
}
