import { PageTitle } from "@/components/common/page-title";
import { HrEmployeesClient } from "@/components/hr/hr-employees-client";

export default function RhEmployeesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Colaboradores"
        description="Consulta operacional dos colaboradores por unidade, com dados sensíveis protegidos pelas permissões de RH."
      />
      <HrEmployeesClient />
    </div>
  );
}
