import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logHrApiError } from "@/lib/hr/api-auth";
import { requireCronAuth } from "@/lib/cron/require-cron-auth";
import { applyDueEmployeeTerminations } from "@/lib/hr/apply-due-terminations";
import { applyDueEmployeeMovements } from "@/lib/hr/apply-due-movements";

// RH-E-05 — endpoint UNIFICADO do efetivador diario. NAO usa sessao de usuario: e' protegido por
// CRON_SECRET (header Authorization: Bearer <segredo>). Disparado pelo GitHub Actions (hr-cron.yml).
//
// Orquestracao Nivel 1 (sem registry generico): roda DESLIGAMENTOS primeiro, MOVIMENTACOES depois.
// A ordem importa: o efetivador de movimentacao pula quem tem desligamento vigente; aplicar o
// desligamento antes garante que o skip o enxergue no mesmo run.
//
// SO POST: efetivacao TEM efeito colateral (altera o cadastro do colaborador) e nao pode ser exposta
// via GET (GET vaza em log/historico/prefetch). O /movements/apply-due permanece por compatibilidade.

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const gate = requireCronAuth(request);
  if ("response" in gate) return gate.response;

  try {
    const supabase = createSupabaseAdminClient();
    const terminations = await applyDueEmployeeTerminations(supabase);
    const movements = await applyDueEmployeeMovements(supabase);
    // So contadores no corpo — nenhum dado sensivel/PII.
    return NextResponse.json({ ok: true, terminations, movements });
  } catch (error) {
    logHrApiError("apply_due.run_failed", error instanceof Error ? error : { message: "unknown" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
