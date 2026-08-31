import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import {
  callTransitionRpc,
  countHistory,
  findUnitIdByCode,
  listActiveRooms,
  probeTransitionRpcAsAnon,
  readHistorySince,
  readRoom,
  setRoomRecordStatus,
  type RoomStateRow
} from "./helpers/db";

// ===========================================================================================
// E2E — POST /api/base/rooms/transitions (plano docs/codex/70)
//
// POR QUE ESTA SUITE EXISTE, em um caso concreto: a primeira versao da RPC omitia
// `organization_id` nos dois insert de room_status_history -- coluna `not null` desde a 011.
// TODA transicao teria falhado com 23502. Nem `tsc` nem `test:unit` pegariam: os unitarios
// sao puros, sem banco, e provam a REGRA (canTransition), nunca a gravacao. So' uma chamada
// real pega. O caso 1 abaixo e' exatamente essa chamada.
//
// ATOR: LIDER_GOVERNANCA e LIDER_MANUTENCAO. NUNCA super admin -- `userHasPermissionForUnit`
// tem `if (access.isSuperAdmin) return true`, entao uma suite que passasse como super admin
// nao provaria nada sobre a matriz de permissao.
//
// -------------------------------------------------------------------------------------
// PORTA DE MAO UNICA -- leia antes de estranhar o staging depois:
//
// A primeira rodada desta suite DESLIGA O BACKFILL DA 089 EM STAGING, PARA SEMPRE. A guarda
// do backfill e' `where not exists (select 1 from public.room_status_history)`, e o historico
// e' append-only -- nao limpe para "reativar". E' o comportamento correto (havendo uma linha
// de historico, o sistema ja e' a fonte da verdade e o room_status antigo nao manda mais em
// nada), mas nao tem volta. Isto esta escrito aqui para ninguem se assustar.
// -------------------------------------------------------------------------------------
//
// LACUNAS DECLARADAS -- casos que NAO estao aqui, e o motivo. Nenhum deles tem teste que
// finja cobri-lo: um teste que finge e' pior que a lacuna escrita (§11 do plano ja registrou
// um "teste vazio por construcao" uma vez).
//
//   13 (lote atravessando duas unidades -> 422) e 14 (apartamento fora do escopo -> 404):
//      exigem uma SEGUNDA unidade com apartamentos. A GALLI PRAIA (GALLI2) nao existe, nao
//      vai existir, e tem zero apartamentos nos dois bancos; os 115 estao todos na GALLI.
//      Criar apartamento na GALLI2 para forcar seria fabricar topologia falsa numa unidade
//      que sera' desativada.
//
//   16b (a rota traduz ROOMS_TRANSITION_STALE em 409, e nao em 500): nao e' testavel de
//      forma deterministica. O corpo aceito e' { roomIds, dimension, toStatus, reason } -- o
//      cliente NUNCA envia `from`, a rota o le do banco. O STALE so' dispara numa corrida
//      real entre o SELECT da rota e o `for update` da RPC. O 16a abaixo cobre a metade que
//      importa (a RPC recusa e nao grava nada); a traducao do erro fica descoberta.
// ===========================================================================================

const UNIT_CODE = "GALLI";
const TRANSITIONS_URL = "/api/base/rooms/transitions";

type Dimension = "occupancy" | "housekeeping" | "blocking";

type TransitionBody = {
  roomIds: string[];
  dimension: Dimension;
  toStatus: string;
  reason?: string;
};

/** Contexto HTTP autenticado como um dos usuarios do plano 70. */
async function contextFor(
  user: "E2E_GOVERNANCA" | "E2E_MANUTENCAO",
  baseURL: string
): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL, storageState: authStatePath(user) });
}

async function postTransition(ctx: APIRequestContext, body: TransitionBody) {
  const response = await ctx.post(TRANSITIONS_URL, {
    data: body,
    headers: { "content-type": "application/json" }
  });

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; updated?: number; message?: string };

  return { status: response.status(), payload };
}

