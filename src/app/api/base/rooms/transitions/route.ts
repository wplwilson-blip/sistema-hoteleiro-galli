import { NextResponse } from "next/server";
import {
  ROOM_PERMISSIONS,
  canTransition,
  isBatchAllowed,
  isHousekeepingServiceType,
  isRoomStateDimension,
  validateOccurredAt,
  type BlockingStatus,
  type HousekeepingStatus,
  type RoomPermissionCode,
  type RoomRecordStatus,
  type RoomStateDimension
} from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// Transicao de estado de apartamento (plano docs/codex/70, §6.2).
//
// POST, nao PATCH: nao e' atualizacao de campo, e' transicao com regra de perfil, validacao
// de origem e gravacao de historico. POST numa colecao de transicoes e' honesto sobre isso.
//
// UMA rota, que ja' nasce em lote. Uma individual mais uma em lote seriam duas copias da
// validacao de perfil e da regra de transicao -- exatamente onde elas divergem com o tempo.
// Um apartamento e' um array de um.
//
// A REGRA nao vive aqui: vive em `canTransition`, em rooms-utils.ts, que e' puro e testado
// no runner sem banco. Esta rota autentica, resolve permissoes, decide com aquela funcao e
// delega a escrita para a RPC transacional. Se voce sentir vontade de escrever um `if` de
// estado aqui, ele pertence a rooms-utils.ts.

const MAX_BATCH_SIZE = 200;

type TransitionRequestBody = {
  roomIds?: unknown;
  dimension?: unknown;
  toStatus?: unknown;
  reason?: unknown;
  /** Hora do FATO para o LOTE INTEIRO, ISO. Ausente = agora (plano 75, D5). */
  occurredAt?: unknown;
  /**
   * Hora do FATO POR APARTAMENTO, `roomId -> ISO`. O ESPECIFICO VENCE O GERAL.
   *
   * Espelha `serviceTypes`, e existe pelo mesmo motivo: a folha tem uma hora por
   * apartamento -- "112 as 10h20, 113 as 10h45". Sem este mapa, a governanta que lanca dez de
   * uma vez carimba os dez com a mesma hora, que e' exatamente o comportamento que a D8
   * rejeitou ao mover `occurred_at` para dentro do item.
   */
  occurredAts?: unknown;
  /**
   * Tipo de arrumacao POR APARTAMENTO, exigido ao chegar em `clean` (plano 75, D2).
   *
   * Por apartamento, e nao um por chamada: um corredor tem saidas E permanencias misturadas,
   * entao um tipo unico para o lote estaria errado na metade dos quartos.
   */
  serviceTypes?: unknown;
};

type RoomStateRow = {
  id: string;
  unit_id: string;
  status: RoomRecordStatus;
  housekeeping_status: HousekeepingStatus;
  blocking_status: BlockingStatus;
};

/** Codigo de negacao -> status HTTP. 403 so' para falta de permissao. */
const denialStatusMap = {
  forbidden: 403,
  invalid_dimension_value: 422,
  invalid_transition: 422,
  no_writer: 422,
  reason_required: 422
} as const;

function currentValue(row: RoomStateRow, dimension: RoomStateDimension) {
  return dimension === "blocking" ? row.blocking_status : row.housekeeping_status;
}

