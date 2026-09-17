# -*- coding: utf-8 -*-
"""
Tira 78.8 e 78.11 da inercia (montam a propria precondicao) e faz o 31 ler o que encontra.
"""
import io
import sys

P = "tests/e2e/rooms-transitions.e2e.spec.ts"
s = io.open(P, encoding="utf-8").read()


def troca(velho, novo, rotulo):
    global s
    if s.count(velho) != 1:
        sys.exit("esperava 1 ocorrencia (achou %d): %s" % (s.count(velho), rotulo))
    s = s.replace(velho, novo, 1)


# =========================================================================== 78.8
troca(
    '''  test("78.8 - A INVARIANTE, pela porta dos fundos: a RPC recusa check-out sem o efeito", async () => {''',
    '''  test("78.8 - A INVARIANTE, pela porta dos fundos: a RPC recusa check-out sem o efeito", async ({
    baseURL
  }) => {''',
    "78.8 recebe baseURL",
)

troca(
    '''    let alvo: RoomStateRow | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (atual.occupancy_status === "occupied") {
        alvo = atual;
        break;
      }
    }

    test.skip(alvo === null, "Nenhum apartamento ocupado: a suite nao ocupa um para poder testar.");

    if (!alvo) return;

    const antes = await readRoom(alvo.id);

    const semEfeito = await callTransitionRpc({''',
    '''    // ESTE CASO MONTA A PROPRIA PRECONDICAO -- e a versao anterior nao montava, o que o
    // deixou INERTE. Ele pulava com "nenhum apartamento ocupado", e nenhum ficava ocupado
    // depois que os outros casos da fatia aprenderam a devolver o estado. Resultado: o caso
    // que prova o ARGUMENTO CENTRAL da fatia 78 nunca executou.
    //
    // Ocupar um apartamento e desocupa-lo no `finally` NAO e' fabricar dado: e' o cenario do
    // caso, do comeco ao fim, e nunca sai da mao dele. Fabricar seria reescrever o desfecho
    // que a governanta lancou ou a tarefa de um dia passado -- coisas de que outro e' dono.
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: quem ocupa o apartamento e' a recepcao, pela rota."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    const candidato = rooms.find(() => true);

    if (!candidato) return;

    const estadoOriginal = await readRoom(candidato.id);
    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {
      // A PRECONDICAO, pela rota real -- nao por escrita direta no banco.
      if (estadoOriginal.occupancy_status === "vacant") {
        const entrada = await recepcao.post("/api/base/rooms/occupancy", {
          data: { entries: [{ roomId: candidato.id, event: "check_in", reason: "[E2E] 78.8 precondicao" }] },
          headers: { "content-type": "application/json" }
        });

        expect(entrada.status(), "nao consegui ocupar o apartamento para montar o cenario").toBe(200);
      }

      const alvo = await readRoom(candidato.id);

      expect(alvo.occupancy_status).toBe("occupied");

      await provarInvarianteDoCheckOut(alvo);
    } finally {
      if ((await readRoom(candidato.id)).occupancy_status === "occupied") {
        await recepcao.post("/api/base/rooms/occupancy", {
          data: { entries: [{ roomId: candidato.id, event: "check_out" }] },
          headers: { "content-type": "application/json" }
        });
      }

      await restoreRoom(gov, estadoOriginal);
      await recepcao.dispose();
    }
  });

  /** O miolo do 78.8, separado so' para o caso acima ficar legivel. */
  async function provarInvarianteDoCheckOut(alvo: RoomStateRow): Promise<void> {
    const antes = await readRoom(alvo.id);

    const semEfeito = await callTransitionRpc({''',
    "78.8 monta a propria precondicao",
)

troca(
    '''    const depois = await readRoom(alvo.id);

    expect(depois.occupancy_status).toBe(antes.occupancy_status);
    expect(depois.housekeeping_status).toBe(antes.housekeeping_status);
  });

  test("78.9''',
    '''    const depois = await readRoom(alvo.id);

    expect(depois.occupancy_status).toBe(antes.occupancy_status);
    expect(depois.housekeeping_status).toBe(antes.housekeeping_status);
  }

  test("78.9''',
    "fecha a funcao auxiliar do 78.8",
)

