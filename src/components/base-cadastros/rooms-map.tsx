"use client";

import { useMemo } from "react";
import { DoorOpen, Fan, Refrigerator, Snowflake, Users, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import {
  blockingStatusLabel,
  climateControlLabel,
  describeRoomState,
  housekeepingStatusLabel,
  groupRoomsByFloorAndBlock,
  type RoomRecord,
  type RoomState,
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

/**
 * Icone com significado ACESSIVEL.
 *
 * Licao das fatias M3/C6: icone sozinho nao e' lido por leitor de tela e o `title` nao
 * aparece em toque. Por isso cada icone carrega `aria-label` + `title` no wrapper e um
 * `<span class="sr-only">` com o texto -- e, no card, o mesmo significado continua escrito
 * por extenso no rodape e no tooltip do card inteiro.
 */
function MeaningfulIcon({ icon: Icon, label, className = "h-3 w-3" }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex items-center">
      <Icon className={className} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Climatizacao -> icone. `null` quando nao informada (nao inventa um icone padrao). */
function climateIcon(value: string): { icon: LucideIcon; label: string } | null {
  if (value === "ar_condicionado") {
    return { icon: Snowflake, label: "Ar-condicionado" };
  }

  if (value === "ventilador") {
    return { icon: Fan, label: "Ventilador" };
  }

  return null;
}

/** As tres dimensoes do apartamento, no formato que rooms-utils espera. */
function roomState(room: RoomRecord): RoomState {
  return {
    record: room.recordStatus,
    occupancy: room.occupancyStatus,
    housekeeping: room.housekeepingStatus,
    blocking: room.blockingStatus
  };
}

function buildRoomTitle(room: RoomRecord) {
  const state = describeRoomState(roomState(room));

  return [
    `Apartamento ${room.roomNumber}`,
    room.roomType ? `Tipo: ${room.roomType.name} (${room.roomType.code})` : "Tipo: não classificado",
    room.capacity === null ? "Capacidade: não informada" : `Capacidade: ${room.capacity} PAX`,
    // As tres dimensoes por extenso: a porta mostra so' a que manda (bloqueio > ocupacao >
    // limpeza), e o detalhe completo nao pode ficar so' na cor.
    `Situação: ${state.label}`,
    `Limpeza: ${housekeepingStatusLabel(room.housekeepingStatus)}`,
    `Bloqueio: ${blockingStatusLabel(room.blockingStatus)}`,
    `Vendável: ${state.sellable ? "Sim" : "Não"}`,
    `Conjugada: ${room.isConnecting ? "Sim" : "Não"}`,
    `Climatização: ${climateControlLabel(room.climateControl)}`,
    `Frigobar: ${room.hasMinibar ? "Sim" : "Não"}`
  ].join(" · ");
}

function RoomDoor({ room }: { room: RoomRecord }) {
  // Cor pela COMBINACAO das tres dimensoes, nunca por um campo unico: um apartamento em
  // manutencao que por acaso esta `inspected` nao pode aparecer verde.
  const state = describeRoomState(roomState(room));
  const climate = climateIcon(room.climateControl);

  return (
    <div
      className={`flex w-full flex-col gap-1 rounded-lg border px-2 py-2 text-center shadow-sm ${toneCardClassMap[state.tone]}`}
      title={buildRoomTitle(room)}
      data-testid={`apartamento-porta-${room.roomNumber}`}
    >
      <span className="text-base font-semibold leading-none">{room.roomNumber}</span>
      <span className="text-[11px] font-medium leading-none opacity-80">{room.roomType?.code ?? "—"}</span>

      {/* Linha compacta de icones: leitura de relance no mapa. O significado NAO vive so'
          aqui -- continua por extenso no rodape abaixo e no tooltip do card. */}
      <span className="flex flex-wrap items-center justify-center gap-1 opacity-80">
        {climate ? <MeaningfulIcon icon={climate.icon} label={climate.label} /> : null}
        {room.hasMinibar ? <MeaningfulIcon icon={Refrigerator} label="Frigobar" /> : null}
        {room.isConnecting ? <MeaningfulIcon icon={DoorOpen} label="Conjugada" /> : null}
        {room.capacity === null ? null : (
          <span className="inline-flex items-center gap-0.5 text-[11px] leading-none">
            <MeaningfulIcon icon={Users} label={`Capacidade: ${room.capacity} PAX`} />
            <span aria-hidden="true">{room.capacity}</span>
          </span>
        )}
      </span>

      {/* Rodape VISIVEL com o detalhe textual. O `title` do card nao aparece em toque e nao
          e' lido por leitor de tela -- sozinho, deixaria a informacao inacessivel no
          celular, que e' onde a governanca de fato usa o mapa. */}
      <span className="text-[11px] leading-tight opacity-80">
        {room.capacity === null ? "-" : `${room.capacity} PAX`} · {state.label}
      </span>
    </div>
  );
}

const amenityLegend: Array<{ icon: LucideIcon; label: string }> = [
  { icon: Snowflake, label: "Ar-condicionado" },
  { icon: Fan, label: "Ventilador" },
  { icon: Refrigerator, label: "Frigobar" },
  { icon: DoorOpen, label: "Conjugada" },
  { icon: Users, label: "Capacidade (PAX)" }
];

export function RoomsMap({ rooms }: { rooms: RoomRecord[] }) {
  const groups = useMemo(() => groupRoomsByFloorAndBlock(rooms), [rooms]);

  // So' entram na legenda as situacoes presentes na tela: legenda com item que nao aparece
  // na grade ensina errado.
  //
  // A legenda e' derivada de describeRoomState -- a MESMA funcao que pinta a porta. Montar
  // uma lista fixa aqui traria de volta a divergencia entre o que a grade mostra e o que a
  // legenda diz, que e' justamente o que rooms-utils.ts existe para impedir.
  const statusesInView = useMemo(() => {
    const found = new Map<string, RoomStatusTone>();

    for (const room of rooms) {
      const state = describeRoomState(roomState(room));

      if (!found.has(state.label)) {
        found.set(state.label, state.tone);
      }
    }

    return Array.from(found.entries())
      .map(([label, tone]) => ({ label, tone }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [rooms]);

  return (
    <div className="space-y-4">
      {/* Legenda FIXA acima da grade, em duas partes: cor = situacao, icone = comodidade.
          Grade colorida com iconografia e sem legenda obriga a decorar os dois codigos. */}
      <div className="space-y-2 rounded-lg border bg-card p-3 text-xs shadow-sm shadow-primary/5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-muted-foreground">Situação:</span>
          {statusesInView.map((status) => (
            <StatusBadge key={status.label} status={status.tone} label={status.label} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-2">
          <span className="font-medium text-muted-foreground">Comodidades:</span>
          {amenityLegend.map((item) => (
            <span key={item.label} className="flex items-center gap-1 text-muted-foreground">
              <MeaningfulIcon icon={item.icon} label={item.label} />
              {/* Rotulo VISIVEL ao lado do icone -- a legenda existe justamente para quem
                  ainda nao sabe o que o icone quer dizer. */}
              <span aria-hidden="true">{item.label}</span>
            </span>
          ))}
        </div>
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
