import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logHrApiError } from "@/lib/hr/api-auth";
import { requireCronAuth } from "@/lib/cron/require-cron-auth";
import { runDueJobs } from "@/lib/cron/run-due-jobs";

// CORE Fatia 2 — endpoint do RUNNER da fila. NAO usa sessao: protegido por CRON_SECRET (requireCronAuth,
// Fatia 1). Disparado pelo GitHub Actions (hr-cron.yml). Roda os job_type do registry para todas as
// unidades ativas (enqueue system -> claim -> handler -> complete/fail), com pre-check diario.
//
// SO POST: efeito colateral (muda status de treinamentos/ASO/NR e publica eventos). GET vazaria em
// log/prefetch.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const gate = requireCronAuth(request);
  if ("response" in gate) return gate.response;

  try {
    const summary = await runDueJobs(createSupabaseAdminClient());
    // So contadores no corpo — nenhum dado sensivel/PII.
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logHrApiError("run_jobs.run_failed", error instanceof Error ? error : { message: "unknown" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
