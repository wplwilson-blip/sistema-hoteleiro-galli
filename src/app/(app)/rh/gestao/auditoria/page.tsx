import { PageTitle } from "@/components/common/page-title";
import { HrAuditClient } from "@/components/hr/hr-audit-client";

export default function RhAuditoriaPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Histórico e Auditoria do RH" description="Consulta gerencial dos registros e movimentações dos processos de RH." />
      <HrAuditClient />
    </div>
  );
}
