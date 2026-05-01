import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppProviders } from "@/components/providers/app-providers";
import { getCurrentSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionContext = await getCurrentSessionContext();

  if (!sessionContext) {
    redirect("/login");
  }

  return (
    <AppProviders sessionContext={sessionContext}>
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-5 lg:px-6 xl:px-8">{children}</main>
        </div>
      </div>
    </AppProviders>
  );
}
