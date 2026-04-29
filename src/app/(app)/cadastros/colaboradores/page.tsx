import { PageTitle } from "@/components/common/page-title";
import { EmployeesClient } from "@/components/base-cadastros/employees-client";

export default function ColaboradoresPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Colaboradores" description="Gerencie os colaboradores vinculados a estrutura administrativa da rede." />
      <EmployeesClient />
    </div>
  );
}

