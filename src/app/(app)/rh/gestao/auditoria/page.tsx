import { PageTitle } from "@/components/common/page-title";
import { HrAuditClient } from "@/components/hr/hr-audit-client";

export default function RhAuditoriaPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Auditoria RH" description="Consulta gerencial de eventos auditaveis dos workflows de RH." />
      <HrAuditClient />
    </div>
  );
}
