// Tipos e logica PURA compartilhados pela lista e pelo mapa de apartamentos (UH Fase 2,
// plano docs/codex/68).
//
// Vive num .ts separado dos componentes de proposito: e' o que permite testar agrupamento,
// resolucao de aba e consistencia de tons no runner puro, sem browser. E, principalmente,
// e' o que garante que a lista e o mapa leiam os MESMOS mapas de rotulo e tom -- duas
// copias divergiriam no primeiro status novo que alguem acrescentasse.

export type RoomTypeRef = {
  id: string;
  code: string;
  name: string;
  category: string;
  capacity: number | null;
  beds: number | null;
};

export type BlockRef = { id: string; code: string; name: string };
export type FloorRef = { id: string; code: string; name: string; number: number | null };

export type RoomRecord = {
  id: string;
  unitId: string;
  roomNumber: string;
  displayName: string;
  roomStatus: string;
  capacity: number | null;
  isConnecting: boolean;
  connectingRoomId: string;
  climateControl: string;
  hasMinibar: boolean;
  roomType: RoomTypeRef | null;
  block: BlockRef | null;
  floor: FloorRef | null;
};

export type RoomStatusTone = "success" | "warning" | "danger" | "info" | "visual";

/** Valores do enum public.room_status (migration 001), na ordem em que foram declarados. */
export const ROOM_STATUS_VALUES = [
  "available",
  "occupied",
  "dirty",
  "cleaning",
  "maintenance",
  "blocked",
  "inactive"
] as const;

export const roomStatusLabelMap: Record<string, string> = {
  available: "Livre",
  occupied: "Ocupado",
  dirty: "Sujo",
  cleaning: "Em limpeza",
  maintenance: "Manutenção",
  blocked: "Bloqueado",
  inactive: "Inativo"
};

export const roomStatusToneMap: Record<string, RoomStatusTone> = {
  available: "success",
  occupied: "info",
  dirty: "warning",
  cleaning: "warning",
  maintenance: "danger",
  blocked: "danger",
  inactive: "visual"
};

export const climateControlLabelMap: Record<string, string> = {
  ar_condicionado: "Ar-condicionado",
  ventilador: "Ventilador"
};

export function roomStatusLabel(value: string) {
  return roomStatusLabelMap[value] ?? value;
}

export function roomStatusTone(value: string): RoomStatusTone {
  return roomStatusToneMap[value] ?? "visual";
}

export function climateControlLabel(value: string) {
  if (!value) {
    return "-";
  }

  return climateControlLabelMap[value] ?? value;
}

export function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------- alternancia de visao

export type RoomsView = "lista" | "mapa";

/**
 * Resolve a aba a partir do query param `?view=`.
 *
 * O estado da aba vive na URL (e nao em useState) para o card da porta operacional em
 * Governanca/Manutencao poder linkar direto no mapa. Qualquer valor que nao seja "mapa"
 * cai na lista -- inclusive lixo e ausencia -- em vez de quebrar a tela.
 */
export function resolveRoomsView(value: string | null | undefined): RoomsView {
  return value === "mapa" ? "mapa" : "lista";
}

// ---------------------------------------------------------------- agrupamento do mapa

export type RoomsMapBlockGroup = {
  key: string;
  blockName: string;
  rooms: RoomRecord[];
};

export type RoomsMapFloorGroup = {
  key: string;
  floorName: string;
  floorNumber: number | null;
  blocks: RoomsMapBlockGroup[];
};

const UNCLASSIFIED_KEY = "__sem_classificacao__";
const UNCLASSIFIED_LABEL = "Não classificado";

/**
 * Agrupa os apartamentos por andar e, dentro de cada andar, por ala.
 *
 * `block_id` e `floor_id` sao NULLABLE em public.rooms (migration 004). Um apartamento sem
 * ala ou sem andar cai num grupo "Nao classificado" em vez de DESAPARECER da grade -- some
 * silenciosamente e' o pior comportamento possivel para um inventario, porque a tela fica
 * com cara de completa. O grupo sem andar vai para o fim.
 *
 * Ordenacao: andar por floor.number (Subsolo -1, Terreo 0, 1o 1), ala por nome, apartamento
 * por numero (comparacao numerica quando ambos sao numericos, para 9 nao vir depois de 10).
 */
export function groupRoomsByFloorAndBlock(rooms: RoomRecord[]): RoomsMapFloorGroup[] {
  const floors = new Map<string, RoomsMapFloorGroup>();

  for (const room of rooms) {
    const floorKey = room.floor?.id ?? UNCLASSIFIED_KEY;
    const blockKey = room.block?.id ?? UNCLASSIFIED_KEY;

    let floorGroup = floors.get(floorKey);

    if (!floorGroup) {
      floorGroup = {
        key: floorKey,
        floorName: room.floor?.name ?? UNCLASSIFIED_LABEL,
        floorNumber: room.floor?.number ?? null,
        blocks: []
      };
      floors.set(floorKey, floorGroup);
    }

    let blockGroup = floorGroup.blocks.find((block) => block.key === blockKey);

    if (!blockGroup) {
      blockGroup = {
        key: blockKey,
        blockName: room.block?.name ?? UNCLASSIFIED_LABEL,
        rooms: []
      };
      floorGroup.blocks.push(blockGroup);
    }

    blockGroup.rooms.push(room);
  }

  const ordered = Array.from(floors.values()).sort((a, b) => {
    // Sem andar vai para o fim, nao para o comeco (um null nao e' "antes do subsolo").
    if (a.floorNumber === null && b.floorNumber === null) {
      return a.floorName.localeCompare(b.floorName, "pt-BR");
    }

    if (a.floorNumber === null) {
      return 1;
    }

    if (b.floorNumber === null) {
      return -1;
    }

    return a.floorNumber - b.floorNumber;
  });

  for (const floorGroup of ordered) {
    floorGroup.blocks.sort((a, b) => {
      if (a.key === UNCLASSIFIED_KEY) {
        return 1;
      }

      if (b.key === UNCLASSIFIED_KEY) {
        return -1;
      }

      return a.blockName.localeCompare(b.blockName, "pt-BR");
    });

    for (const blockGroup of floorGroup.blocks) {
      blockGroup.rooms.sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber));
    }
  }

  return ordered;
}

/** Numero de apartamento e' TEXT no banco: compara como numero quando os dois forem. */
function compareRoomNumbers(a: string, b: string) {
  const numberA = Number(a);
  const numberB = Number(b);

  if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
    return numberA - numberB;
  }

  return a.localeCompare(b, "pt-BR", { numeric: true });
}
