import { NextResponse } from "next/server";
import {
  HOUSEKEEPING_DECLINE_ORIGIN_VALUES,
  ROOM_PERMISSIONS,
  type HousekeepingDeclineOrigin
} from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Dispensa de arrumação (plano docs/codex/75, D3).
//
// Boa parte das permanencias o hospede nao quer que arrumem. A dispensa chega por dois caminhos
// -- a recepcao avisa antes, ou a camareira descobre na porta --, e REGISTRAR QUAL DOS DOIS e' o
// que permite avaliar depois se o aviso da recepcao esta funcionando.
//
// A dispensa ENCERRA a tarefa, nao a deixa pendente: nao e' trabalho que ficou faltando, e'
// trabalho que nao existiu. O numero que a governanta olha no fim do dia e' "o que ficou por
// fazer" -- se dispensa contasse ali, ela terminaria todo dia com vinte vermelhos que nao sao
// problema nenhum, e em duas semanas pararia de olhar o numero.
//
// O APARTAMENTO NAO MUDA DE ESTADO: dispensa nao e' transicao. O estado de limpeza continua o
// que era, e e' justamente o ponto -- por isso ela vive na tarefa do dia e nao em
// `room_status_history`.

function isDeclineOrigin(value: unknown): value is HousekeepingDeclineOrigin {
  return typeof value === "string" && (HOUSEKEEPING_DECLINE_ORIGIN_VALUES as readonly string[]).includes(value);
}

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    let body: { outcome?: unknown; declineOrigin?: unknown; declineNote?: unknown };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return apiError("Corpo da requisicao invalido.", 400);
    }

    // Esta rota registra DISPENSA e so' isso. Concluir tarefa acontece pela transicao de
    // estado (a limpeza de fato mudou), e reabrir tarefa concluida nao e' operacao de
    // governanca -- e' o dia inteiro que reabre, com registro.
    if (body.outcome !== "declined") {
      return apiError("Esta rota registra apenas dispensa de arrumacao.", 422);
    }

    if (!isDeclineOrigin(body.declineOrigin)) {
      return apiError("Informe se a dispensa foi avisada pela recepcao ou descoberta na porta.", 422);
    }

    const declineNote =
      typeof body.declineNote === "string" && body.declineNote.trim() ? body.declineNote.trim() : null;

    const { data: task, error: taskError } = await supabase
      .from("housekeeping_tasks")
      .select("id, unit_id, outcome, housekeeping_days!inner(closed_at)")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (taskError) {
      logBaseCadastroError("rooms.task_lookup_failed", taskError);
      return apiError("Nao foi possivel carregar a tarefa.", 500);
    }

    if (!task || (!context.accessibleUnitIds.includes(task.unit_id) && !context.isSuperAdmin)) {
      return apiError("Tarefa nao encontrada.", 404);
    }

    if (!(await userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, task.unit_id))) {
      return apiError("Voce nao tem permissao para registrar dispensa.", 403);
    }

    const day = task.housekeeping_days as unknown as { closed_at: string | null };

    // Dia fechado nao recebe lancamento. Reabrir e' um ato proprio, explicito e registrado --
    // deixar a dispensa entrar num dia fechado seria mudar o passado sem que ninguem soubesse.
    if (day?.closed_at) {
      return apiError("O dia esta fechado. Reabra o dia para registrar.", 409);
    }

    if (task.outcome !== "pending") {
      // So' tarefa pendente pode ser dispensada: `done` ja aconteceu, `declined` ja esta, e
      // `cancelled`/`not_done` sao desfechos que a dispensa nao descreve.
      return apiError("Esta tarefa ja tem desfecho.", 422);
    }

    const { error } = await supabase
      .from("housekeeping_tasks")
      .update({
        outcome: "declined",
        decline_origin: body.declineOrigin,
        decline_note: declineNote,
        completed_at: new Date().toISOString(),
        updated_by: context.session.user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.id);

    if (error) {
      logBaseCadastroError("rooms.task_decline_failed", error);
      return apiError("Nao foi possivel registrar a dispensa.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logBaseCadastroError("rooms.task_patch_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel registrar a dispensa.", 500);
  }
}
