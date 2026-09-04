import { NextResponse } from "next/server";
import { ROOM_PERMISSIONS } from "@/components/base-cadastros/rooms-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { apiError, logBaseCadastroError } from "@/lib/base-cadastros/api-helpers";

// A FONTE UNICA da tela da governanta (plano docs/codex/77, §4).
//
// Devolve o dia da data operacional com as tarefas e o apartamento de cada uma -- e, junto,
// OS DIAS ANTERIORES AINDA EM ABERTO.
//
// Esses dias anteriores vem na MESMA resposta de proposito (D3): a tela precisa avisar "o dia
// 04/09 continua aberto" para a governanta fechar com um clique, e fazer isso numa segunda
// consulta significaria que a tela pode renderizar sem o aviso enquanto a segunda nao volta --
// e um aviso que aparece depois e' um aviso que ela ja passou por cima.
//
// POR QUE NAO FECHAMOS SOZINHOS o dia esquecido: seria mudanca de estado silenciosa. Esta linha
// de trabalho ja recusou isso tres vezes pelo mesmo motivo -- o `available` que liberava para
// venda sozinho, a dispensa que nao podia virar transicao, a UI otimista que pintaria antes da
// confirmacao. O sistema nao decide por alguem que nao ficou sabendo.

type TaskRow = {
  id: string;
  room_id: string;
  outcome: string;
  service_type: string | null;
  decline_origin: string | null;
  decline_note: string | null;
  completed_at: string | null;
  carried_over_since: string | null;
  carried_over_days: number;
  rooms: {
    room_number: string;
    housekeeping_status: string;
    blocking_status: string;
    occupancy_status: string;
    housekeeping_changed_at: string;
    blocks: { name: string } | null;
    floors: { name: string; number: number | null } | null;
  } | null;
};

export async function GET(request: Request) {
  const { context, response } = await requirePermission(ROOM_PERMISSIONS.view, { scope: "active-unit" });

  if (response || !context) {
    return response;
  }

  try {
    const supabase = context.supabase;
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unitId") ?? "";

    if (!unitId) {
      return apiError("Informe a unidade.", 400);
    }

    if (!context.accessibleUnitIds.includes(unitId) && !context.isSuperAdmin) {
      // Mesma mensagem do "nao encontrado" das demais rotas: distinguir contaria a um usuario
      // de outra unidade que aquela unidade existe.
      return apiError("Unidade nao encontrada.", 404);
    }

    // A data operacional vem da MESMA funcao que a RPC usa (091). Calcula-la aqui em JS
    // deixaria dois calculos que podem divergir -- e o fuso da unidade e' justamente o que a
    // D7 do plano 75 corrigiu depois de o servidor em UTC virar o dia as 21h.
    const { data: serviceDate, error: dateError } = await supabase.rpc("housekeeping_service_date", {
      p_at: new Date().toISOString(),
      p_unit_id: unitId
    });

    if (dateError) {
      logBaseCadastroError("rooms.day_service_date_failed", dateError);
      return apiError("Nao foi possivel resolver a data operacional.", 500);
    }

    const { data: days, error: daysError } = await supabase
      .from("housekeeping_days")
      .select("id, service_date, opened_at, opened_by, closed_at, closed_by")
      .eq("unit_id", unitId)
      .lte("service_date", serviceDate as string)
      .order("service_date", { ascending: false })
      .limit(30);

    if (daysError) {
      logBaseCadastroError("rooms.day_lookup_failed", daysError);
      return apiError("Nao foi possivel carregar o dia.", 500);
    }

    const rows = (days ?? []) as Array<{ id: string; service_date: string; closed_at: string | null }>;
    const today = rows.find((row) => row.service_date === serviceDate) ?? null;

    // Dias ANTERIORES que ficaram abertos. O de hoje nao entra: ele esta aberto porque ainda
    // esta acontecendo, e nao porque alguem esqueceu.
    const stalePreviousDays = rows.filter((row) => row.service_date !== serviceDate && row.closed_at === null);

    if (!today) {
      // DIA SEM REGISTRO E' SILENCIO, NAO ZERO. A resposta diz explicitamente que o dia nao foi
      // aberto, em vez de devolver uma lista vazia que a tela nao teria como distinguir de um
      // dia sem trabalho nenhum.
      return NextResponse.json({
        ok: true,
        serviceDate,
        day: null,
        tasks: [],
        counts: {},
        stalePreviousDays
      });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("housekeeping_tasks")
      .select(
        "id, room_id, outcome, service_type, decline_origin, decline_note, completed_at, carried_over_since, carried_over_days, rooms(room_number, housekeeping_status, blocking_status, occupancy_status, housekeeping_changed_at, blocks(name), floors(name, number))"
      )
      .eq("housekeeping_day_id", today.id)
      .is("deleted_at", null);

    if (tasksError) {
      logBaseCadastroError("rooms.day_tasks_failed", tasksError);
      return apiError("Nao foi possivel carregar a fila do dia.", 500);
    }

    const list = ((tasks ?? []) as unknown as TaskRow[]).map((task) => ({
      id: task.id,
      roomId: task.room_id,
      outcome: task.outcome,
      serviceType: task.service_type,
      declineOrigin: task.decline_origin,
      declineNote: task.decline_note,
      completedAt: task.completed_at,
      // A sobra vai como os DOIS campos. `carriedOverSince` e' a fonte; `carriedOverDays` e'
      // conveniencia para a tela nao ter que contar dias registrados (plano 77, D6).
      carriedOverSince: task.carried_over_since,
      carriedOverDays: task.carried_over_days,
      roomNumber: task.rooms?.room_number ?? "",
      housekeepingStatus: task.rooms?.housekeeping_status ?? "",
      blockingStatus: task.rooms?.blocking_status ?? "",
      occupancyStatus: task.rooms?.occupancy_status ?? "",
      housekeepingChangedAt: task.rooms?.housekeeping_changed_at ?? null,
      blockName: task.rooms?.blocks?.name ?? null,
      floorName: task.rooms?.floors?.name ?? null,
      floorNumber: task.rooms?.floors?.number ?? null
    }));

    const counts = list.reduce<Record<string, number>>((acc, task) => {
      acc[task.outcome] = (acc[task.outcome] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({ ok: true, serviceDate, day: today, tasks: list, counts, stalePreviousDays });
  } catch (error) {
    logBaseCadastroError("rooms.day_current_unexpected", error instanceof Error ? error : { message: "unknown" });
    return apiError("Nao foi possivel carregar o dia.", 500);
  }
}
