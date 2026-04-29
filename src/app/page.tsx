import { redirect } from "next/navigation";
import { getCurrentSessionContext, hasActiveSuperAdmin, InitialSetupCheckError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  let hasSuperAdmin: boolean;

  try {
    hasSuperAdmin = await hasActiveSuperAdmin();
  } catch (error) {
    if (error instanceof InitialSetupCheckError) {
      return <SetupCheckUnavailable />;
    }

    throw error;
  }

  if (!hasSuperAdmin) {
    redirect("/setup-inicial");
  }

  const sessionContext = await getCurrentSessionContext();

  if (sessionContext) {
    redirect("/dashboard");
  }

  redirect("/login");
}

function SetupCheckUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Setup inicial indisponivel</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Nao foi possivel verificar o setup inicial agora. Revise a configuracao do servidor e tente novamente.
        </p>
      </div>
    </main>
  );
}
