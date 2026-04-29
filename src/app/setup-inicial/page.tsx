import Image from "next/image";
import { redirect } from "next/navigation";
import { hasActiveSuperAdmin, InitialSetupCheckError } from "@/lib/auth/session";
import { InitialSetupForm } from "@/app/setup-inicial/setup-form";

export const dynamic = "force-dynamic";

export default async function InitialSetupPage() {
  let hasSuperAdmin: boolean;

  try {
    hasSuperAdmin = await hasActiveSuperAdmin();
  } catch (error) {
    if (error instanceof InitialSetupCheckError) {
      return <SetupCheckUnavailable />;
    }

    throw error;
  }

  if (hasSuperAdmin) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_560px]">
        <section className="relative hidden overflow-hidden bg-primary px-12 py-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <Image src="/brand/login-bg.png" alt="" fill priority sizes="calc(100vw - 560px)" className="object-cover" />
          <div className="absolute inset-0 bg-primary/80" />
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(7,44,48,0.92)_0%,rgba(7,44,48,0.62)_52%,rgba(7,44,48,0.84)_100%)]" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/95 p-2 shadow-lg">
              <Image src="/brand/logo.png" alt="Hotel Galli" width={42} height={42} className="h-auto w-auto" />
            </div>
            <div>
              <p className="text-lg font-semibold">Hotel Galli</p>
              <p className="text-xs uppercase tracking-[0.18em] text-primary-foreground/70">Setup inicial</p>
            </div>
          </div>

          <div className="relative max-w-2xl pb-8">
            <h1 className="text-4xl font-semibold leading-tight">Crie o primeiro Super Admin da rede.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-primary-foreground/78">
              Este fluxo fica disponivel apenas enquanto nao houver Super Admin ativo no sistema.
            </p>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-6 py-10">
          <div className="absolute inset-x-0 top-0 h-40 bg-primary/5 lg:hidden" />
          <InitialSetupForm />
        </section>
      </div>
    </main>
  );
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
