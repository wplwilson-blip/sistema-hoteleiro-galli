import { expect, test } from "@playwright/test";

import {
  ROOM_STATUS_VALUES,
  groupRoomsByFloorAndBlock,
  resolveRoomsView,
  roomStatusLabelMap,
  roomStatusTone,
  roomStatusToneMap,
  type RoomRecord
} from "../../src/components/base-cadastros/rooms-utils";

// Runner puro. Cobre a UH Fase 2 (plano docs/codex/68): mapa visual de apartamentos.
//
// O que estes testes protegem: um apartamento nunca some da grade por falta de ala/andar, a
// aba resolvida da URL nunca quebra a tela, e lista e mapa nunca discordam sobre a cor de
// uma situacao.

function room(overrides: Partial<RoomRecord> & { id: string; roomNumber: string }): RoomRecord {
  return {
    unitId: "unit-1",
    displayName: "",
    roomStatus: "available",
    // Tres dimensoes (plano 70). O fixture nasce vendavel -- vago, vistoriado, sem bloqueio.
    occupancyStatus: "vacant",
    housekeepingStatus: "inspected",
    blockingStatus: "none",
    capacity: 2,
    isConnecting: false,
    connectingRoomId: "",
    climateControl: "ventilador",
    hasMinibar: false,
    roomType: { id: "type-std", code: "STD", name: "Standard Duplo", category: "standard", capacity: 2, beds: 2 },
    block: { id: "block-100", code: "100", name: "Ala 100" },
    floor: { id: "floor-sub", code: "SUBSOLO", name: "Subsolo", number: -1 },
    ...overrides
  };
}

const SUBSOLO = { id: "floor-sub", code: "SUBSOLO", name: "Subsolo", number: -1 };
const TERREO = { id: "floor-ter", code: "TERREO", name: "Terreo", number: 0 };
const PRIMEIRO = { id: "floor-pri", code: "PRIMEIRO", name: "1o Andar", number: 1 };
const ALA_100 = { id: "block-100", code: "100", name: "Ala 100" };
const ALA_200 = { id: "block-200", code: "200", name: "Ala 200" };

// ------------------------------------------------------------------ agrupamento

test("agrupa por andar e, dentro do andar, por ala", () => {
  const groups = groupRoomsByFloorAndBlock([
    room({ id: "a", roomNumber: "211", floor: TERREO, block: ALA_200 }),
    room({ id: "b", roomNumber: "112", floor: SUBSOLO, block: ALA_100 }),
    room({ id: "c", roomNumber: "212", floor: TERREO, block: ALA_200 })
  ]);

  expect(groups.map((floor) => floor.floorName)).toEqual(["Subsolo", "Terreo"]);
  expect(groups[1].blocks).toHaveLength(1);
  expect(groups[1].blocks[0].rooms.map((item) => item.roomNumber)).toEqual(["211", "212"]);
});

test("ordena os andares por floor.number, nao por nome", () => {
  // Por nome, "1o Andar" viria antes de "Subsolo" e "Terreo" -- o mapa mostraria os andares
  // fora da ordem fisica do predio.
  const groups = groupRoomsByFloorAndBlock([
    room({ id: "a", roomNumber: "301", floor: PRIMEIRO }),
    room({ id: "b", roomNumber: "201", floor: TERREO }),
    room({ id: "c", roomNumber: "101", floor: SUBSOLO })
  ]);

  expect(groups.map((floor) => floor.floorNumber)).toEqual([-1, 0, 1]);
});

test("ordena as alas por nome e os apartamentos por numero", () => {
  const groups = groupRoomsByFloorAndBlock([
    room({ id: "a", roomNumber: "210", floor: TERREO, block: ALA_200 }),
    room({ id: "b", roomNumber: "29", floor: TERREO, block: ALA_200 }),
    room({ id: "c", roomNumber: "101", floor: TERREO, block: ALA_100 })
  ]);

  expect(groups[0].blocks.map((block) => block.blockName)).toEqual(["Ala 100", "Ala 200"]);
  // Numerico, nao alfabetico: "29" antes de "210" (alfabeticamente seria o contrario).
  expect(groups[0].blocks[1].rooms.map((item) => item.roomNumber)).toEqual(["29", "210"]);
});

