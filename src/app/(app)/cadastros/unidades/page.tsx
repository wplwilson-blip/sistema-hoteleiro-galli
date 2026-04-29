import { PageTitle } from "@/components/common/page-title";
import { UnitsClient } from "@/components/base-cadastros/units-client";

export default function UnidadesPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Unidades" description="Cadastro das unidades operacionais da rede Hotel Galli." />
      <UnitsClient />
    </div>
  );
}

