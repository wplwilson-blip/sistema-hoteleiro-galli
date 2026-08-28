import { NextResponse } from "next/server";
import { BASE_PERMISSIONS, requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";
import type { BlockingStatus, HousekeepingStatus, OccupancyStatus } from "@/components/base-cadastros/rooms-utils";

// Linhas com os relacionamentos embutidos pelo PostgREST. Os joins vem como OBJETO quando
// a FK e' um-para-um do lado do filho -- mas o tipo gerado pelo supabase-js as vezes os
// descreve como array, entao normalizamos em `pickRelation` abaixo.
type RelatedRoomType = {
  id: string;
  code: string;
  name: string;
  category: string;
  capacity: number | null;
  beds: number | null;
};

type RelatedBlock = {
  id: string;
  code: string;
  name: string;
};

type RelatedFloor = {
  id: string;
  code: string;
  name: string;
  number: number | null;
};

type RoomRow = {
  id: string;
  unit_id: string;
  room_number: string;
  display_name: string | null;
  room_status: string;
  occupancy_status: OccupancyStatus;
  housekeeping_status: HousekeepingStatus;
  blocking_status: BlockingStatus;
  capacity: number | null;
  is_connecting: boolean | null;
  connecting_room_id: string | null;
  climate_control: string | null;
  has_minibar: boolean | null;
  room_types: RelatedRoomType | RelatedRoomType[] | null;
  blocks: RelatedBlock | RelatedBlock[] | null;
  floors: RelatedFloor | RelatedFloor[] | null;
};

/** O embed do PostgREST pode chegar como objeto ou como array de um item. */
function pickRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapRoom(row: RoomRow) {
  const roomType = pickRelation(row.room_types);
  const block = pickRelation(row.blocks);
  const floor = pickRelation(row.floors);

  return {
    id: row.id,
    unitId: row.unit_id,
    roomNumber: row.room_number,
    displayName: row.display_name ?? "",
    // LEGADO (plano 70, D2): nenhuma tela le mais este campo. Continua no payload enquanto
    // a coluna existir, e sai junto com ela na migration seguinte.
    roomStatus: row.room_status,
    // As tres dimensoes reais. Sao `not null` com default no banco (089), entao nao ha
    // fallback aqui de proposito: um nulo aqui seria bug de schema, e mascara-lo com
    // `?? "dirty"` esconderia justamente o apartamento cujo estado se perdeu.
    occupancyStatus: row.occupancy_status,
    housekeepingStatus: row.housekeeping_status,
    blockingStatus: row.blocking_status,
    capacity: row.capacity,
    isConnecting: Boolean(row.is_connecting),
    connectingRoomId: row.connecting_room_id ?? "",
    climateControl: row.climate_control ?? "",
    hasMinibar: Boolean(row.has_minibar),
    roomType: roomType
      ? { id: roomType.id, code: roomType.code, name: roomType.name, category: roomType.category, capacity: roomType.capacity, beds: roomType.beds }
      : null,
    block: block ? { id: block.id, code: block.code, name: block.name } : null,
    floor: floor ? { id: floor.id, code: floor.code, name: floor.name, number: floor.number } : null
  };
}

export async function GET() {
  const { context, response } = await requirePermission(BASE_PERMISSIONS.roomsView, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const accessibleUnitIds = context.accessibleUnitIds;

    // Escopo ja' estreitado pelo gate (`scope: "active-unit"`). Lista vazia = sem unidade
    // acessivel: devolve vazio em vez de consultar sem filtro, que traria o parque inteiro.
    if (!accessibleUnitIds.length) {
      return NextResponse.json({ ok: true, rooms: [] });
    }

    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select(
        "id, unit_id, room_number, display_name, room_status, occupancy_status, housekeeping_status, blocking_status, capacity, is_connecting, connecting_room_id, climate_control, has_minibar, room_types(id, code, name, category, capacity, beds), blocks(id, code, name), floors(id, code, name, number)"
      )
      .in("unit_id", accessibleUnitIds)
      .is("deleted_at", null)
      .order("room_number", { ascending: true });

    if (roomsError) {
      logBaseCadastroError("rooms.list_failed", roomsError);
      return apiError("Nao foi possivel carregar os apartamentos.", 500);
    }

    return NextResponse.json({
      ok: true,
      rooms: ((rooms ?? []) as unknown as RoomRow[]).map(mapRoom)
    });
  } catch (error) {
    logBaseCadastroError("rooms.list_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel carregar os apartamentos.", 500);
  }
}