/**
 * Leva um apartamento ate' `target` SO por transicoes legais, pela propria rota.
 *
 * E' o mecanismo de restauracao: a suite nunca escreve estado por fora para "arrumar" o
 * banco -- se o caminho de volta nao existir pela rota, isso e' um achado, nao um obstaculo.
 * O unico caminho de entrada em `inspected` passa por `cleaning`, e e' de proposito: nao se
 * vistoria o que ninguem arrumou.
 */
async function driveHousekeepingTo(ctx: APIRequestContext, roomId: string, target: string): Promise<void> {
  for (let guard = 0; guard < 6; guard++) {
    const current = (await readRoom(roomId)).housekeeping_status;

    if (current === target) {
      return;
    }

    const next =
      target === "dirty"
        ? "dirty"
        : current === "dirty"
          ? "cleaning"
          : current === "cleaning"
            ? target === "clean" || target === "inspected"
              ? target
              : "clean"
            : current === "clean"
              ? "inspected"
              : "dirty";

    const { status, payload } = await postTransition(ctx, {
      roomIds: [roomId],
      dimension: "housekeeping",
      toStatus: next
    });

    if (status !== 200) {
      throw new Error(
        `[e2e] Nao consegui levar o apartamento ${roomId} de ${current} para ${next} ` +
          `(HTTP ${status}: ${payload.message ?? ""}).`
      );
    }
  }

  throw new Error(`[e2e] Nao alcancei ${target} no apartamento ${roomId} em 6 passos.`);
}

/** Restaura limpeza e bloqueio ao que estavam antes do caso. */
async function restoreRoom(ctx: APIRequestContext, before: RoomStateRow): Promise<void> {
  const now = await readRoom(before.id);

  if (now.blocking_status !== before.blocking_status) {
    await postTransition(ctx, {
      roomIds: [before.id],
      dimension: "blocking",
      toStatus: before.blocking_status,
      reason: "[E2E] restauracao do estado anterior ao teste."
    });
  }

  await driveHousekeepingTo(ctx, before.id, before.housekeeping_status);
}

