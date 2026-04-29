"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SessionContext } from "@/lib/auth/types";
import { useAppStore } from "@/store/app-store";

export function AppProviders({ children, sessionContext }: { children: React.ReactNode; sessionContext?: SessionContext | null }) {
  const [queryClient] = useState(() => new QueryClient());
  const setSessionContext = useAppStore((state) => state.setSessionContext);

  useEffect(() => {
    if (sessionContext) {
      setSessionContext(sessionContext);
    }
  }, [sessionContext, setSessionContext]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
