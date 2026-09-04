import { NextResponse } from "next/server";
import { ROOM_PERMISSIONS } from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Reabrir o dia da governanca (plano docs/codex/77, D4 e D5).
//
// Quarto atrasado as 18h depois do fechamento das 17h acontece. Proibir reabrir faria o dado
// ficar errado nos DOIS dias: o de hoje sem o trabalho, e o de amanha com um trabalho que nao
// e' dele.
//
// Reabrir devolve SO' as `not_done` para `pending`. `done`, `declined` e `cancelled` ficam
// intactas -- e a assimetria com o desbloqueio (que ressuscita so' `cancelled`) e' justificada
// pelas NATUREZAS: `done` e `declined` sao fatos consumados, e `not_done` nao e' fato -- e' o
// registro de que o dia acabou antes do trabalho, que e' exatamente a premissa que reabrir
// desfaz.
//
// A reabertura E' REGISTRADA. Zerar `closed_at`/`closed_by` sozinho apagaria que o dia chegou a
// ser fechado; o evento na `housekeeping_day_events` preserva cada fechamento que houve, com o
// numero de pendentes daquele momento -- que nao e' recuperavel depois, porque reabrir acabou
// de converter aquelas `not_done` em `pending`.

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const dayId = params.id;

    const { data: day, error: dayError } = await supabase
      .from("housekeeping_days")
      .select("id, unit_id, service_date, closed_at")
      .eq("id", dayId)
      .maybeSingle();

    if (dayError) {
      logBaseCadastroError("rooms.day_lookup_failed", dayError);
      return apiError("Nao foi possivel carregar o dia.", 500);
    }

    if (!day || (!context.accessibleUnitIds.includes(day.unit_id) && !context.isSuperAdmin)) {
      // 404 tambem quando o dia existe mas e' de outra unidade: distinguir contaria que ele
      // existe. Mesmo criterio das demais rotas de apartamento.
      return apiError("Dia nao encontrado.", 404);
    }

    if (!(await userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, day.unit_id))) {
      return apiError("Voce nao tem permissao para reabrir o dia de arrumacao.", 403);
    }

    let note: string | null = null;

    try {
      const body = (await request.json()) as { note?: unknown };
      note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    } catch {
      // Corpo ausente e' legitimo aqui: a nota e' opcional.
      note = null;
    }

    const { data: restored, error } = await supabase.rpc("housekeeping_reopen_day", {
      p_day_id: dayId,
      p_actor_id: context.session.user.id,
      p_note: note
    });

    if (error) {
      if (typeof error.message === "string" && error.message.includes("HOUSEKEEPING_DAY_NOT_FOUND")) {
        return apiError("Dia nao encontrado.", 404);
      }

      logBaseCadastroError("rooms.reopen_day_failed", error);
      return apiError("Nao foi possivel reabrir o dia.", 500);
    }

    // Reabrir um dia ja aberto devolve 0 e nao gera evento -- no-op idempotente na RPC.
    return NextResponse.json({ ok: true, restored: restored ?? 0 });
  } catch (error) {
    logBaseCadastroError("rooms.reopen_day_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel reabrir o dia.", 500);
  }
}
