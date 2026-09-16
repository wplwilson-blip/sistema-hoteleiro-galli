# -*- coding: utf-8 -*-
"""Acrescenta o caso 80.1 -- a dispensa sobrevive a vistoria, e o quarto volta a vender."""
import io
import sys

P = "tests/e2e/rooms-transitions.e2e.spec.ts"
s = io.open(P, encoding="utf-8").read()

CASO = '''
  // ===========================================================================================
  // A DISPENSA SOBREVIVE AO RESTO DO DIA (plano docs/codex/80, migration 094)
  // ===========================================================================================

  test("80.1 - vistoriar NAO apaga a dispensa, e o apartamento volta a vender", async () => {
    // O CASO QUE PROVA OS DOIS LADOS, e nenhum deles sozinho basta:
    //
    //   (i)  a dispensa fica INTACTA -- origem, nota e hora. Ela e' o UNICO registro de si
    //        mesma: dispensa nao e' transicao (§3 do plano 75), entao nao esta em
    //        `room_status_history`. Sobrescrever a tarefa apagava o fato de vez.
    //   (ii) o apartamento CHEGA a `inspected` e volta a ser vendavel. Sem esta metade, a
    //        correcao poderia ter sido "a RPC recusa a transicao" -- que nao derruba com 23514,
    //        nao perde dado, e deixa o quarto fora de venda. Trocaria de vitima.
    //
    // Antes da 094 este caminho respondia HTTP 500: o bloco (a) gravava `outcome = 'done'` sem
    // limpar `decline_origin`, violando o bicondicional da 091 (SQLSTATE 23514).
    let alvo: RoomStateRow | null = null;
    let tarefaId: string | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (atual.blocking_status !== "none") {
        continue;
      }

      const tarefa = await readTask(dayId, candidato.id);

      if (tarefa.outcome === "pending") {
        alvo = atual;
        tarefaId = tarefa.id;
        break;
      }
    }

    test.skip(
      alvo === null,
      "Nenhum apartamento sem bloqueio com tarefa pendente hoje: a suite nao reabre tarefa alheia para montar o cenario."
    );

    if (!alvo || !tarefaId) return;

    const estadoOriginal = await readRoom(alvo.id);

    try {
      // A MANHA: o hospede dispensa a arrumacao. Pela ROTA, com a origem da camareira -- o
      // caminho da governanta, que nao depende do ator da recepcao existir.
      const dispensa = await gov.patch(`/api/base/rooms/tasks/${tarefaId}`, {
        data: { outcome: "declined", declineOrigin: "housekeeper", declineNote: "[E2E] 80.1 hospede dispensou" },
        headers: { "content-type": "application/json" }
      });

      expect(dispensa.status()).toBe(200);

      const dispensada = await readTask(dayId, alvo.id);

      expect(dispensada.outcome).toBe("declined");
      expect(dispensada.decline_origin).toBe("housekeeper");

      // A TARDE: o hospede sai, o quarto e' arrumado e vistoriado. `driveHousekeepingTo`
      // percorre o ciclo inteiro pela rota -- e e' na chegada em `inspected` que estourava.
      await driveHousekeepingTo(gov, alvo.id, "inspected");

      // (ii) O APARTAMENTO VOLTA A VENDER.
      const depois = await readRoom(alvo.id);

      expect(depois.housekeeping_status).toBe("inspected");
      expect(depois.occupancy_status).toBe("vacant");
      expect(depois.blocking_status).toBe("none");

      // (i) A DISPENSA CONTINUA LA', inteira -- comparada com ela mesma antes da vistoria, e
      // nao com valores fixos.
      const aindaDispensada = await readTask(dayId, alvo.id);

      expect(aindaDispensada.outcome).toBe("declined");
      expect(aindaDispensada.decline_origin).toBe(dispensada.decline_origin);
      expect(aindaDispensada.decline_note).toBe(dispensada.decline_note);
      expect(aindaDispensada.completed_at).toBe(dispensada.completed_at);

      // E o bicondicional da D2.1 continua satisfeito: tarefa sem `done` nao carrega tipo.
      expect(aindaDispensada.service_type).toBeNull();
    } finally {
      // Desfaz o proprio rastro: a dispensa foi ESTE caso que lancou.
      await resetTaskToPending(tarefaId);
      await restoreRoom(gov, estadoOriginal);
    }
  });
'''

corte = s.rindex("\n});")
s = s[:corte] + "\n" + CASO + s[corte:]

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("caso 80.1 acrescentado")
