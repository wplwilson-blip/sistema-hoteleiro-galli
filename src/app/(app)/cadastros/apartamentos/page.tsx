import { PageTitle } from "@/components/common/page-title";
import { RoomsClient } from "@/components/base-cadastros/rooms-client";

export default function ApartamentosPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Apartamentos" description="Consulte os apartamentos (UHs) da unidade ativa, com tipo, ala, andar e situação." />
      <RoomsClient />
    </div>
  );
}
