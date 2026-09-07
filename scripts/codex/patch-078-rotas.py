# -*- coding: utf-8 -*-
"""Fatia 78: catalogo de permissao, rota de transicao e o gate da dispensa."""
import io
import sys


def patch(caminho, trocas):
    s = io.open(caminho, encoding="utf-8").read()

    for velho, novo, rotulo in trocas:
        if s.count(velho) != 1:
            sys.exit("%s -- esperava 1 ocorrencia (achou %d): %s" % (caminho, s.count(velho), rotulo))
        s = s.replace(velho, novo, 1)

    io.open(caminho, "w", encoding="utf-8", newline="\n").write(s)
    print("ok " + caminho)


# ------------------------------------------------------------------ catalogo server-only
patch(
    "src/lib/auth/permissions.ts",
    [
        (
            """  // Apartamentos (UHs) — 088 (view/block/manage) e 089 (housekeeping/inspect).""",
            """  // Apartamentos (UHs) — 088 (view/block/manage), 089 (housekeeping/inspect) e
  // 093 (occupancy).""",
            "comentario do bloco de apartamentos",
        ),
        (
            """  roomsInspect: ROOM_PERMISSIONS.inspect
} as const;""",
            """  roomsInspect: ROOM_PERMISSIONS.inspect,
  roomsOccupancy: ROOM_PERMISSIONS.occupancy
} as const;""",
            "roomsOccupancy",
        ),
    ],
)

# ------------------------------------------------------------------ rota de transicao
patch(
    "src/app/api/base/rooms/transitions/route.ts",
    [
        (
            """    const [hasHousekeeping, hasInspect, hasBlock] = await Promise.all([
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.inspect, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.block, unitId)
    ]);

    const heldCodes: Array<RoomPermissionCode | null> = [
      hasHousekeeping ? ROOM_PERMISSIONS.housekeeping : null,
      hasInspect ? ROOM_PERMISSIONS.inspect : null,
      hasBlock ? ROOM_PERMISSIONS.block : null
    ];""",
            """    const [hasHousekeeping, hasInspect, hasBlock, hasOccupancy] = await Promise.all([
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.housekeeping, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.inspect, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.block, unitId),
      userHasPermissionForUnit(supabase, context.session, ROOM_PERMISSIONS.occupancy, unitId)
    ]);

    const heldCodes: Array<RoomPermissionCode | null> = [
      hasHousekeeping ? ROOM_PERMISSIONS.housekeeping : null,
      hasInspect ? ROOM_PERMISSIONS.inspect : null,
      hasBlock ? ROOM_PERMISSIONS.block : null,
      // Plano 78: a ocupacao passou a ter escritor. Sem esta linha, `canTransition` receberia
      // a lista SEM o codigo e negaria todo check-in com 403 -- o "botao morto" da D3.
      hasOccupancy ? ROOM_PERMISSIONS.occupancy : null
    ];""",
            "permissao de ocupacao resolvida por unidade",
        ),
        (
            """        housekeeping_effect: dimension === "blocking" ? decision.effects.housekeeping ?? null : null,""",
            """        // O EFEITO VEM DA DECISAO, seja qual for a dimensao. Ate' a fatia 78 esta linha
        // filtrava `dimension === "blocking"` porque era a unica com efeito colateral. Com o
        // check-out (occupancy -> vacant, que derruba a limpeza para `dirty`), o filtro
        // mandaria efeito NULO e a RPC recusaria com CHECKOUT_REQUIRES_DIRTY -- a trava
        // funcionando contra a propria rota. Ler a decisao e' o que mantem as duas pontas
        // dizendo a mesma coisa.
        housekeeping_effect: decision.effects.housekeeping ?? null,""",
            "efeito colateral generico",
        ),
        (
            """      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_BEFORE_LAST")) {
        return apiError("A hora informada e' anterior ao ultimo lancamento deste apartamento hoje.", 422);
      }""",
            """      if (message.includes("ROOMS_TRANSITION_OCCURRED_AT_BEFORE_LAST")) {
        return apiError("A hora informada e' anterior ao ultimo lancamento deste apartamento hoje.", 422);
      }

      // AS DUAS RECUSAS DE FORMA DA OCUPACAO (plano 78, D1).
      //
      // Em operacao normal elas NAO acontecem: a rota so' monta o item depois que
      // `canTransition` aprovou, e a matriz de la' produz exatamente as duas formas que a RPC
      // aceita. Estao mapeadas porque o dia em que acontecerem sera' o dia em que as duas
      // pontas DIVERGIRAM -- e divergencia tem que aparecer como 422 legivel, nao como 500
      // generico que manda todo mundo procurar no lugar errado.
      if (message.includes("ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY")) {
        return apiError(
          "O check-out devolve o apartamento para a governanca: de ocupado para livre nao existe.",
          422
        );
      }

      if (message.includes("ROOMS_TRANSITION_OCCUPANCY_INVALID_FORM")) {
        return apiError("A ocupacao aceita apenas check-in e check-out.", 422);
      }""",
            "mapeamento dos dois erros novos",
        ),
    ],
)
