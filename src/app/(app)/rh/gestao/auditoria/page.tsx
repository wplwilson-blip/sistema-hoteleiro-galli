import { PageTitle } from "@/components/common/page-title";
import { HrAuditClient } from "@/components/hr/hr-audit-client";

export default function RhAuditoriaPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Historico e Auditoria do RH" description="Consulta gerencial dos registros e movimentacoes dos processos de RH." />
      <HrAuditClient />
    </div>
  );
}
