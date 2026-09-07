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

    // A ORIGEM DECLARADA PRECISA CASAR COM QUEM ESTA' LANCANDO (plano 78, D6).
    //
    // ACHADO, e a versao honesta dele: este gate NAO estava aberto demais -- estava fechado
    // para a Recepcao. Ate' aqui ele exigia `rooms.housekeeping` para QUALQUER dispensa,
    // inclusive a de origem `front_desk`, que por definicao e' lancada por quem NAO opera
    // limpeza. A dispensa da recepcao existia no modelo desde a 091 e nao tinha por onde
    // entrar; ninguem percebeu porque nao havia perfil de recepcao para tentar.
    //
    // O QUE CONTINUA ERRADO SE SO' ABRIRMOS: a origem seria auto-declarada. Quem tivesse
    // `rooms.housekeeping` poderia registrar `front_desk` -- afirmar que a recepcao avisou --
    // e vice-versa. E a origem NAO e' um rotulo decorativo: a D3 do plano 75 a criou para
    // responder "o aviso da recepcao esta' funcionando?". Um campo que qualquer um preenche
    // com qualquer valor nao responde essa pergunta; ele so' parece responder.
    //
    // Entao o gate e' POR ORIGEM:
    //   `front_desk`  -> `rooms.occupancy`     (a recepcao avisou antes)
    //   `housekeeper` -> `rooms.housekeeping`  (a camareira descobriu na porta)
    //
    // Uma recepcionista nao registra "descoberto na porta": ela nao esteve na porta.
    const permissaoDaOrigem =
      body.declineOrigin === "front_desk" ? ROOM_PERMISSIONS.occupancy : ROOM_PERMISSIONS.housekeeping;

    if (!(await userHasPermissionForUnit(supabase, context.session, permissaoDaOrigem, task.unit_id))) {
      return apiError("Voce nao tem permissao para registrar dispensa com esta origem.", 403);
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