export async function POST(request: Request) {
  // O gate de entrada e' `rooms.view`: quem nao enxerga o inventario nao transita nada. A
  // permissao ESPECIFICA da transicao (housekeeping / inspect / block) e' resolvida depois,
  // por unidade, porque depende de qual transicao foi pedida.
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    let body: TransitionRequestBody;

    try {
      body = (await request.json()) as TransitionRequestBody;
    } catch {
      return apiError("Corpo da requisicao invalido.", 400);
    }

    const roomIds = Array.isArray(body.roomIds) ? body.roomIds.filter((id): id is string => typeof id === "string") : [];
    const dimension = typeof body.dimension === "string" ? body.dimension : "";
    const toStatus = typeof body.toStatus === "string" ? body.toStatus : "";
    const reason = typeof body.reason === "string" ? body.reason : null;
    const occurredAtRaw = typeof body.occurredAt === "string" ? body.occurredAt : null;
    const serviceTypes =
      body.serviceTypes && typeof body.serviceTypes === "object" && !Array.isArray(body.serviceTypes)
        ? (body.serviceTypes as Record<string, unknown>)
        : {};
    const occurredAts =
      body.occurredAts && typeof body.occurredAts === "object" && !Array.isArray(body.occurredAts)
        ? (body.occurredAts as Record<string, unknown>)
        : {};

    if (!roomIds.length) {
      return apiError("Selecione ao menos um apartamento.", 400);
    }

    // Duplicata no lote travaria a propria transacao no `for update` da RPC. Deduplicar e'
    // mais util que recusar: a tela manda o que o usuario selecionou.
    const uniqueRoomIds = Array.from(new Set(roomIds));

    if (uniqueRoomIds.length > MAX_BATCH_SIZE) {
      return apiError(`Selecione no maximo ${MAX_BATCH_SIZE} apartamentos por vez.`, 400);
    }

    if (!isRoomStateDimension(dimension)) {
      return apiError("Dimensao invalida.", 422);
    }

    // TRAVA DE LOTE (plano 75, D4). Recusada ANTES de qualquer leitura: chegar em `inspected`
    // com um lote e' pedido malformado, nao um estado que precise ser conferido no banco. A
    // RPC repete a trava sob o lock -- aqui e' pela mensagem util.
    if (!isBatchAllowed(dimension, toStatus, uniqueRoomIds.length)) {
      return apiError(
        "A vistoria e' feita um apartamento por vez: e' o registro de que voce olhou aquele quarto.",
        422
      );
    }

    // Hora do fato. A trava de ordem (nao anterior ao ultimo lancamento) depende do estado do
    // banco e vive na RPC, sob o lock; aqui validamos o que da para validar sem I/O.
    //
    // `resolveOccurredAt` aplica a precedencia: o mapa por apartamento vence o valor do lote.
    const parseOccurredAt = (raw: unknown): Date | null | "invalid" => {
      if (typeof raw !== "string" || !raw) {
        return null;
      }

      const parsed = new Date(raw);

      if (Number.isNaN(parsed.getTime())) {
        return "invalid";
      }

      return validateOccurredAt(parsed, new Date(), null).valid ? parsed : "invalid";
    };

    const loteOccurredAt = parseOccurredAt(occurredAtRaw);

    if (loteOccurredAt === "invalid") {
      return apiError("Hora informada invalida ou no futuro.", 422);
    }

    if (!context.accessibleUnitIds.length) {
      return apiError("Nenhuma unidade acessivel.", 403);
    }

    const { data: rows, error: roomsError } = await supabase
      .from("rooms")
      .select("id, unit_id, status, housekeeping_status, blocking_status")
      .in("id", uniqueRoomIds)
      .in("unit_id", context.accessibleUnitIds)
      .is("deleted_at", null);

    if (roomsError) {
      logBaseCadastroError("rooms.transition_load_failed", roomsError);
      return apiError("Nao foi possivel carregar os apartamentos.", 500);
    }

    const rooms = (rows ?? []) as RoomStateRow[];

    // Faltou apartamento: ou nao existe, ou esta fora do escopo de unidade do ator. Os dois
    // casos respondem 404 com a MESMA mensagem -- distinguir contaria a um usuario de outra
    // unidade que aquele apartamento existe.
    if (rooms.length !== uniqueRoomIds.length) {
      return apiError("Apartamento nao encontrado.", 404);
    }

    // Apartamento INATIVO no cadastro nao transita: ele nao esta no inventario em uso, e
    // portanto nao entra em fila de arrumacao nem volta para a venda. Recusa o lote inteiro,
    // como qualquer outra negacao -- transicionar "os ativos do lote" e ficar calado sobre o
    // resto e' o meio-resultado que a transacao existe para impedir. Reativar e' assunto do
    // cadastro (`rooms.manage`), nao da governanca. A RPC repete a checagem sob o lock.
    if (rooms.some((room) => room.status !== "active")) {
      return apiError("Apartamento inativo nao aceita transicao de estado.", 422);
    }

    // Lote que atravessa unidades e' recusado inteiro. A permissao e' resolvida POR unidade;
    // aceitar o lote misto exigiria resolver por apartamento e abriria a porta para um lote
    // parcialmente autorizado -- que e' o estado que a transacao existe para impedir.
    const unitIds = Array.from(new Set(rooms.map((room) => room.unit_id)));

    if (unitIds.length > 1) {
      return apiError("Selecione apartamentos de uma unidade por vez.", 422);
    }

    const unitId = unitIds[0];

    // As permissoes de escrita que o ator possui NAQUELA unidade. `canTransition` recebe a
    // lista e decide -- a rota nao sabe qual codigo cada transicao exige, e e' de proposito:
    // essa tabela vive num lugar so'.
    const [hasHousekeeping, hasInspect, hasBlock] = await Promise.all([
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.inspect, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.block, unitId)
    ]);

    const heldCodes: Array<RoomPermissionCode | null> = [
      hasHousekeeping ? ROOM_PERMISSIONS.housekeeping : null,
      hasInspect ? ROOM_PERMISSIONS.inspect : null,
      hasBlock ? ROOM_PERMISSIONS.block : null
    ];

    const permissions = heldCodes.filter((code): code is RoomPermissionCode => code !== null);

    // Decide TODOS antes de escrever QUALQUER um. A primeira negacao aborta o lote inteiro:
    // um lote meio aplicado deixa a governanta sem saber o que gravou, que e' o motivo pelo
    // qual ela volta para o papel.
    const transitions: Array<{
      room_id: string;
      from: string;
      to: string;
      housekeeping_effect: string | null;
      service_type: string | null;
      occurred_at: string | null;
    }> = [];

    for (const room of rooms) {
      const from = currentValue(room, dimension);
      const decision = canTransition(permissions, dimension, from, toStatus, reason);

      if (!decision.allowed) {
        return apiError(decision.message, denialStatusMap[decision.code]);
      }

      const declaredType = serviceTypes[room.id];

      if (declaredType !== undefined && !isHousekeepingServiceType(declaredType)) {
        return apiError("Tipo de arrumacao invalido.", 422);
      }

      const roomOccurredAt = parseOccurredAt(occurredAts[room.id]);

      if (roomOccurredAt === "invalid") {
        return apiError("Hora informada invalida ou no futuro.", 422);
      }

      transitions.push({
        room_id: room.id,
        from,
        to: toStatus,
        housekeeping_effect: dimension === "blocking" ? decision.effects.housekeeping ?? null : null,
        service_type: declaredType ?? null,
        // A hora do fato viaja NO ITEM, e nao como parametro da funcao (plano 75, D8):
        // acrescentar argumento a uma RPC exposta cria SOBRECARGA, e o PostgREST recusa toda
        // chamada com PGRST203 quando o argumento opcional e' omitido.
        //
        // O ESPECIFICO VENCE O GERAL: a hora daquele apartamento, se houver, e senao a do
        // lote. E' o que permite lancar dez quartos de uma vez, cada um com a hora da folha.
        occurred_at: (roomOccurredAt ?? loteOccurredAt)?.toISOString() ?? null
      });
    }

    const { data: applied, error: rpcError } = await supabase.rpc("rooms_apply_transition", {
      p_transitions: transitions,
      p_dimension: dimension,
      p_reason: reason,
      p_actor_id: context.session.user.id
    });

    if (rpcError) {
      // Outra pessoa mexeu no mesmo apartamento entre a nossa leitura e a escrita. Nada foi
      // gravado (a RPC e' transacional). 409 e nao 500: nao e' falha, e' concorrencia, e a
      // tela deve recarregar e mostrar o estado real em vez de repetir cegamente.
      if (typeof rpcError.message === "string" && rpcError.message.includes("ROOMS_TRANSITION_STALE")) {
        return apiError("O estado de um dos apartamentos mudou. Recarregue e tente novamente.", 409);
      }

      // As recusas de REGRA da RPC viram 422, nao 500: sao pedido invalido, nao falha de
      // infraestrutura. Casamos por MENSAGEM porque e' o acoplamento existente entre rota e
      // RPC -- registrado como divida em docs/NAO_ALTERAR.md.
      const message = typeof rpcError.message === "string" ? rpcError.message : "";

      if (message.includes("ROOMS_TRANSITION_INSPECT_NOT_BATCHABLE")) {
        return apiError(
          "A vistoria e' feita um apartamento por vez: e' o registro de que voce olhou aquele quarto.",
          422
        );
      }

      if (message.includes("ROOMS_TRANSITION_SERVICE_TYPE_REQUIRED")) {
        return apiError("Informe se a arrumacao foi de saida ou de permanencia.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_INVALID_SERVICE_TYPE")) {
        return apiError("Tipo de arrumacao invalido.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_FUTURE")) {
        return apiError("A hora informada nao pode estar no futuro.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_BEFORE_LAST")) {
        return apiError("A hora informada e' anterior ao ultimo lancamento deste apartamento hoje.", 422);
      }

      logBaseCadastroError("rooms.transition_failed", rpcError);
      return apiError("Nao foi possivel registrar a transicao.", 500);
    }

    // Sem UI otimista (§6.3c): a tela so' pinta depois desta resposta. Devolvemos o que
    // realmente foi gravado, e nao o que foi pedido.
    return NextResponse.json({ ok: true, updated: typeof applied === "number" ? applied : transitions.length });
  } catch (error) {
    logBaseCadastroError("rooms.transition_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel registrar a transicao.", 500);
  }
}