# =========================================================================== 78.11
troca(
    '''    // Alvo compativel: vago, sem bloqueio e NAO vistoriado -- ou seja, nao vendavel.
    let alvo: RoomStateRow | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (
        atual.occupancy_status === "vacant" &&
        atual.blocking_status === "none" &&
        atual.housekeeping_status !== "inspected"
      ) {
        alvo = atual;
        break;
      }
    }

    test.skip(alvo === null, "Nenhum apartamento vago e nao vistoriado: a suite nao suja um para poder testar.");

    if (!alvo) return;

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {''',
    '''    // ESTE CASO TAMBEM MONTA A PROPRIA PRECONDICAO. A versao anterior procurava um
    // apartamento vago e NAO vistoriado, e pulava quando nao achava -- que passou a ser
    // sempre, porque os oito terminam a suite em `inspected`. Inerte.
    //
    // Sujar um apartamento e devolve-lo ao estado encontrado e' o cenario do caso. Quem suja
    // e' a GOVERNANCA, pela rota, com a permissao dela -- e quem devolve tambem.
    const alvo = rooms.find(() => true) ?? null;

    if (!alvo) return;

    const estadoOriginal = await readRoom(alvo.id);

    test.skip(
      estadoOriginal.blocking_status !== "none",
      "O apartamento escolhido esta bloqueado: bloqueio e' estado de que a manutencao e' dona."
    );

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {
      // A PRECONDICAO: nao vendavel. `dirty` basta -- `isRoomSellable` exige `inspected`.
      await driveHousekeepingTo(gov, alvo.id, "dirty");

      expect((await readRoom(alvo.id)).housekeeping_status).toBe("dirty");
''',
    "78.11 monta a propria precondicao",
)

troca(
    '''      expect(comMotivo.status()).toBe(200);
      expect((await readRoom(alvo.id)).occupancy_status).toBe("occupied");
    } finally {''',
    '''      expect(comMotivo.status()).toBe(200);
      expect((await readRoom(alvo.id)).occupancy_status).toBe("occupied");
    } finally {
      void estadoOriginal;''',
    "78.11 marca o estado original como usado",
)

# =========================================================================== 31
troca(
    '''      const noSegundo = await readTask(segundo.id, room.id);
      expect(noSegundo.carried_over_since).toBe(primeiro.service_date);
      expect(noSegundo.carried_over_days).toBe(1);

      const emHojeApos1 = await readTask(hoje.id, room.id);
      expect(emHojeApos1.carried_over_since).toBe(primeiro.service_date);
      expect(emHojeApos1.carried_over_days).toBe(2);''',
    '''      // O NUMERO ESPERADO E' LIDO, NAO FIXADO -- e esta e' a correcao do caso.
      //
      // `carried_over_days` conta os DIAS REGISTRADOS no intervalo [carried_over_since, dia)
      // (092, secao 5). A versao anterior fixava 2 para hoje, assumindo que os unicos dias
      // entre `primeiro` e `hoje` eram `primeiro` e `segundo`. O staging tem quatro dias
      // anteriores em aberto (02, 03, 04 e 07/09), entao o numero real e' 4 -- e o caso
      // falhava com "Expected: 2, Received: 4" acusando o produto de um erro que era dele.
      //
      // Um teste que fixa uma suposicao em vez de ler o que encontra quebra com o calendario,
      // que e' o oposto do principio que o cabecalho desta suite prega.
      const diasEntre = (de: string, ate: string) =>
        dias.filter((d) => d.service_date >= de && d.service_date < ate).length;

      const noSegundo = await readTask(segundo.id, room.id);
      expect(noSegundo.carried_over_since).toBe(primeiro.service_date);
      expect(noSegundo.carried_over_days).toBe(diasEntre(primeiro.service_date, segundo.service_date));

      const emHojeApos1 = await readTask(hoje.id, room.id);
      expect(emHojeApos1.carried_over_since).toBe(primeiro.service_date);
      expect(emHojeApos1.carried_over_days).toBe(diasEntre(primeiro.service_date, hoje.service_date));''',
    "31 le o numero esperado",
)

troca(
    '''      const emHojeApos2 = await readTask(hoje.id, room.id);
      expect(emHojeApos2.carried_over_since).toBe(primeiro.service_date);
      expect(emHojeApos2.carried_over_since).not.toBe(segundo.service_date);
      expect(emHojeApos2.carried_over_days).toBe(2);''',
    '''      const emHojeApos2 = await readTask(hoje.id, room.id);
      expect(emHojeApos2.carried_over_since).toBe(primeiro.service_date);
      expect(emHojeApos2.carried_over_since).not.toBe(segundo.service_date);
      // O MESMO numero de antes: fechar o segundo dia NAO pode reiniciar a contagem. E' o
      // "reset" que este caso existe para travar -- e por isso a comparacao e' com o valor
      // lido antes, e nao com uma constante.
      expect(emHojeApos2.carried_over_days).toBe(emHojeApos1.carried_over_days);''',
    "31 compara com o valor anterior",
)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("78.8, 78.11 e 31 corrigidos")
