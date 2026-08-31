import { expect, test } from "@playwright/test";

import {
  BLOCKING_STATUS_VALUES,
  HOUSEKEEPING_STATUS_VALUES,
  ROOM_PERMISSIONS,
  ROOM_PERMISSION_PROFILE_GRANTS,
  ROOM_STATUS_VALUES,
  applyRoomTransition,
  backfillRoomState,
  canTransition,
  describeRoomState,
  isRoomSellable,
  type RoomState
} from "../../src/components/base-cadastros/rooms-utils";

// Runner PURO (playwright.unit.config.ts: sem banco, sem browser). Cobre a §7 do plano
// docs/codex/70 -- estado do apartamento em tres dimensoes.
//
// O que estes testes protegem, em uma frase: que ninguem chegue a "Vistoriado" -- o unico
// estado que libera o apartamento para venda -- sem passar por quem tem BASE:rooms.inspect e
// sem que alguem tenha arrumado o apartamento antes.
//
// LIMITE DECLARADO (§6.1): o teste 5 valida a TABELA DE REFERENCIA `backfillRoomState()`, da
// qual a migration 089 e' transcricao. Ele NAO executa o SQL. A prova do SQL e' a contagem
// por dimensao da secao VALIDACAO da 089, na mao de quem aplica.

const GOVERNANTA = [ROOM_PERMISSIONS.housekeeping, ROOM_PERMISSIONS.inspect, ROOM_PERMISSIONS.block];
const MANUTENCAO = [ROOM_PERMISSIONS.block];
const SEM_PERMISSAO: string[] = [];

function state(overrides: Partial<RoomState> = {}): RoomState {
  return { record: "active", occupancy: "vacant", housekeeping: "dirty", blocking: "none", ...overrides };
}

// ---------------------------------------------------------------------------- §7.1

test("1 - matriz de transicao por permissao: quem registra limpeza nao vistoria", () => {
  // A governanta percorre o ciclo inteiro.
  expect(canTransition(GOVERNANTA, "housekeeping", "dirty", "cleaning").allowed).toBe(true);
  expect(canTransition(GOVERNANTA, "housekeeping", "cleaning", "clean").allowed).toBe(true);
  expect(canTransition(GOVERNANTA, "housekeeping", "clean", "inspected").allowed).toBe(true);
  expect(canTransition(GOVERNANTA, "housekeeping", "inspected", "dirty").allowed).toBe(true);

  // A FRONTEIRA da matriz do RH-35B: so' `housekeeping` registra a limpeza, e ela sozinha
  // NAO valida a conclusao. E' a razao de esta fatia existir.
  const soLimpeza = [ROOM_PERMISSIONS.housekeeping];

  expect(canTransition(soLimpeza, "housekeeping", "dirty", "cleaning").allowed).toBe(true);
  expect(canTransition(soLimpeza, "housekeeping", "cleaning", "clean").allowed).toBe(true);

  const negado = canTransition(soLimpeza, "housekeeping", "clean", "inspected");
  expect(negado.allowed).toBe(false);
  expect(negado.allowed === false && negado.code).toBe("forbidden");

  // E o inverso: quem so' vistoria nao empurra a fila de arrumacao.
  const soVistoria = [ROOM_PERMISSIONS.inspect];
  expect(canTransition(soVistoria, "housekeeping", "dirty", "cleaning").allowed).toBe(false);

  // Sem permissao nenhuma, nada passa.
  for (const from of HOUSEKEEPING_STATUS_VALUES) {
    for (const to of HOUSEKEEPING_STATUS_VALUES) {
      expect(canTransition(SEM_PERMISSAO, "housekeeping", from, to).allowed).toBe(false);
    }
  }

  // Bloqueio exige `rooms.block`, que a manutencao tem e a limpeza pura nao.
  expect(canTransition(MANUTENCAO, "blocking", "none", "maintenance").allowed).toBe(true);
  expect(canTransition([ROOM_PERMISSIONS.housekeeping], "blocking", "none", "maintenance").allowed).toBe(false);

  // Ocupacao entra SEM ESCRITOR (D1): negada para todo mundo, inclusive para quem tem tudo.
  // Nao e' "falta tela" -- e' trava, e vale para chamada direta a rota.
  const ocupacao = canTransition(GOVERNANTA, "occupancy", "vacant", "occupied");
  expect(ocupacao.allowed).toBe(false);
  expect(ocupacao.allowed === false && ocupacao.code).toBe("no_writer");
});

