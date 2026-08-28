import { Suspense } from "react";
import { PageTitle } from "@/components/common/page-title";
import { LoadingTable } from "@/components/base-cadastros/crud-components";
import { RoomsClient } from "@/components/base-cadastros/rooms-client";

export default function ApartamentosPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Apartamentos" description="Consulte os apartamentos (UHs) da unidade ativa, em lista ou no mapa por andar e ala." />
      {/* <Suspense> obrigatorio: RoomsClient usa useSearchParams (a aba vive na URL), e no
          App Router isso exige limite de suspensao -- sem ele o build acusa "bail out to
          client-side rendering" e a rota inteira deixa de ser pre-renderizada. */}
      <Suspense fallback={<LoadingTable label="Carregando apartamentos..." />}>
        <RoomsClient />
      </Suspense>
    </div>
  );
}
