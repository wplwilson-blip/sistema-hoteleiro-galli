import { NextResponse } from "next/server";
import { ROOM_PERMISSIONS } from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Fechar o dia da governanca (plano docs/codex/77, D1 e D2).
//
// FECHAR COM PENDENCIA E' PERMITIDO. Um sistema que proibe encerrar e' um sistema que ensina a
// mentir para poder fechar: a governanta marcaria como arrumado o que nao foi, so' para o botao
// liberar. O numero de pendentes convertidas volta na resposta -- e' o que a tela mostra na
// confirmacao, e o que fica gravado no evento de fechamento.
//
// As pendentes viram `not_done`, que separa "ficou sem arrumar e o dia fechou" de "esta
// pendente porque o dia ainda esta aberto". Sem isso a fila de hoje se mistura com a sobra de
// ontem -- e um quarto que ficou sem arrumar e' justamente o que ela quer ver amanha.

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
      return apiError("Voce nao tem permissao para fechar o dia de arrumacao.", 403);
    }

    const { data: pendingConverted, error } = await supabase.rpc("housekeeping_close_day", {
      p_day_id: dayId,
      p_actor_id: context.session.user.id
    });

    if (error) {
      if (typeof error.message === "string" && error.message.includes("HOUSEKEEPING_DAY_NOT_FOUND")) {
        return apiError("Dia nao encontrado.", 404);
      }

      logBaseCadastroError("rooms.close_day_failed", error);
      return apiError("Nao foi possivel fechar o dia.", 500);
    }

    // Fechar um dia ja fechado devolve 0 e nao gera segundo evento -- no-op idempotente na RPC.
    return NextResponse.json({ ok: true, pendingConverted: pendingConverted ?? 0 });
  } catch (error) {
    logBaseCadastroError("rooms.close_day_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel fechar o dia.", 500);
  }
}