// ---------------------------------------------------------------------------- §7.2

test("2 - manutencao NUNCA chega a inspected: encerrar bloqueio resulta em dirty", () => {
  // O teste que mais importa da fatia. Se um so' tiver que passar, e' este: e' o que impede
  // apartamento recem-consertado de ir direto para a venda, sem ninguem olhar depois da obra.
  const decision = canTransition(MANUTENCAO, "blocking", "maintenance", "none", "Troca de registro do chuveiro.");

  expect(decision.allowed).toBe(true);

  if (decision.allowed) {
    expect(decision.effects.housekeeping).toBe("dirty");
    expect(decision.effects.housekeeping).not.toBe("inspected");

    // Mesmo partindo de um apartamento que estava vistoriado antes da obra, o resultado e'
    // `dirty` -- e, portanto, NAO vendavel.
    const antes = state({ housekeeping: "inspected", blocking: "maintenance" });
    const depois = applyRoomTransition(antes, decision.effects);

    expect(depois.housekeeping).toBe("dirty");
    expect(depois.blocking).toBe("none");
    expect(isRoomSellable(depois)).toBe(false);
  }

  // E a manutencao nao alcanca `inspected` por caminho nenhum: nao tem a permissao.
  for (const from of HOUSEKEEPING_STATUS_VALUES) {
    expect(canTransition(MANUTENCAO, "housekeeping", from, "inspected").allowed).toBe(false);
  }
});

// ---------------------------------------------------------------------------- §7.3

test("3 - encerrar bloqueio SEM observacao e' rejeitado (manutencao E comercial)", () => {
  const semTexto = canTransition(MANUTENCAO, "blocking", "maintenance", "none");
  expect(semTexto.allowed).toBe(false);
  expect(semTexto.allowed === false && semTexto.code).toBe("reason_required");

  // Espaco em branco nao e' observacao.
  expect(canTransition(MANUTENCAO, "blocking", "maintenance", "none", "   ").allowed).toBe(false);
  expect(canTransition(MANUTENCAO, "blocking", "maintenance", "none", "").allowed).toBe(false);

  // Com texto, passa.
  expect(canTransition(MANUTENCAO, "blocking", "maintenance", "none", "Peca trocada.").allowed).toBe(true);

  // Bloqueio COMERCIAL segue a mesma regra. O criterio nao e' "passou por obra", e' "alguem
  // entrou no apartamento": reforma, uso interno e cortesia tambem sao gente dentro do
  // quarto. O CHECK da 089 tem exatamente o mesmo escopo.
  const comercialSemTexto = canTransition(MANUTENCAO, "blocking", "commercial", "none");
  expect(comercialSemTexto.allowed).toBe(false);
  expect(comercialSemTexto.allowed === false && comercialSemTexto.code).toBe("reason_required");

  const comercialComTexto = canTransition(MANUTENCAO, "blocking", "commercial", "none", "Fim da reforma da suite.");
  expect(comercialComTexto.allowed).toBe(true);

  // E cai em `dirty` igual a manutencao -- nunca de volta para a venda.
  if (comercialComTexto.allowed) {
    expect(comercialComTexto.effects.housekeeping).toBe("dirty");
    expect(isRoomSellable(applyRoomTransition(state({ housekeeping: "inspected", blocking: "commercial" }), comercialComTexto.effects))).toBe(false);
  }

  // ENTRAR em bloqueio comercial TAMBEM exige observacao: tirar apartamento de venda por
  // decisao propria e' perda de receita, e perda de receita sem motivo registrado nao tem a
  // quem perguntar depois.
  const entraComercial = canTransition(MANUTENCAO, "blocking", "none", "commercial");
  expect(entraComercial.allowed).toBe(false);
  expect(entraComercial.allowed === false && entraComercial.code).toBe("reason_required");
  expect(canTransition(MANUTENCAO, "blocking", "none", "commercial", "Reforma da suite 305.").allowed).toBe(true);

  // ENTRAR em manutencao NAO exige -- o motivo vem do chamado tecnico. E' a unica das quatro
  // transicoes de bloqueio sem observacao obrigatoria, e a assimetria e' deliberada.
  expect(canTransition(MANUTENCAO, "blocking", "none", "maintenance").allowed).toBe(true);

  // Entrar em bloqueio nao mexe na limpeza: o apartamento so' e' sujado na SAIDA, quando
  // alguem ja esteve la dentro.
  const entraManutencao = canTransition(MANUTENCAO, "blocking", "none", "maintenance");
  expect(entraManutencao.allowed && entraManutencao.effects.housekeeping).toBeUndefined();

  // Quem nao tem permissao recebe `forbidden`, nao `reason_required`: a mensagem de erro nao
  // deve ensinar que faltava so' preencher um campo.
  const semPermissao = canTransition(SEM_PERMISSAO, "blocking", "maintenance", "none");
  expect(semPermissao.allowed === false && semPermissao.code).toBe("forbidden");
});

