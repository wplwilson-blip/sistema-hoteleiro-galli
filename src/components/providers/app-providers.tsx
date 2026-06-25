"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { SessionContext } from "@/lib/auth/types";
import { useAppStore } from "@/store/app-store";

export function AppProviders({ children, sessionContext }: { children: React.ReactNode; sessionContext?: SessionContext | null }) {
  const [queryClient] = useState(() => new QueryClient());
  const setSessionContext = useAppStore((state) => state.setSessionContext);

  // Seed SINCRONO no 1o render: garante que filhos (ex.: AppHeader) leiam um
  // SessionContext real antes do 1o paint, sem flash do estado neutro (footgun 1).
  useState(() => {
    if (sessionContext) {
      useAppStore.getState().setSessionContext(sessionContext);
    }
    return null;
  });

  // Mantem o store em sincronia caso o SessionContext do servidor mude.
  useEffect(() => {
    if (sessionContext) {
      setSessionContext(sessionContext);
    }
  }, [sessionContext, setSessionContext]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
