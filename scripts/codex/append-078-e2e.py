# -*- coding: utf-8 -*-
"""Acrescenta os casos 78.7 a 78.12 ao final do describe de rooms-transitions.e2e.spec.ts."""
import io
import sys

P = "tests/e2e/rooms-transitions.e2e.spec.ts"
s = io.open(P, encoding="utf-8").read()

# O import do ator novo.
velho_import = 'import { authStatePath } from "./helpers/auth";'
novo_import = 'import { authStatePath, isUserConfigured } from "./helpers/auth";'

if s.count(velho_import) != 1:
    sys.exit("import de auth nao encontrado")

s = s.replace(velho_import, novo_import, 1)

CASOS = '''
  // ===========================================================================================
  // A RECEPCAO ESCREVE A OCUPACAO (plano docs/codex/78, migration 093)
  //
  // ATOR: E2E_RECEPCAO, perfil RECEPCAO -- que NASCE COM A 093. Enquanto a migration nao for
  // aplicada e o usuario nao existir, estes casos PULAM COM MOTIVO. Pular com motivo e'
  // honesto; ficar vermelho por falta de credencial ensina a suite a ser ignorada.
  // ===========================================================================================

  test("78.7 - o caminho inteiro: check-out devolve para a governanca, e so' ela devolve para a venda", async ({
    baseURL
  }) => {
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: o perfil RECEPCAO nasce com a migration 093."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    // ALVO COMPATIVEL, escolhido no estado encontrado (principio da suite): um apartamento
    // VAGO, sem bloqueio. A suite nao fabrica o cenario.
    let alvo: RoomStateRow | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (atual.occupancy_status === "vacant" && atual.blocking_status === "none") {
        alvo = atual;
        break;
      }
    }

    test.skip(alvo === null, "Nenhum apartamento vago e sem bloqueio: a suite nao reescreve estado alheio.");

    if (!alvo) return;

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {
      // 1) CHECK-IN. A ocupacao muda; a limpeza NAO.
      const antes = await readRoom(alvo.id);
      const entrada = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_in", reason: "E2E 78.7" }] },
        headers: { "content-type": "application/json" }
      });

      expect(entrada.status()).toBe(200);

      const ocupado = await readRoom(alvo.id);

      expect(ocupado.occupancy_status).toBe("occupied");
      expect(ocupado.housekeeping_status).toBe(antes.housekeeping_status);

      // 2) CHECK-OUT. AS DUAS DIMENSOES, e e' o que a fatia existe para garantir.
      const saida = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_out" }] },
        headers: { "content-type": "application/json" }
      });

      expect(saida.status()).toBe(200);

      const depois = await readRoom(alvo.id);

      expect(depois.occupancy_status).toBe("vacant");
      // O CORACAO: sujo, nunca vistoriado. Vago + vistoriado aqui seria um apartamento
      // VENDAVEL COM O QUARTO SUJO.
      expect(depois.housekeeping_status).toBe("dirty");

      // 3) E A RECEPCAO NAO CONSEGUE DEVOLVER PARA A VENDA (D4). Quem libera e' a governanca.
      const tentativa = await recepcao.post("/api/base/rooms/transitions", {
        data: { roomIds: [alvo.id], dimension: "housekeeping", toStatus: "cleaning" },
        headers: { "content-type": "application/json" }
      });

      expect(tentativa.status()).toBe(403);
    } finally {
      await recepcao.dispose();
    }
  });

  test("78.8 - A INVARIANTE, pela porta dos fundos: a RPC recusa check-out sem o efeito", async () => {
    // O TESTE QUE PROVA QUE A TRAVA ESTREITADA E' MAIS FORTE QUE A NO_WRITER.
    //
    // Vai DIRETO na RPC com service role -- o mesmo uso ja declarado no cabecalho de
    // helpers/db.ts para "forcar um `from` obsoleto". E' a unica forma de exercitar a camada
    // que vale contra uma segunda rota escrita amanha ou um select no SQL Editor: pela rota, o
    // efeito e' calculado por `canTransition` e nunca chega errado.
    //
    // NAO HA RISCO DE RESIDUO por construcao: se a chamada FALHAR (o esperado), nada foi
    // escrito. Se ela PASSAR, o teste quebra -- e a falha e' justamente a noticia.
    let alvo: RoomStateRow | null = null;

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

    const semEfeito = await callTransitionRpc({
      transitions: [{ room_id: alvo.id, from: "occupied", to: "vacant", housekeeping_effect: null }],
      dimension: "occupancy"
    });

    expect(semEfeito.error).not.toBeNull();
    expect(semEfeito.error?.message ?? "").toContain("ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY");

    // E `inspected` como efeito morre pela MESMA trava -- a tentativa que a D4 impede.
    const comInspected = await callTransitionRpc({
      transitions: [{ room_id: alvo.id, from: "occupied", to: "vacant", housekeeping_effect: "inspected" }],
      dimension: "occupancy"
    });

    expect(comInspected.error?.message ?? "").toContain("ROOMS_TRANSITION_CHECKOUT_REQUIRES_DIRTY");

    // NADA FOI ESCRITO nas duas tentativas: a RPC e' transacional.
    const depois = await readRoom(alvo.id);

    expect(depois.occupancy_status).toBe(antes.occupancy_status);
    expect(depois.housekeeping_status).toBe(antes.housekeeping_status);
  });

  test("78.9 - a GOVERNANCA nao marca ocupacao: 403 (a metade reciproca da D4)", async () => {
    const alvo = rooms[0];

    const resposta = await gov.post("/api/base/rooms/occupancy", {
      data: { entries: [{ roomId: alvo.id, event: "check_in" }] },
      headers: { "content-type": "application/json" }
    });

    // 403 e nao 422: e' falta de permissao, e a governanta nao deve descobrir pela mensagem
    // que faltava so' preencher um campo. Cada setor escreve numa dimensao so'.
    expect(resposta.status()).toBe(403);
  });

  test("78.10 - a dispensa `front_desk` exige rooms.occupancy, e a `housekeeper` exige rooms.housekeeping", async ({
    baseURL
  }) => {
    // O GATE POR ORIGEM (plano 78, D6). Este teste quebra se alguem alargar o gate de novo --
    // e' a razao de ele existir.
    //
    // A origem NAO e' rotulo decorativo: a D3 do plano 75 a criou para responder "o aviso da
    // recepcao esta funcionando?". Um campo que qualquer um preenche com qualquer valor nao
    // responde essa pergunta -- so' parece responder.
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: o perfil RECEPCAO nasce com a migration 093."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    // Alvo compativel: uma tarefa PENDENTE do dia de hoje.
    let tarefaId: string | null = null;
    let quartoDaTarefa: string | null = null;

    for (const candidato of rooms) {
      const tarefa = await readTask(dayId, candidato.id);

      if (tarefa.outcome === "pending") {
        tarefaId = tarefa.id;
        quartoDaTarefa = candidato.id;
        break;
      }
    }

    test.skip(tarefaId === null, "Nenhuma tarefa pendente hoje: a suite nao reabre tarefa alheia.");

    if (!tarefaId || !quartoDaTarefa) return;

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {
      // A RECEPCIONISTA NAO REGISTRA "DESCOBERTO NA PORTA": ela nao esteve na porta.
      const origemErrada = await recepcao.patch(`/api/base/rooms/tasks/${tarefaId}`, {
        data: { outcome: "declined", declineOrigin: "housekeeper" },
        headers: { "content-type": "application/json" }
      });

      expect(origemErrada.status()).toBe(403);

      // E A GOVERNANTA NAO REGISTRA "A RECEPCAO AVISOU": ela nao e' a recepcao.
      const govNaOrigemDaRecepcao = await gov.patch(`/api/base/rooms/tasks/${tarefaId}`, {
        data: { outcome: "declined", declineOrigin: "front_desk" },
        headers: { "content-type": "application/json" }
      });

      expect(govNaOrigemDaRecepcao.status()).toBe(403);

      // A tarefa continua INTOCADA depois das duas recusas.
      expect((await readTask(dayId, quartoDaTarefa)).outcome).toBe("pending");

      // E a origem CERTA passa -- que e' a dispensa da recepcao, que ate' esta fatia nao tinha
      // por onde entrar: o gate exigia `rooms.housekeeping` para QUALQUER origem.
      const origemCerta = await recepcao.patch(`/api/base/rooms/tasks/${tarefaId}`, {
        data: { outcome: "declined", declineOrigin: "front_desk", declineNote: "E2E 78.10" },
        headers: { "content-type": "application/json" }
      });

      expect(origemCerta.status()).toBe(200);
    } finally {
      await recepcao.dispose();
    }
  });

  test("78.11 - check-in em apartamento nao vendavel: 422 sem motivo, aceito com motivo (D9)", async ({
    baseURL
  }) => {
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: o perfil RECEPCAO nasce com a migration 093."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    // Alvo compativel: vago, sem bloqueio e NAO vistoriado -- ou seja, nao vendavel.
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

    try {
      const semMotivo = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_in" }] },
        headers: { "content-type": "application/json" }
      });

      // Nao e' proibicao: e' exigencia de registro. Recusar de vez produziria um apartamento
      // marcado vago com o hospede dentro -- pior que o problema.
      expect(semMotivo.status()).toBe(422);
      expect((await readRoom(alvo.id)).occupancy_status).toBe("vacant");

      const comMotivo = await recepcao.post("/api/base/rooms/occupancy", {
        data: {
          entries: [{ roomId: alvo.id, event: "check_in", reason: "E2E 78.11 - hospede chegou antes da vistoria" }]
        },
        headers: { "content-type": "application/json" }
      });

      expect(comMotivo.status()).toBe(200);
      expect((await readRoom(alvo.id)).occupancy_status).toBe("occupied");
    } finally {
      await recepcao.dispose();
    }
  });

  test("78.12 - check-out em apartamento que ja consta livre: 409 dizendo QUAL", async ({ baseURL }) => {
    test.skip(
      !isUserConfigured("E2E_RECEPCAO"),
      "E2E_RECEPCAO nao configurado: o perfil RECEPCAO nasce com a migration 093."
    );

    if (!baseURL) throw new Error("[e2e] baseURL ausente.");

    let alvo: RoomStateRow | null = null;

    for (const candidato of rooms) {
      const atual = await readRoom(candidato.id);

      if (atual.occupancy_status === "vacant") {
        alvo = atual;
        break;
      }
    }

    test.skip(alvo === null, "Nenhum apartamento vago.");

    if (!alvo) return;

    const recepcao = await contextFor("E2E_RECEPCAO", baseURL);

    try {
      const resposta = await recepcao.post("/api/base/rooms/occupancy", {
        data: { entries: [{ roomId: alvo.id, event: "check_out" }] },
        headers: { "content-type": "application/json" }
      });

      // 409 e nao 422: nao e' pedido malformado, e' o mundo em desacordo com a tela. E DIZ
      // QUAL apartamento, no formato do plano 77 -- sem isso a recepcionista perde o lote
      // inteiro e nao sabe qual dos dez causou.
      expect(resposta.status()).toBe(409);

      const corpo = (await resposta.json().catch(() => ({}))) as {
        conflict?: { roomId?: string; current?: string; dimension?: string };
      };

      expect(corpo.conflict?.roomId).toBe(alvo.id);
      expect(corpo.conflict?.current).toBe("vacant");
      expect(corpo.conflict?.dimension).toBe("occupancy");
    } finally {
      await recepcao.dispose();
    }
  });

'''

# Entra ANTES do fechamento do describe (ultimo "});" do arquivo).
corte = s.rindex("\n});")
s = s[:corte] + "\n" + CASOS + s[corte:]

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("casos 78.7 a 78.12 acrescentados")