// ---------------------------------------------------------------------------- §7.4

test("4 - isRoomSellable exige cadastro ativo, vago, vistoriado e sem bloqueio", () => {
  expect(isRoomSellable({ record: "active", occupancy: "vacant", housekeeping: "inspected", blocking: "none" })).toBe(true);

  // Varredura exaustiva: qualquer outra combinacao das tres dimensoes e' falsa. Enumerar e'
  // barato (2 x 4 x 3 = 24) e fecha a regra por construcao, em vez de por amostragem.
  let vendaveis = 0;

  for (const occupancy of ["vacant", "occupied"] as const) {
    for (const housekeeping of HOUSEKEEPING_STATUS_VALUES) {
      for (const blocking of BLOCKING_STATUS_VALUES) {
        const sellable = isRoomSellable({ record: "active", occupancy, housekeeping, blocking });

        if (sellable) {
          vendaveis += 1;
          expect({ occupancy, housekeeping, blocking }).toEqual({
            occupancy: "vacant",
            housekeeping: "inspected",
            blocking: "none"
          });
        }
      }
    }
  }

  expect(vendaveis).toBe(1);

  // "Limpo" NAO e' vendavel -- e' a fronteira que separa registrar limpeza de validar
  // conclusao. Um apartamento limpo mas nao vistoriado nao vai para venda.
  expect(isRoomSellable(state({ housekeeping: "clean" }))).toBe(false);

  // E a cor acompanha: bloqueio vence limpeza na leitura de relance.
  const emObra = describeRoomState(state({ housekeeping: "inspected", blocking: "maintenance" }));
  expect(emObra.tone).toBe("danger");
  expect(emObra.sellable).toBe(false);

  // CADASTRO INATIVO nao e' vendavel, por mais vistoriado que esteja. Sem esta condicao,
  // desativar o cadastro de um apartamento `inspected` o deixaria vendavel: some da lista e
  // continua a venda.
  const inativo = state({ record: "inactive", housekeeping: "inspected" });
  expect(isRoomSellable(inativo)).toBe(false);
  expect(isRoomSellable(state({ record: "archived", housekeeping: "inspected" }))).toBe(false);

  // E o cadastro vence ate' o bloqueio na precedencia: um apartamento inativo nao esta "em
  // manutencao" nem "sujo" -- ele nao esta em operacao, e nao pode aparecer na fila da
  // governanta com a cor de quem precisa de arrumacao.
  expect(describeRoomState(inativo).label).toBe("Inativo");
  expect(describeRoomState(state({ record: "inactive", blocking: "maintenance" })).label).toBe("Inativo");
  expect(describeRoomState(state({ record: "inactive", housekeeping: "dirty" })).tone).toBe("visual");
});

// ---------------------------------------------------------------------------- §7.5

