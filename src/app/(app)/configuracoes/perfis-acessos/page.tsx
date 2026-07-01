import { redirect } from "next/navigation";
import { getCurrentSessionContext } from "@/lib/auth/session";
import { canDo } from "@/lib/auth/permissions-ui";
import { PerfisAcessosClient } from "@/components/admin/perfis-acessos-client";

export const dynamic = "force-dynamic";

// Fase 3-A: page-guard (defesa em profundidade). O gate real esta nas 3 APIs (requirePermission).
// Aqui reusamos as permissoes ja expostas no SessionContext (Fase 1) para redirecionar quem nao pode.
export default async function PerfisAcessosPage() {
  const sessionContext = await getCurrentSessionContext();

  if (!sessionContext) {
    redirect("/login");
  }

  if (!canDo(sessionContext.permissions, "ADMIN:permissions.view")) {
    redirect("/dashboard");
  }

  return <PerfisAcessosClient />;
}
