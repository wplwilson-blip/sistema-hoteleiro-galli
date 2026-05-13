import { PageTitle } from "@/components/common/page-title";
import { HrEmployeesClient } from "@/components/hr/hr-employees-client";

export default function RhEmployeesPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Colaboradores de RH"
        description="Consulta segura de colaboradores por unidade, com dados sensiveis protegidos pelas permissoes de RH."
      />
      <HrEmployeesClient />
    </div>
  );
}