test("5 - backfill: os sete valores antigos produzem a tripla da §5.3", () => {
  // Tabela transcrita do plano, nao derivada da implementacao: se `backfillRoomState` mudar,
  // este teste quebra -- que e' o ponto.
  expect(backfillRoomState("available")).toEqual({ occupancy: "vacant", housekeeping: "inspected", blocking: "none" });
  expect(backfillRoomState("occupied")).toEqual({ occupancy: "occupied", housekeeping: "dirty", blocking: "none" });
  expect(backfillRoomState("dirty")).toEqual({ occupancy: "vacant", housekeeping: "dirty", blocking: "none" });
  expect(backfillRoomState("cleaning")).toEqual({ occupancy: "vacant", housekeeping: "cleaning", blocking: "none" });
  expect(backfillRoomState("maintenance")).toEqual({ occupancy: "vacant", housekeeping: "dirty", blocking: "maintenance" });
  expect(backfillRoomState("blocked")).toEqual({ occupancy: "vacant", housekeeping: "dirty", blocking: "commercial" });
  expect(backfillRoomState("inactive")).toEqual({ occupancy: "vacant", housekeeping: "dirty", blocking: "none" });

  // Os sete valores do enum antigo estao cobertos -- nenhum cai num buraco.
  expect(ROOM_STATUS_VALUES).toHaveLength(7);

  for (const legacy of ROOM_STATUS_VALUES) {
    expect(backfillRoomState(legacy)).toBeTruthy();
  }

  // NINGUEM VOLTA A VENDA POR MIGRATION: `available` e' o UNICO valor antigo que produz um
  // apartamento vendavel. Tudo que estava bloqueado, em obra ou inativo cai em `dirty`.
  // O backfill nao devolve `record` -- a situacao do cadastro nao vem do room_status antigo.
  // Aqui compomos com cadastro ATIVO, que e' o cenario em que a pergunta "quem ficou vendavel
  // depois da migration?" faz sentido.
  const vendaveisAposBackfill = ROOM_STATUS_VALUES.filter((legacy) =>
    isRoomSellable({ record: "active", ...backfillRoomState(legacy) })
  );
  expect(vendaveisAposBackfill).toEqual(["available"]);
});

// ---------------------------------------------------------------------------- §7.6

test("6 - atalho cleaning -> inspected permitido; dirty -> inspected negado", () => {
  // O atalho existe porque `clean` e' disponivel, nao obrigatorio (§4.1): obrigar a marcar
  // "Limpo" em quarenta apartamentos antes de "Vistoriado" faria a governanta pular o
  // primeiro, e o estado viraria ritual vazio.
  expect(canTransition(GOVERNANTA, "housekeeping", "cleaning", "inspected").allowed).toBe(true);

  // Nao se vistoria o que ninguem arrumou. Este e' o furo que uma denylist deixaria passar.
  const negado = canTransition(GOVERNANTA, "housekeeping", "dirty", "inspected");
  expect(negado.allowed).toBe(false);
  expect(negado.allowed === false && negado.code).toBe("invalid_transition");

  // Nem com todas as permissoes do mundo.
  expect(canTransition([...GOVERNANTA, "BASE:rooms.manage"], "housekeeping", "dirty", "inspected").allowed).toBe(false);

  // DESFAZER lancamento errado: `cleaning` e `clean` voltam para `dirty` com a MESMA
  // permissao que os lancou. Sem isto, corrigir um "Limpo" clicado por engano exigiria
  // passar por `inspected` -- liberar o apartamento para venda para poder consertar o erro.
  expect(canTransition([ROOM_PERMISSIONS.housekeeping], "housekeeping", "cleaning", "dirty").allowed).toBe(true);
  expect(canTransition([ROOM_PERMISSIONS.housekeeping], "housekeeping", "clean", "dirty").allowed).toBe(true);
  expect(canTransition(SEM_PERMISSAO, "housekeeping", "clean", "dirty").allowed).toBe(false);

  // Voltam para `dirty`, NUNCA para `cleaning`: reabrir uma limpeza que nao aconteceu seria
  // inventar um fato.
  expect(canTransition(GOVERNANTA, "housekeeping", "clean", "cleaning").allowed).toBe(false);

  // Transicoes que a matriz da D3 nao lista continuam negadas -- allowlist, nao denylist.
  expect(canTransition(GOVERNANTA, "housekeeping", "dirty", "clean").allowed).toBe(false);
  expect(canTransition(GOVERNANTA, "housekeeping", "inspected", "clean").allowed).toBe(false);

  // Valor que nao pertence a dimensao nao vira transicao valida por acidente: `dirty` e'
  // limpeza, nunca bloqueio.
  const foraDaDimensao = canTransition(GOVERNANTA, "blocking", "none", "dirty");
  expect(foraDaDimensao.allowed === false && foraDaDimensao.code).toBe("invalid_dimension_value");
});

