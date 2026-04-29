import { PageTitle } from "@/components/common/page-title";
import { UsersClient } from "@/components/base-cadastros/users-client";

export default function UsuariosPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Usuários internos" description="Gerencie os acessos dos colaboradores ao sistema administrativo." />
      <UsersClient />
    </div>
  );
}
