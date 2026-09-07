import { NextResponse } from "next/server";
import {
  ROOM_PERMISSIONS,
  canTransition,
  isRoomSellable,
  validateOccurredAt,
  type BlockingStatus,
  type HousekeepingStatus,
  type OccupancyStatus,
  type RoomRecordStatus
} from "@/components/base-cadastros/rooms-utils";
import { requirePermission, userHasPermissionForUnit } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// CHECK-IN E CHECK-OUT — a Recepcao escrevendo a ocupacao (plano docs/codex/78).
//
// POR QUE UMA ROTA PROPRIA, e nao um ramo novo em `/transitions`: a rota de transicao fala o
// vocabulario da Governanca e da Manutencao -- `dimension`, `toStatus`, `from`, efeito
// colateral. A Recepcao nao pensa assim: ela pensa "o hospede chegou" e "o hospede saiu". Uma
// recepcionista NUNCA digita `housekeeping_effect`, e uma tela que a obrigasse a escolher o
// efeito seria uma tela que permite escolher o efeito ERRADO.
//
// A traducao mora aqui, num lugar so': `check_in` e `check_out` viram as duas formas da D1.
//
// A REGRA continua nao vivendo na rota. `canTransition` decide, `rooms_apply_transition`
// escreve, e as duas formas sao conferidas de novo dentro da RPC -- porque a trava que vale
// contra uma chamada direta e' a do banco, nao a daqui.

const MAX_BATCH_SIZE = 200;

/**
 * Os dois eventos, e o `from`/`to` de cada um.
 *
 * O `from` e' DERIVADO do evento, nunca recebido: se o cliente mandasse a origem, um cliente
 * desatualizado poderia afirmar "estava ocupado" sobre um apartamento que ja' foi liberado --
 * e a releitura sob lock na RPC existe justamente para nao acreditar nisso.
 */
const FRONT_DESK_EVENTS = {
  check_in: { from: "vacant", to: "occupied" },
  check_out: { from: "occupied", to: "vacant" }
} as const;

type FrontDeskEvent = keyof typeof FRONT_DESK_EVENTS;

function isFrontDeskEvent(value: unknown): value is FrontDeskEvent {
  return typeof value === "string" && value in FRONT_DESK_EVENTS;
}

type OccupancyRequestBody = {
  /** Lista de `{ roomId, event, occurredAt?, reason? }`. */
  entries?: unknown;
};

type EntradaBruta = {
  roomId?: unknown;
  event?: unknown;
  occurredAt?: unknown;
  reason?: unknown;
};

type RoomStateRow = {
  id: string;
  unit_id: string;
  status: RoomRecordStatus;
  occupancy_status: OccupancyStatus;
  housekeeping_status: HousekeepingStatus;
  blocking_status: BlockingStatus;
};

