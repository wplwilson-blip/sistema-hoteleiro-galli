import { PageTitle } from "@/components/common/page-title";
import { HrOccupationalHealthClient } from "@/components/hr/hr-occupational-health-client";

export default function HrOccupationalHealthPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Saude Ocupacional"
        description="ASOs, exames ocupacionais, restricoes, certificacoes NR e vencimentos do RH."
      />
      <HrOccupationalHealthClient />
    </div>
  );
}
