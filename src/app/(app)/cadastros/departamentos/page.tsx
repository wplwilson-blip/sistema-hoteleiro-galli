import { PageTitle } from "@/components/common/page-title";
import { DepartmentsClient } from "@/components/base-cadastros/departments-client";

export default function DepartamentosPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Departamentos"
        description="Cadastro de departamentos por unidade. REC pode ser cadastrado manualmente quando a unidade precisar de Recepção."
      />
      <DepartmentsClient />
    </div>
  );
}

