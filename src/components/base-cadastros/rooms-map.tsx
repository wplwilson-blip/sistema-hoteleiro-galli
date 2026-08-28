"use client";

import { useMemo } from "react";
import { Link2, Snowflake, Wind } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import {
  ROOM_STATUS_VALUES,
  climateControlLabel,
  groupRoomsByFloorAndBlock,
  roomStatusLabel,
  roomStatusTone,
  type RoomRecord,
  type RoomStatusTone
} from "@/components/base-cadastros/rooms-utils";

// Cores da PORTA no mapa. Derivadas do mesmo tom que a lista usa no StatusBadge
// (roomStatusTone), para lista e mapa nunca discordarem sobre o que e' cada situacao.
const toneCardClassMap: Record<RoomStatusTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
  visual: "border-border bg-muted text-muted-foreground"
};

function buildRoomTitle(room: RoomRecord) {
  return [
    `Apartamento ${room.roomNumber}`,
    room.roomType ? `Tipo: ${room.roomType.name} (${room.roomType.code})` : "Tipo: não classificado",
    room.capacity === null ? "Capacidade: não informada" : `Capacidade: ${room.capacity} PAX`,
    `Situação: ${roomStatusLabel(room.roomStatus)}`,
    `Conjugada: ${room.isConnecting ? "Sim" : "Não"}`,
    `Climatização: ${climateControlLabel(room.climateControl)}`,
    `Frigobar: ${room.hasMinibar ? "Sim" : "Não"}`
  ].join(" · ");
}

function RoomDoor({ room }: { room: RoomRecord }) {
  const tone = roomStatusTone(room.roomStatus);

  return (
    <div
      className={`flex w-full flex-col gap-1 rounded-lg border px-2 py-2 text-center shadow-sm ${toneCardClassMap[tone]}`}
      title={buildRoomTitle(room)}
      data-testid={`apartamento-porta-${room.roomNumber}`}
    >
      <span className="text-base font-semibold leading-none">{room.roomNumber}</span>
      <span className="text-[11px] font-medium leading-none opacity-80">{room.roomType?.code ?? "—"}</span>

      {/* Rodape VISIVEL com o detalhe. O `title` acima nao aparece em toque e nao e' lido
          por leitor de tela -- sozinho, deixaria a informacao inacessivel em celular. */}
      <span className="text-[11px] leading-tight opacity-80">
        {room.capacity === null ? "-" : `${room.capacity} PAX`} · {roomStatusLabel(room.roomStatus)}
      </span>
      <span className="flex items-center justify-center gap-1 text-[11px] opacity-80">
        {room.isConnecting ? <Link2 className="h-3 w-3" aria-label="Conjugada" /> : null}
        {room.climateControl === "ar_condicionado" ? <Snowflake className="h-3 w-3" aria-label="Ar-condicionado" /> : null}
        {room.climateControl === "ventilador" ? <Wind className="h-3 w-3" aria-label="Ventilador" /> : null}
      </span>
    </div>
  );
}

export function RoomsMap({ rooms }: { rooms: RoomRecord[] }) {
  const groups = useMemo(() => groupRoomsByFloorAndBlock(rooms), [rooms]);

  // So' entram na legenda as situacoes presentes na tela: legenda com item que nao aparece
  // na grade ensina errado.
  const statusesInView = useMemo(() => {
    const found = new Set(rooms.map((room) => room.roomStatus));

    return ROOM_STATUS_VALUES.filter((status) => found.has(status));
  }, [rooms]);

  return (
    <div className="space-y-4">
      {/* Legenda FIXA acima da grade: grade colorida sem legenda obriga a decorar cor. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-xs shadow-sm shadow-primary/5">
        <span className="font-medium text-muted-foreground">Situação:</span>
        {statusesInView.map((status) => (
          <StatusBadge key={status} status={roomStatusTone(status)} label={roomStatusLabel(status)} />
        ))}
        <span className="ml-2 flex items-center gap-1 text-muted-foreground">
          <Link2 className="h-3 w-3" /> conjugada
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Snowflake className="h-3 w-3" /> ar-condicionado
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Wind className="h-3 w-3" /> ventilador
        </span>
      </div>

      {groups.map((floor) => (
        <section key={floor.key} className="space-y-3 rounded-lg border bg-card p-4 shadow-sm shadow-primary/5">
          <h3 className="text-sm font-semibold">{floor.floorName}</h3>

          {floor.blocks.map((block) => (
            <div key={`${floor.key}-${block.key}`} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {block.blockName} · {block.rooms.length} {block.rooms.length === 1 ? "apartamento" : "apartamentos"}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
                {block.rooms.map((room) => (
                  <RoomDoor key={room.id} room={room} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