// ---------------------------------------------------------------------------- §7.7

test("7 - allowlist FECHADA de rooms.inspect: so' os perfis da D5", () => {
  // Substitui o teste antigo ("OPERACIONAL_GOVERNANCA recebe 403"), que era vazio por
  // construcao: o perfil nao existe no banco, entao a asercao passava trivialmente e
  // continuaria passando com `inspect` concedido a quem nao devia.
  //
  // Este quebra na direcao util -- se alguem acrescentar SUPERVISOR ou DEPARTMENT_MANAGER a
  // migration 089 sem revisar a decisao D5.
  const permitidos = ROOM_PERMISSION_PROFILE_GRANTS[ROOM_PERMISSIONS.inspect];

  expect([...permitidos].sort()).toEqual(["LIDER_GOVERNANCA", "SUPER_ADMIN", "UNIT_DIRECTOR"]);
  expect([...ROOM_PERMISSION_PROFILE_GRANTS[ROOM_PERMISSIONS.housekeeping]].sort()).toEqual([
    "LIDER_GOVERNANCA",
    "SUPER_ADMIN",
    "UNIT_DIRECTOR"
  ]);

  // Os perfis genericos NAO vistoriam. E' a razao de a D5 ter criado LIDER_GOVERNANCA em vez
  // de reaproveitar um perfil existente: para RECEBER inspect, a governanta teria que SER
  // DEPARTMENT_MANAGER (e ganhar alcada de compra) ou SUPERVISOR (e ganhar acesso a RH).
  for (const perfil of ["DEPARTMENT_MANAGER", "SUPERVISOR", "EMPLOYEE", "AUDIT", "NETWORK_MANAGER", "FINANCE", "EXTERNAL_TECHNICIAN"]) {
    expect(permitidos).not.toContain(perfil);
    expect(ROOM_PERMISSION_PROFILE_GRANTS[ROOM_PERMISSIONS.housekeeping]).not.toContain(perfil);
  }

  // OPERACIONAL_GOVERNANCA nao e' criado: camareira nao tem login, e conceder a um perfil
  // inexistente e' dead grant -- o incidente DEPARTMENT_MANAGER/approvals.decide de novo.
  expect(permitidos).not.toContain("OPERACIONAL_GOVERNANCA");

  // LIDER_MANUTENCAO ve e bloqueia, e NAO vistoria: quem encerra a obra deixa a UH em
  // `dirty`, e quem a devolve a venda e' a governanca.
  expect(ROOM_PERMISSION_PROFILE_GRANTS[ROOM_PERMISSIONS.block]).toContain("LIDER_MANUTENCAO");
  expect(permitidos).not.toContain("LIDER_MANUTENCAO");

  // `rooms.block` mantem os perfis da 088 e ganha os dois novos. Revogar de
  // DEPARTMENT_MANAGER e SUPERVISOR foi considerado e REJEITADO pelo Wilson -- e' o que esta
  // nos dois bancos. A allowlist de block e' mais larga que a de inspect de proposito:
  // bloquear nao libera UH para venda, e a fronteira que esta fatia protege e' a da vistoria.
  expect([...ROOM_PERMISSION_PROFILE_GRANTS[ROOM_PERMISSIONS.block]].sort()).toEqual([
    "DEPARTMENT_MANAGER",
    "LIDER_GOVERNANCA",
    "LIDER_MANUTENCAO",
    // `SUPERVISOR` antes de `SUPER_ADMIN`: .sort() e' lexicografico por codigo, e "V" (0x56)
    // vem antes de "_" (0x5F).
    "SUPERVISOR",
    "SUPER_ADMIN",
    "UNIT_DIRECTOR"
  ]);

  // Nenhum dos perfis novos recebe `rooms.manage`: quem opera o mapa nao redefine o
  // inventario -- criterio que a 088 ja fixou ao negar `manage` ao SUPERVISOR.
  expect(Object.keys(ROOM_PERMISSION_PROFILE_GRANTS)).not.toContain("BASE:rooms.manage");
});
