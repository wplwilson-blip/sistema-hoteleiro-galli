import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logHrApiError } from "@/lib/hr/api-auth";
import { requireCronAuth } from "@/lib/cron/require-cron-auth";
import { applyDueEmployeeMovements } from "@/lib/hr/apply-due-movements";

// RH-E-01 — endpoint do efetivador diario. NAO usa sessao de usuario: e' protegido por CRON_SECRET
// (header Authorization: Bearer <segredo>). Disparado pelo Vercel Cron (vercel.json).
//
// SO POST: a efetivacao TEM efeito colateral (altera o cadastro do colaborador) e nao pode ser
// exposta via GET (GET vaza em log/historico/prefetch). O Vercel Cron invoca o metodo que a rota
// expoe; POST protegido por Bearer e' o padrao correto.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const gate = requireCronAuth(request);
  if ("response" in gate) return gate.response;

  try {
    const summary = await applyDueEmployeeMovements(createSupabaseAdminClient());
    // So contadores no corpo — nenhum dado sensivel/PII.
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logHrApiError("apply_due.run_failed", error instanceof Error ? error : { message: "unknown" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