test.describe("Transicao de estado de apartamento (plano 70)", () => {
  let unitId: string;
  let rooms: RoomStateRow[];
  let gov: APIRequestContext;
  let manut: APIRequestContext;

  test.beforeAll(async ({ baseURL }) => {
    if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");

    unitId = await findUnitIdByCode(UNIT_CODE);
    rooms = await listActiveRooms(unitId, 8);

    if (rooms.length < 5) {
      throw new Error(`[e2e] A unidade ${UNIT_CODE} precisa de ao menos 5 apartamentos ativos.`);
    }

    gov = await contextFor("E2E_GOVERNANCA", baseURL);
    manut = await contextFor("E2E_MANUTENCAO", baseURL);
  });

  test.afterAll(async () => {
    await gov?.dispose();
    await manut?.dispose();
  });

  // ------------------------------------------------------------------------------- caso 1

  test("1 - inspected -> dirty grava de verdade (prova a RPC inteira, organization_id incluso)", async () => {
    const room = rooms[0];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "inspected");

      const since = new Date().toISOString();
      const { status, payload } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "housekeeping",
        toStatus: "dirty"
      });

      expect(status, `resposta: ${payload.message ?? ""}`).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.updated).toBe(1);
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");

      // A prova que o unitario nao da': a linha de historico existe e esta COMPLETA.
      const history = await readHistorySince(room.id, since);
      expect(history).toHaveLength(1);
      expect(history[0].organization_id).not.toBeNull();
      expect(history[0].dimension).toBe("housekeeping");
      expect(history[0].previous_status).toBe("inspected");
      expect(history[0].new_status).toBe("dirty");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ------------------------------------------------------------------------------- caso 2

  test("2 - ciclo completo dirty -> cleaning -> clean -> inspected", async () => {
    const room = rooms[1];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      for (const next of ["cleaning", "clean", "inspected"]) {
        const { status, payload } = await postTransition(gov, {
          roomIds: [room.id],
          dimension: "housekeeping",
          toStatus: next
        });

        expect(status, `passo ${next}: ${payload.message ?? ""}`).toBe(200);
        expect((await readRoom(room.id)).housekeeping_status).toBe(next);
      }
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ------------------------------------------------------------------------------- caso 3

  test("3 - atalho §4.1: cleaning -> inspected direto", async () => {
    const room = rooms[1];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "cleaning");

      const { status, payload } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "housekeeping",
        toStatus: "inspected"
      });

      expect(status, `resposta: ${payload.message ?? ""}`).toBe(200);
      expect((await readRoom(room.id)).housekeeping_status).toBe("inspected");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ------------------------------------------------------------------------------- caso 4

  test("4 - desfazer: cleaning -> dirty e clean -> dirty", async () => {
    const room = rooms[2];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "cleaning");
      let result = await postTransition(gov, { roomIds: [room.id], dimension: "housekeeping", toStatus: "dirty" });
      expect(result.status, `cleaning->dirty: ${result.payload.message ?? ""}`).toBe(200);
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");

      await driveHousekeepingTo(gov, room.id, "clean");
      result = await postTransition(gov, { roomIds: [room.id], dimension: "housekeeping", toStatus: "dirty" });
      expect(result.status, `clean->dirty: ${result.payload.message ?? ""}`).toBe(200);
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ------------------------------------------------------------------------------- caso 5

  test("5 - lote: varios apartamentos numa chamada, `updated` bate com o tamanho", async () => {
    const batch = rooms.slice(0, 4);
    const before = await Promise.all(batch.map((room) => readRoom(room.id)));

    try {
      for (const room of batch) {
        await driveHousekeepingTo(gov, room.id, "dirty");
      }

      const { status, payload } = await postTransition(gov, {
        roomIds: batch.map((room) => room.id),
        dimension: "housekeeping",
        toStatus: "cleaning"
      });

      expect(status, `resposta: ${payload.message ?? ""}`).toBe(200);
      expect(payload.updated).toBe(batch.length);

      for (const room of batch) {
        expect((await readRoom(room.id)).housekeeping_status).toBe("cleaning");
      }
    } finally {
      for (const snapshot of before) {
        await restoreRoom(gov, snapshot);
      }
    }
  });

  // ------------------------------------------------------------------------- casos 6 a 9

  test("6 - none -> maintenance SEM observacao e' permitido (o motivo vem do chamado)", async () => {
    const room = rooms[3];
    const before = await readRoom(room.id);

    try {
      const { status, payload } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "maintenance"
      });

      expect(status, `resposta: ${payload.message ?? ""}`).toBe(200);
      expect((await readRoom(room.id)).blocking_status).toBe("maintenance");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("7 - none -> commercial exige observacao: 422 sem, 200 com", async () => {
    const room = rooms[3];
    const before = await readRoom(room.id);

    try {
      const semTexto = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "commercial"
      });
      expect(semTexto.status).toBe(422);
      expect((await readRoom(room.id)).blocking_status).toBe("none");

      const comTexto = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "commercial",
        reason: "[E2E] bloqueio comercial para teste."
      });
      expect(comTexto.status, `resposta: ${comTexto.payload.message ?? ""}`).toBe(200);
      expect((await readRoom(room.id)).blocking_status).toBe("commercial");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("8 - maintenance -> none SEM observacao e' recusado", async () => {
    const room = rooms[3];
    const before = await readRoom(room.id);

    try {
      await postTransition(gov, { roomIds: [room.id], dimension: "blocking", toStatus: "maintenance" });

      const { status } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "none"
      });

      expect(status).toBe(422);
      expect((await readRoom(room.id)).blocking_status).toBe("maintenance");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("9 - encerrar manutencao com observacao deixa a UH em dirty, NUNCA em inspected", async () => {
    // O §7.2 do plano: "se um unico teste desta fatia tiver que passar, e' este". E' o que
    // impede apartamento recem-consertado de ir direto para a venda.
    const room = rooms[4];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "inspected");
      await postTransition(gov, { roomIds: [room.id], dimension: "blocking", toStatus: "maintenance" });

      const { status, payload } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "none",
        reason: "[E2E] troca de registro do chuveiro."
      });

      expect(status, `resposta: ${payload.message ?? ""}`).toBe(200);

      const after = await readRoom(room.id);
      expect(after.blocking_status).toBe("none");
      expect(after.housekeeping_status).toBe("dirty");
      expect(after.housekeeping_status).not.toBe("inspected");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ----------------------------------------------------------------------- casos 10 a 15

  test("10 - dirty -> inspected e' recusado (nao se vistoria o que ninguem arrumou)", async () => {
    const room = rooms[0];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      const { status, payload } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "housekeeping",
        toStatus: "inspected"
      });

      expect(status).toBe(422);
      expect(payload.ok).not.toBe(true);
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("11 - LIDER_MANUTENCAO nao registra limpeza: 403", async () => {
    const room = rooms[0];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      const { status } = await postTransition(manut, {
        roomIds: [room.id],
        dimension: "housekeeping",
        toStatus: "cleaning"
      });

      expect(status).toBe(403);
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("12 - apartamento inativo recusa o LOTE INTEIRO", async () => {
    const ativo = rooms[0];
    const inativo = rooms[1];
    const before = await Promise.all([readRoom(ativo.id), readRoom(inativo.id)]);

    try {
      await driveHousekeepingTo(gov, ativo.id, "dirty");
      await driveHousekeepingTo(gov, inativo.id, "dirty");
      await setRoomRecordStatus(inativo.id, "inactive");

      const { status } = await postTransition(gov, {
        roomIds: [ativo.id, inativo.id],
        dimension: "housekeeping",
        toStatus: "cleaning"
      });

      expect(status).toBe(422);

      // O LOTE INTEIRO: o apartamento ATIVO tambem nao pode ter mudado. Transicionar "os
      // ativos do lote" e ficar calado sobre o resto e' o meio-resultado que a transacao
      // existe para impedir.
      expect((await readRoom(ativo.id)).housekeeping_status).toBe("dirty");
      expect((await readRoom(inativo.id)).housekeeping_status).toBe("dirty");
    } finally {
      await setRoomRecordStatus(inativo.id, "active");
      await restoreRoom(gov, before[0]);
      await restoreRoom(gov, before[1]);
    }
  });

  test("15 - dimension 'occupancy' e' recusada: sem escritor nesta release (D1)", async () => {
    const room = rooms[0];
    const antes = await readRoom(room.id);

    const { status } = await postTransition(gov, {
      roomIds: [room.id],
      dimension: "occupancy",
      toStatus: "occupied"
    });

    expect(status).toBe(422);
    expect((await readRoom(room.id)).occupancy_status).toBe(antes.occupancy_status);
  });

  // ------------------------------------------------------------------------------ caso 16a

  test("16a - a RPC recusa `from` mentiroso com STALE e NAO grava nada", async () => {
    // Chamada DIRETA a RPC: a rota calcula o `from` sozinho e jamais produziria um valor
    // divergente. So' por aqui da' para exercitar a releitura da origem sob o lock.
    const room = rooms[2];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      const historyBefore = await countHistory(room.id);

      const { error } = await callTransitionRpc({
        // O apartamento esta em `dirty`; afirmamos `clean`.
        transitions: [{ room_id: room.id, from: "clean", to: "inspected", housekeeping_effect: null }],
        dimension: "housekeeping"
      });

      expect(error, "a RPC deveria ter recusado o `from` obsoleto").not.toBeNull();
      expect(error?.message ?? "").toContain("ROOMS_TRANSITION_STALE");

      // A transacionalidade e' a razao de a RPC existir: nada mudou, nada foi gravado.
      expect((await readRoom(room.id)).housekeeping_status).toBe("dirty");
      expect(await countHistory(room.id)).toBe(historyBefore);
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ----------------------------------------------------------------------- casos 17 a 19

  test("17 - cada transicao grava historico completo (organization_id, dimension, from/to)", async () => {
    const room = rooms[2];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      const since = new Date().toISOString();
      await postTransition(gov, { roomIds: [room.id], dimension: "housekeeping", toStatus: "cleaning" });
      await postTransition(gov, { roomIds: [room.id], dimension: "housekeeping", toStatus: "clean" });

      const history = await readHistorySince(room.id, since);
      expect(history).toHaveLength(2);

      expect(history[0].organization_id).not.toBeNull();
      expect(history[0].dimension).toBe("housekeeping");
      expect(history[0].previous_status).toBe("dirty");
      expect(history[0].new_status).toBe("cleaning");

      expect(history[1].organization_id).not.toBeNull();
      expect(history[1].previous_status).toBe("cleaning");
      expect(history[1].new_status).toBe("clean");

      // unit_id do historico e' o do apartamento -- nao um default qualquer.
      expect(history[0].unit_id).toBe(before.unit_id);
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("18 - encerrar manutencao grava DUAS linhas: blocking com motivo, housekeeping automatica", async () => {
    const room = rooms[4];
    const before = await readRoom(room.id);
    const reason = "[E2E] fim da manutencao, troca de peca.";

    try {
      // Estado de limpeza conhecido e DIFERENTE de dirty, para o previous_status da linha
      // automatica ter o que provar: se ele vier null, o historico nao responde "o 305
      // estava vistoriado quando entrou em obra?".
      await driveHousekeepingTo(gov, room.id, "inspected");
      await postTransition(gov, { roomIds: [room.id], dimension: "blocking", toStatus: "maintenance" });

      const since = new Date().toISOString();
      const { status } = await postTransition(gov, {
        roomIds: [room.id],
        dimension: "blocking",
        toStatus: "none",
        reason
      });
      expect(status).toBe(200);

      const history = await readHistorySince(room.id, since);
      expect(history).toHaveLength(2);

      const blocking = history.find((row) => row.dimension === "blocking");
      const housekeeping = history.find((row) => row.dimension === "housekeeping");

      expect(blocking).toBeDefined();
      expect(blocking?.previous_status).toBe("maintenance");
      expect(blocking?.new_status).toBe("none");
      expect(blocking?.reason).toBe(reason);
      expect(blocking?.organization_id).not.toBeNull();

      expect(housekeeping).toBeDefined();
      expect(housekeeping?.is_automatic).toBe(true);
      expect(housekeeping?.new_status).toBe("dirty");
      // O ponto do caso: previous_status REAL, nunca null.
      expect(housekeeping?.previous_status).toBe("inspected");
      expect(housekeeping?.organization_id).not.toBeNull();
    } finally {
      await restoreRoom(gov, before);
    }
  });

  test("19 - housekeeping_changed_at avanca na limpeza e NAO avanca em bloqueio que nao a tocou", async () => {
    const room = rooms[3];
    const before = await readRoom(room.id);

    try {
      await driveHousekeepingTo(gov, room.id, "dirty");

      const antesDaLimpeza = (await readRoom(room.id)).housekeeping_changed_at;

      await postTransition(gov, { roomIds: [room.id], dimension: "housekeeping", toStatus: "cleaning" });
      const depoisDaLimpeza = (await readRoom(room.id)).housekeeping_changed_at;

      expect(new Date(depoisDaLimpeza).getTime()).toBeGreaterThan(new Date(antesDaLimpeza).getTime());

      // Bloquear NAO mexe na limpeza -- logo nao pode zerar "Sujo ha 6 horas".
      await postTransition(gov, { roomIds: [room.id], dimension: "blocking", toStatus: "maintenance" });
      const depoisDoBloqueio = (await readRoom(room.id)).housekeeping_changed_at;

      expect(new Date(depoisDoBloqueio).getTime()).toBe(new Date(depoisDaLimpeza).getTime());
    } finally {
      await restoreRoom(gov, before);
    }
  });

  // ------------------------------------------------------------------------------- caso 20

  test("20 - a RPC continua FECHADA para quem nao e' service_role", async () => {
    // Trava que reprovou a primeira revisao e que um `create or replace` distraido desfaz
    // sem quebrar mais nada visivelmente. Ver o comentario de probeTransitionRpcAsAnon:
    // a prova e' comportamental porque pg_proc nao e' exposto pelo PostgREST.
    const { blocked, detail } = await probeTransitionRpcAsAnon();

    expect(blocked, `a RPC ficou executavel fora de service_role -> ${detail}`).toBe(true);
  });
});