export async function POST(request: Request) {
  // O gate de entrada e' `rooms.view`, como na rota de transicao: quem nao enxerga o
  // inventario nao escreve nada nele. `rooms.occupancy` e' resolvida DEPOIS, por unidade --
  // e' ela que autoriza a operacao em si.
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;

    let body: OccupancyRequestBody;

    try {
      body = (await request.json()) as OccupancyRequestBody;
    } catch {
      return apiError("Corpo da requisicao invalido.", 400);
    }

    const entradasBrutas = Array.isArray(body.entries) ? (body.entries as EntradaBruta[]) : [];

    if (!entradasBrutas.length) {
      return apiError("Informe ao menos um apartamento.", 400);
    }

    if (entradasBrutas.length > MAX_BATCH_SIZE) {
      return apiError(`Registre no maximo ${MAX_BATCH_SIZE} apartamentos por vez.`, 400);
    }

    const entradas: Array<{
      roomId: string;
      event: FrontDeskEvent;
      occurredAt: Date | null;
      reason: string | null;
    }> = [];

    for (const bruta of entradasBrutas) {
      if (typeof bruta?.roomId !== "string" || !bruta.roomId) {
        return apiError("Apartamento invalido.", 400);
      }

      if (!isFrontDeskEvent(bruta.event)) {
        return apiError("Informe se e' check-in ou check-out.", 422);
      }

      let occurredAt: Date | null = null;

      if (typeof bruta.occurredAt === "string" && bruta.occurredAt) {
        const parsed = new Date(bruta.occurredAt);

        // A trava de ORDEM (nao anterior ao ultimo lancamento do dia) depende do estado do
        // banco e vive na RPC, sob o lock. Aqui so' o que da' para conferir sem I/O.
        if (Number.isNaN(parsed.getTime()) || !validateOccurredAt(parsed, new Date(), null).valid) {
          return apiError("Hora informada invalida ou no futuro.", 422);
        }

        occurredAt = parsed;
      }

      entradas.push({
        roomId: bruta.roomId,
        event: bruta.event,
        occurredAt,
        reason: typeof bruta.reason === "string" && bruta.reason.trim() ? bruta.reason.trim() : null
      });
    }

    // Um apartamento nao pode aparecer duas vezes no mesmo lote: "check-in e check-out do 112
    // na mesma chamada" nao e' um lote, e' uma sequencia -- e o segundo item leria o estado de
    // ANTES do primeiro. Recusar e' mais honesto que aplicar numa ordem que ninguem pediu.
    const roomIds = entradas.map((entrada) => entrada.roomId);

    if (new Set(roomIds).size !== roomIds.length) {
      return apiError("O mesmo apartamento aparece duas vezes no lote.", 422);
    }

    if (!context.accessibleUnitIds.length) {
      return apiError("Nenhuma unidade acessivel.", 403);
    }

    const { data: rows, error: roomsError } = await supabase
      .from("rooms")
      .select("id, unit_id, status, occupancy_status, housekeeping_status, blocking_status")
      .in("id", roomIds)
      .in("unit_id", context.accessibleUnitIds)
      .is("deleted_at", null);

    if (roomsError) {
      logBaseCadastroError("rooms.occupancy_load_failed", roomsError);
      return apiError("Nao foi possivel carregar os apartamentos.", 500);
    }

    const rooms = (rows ?? []) as RoomStateRow[];

    // Mesma mensagem para "nao existe" e "e' de outra unidade": distinguir contaria a alguem
    // de outra unidade que aquele apartamento existe.
    if (rooms.length !== roomIds.length) {
      return apiError("Apartamento nao encontrado.", 404);
    }

    if (rooms.some((room) => room.status !== "active")) {
      return apiError("Apartamento inativo nao aceita check-in nem check-out.", 422);
    }

    const unitIds = Array.from(new Set(rooms.map((room) => room.unit_id)));

    if (unitIds.length > 1) {
      return apiError("Selecione apartamentos de uma unidade por vez.", 422);
    }

    const unitId = unitIds[0];

    const temOcupacao = await userHasPermissionForUnit(
      supabase,
      context.session,
      ROOM_PERMISSIONS.occupancy,
      unitId
    );

    const permissoes = temOcupacao ? [ROOM_PERMISSIONS.occupancy] : [];
    const porId = new Map(rooms.map((room) => [room.id, room]));

    // Decide TODOS antes de escrever QUALQUER um, como na rota de transicao: um lote meio
    // aplicado deixa a recepcionista sem saber o que gravou.
    const transitions: Array<{
      room_id: string;
      from: string;
      to: string;
      housekeeping_effect: string | null;
      service_type: null;
      occurred_at: string | null;
    }> = [];

    const motivos: string[] = [];

    for (const entrada of entradas) {
      const room = porId.get(entrada.roomId);

      if (!room) {
        return apiError("Apartamento nao encontrado.", 404);
      }

      const forma = FRONT_DESK_EVENTS[entrada.event];

      // O ESTADO REAL diverge do que o evento pressupoe: check-in num apartamento ja ocupado,
      // ou check-out num vago. 409 e nao 422 -- nao e' pedido malformado, e' o mundo em
      // desacordo com a tela. E diz QUAL apartamento, no formato do plano 77.
      if (room.occupancy_status !== forma.from) {
        return NextResponse.json(
          {
            ok: false,
            message:
              entrada.event === "check_in"
                ? "Este apartamento ja' consta como ocupado."
                : "Este apartamento ja' consta como livre.",
            conflict: {
              roomId: room.id,
              expected: forma.from,
              current: room.occupancy_status,
              dimension: "occupancy"
            }
          },
          { status: 409 }
        );
      }

      const decision = canTransition(permissoes, "occupancy", forma.from, forma.to, entrada.reason);

      if (!decision.allowed) {
        return apiError(
          decision.code === "forbidden"
            ? "Voce nao tem permissao para registrar check-in e check-out."
            : decision.message,
          decision.code === "forbidden" ? 403 : 422
        );
      }

      // CHECK-IN EM APARTAMENTO NAO VENDAVEL: PERMITIDO, COM OBSERVACAO (plano 78, D9).
      //
      // Recusar produziria um apartamento marcado vago com gente dentro -- o hospede esta' com
      // a chave na mao, e um sistema que se recusa a registrar um fato consumado passa a
      // mentir sobre algo pior. Aceitar em silencio tornaria invisivel que se vendeu um quarto
      // sujo. Entao entra, e entra com o motivo -- mesma forma da observacao obrigatoria do
      // bloqueio comercial, pela mesma razao: excecao registrada e' excecao auditavel.
      if (entrada.event === "check_in") {
        const vendavel = isRoomSellable({
          record: room.status,
          occupancy: room.occupancy_status,
          housekeeping: room.housekeeping_status,
          blocking: room.blocking_status
        });

        if (!vendavel && !entrada.reason) {
          return apiError(
            "Este apartamento nao esta' liberado para venda. Informe o motivo do check-in.",
            422
          );
        }
      }

      if (entrada.reason) {
        motivos.push(entrada.reason);
      }

      transitions.push({
        room_id: room.id,
        from: forma.from,
        to: forma.to,
        // O EFEITO VEM DA DECISAO, nunca do cliente. E' o que garante que todo check-out
        // carregue `dirty` -- e a RPC recusa o item se ele nao carregar.
        housekeeping_effect: decision.effects.housekeeping ?? null,
        service_type: null,
        // No item, e nao como argumento da funcao: acrescentar argumento a uma RPC exposta
        // cria sobrecarga e o PostgREST recusa tudo com PGRST203 (plano 75, D8).
        occurred_at: entrada.occurredAt?.toISOString() ?? null
      });
    }

    const { data: applied, error: rpcError } = await supabase.rpc("rooms_apply_transition", {
      p_transitions: transitions,
      p_dimension: "occupancy",
      // `p_reason` e' do LOTE. Com motivos diferentes por apartamento, mandar um deles seria
      // atribuir a todos um motivo que nao e' o deles.
      p_reason: motivos.length === 1 ? motivos[0] : null,
      p_actor_id: context.session.user.id
    });

    if (rpcError) {
      const message = typeof rpcError.message === "string" ? rpcError.message : "";

      if (message.includes("ROOMS_TRANSITION_NO_WRITER")) {
        // A migration 093 nao foi aplicada neste banco. Mensagem propria porque o sintoma
        // ("nao consigo fazer check-in") nao aponta para a causa em lugar nenhum.
        logBaseCadastroError("rooms.occupancy_migration_missing", rpcError);
        return apiError("O registro de check-in e check-out ainda nao esta' liberado neste ambiente.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_STALE")) {
        return apiError("O estado de um dos apartamentos mudou. Recarregue e tente novamente.", 409);
      }

      if (message.includes("ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY")) {
        return apiError(
          "O check-out devolve o apartamento para a governanca: de ocupado para livre nao existe.",
          422
        );
      }

      if (message.includes("ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM")) {
        return apiError("A ocupacao aceita apenas check-in e check-out.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_ROOM_INACTIVE")) {
        return apiError("Apartamento inativo nao aceita check-in nem check-out.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_FUTURE")) {
        return apiError("A hora informada nao pode estar no futuro.", 422);
      }

      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_BEFORE_LAST")) {
        return apiError("A hora informada e' anterior ao ultimo lancamento deste apartamento hoje.", 422);
      }

      logBaseCadastroError("rooms.occupancy_failed", rpcError);
      return apiError("Nao foi possivel registrar o check-in ou check-out.", 500);
    }

    return NextResponse.json({
      ok: true,
      updated: typeof applied === "number" ? applied : transitions.length
    });
  } catch (error) {
    logBaseCadastroError("rooms.occupancy_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel registrar o check-in ou check-out.", 500);
  }
}
