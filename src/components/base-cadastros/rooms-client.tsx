"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorMessage, Field, LoadingTable, SelectField, TextInput } from "@/components/base-cadastros/crud-components";
import { RoomsMap } from "@/components/base-cadastros/rooms-map";
import {
  climateControlLabel,
  describeRoomState,
  normalizeSearchValue,
  resolveRoomsView,
  type RoomRecord,
  type RoomState
} from "@/components/base-cadastros/rooms-utils";

/**
 * As tres dimensoes do apartamento (plano 70). A lista e o mapa leem pela MESMA funcao
 * (`describeRoomState`): enquanto a lista lia `roomStatus` legado e o mapa lia as tres
 * dimensoes, as duas telas passavam a discordar na PRIMEIRA transicao registrada.
 */
function roomState(room: RoomRecord): RoomState {
  return {
    occupancy: room.occupancyStatus,
    housekeeping: room.housekeepingStatus,
    blocking: room.blockingStatus
  };
}

type RoomListResponse = {
  ok: true;
  rooms: RoomRecord[];
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }

  return payload;
}

export function RoomsClient() {
  // Unidade ativa na queryKey: trocar a unidade no cabecalho refaz o fetch da lista, que e'
  // escopada por unidade no servidor (scope: "active-unit").
  const activeUnitId = useAppStore((state) => state.activeUnit.id);

  // A aba vive na URL (?view=mapa), nao em useState: e' o que permite o card da porta
  // operacional (Governanca/Manutencao) linkar direto no mapa.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const view = resolveRoomsView(searchParams.get("view"));

  const changeView = useCallback(
    (nextView: "lista" | "mapa") => {
      const params = new URLSearchParams(searchParams.toString());

      if (nextView === "mapa") {
        params.set("view", "mapa");
      } else {
        params.delete("view");
      }

      const query = params.toString();

      // `replace`, nao `push`: alternar aba nao deve empilhar historico -- o Voltar do
      // navegador tem de sair da tela, nao desfazer cliques de aba.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const roomsQuery = useQuery({
    queryKey: ["base", "rooms", activeUnitId],
    queryFn: async () => requestJson<RoomListResponse>("/api/base/rooms")
  });

  const rooms = useMemo(() => roomsQuery.data?.rooms ?? [], [roomsQuery.data?.rooms]);

  // Opcoes dos filtros derivadas da propria lista: so' aparece o que existe no inventario
  // da unidade ativa, em vez de um catalogo fixo com opcoes que nunca casariam.
  const blockOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const room of rooms) {
      if (room.block) {
        map.set(room.block.id, room.block.name);
      }
    }

    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rooms]);

  const floorOptions = useMemo(() => {
    const map = new Map<string, { name: string; number: number | null }>();

    for (const room of rooms) {
      if (room.floor) {
        map.set(room.floor.id, { name: room.floor.name, number: room.floor.number });
      }
    }

    return Array.from(map, ([id, value]) => ({ id, ...value })).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }, [rooms]);

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const room of rooms) {
      if (room.roomType) {
        map.set(room.roomType.id, `${room.roomType.code} - ${room.roomType.name}`);
      }
    }

    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rooms]);

  // O filtro passa a operar sobre o rotulo COMBINADO -- o mesmo texto que a coluna Situacao
  // mostra. Filtrar por um valor que a tela nao exibe seria pedir ao usuario que adivinhasse.
  const statusOptions = useMemo(() => {
    const found = new Set(rooms.map((room) => describeRoomState(roomState(room)).label));

    return Array.from(found).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    const term = normalizeSearchValue(search);

    return rooms.filter((room) => {
      if (blockFilter !== "all" && room.block?.id !== blockFilter) {
        return false;
      }

      if (floorFilter !== "all" && room.floor?.id !== floorFilter) {
        return false;
      }

      if (typeFilter !== "all" && room.roomType?.id !== typeFilter) {
        return false;
      }

      if (statusFilter !== "all" && describeRoomState(roomState(room)).label !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [room.roomNumber, room.displayName]
        .filter(Boolean)
        .some((value) => normalizeSearchValue(String(value)).includes(term));
    });
  }, [blockFilter, floorFilter, rooms, search, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm shadow-primary/5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Buscar apartamento">
            <TextInput
              value={search}
              placeholder="Número do apartamento"
              onChange={(event) => setSearch(event.target.value)}
              data-testid="apartamentos-busca"
            />
          </Field>
          <Field label="Ala">
            <SelectField value={blockFilter} onChange={(event) => setBlockFilter(event.target.value)}>
              <option value="all">Todas as alas</option>
              {blockOptions.map((block) => (
                <option key={block.id} value={block.id}>{block.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Andar">
            <SelectField value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)}>
              <option value="all">Todos os andares</option>
              {floorOptions.map((floor) => (
                <option key={floor.id} value={floor.id}>{floor.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Tipo">
            <SelectField value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Todos os tipos</option>
              {typeOptions.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Situação">
            <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todas as situações</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {filteredRooms.length} de {rooms.length} apartamentos
          </p>
          {/* Os filtros acima valem para as DUAS visoes (mesmo estado): alternar a aba
              preserva o recorte -- e' a mesma tela vendo o mesmo conjunto de outro jeito. */}
          <div className="flex gap-1 rounded-md border bg-background p-1">
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => changeView("lista")}
              aria-pressed={view === "lista"}
              data-testid="apartamentos-aba-lista"
            >
              Lista
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${view === "mapa" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => changeView("mapa")}
              aria-pressed={view === "mapa"}
              data-testid="apartamentos-aba-mapa"
            >
              Mapa
            </button>
          </div>
        </div>
      </div>

      {roomsQuery.isLoading ? <LoadingTable label="Carregando apartamentos..." /> : null}
      {roomsQuery.error ? (
        <ErrorMessage message={roomsQuery.error instanceof Error ? roomsQuery.error.message : "Erro ao carregar apartamentos."} />
      ) : null}
      {!roomsQuery.isLoading && !roomsQuery.error && !filteredRooms.length ? (
        <EmptyState
          title="Nenhum apartamento encontrado"
          description={
            rooms.length
              ? "Nenhum apartamento corresponde aos filtros aplicados. Ajuste a busca para ver os demais."
              : "Não há apartamentos cadastrados para a unidade ativa."
          }
        />
      ) : null}
      {filteredRooms.length && view === "mapa" ? <RoomsMap rooms={filteredRooms} /> : null}
      {filteredRooms.length && view === "lista" ? (
        <div className="max-w-full overflow-x-auto rounded-lg border bg-card shadow-sm shadow-primary/5">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Apartamento</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Ala</th>
                <th className="px-4 py-3 font-semibold">Andar</th>
                <th className="px-4 py-3 font-semibold">Capacidade</th>
                <th className="px-4 py-3 font-semibold">Situação</th>
                <th className="px-4 py-3 font-semibold">Conjugada</th>
                <th className="px-4 py-3 font-semibold">Climatização</th>
                <th className="px-4 py-3 font-semibold">Frigobar</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRooms.map((room) => (
                <tr key={room.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{room.roomNumber}</p>
                    {room.displayName ? <p className="mt-1 text-xs text-muted-foreground">{room.displayName}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {room.roomType ? (
                      <>
                        <p className="font-medium text-foreground">{room.roomType.name}</p>
                        <p className="mt-1 text-xs">{room.roomType.code}</p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{room.block?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{room.floor?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {room.capacity === null ? "-" : `${room.capacity} PAX`}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={describeRoomState(roomState(room)).tone}
                      label={describeRoomState(roomState(room)).label}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{room.isConnecting ? "Sim" : "Não"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{climateControlLabel(room.climateControl)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{room.hasMinibar ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
