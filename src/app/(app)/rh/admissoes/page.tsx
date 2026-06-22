import { PageTitle } from "@/components/common/page-title";
import { HrAdmissionListClient } from "@/components/hr/hr-admission-list-client";

export default function RhAdmissionsPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Admissões" description="Fila operacional para acompanhar candidatos aprovados até o início do colaborador." />
      <HrAdmissionListClient />
    </div>
  );
}
