import { PageTitle } from "@/components/common/page-title";
import { HrTrainingsClient } from "@/components/hr/hr-trainings-client";

export default function HrTrainingsPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Treinamentos"
        description="Catalogo, atribuicoes, presenca, certificados e vencimentos de treinamentos do RH."
      />
      <HrTrainingsClient />
    </div>
  );
}