test("apartamento SEM ala ou SEM andar cai em 'Não classificado' — nunca some da grade", () => {
  // block_id e floor_id sao NULLABLE em public.rooms (migration 004). Sumir em silencio e' o
  // pior comportamento possivel num inventario: a grade fica com cara de completa.
  const groups = groupRoomsByFloorAndBlock([
    room({ id: "a", roomNumber: "112", floor: SUBSOLO, block: ALA_100 }),
    room({ id: "b", roomNumber: "999", floor: null, block: null }),
    room({ id: "c", roomNumber: "888", floor: SUBSOLO, block: null })
  ]);

  const total = groups.reduce(
    (sum, floor) => sum + floor.blocks.reduce((blockSum, block) => blockSum + block.rooms.length, 0),
    0
  );

  expect(total, "nenhum apartamento pode ser descartado").toBe(3);

  const semAndar = groups.find((floor) => floor.floorName === "Não classificado");
  expect(semAndar, "grupo de andar não classificado deve existir").toBeTruthy();
  expect(semAndar?.blocks[0].rooms.map((item) => item.roomNumber)).toEqual(["999"]);

  const subsolo = groups.find((floor) => floor.floorName === "Subsolo");
  expect(subsolo?.blocks.map((block) => block.blockName)).toEqual(["Ala 100", "Não classificado"]);
});

test("o grupo sem andar vai para o FIM, nao para o comeco", () => {
  // null nao e' "antes do subsolo": um apartamento sem andar nao pode abrir o mapa.
  const groups = groupRoomsByFloorAndBlock([
    room({ id: "a", roomNumber: "999", floor: null }),
    room({ id: "b", roomNumber: "112", floor: SUBSOLO })
  ]);

  expect(groups.map((floor) => floor.floorName)).toEqual(["Subsolo", "Não classificado"]);
});

test("lista vazia devolve nenhum grupo", () => {
  expect(groupRoomsByFloorAndBlock([])).toEqual([]);
});

// ------------------------------------------------------------------ resolucao da aba

test("resolveRoomsView: 'mapa' abre o mapa", () => {
  expect(resolveRoomsView("mapa")).toBe("mapa");
});

test("resolveRoomsView: ausente, 'lista' ou lixo caem na lista", () => {
  // A aba vem da URL, que o usuario pode digitar. Qualquer coisa que nao seja "mapa" volta
  // para o padrao em vez de quebrar a tela.
  for (const value of [null, undefined, "", "lista", "MAPA", "mapa2", "qualquer", "0"]) {
    expect(resolveRoomsView(value), JSON.stringify(value)).toBe("lista");
  }
});

// ------------------------------------------------------------------ consistencia de tons

test("todo valor do enum room_status tem rotulo e tom", () => {
  // Se alguem acrescentar um status ao enum e esquecer os mapas, este teste cai ANTES de a
  // grade renderizar cinza e o rotulo aparecer em ingles na tela.
  for (const status of ROOM_STATUS_VALUES) {
    expect(roomStatusLabelMap[status], `rotulo ausente para ${status}`).toBeTruthy();
    expect(roomStatusToneMap[status], `tom ausente para ${status}`).toBeTruthy();
  }
});

test("status desconhecido cai em 'visual', sem quebrar", () => {
  expect(roomStatusTone("status_que_nao_existe")).toBe("visual");
});

test("manutencao e bloqueado sao 'danger'; livre e 'success'", () => {
  // A cor e' o que o operacional le' de longe no mapa: apartamento fora de servico tem de
  // saltar aos olhos, e livre nao pode competir com ele.
  expect(roomStatusTone("maintenance")).toBe("danger");
  expect(roomStatusTone("blocked")).toBe("danger");
  expect(roomStatusTone("available")).toBe("success");
});
