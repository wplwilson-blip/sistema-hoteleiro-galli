import { NextResponse } from "next/server";
import { ROOM_PERMISSIONS } from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Abertura do dia de trabalho da Governanca (plano docs/codex/75, D1).
//
// POR QUE ABRIR O DIA E' UM ATO EXPLICITO, e nao a fila derivada da ocupacao:
//
//   1. A ocupacao responde DEPOIS do fato. Os check-outs acontecem espalhados pela manha; a
//      governanta distribui o trabalho as 8h, quando a maioria ainda nao saiu. Uma fila
//      derivada estaria vazia exatamente na hora em que ela precisa dela cheia.
//
//   2. DIA SEM REGISTRO E' SILENCIO, NAO ZERO. Sem a linha do dia, um domingo em que ninguem
//      abriu o sistema e um domingo em que nada precisou ser arrumado sao indistinguiveis --
//      os dois aparecem como lista vazia. E' a unica coisa que impede o historico de mentir
//      por omissao.
//
// NENHUMA TAREFA NASCE COM TIPO (D2): o tipo de arrumacao e' decidido no FECHO da limpeza,
// quando a ocupacao ja e' informativa E quem registra acabou de ver o quarto.

export async function POST(request: Request) {
  // Mesma permissao de quem registra limpeza (D6). Abrir o dia e' o mesmo trabalho da mesma
  // pessoa -- codigo novo aqui so' separaria linhas de tabela, nao pessoas.
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    let body: { unitId?: unknown; serviceDate?: unknown };

    try {
      body = (await request.json()) as { unitId?: unknown; serviceDate?: unknown };
    } catch {
      return apiError("Corpo da requisicao invalido.", 400);
    }

    const unitId = typeof body.unitId === "string" ? body.unitId : "";
    // `YYYY-MM-DD` ou ausente (= hoje no banco). A data vem do cliente de proposito: o dia
    // operacional e' o do hotel, e um servidor em outro fuso nao deve decidir isso sozinho.
    const serviceDate = typeof body.serviceDate === "string" ? body.serviceDate : null;

    if (!unitId) {
      return apiError("Informe a unidade.", 400);
    }

    if (serviceDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return apiError("Data invalida.", 422);
    }

    if (!context.accessibleUnitIds.includes(unitId) && !context.isSuperAdmin) {
      // Mesma mensagem de "nao encontrado" usada na rota de transicoes: distinguir contaria a
      // um usuario de outra unidade que aquela unidade existe.
      return apiError("Unidade nao encontrada.", 404);
    }

    if (!(await userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, unitId))) {
      return apiError("Voce nao tem permissao para abrir o dia de arrumacao.", 403);
    }

    const { data: dayId, error } = await supabase.rpc("housekeeping_open_day", {
      p_unit_id: unitId,
      p_service_date: serviceDate,
      p_actor_id: context.session.user.id
    });

    if (error) {
      if (typeof error.message === "string" && error.message.includes("HOUSEKEEPING_UNIT_NOT_FOUND")) {
        return apiError("Unidade nao encontrada.", 404);
      }

      logBaseCadastroError("rooms.open_day_failed", error);
      return apiError("Nao foi possivel abrir o dia.", 500);
    }

    // Reabrir um dia ja aberto e' no-op idempotente na RPC, nunca duplicacao -- a governanta
    // que clicar duas vezes nao ganha 230 tarefas.
    return NextResponse.json({ ok: true, dayId });
  } catch (error) {
    logBaseCadastroError("rooms.open_day_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel abrir o dia.", 500);
  }
}
