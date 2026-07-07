import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logHrApiError } from "@/lib/hr/api-auth";
import { applyDueEmployeeMovements } from "@/lib/hr/apply-due-movements";

// RH-E-01 — endpoint do efetivador diario. NAO usa sessao de usuario: e' protegido por CRON_SECRET
// (header Authorization: Bearer <segredo>). Disparado pelo Vercel Cron (vercel.json).
//
// SO POST: a efetivacao TEM efeito colateral (altera o cadastro do colaborador) e nao pode ser
// exposta via GET (GET vaza em log/historico/prefetch). O Vercel Cron invoca o metodo que a rota
// expoe; POST protegido por Bearer e' o padrao correto.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;

  // Nunca rodar sem segredo configurado (evita endpoint aberto por engano).
  if (!secret) {
    logHrApiError("apply_due.missing_secret", { message: "CRON_SECRET nao definido no ambiente." });
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await applyDueEmployeeMovements(createSupabaseAdminClient());
    // So contadores no corpo — nenhum dado sensivel/PII.
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    logHrApiError("apply_due.run_failed", error instanceof Error ? error : { message: "unknown" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
