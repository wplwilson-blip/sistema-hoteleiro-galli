# -*- coding: utf-8 -*-
"""Reforca o 78.9 (prova a CAUSA da recusa) e acrescenta o 78.13 (item 6 da VALIDACAO)."""
import io
import sys

P = "tests/e2e/rooms-transitions.e2e.spec.ts"
s = io.open(P, encoding="utf-8").read()


def troca(velho, novo, rotulo):
    global s
    if s.count(velho) != 1:
        sys.exit("esperava 1 ocorrencia (achou %d): %s" % (s.count(velho), rotulo))
    s = s.replace(velho, novo, 1)


# ------------------------------------------------------------------ 78.9 prova a CAUSA
troca(
    '''  test("78.9 - a GOVERNANCA nao marca ocupacao: 403 (a metade reciproca da D4)", async () => {
    const alvo = rooms[0];

    const resposta = await gov.post("/api/base/rooms/occupancy", {
      data: { entries: [{ roomId: alvo.id, event: "check_in" }] },
      headers: { "content-type": "application/json" }
    });

    // 403 e nao 422: e' falta de permissao, e a governanta nao deve descobrir pela mensagem
    // que faltava so' preencher um campo. Cada setor escreve numa dimensao so'.
    expect(resposta.status()).toBe(403);
  });''',
    '''  test("78.9 - a GOVERNANCA nao marca ocupacao: 403 PELA CAUSA CERTA (metade reciproca da D4)", async () => {
    const alvo = rooms[0];
    const antes = await readRoom(alvo.id);

    const resposta = await gov.post("/api/base/rooms/occupancy", {
      data: { entries: [{ roomId: alvo.id, event: "check_in" }] },
      headers: { "content-type": "application/json" }
    });

    const corpo = (await resposta.json().catch(() => ({}))) as { message?: string };

    // 403 e nao 422: e' falta de permissao, e a governanta nao deve descobrir pela mensagem
    // que faltava so' preencher um campo. Cada setor escreve numa dimensao so'.
    expect(resposta.status()).toBe(403);

    // A CAUSA, e nao so' o numero. Um 403 pode vir do gate de ENTRADA (`rooms.view`), e nesse
    // caso o teste passaria sem nunca ter exercitado a regra que ele afirma -- verde por
    // falhar ANTES do banco. A governanta TEM `rooms.view`, entao o unico 403 que ela alcanca
    // e' o de `canTransition`, DEPOIS de carregar o apartamento e resolver `rooms.occupancy`
    // por unidade. A mensagem e' privativa desse ponto.
    expect(corpo.message).toBe("Voce nao tem permissao para registrar check-in e check-out.");

    // E a prova de que a rota LE O BANCO antes de decidir: um apartamento inexistente responde
    // 404 -- que so' e' alcancavel depois da consulta. Se a recusa viesse antes do banco, este
    // caso responderia 403 tambem.
    const inexistente = await gov.post("/api/base/rooms/occupancy", {
      data: { entries: [{ roomId: "00000000-0000-0000-0000-000000000000", event: "check_in" }] },
      headers: { "content-type": "application/json" }
    });

    expect(inexistente.status()).toBe(404);

    // Nada mudou no apartamento.
    const depois = await readRoom(alvo.id);
    expect(depois.occupancy_status).toBe(antes.occupancy_status);
  });

  test("78.13 - check-out DE MADRUGADA, com o dia FECHADO: o estado muda e nada se perde", async ({
    baseURL
  }) => {
    // O ITEM 6 DA VALIDACAO da 093, exercitado de verdade.
    //
    // A recepcionista de plantao faz check-out as 2h; o dia da governanca so' abre as 8h. A
    // RPC procura o dia ABERTO daquela data operacional, nao acha, e PULA o bloco da tarefa.
    // Isso esta' certo -- a duvida e' se o apartamento se PERDE. Ele nao se perde: a abertura
    // do dia materializa todos os ativos sem bloqueio (091:312).
    //
    // O cenario nao existe naturalmente (o dia esta' aberto agora), entao o caso FECHA e
    // REABRE o dia de hoje, como os casos 29 e 30 ja fazem -- e devolve tudo no `finally`,
    // inclusive o apartamento.
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: o perfil RECEPCAO nasce com a migration 093."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    let alvo: RoomStateRow | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (atual.occupancy_status === "vacant" && atual.blocking_status === "none") {
        alvo = atual;
        break;
      }
    }

    test.skip(alvo === null, "Nenhum apartamento vago e sem bloqueio.");

    if (!alvo) return;

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);
    const estadoOriginal = await readRoom(alvo.id);
    let fechou = false;

    try {
      // O hospede entra (com o dia ainda aberto).
      const entrada = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_in", reason: "E2E 78.13" }] },
        headers: { "content-type": "application/json" }
      });

      expect(entrada.status()).toBe(200);

      // O dia FECHA -- e' a madrugada.
      const fechamento = await gov.post(`/api/base/rooms/days/${dayId}/close`, {
        headers: { "content-type": "application/json" }
      });

      expect(fechamento.status()).toBe(200);
      fechou = true;

      // A tarefa do apartamento agora e' `not_done` (o fechamento converteu as pendentes).
      const tarefaNoFechamento = await readTask(dayId, alvo.id);

      expect(tarefaNoFechamento.outcome).toBe("not_done");

      // O CHECK-OUT DE MADRUGADA, com o dia fechado.
      const saida = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_out" }] },
        headers: { "content-type": "application/json" }
      });

      // NAO e' recusado: o dia fechado trava LANCAMENTO DE TAREFA, nao o estado do
      // apartamento. O hospede foi embora as 2h, e isso aconteceu.
      expect(saida.status(), `resposta: ${JSON.stringify(await saida.json().catch(() => ({})))}`).toBe(200);

      const depois = await readRoom(alvo.id);

      expect(depois.occupancy_status).toBe("vacant");
      expect(depois.housekeeping_status).toBe("dirty");

      // E A TAREFA NAO FOI TOCADA. Continua `not_done` -- o bloco da tarefa foi pulado porque
      // nao havia dia aberto, exatamente como o item 6 afirma.
      expect((await readTask(dayId, alvo.id)).outcome).toBe("not_done");

      // AS 8H o dia reabre: o apartamento volta para a fila. Nada se perdeu.
      const reabertura = await gov.post(`/api/base/rooms/days/${dayId}/reopen`, {
        data: { note: "[E2E] abertura da manha seguinte." },
        headers: { "content-type": "application/json" }
      });

      expect(reabertura.status()).toBe(200);
      fechou = false;

      expect((await readTask(dayId, alvo.id)).outcome).toBe("pending");
    } finally {
      if (fechou) {
        await reopenDayDirect(dayId);
      }

      // Devolve o apartamento ao estado em que foi encontrado -- ocupacao pela recepcao,
      // limpeza pela governanca. Cada setor desfaz o que escreveu.
      const atual = await readRoom(alvo.id);

      if (atual.occupancy_status === "occupied") {
        await recepcao.post("/api/base/rooms/occupancy", {
          data: { entries: [{ roomId: alvo.id, event: "check_out" }] },
          headers: { "content-type": "application/json" }
        });
      }

      await restoreRoom(gov, estadoOriginal);
      await recepcao.dispose();
    }
  });''',
    "78.9 reforcado + 78.13",
)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("78.9 reforcado e 78.13 acrescentado")
