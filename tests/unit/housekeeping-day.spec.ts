import { expect, test } from "@playwright/test";

import {
  HOUSEKEEPING_SERVICE_TYPE_VALUES,
  HOUSEKEEPING_STATUS_VALUES,
  HOUSEKEEPING_TASK_OUTCOME_VALUES,
  isBatchAllowed,
  isDeclineShapeValid,
  isServiceComplete,
  isTaskShapeValid,
  closesTaskAtClean,
  housekeepingServiceDate,
  maxRoomsPerTransition,
  serviceTypeImpliedBy,
  taskOutcomeAfterBlock,
  taskOutcomeAfterUnblock,
  suggestedServiceType,
  terminalStatusFor,
  validateOccurredAt,
  type HousekeepingDeclineOrigin,
  type HousekeepingServiceType
} from "../../src/components/base-cadastros/rooms-utils";

// Runner PURO. Cobre a §7 do plano docs/codex/75 -- o dia da governanca.
//
// O que estes testes protegem, em uma frase: que a permanencia PARE em `clean` e que a saida
// NAO consiga ser liberada em lote -- as duas regras que separam "registrar limpeza" de
// "liberar para venda", que e' a fronteira que toda esta linha de trabalho existe para
// proteger.

// ---------------------------------------------------------------------------- §7.1

test("1 - estado terminal por tipo: saida termina em inspected, permanencia em clean", () => {
  expect(terminalStatusFor("checkout")).toBe("inspected");
  expect(terminalStatusFor("stayover")).toBe("clean");

  // Permanencia NAO exige vistoria. Nao ha o que liberar para venda: o quarto ja esta ocupado.
  expect(isServiceComplete("stayover", "clean")).toBe(true);
  expect(isServiceComplete("stayover", "inspected")).toBe(false);

  // Saida so' termina em `inspected`. `clean` nao basta.
  expect(isServiceComplete("checkout", "clean")).toBe(false);
  expect(isServiceComplete("checkout", "inspected")).toBe(true);

  // Nenhum tipo termina no meio do caminho.
  for (const type of HOUSEKEEPING_SERVICE_TYPE_VALUES) {
    expect(isServiceComplete(type, "dirty")).toBe(false);
    expect(isServiceComplete(type, "cleaning")).toBe(false);
  }
});

// ---------------------------------------------------------------------------- §7.2 e §7.3

test("2 - chegar em inspected NAO aceita lote, nas DUAS arestas", () => {
  // A trava e' sobre CHEGAR em `inspected`, nao sobre uma aresta. Fechar so' `clean ->
  // inspected` faria do atalho `cleaning -> inspected` a porta dos fundos da vistoria.
  expect(maxRoomsPerTransition("housekeeping", "inspected")).toBe(1);

  expect(isBatchAllowed("housekeeping", "inspected", 1)).toBe(true);
  expect(isBatchAllowed("housekeeping", "inspected", 2)).toBe(false);
  expect(isBatchAllowed("housekeeping", "inspected", 30)).toBe(false);
});

test("3 - lote continua permitido em tudo que e' fato coletivo", () => {
  // Marcar uma ala inteira como suja, comecar um corredor, bloquear um andar: sao fatos sobre
  // muitos quartos ao mesmo tempo. Vistoria nao e'.
  for (const to of ["dirty", "cleaning", "clean"]) {
    expect(isBatchAllowed("housekeeping", to, 30)).toBe(true);
    expect(maxRoomsPerTransition("housekeeping", to)).toBeNull();
  }

  for (const to of ["none", "maintenance", "commercial"]) {
    expect(isBatchAllowed("blocking", to, 30)).toBe(true);
  }

  // `inspected` na dimensao de bloqueio nem existe -- a trava nao pode vazar para la.
  expect(isBatchAllowed("blocking", "inspected", 30)).toBe(true);
});

// ---------------------------------------------------------------------------- §7.4

test("4 - hora do fato: futura recusada, anterior ao ultimo lancamento recusada", () => {
  const agora = new Date("2026-09-01T14:00:00Z");

  // Retroativa legitima: a camareira terminou as 10h20, a governanta lanca as 14h.
  expect(validateOccurredAt(new Date("2026-09-01T10:20:00Z"), agora, null).valid).toBe(true);

  // Futura, nem por um minuto. Relogio adiantado nao e' motivo para aceitar um fato que ainda
  // nao aconteceu.
  const futura = validateOccurredAt(new Date("2026-09-01T14:01:00Z"), agora, null);
  expect(futura.valid).toBe(false);
  expect(futura.valid === false && futura.code).toBe("future");

  // Anterior ao ultimo lancamento do mesmo apartamento no mesmo dia: seria "arrumado as 10h20,
  // sujo as 14h" numa ordem que nao aconteceu, e a linha do tempo vira ficcao.
  const foraDeOrdem = validateOccurredAt(
    new Date("2026-09-01T09:00:00Z"),
    agora,
    new Date("2026-09-01T10:20:00Z")
  );
  expect(foraDeOrdem.valid).toBe(false);
  expect(foraDeOrdem.valid === false && foraDeOrdem.code).toBe("before_last");

  // Igual ao ultimo lancamento passa: duas transicoes no mesmo instante e' o que a propria RPC
  // grava quando ha efeito colateral (encerrar bloqueio derruba a limpeza).
  expect(
    validateOccurredAt(new Date("2026-09-01T10:20:00Z"), agora, new Date("2026-09-01T10:20:00Z")).valid
  ).toBe(true);
});

// ---------------------------------------------------------------------------- §7.5

test("5 - tipo no fecho: sugerido pela ocupacao daquele instante, nunca na abertura", () => {
  expect(suggestedServiceType("vacant")).toBe("checkout");
  expect(suggestedServiceType("occupied")).toBe("stayover");

  // A funcao e' SUGESTAO no fecho. O teste que trava a volta do defeito da D2 anterior e' o
  // 5b abaixo: uma tarefa pendente NAO pode ter tipo -- ou seja, a abertura do dia nao tipa
  // nada, e nenhum caminho consegue faze-lo.
});

test("5b - o bicondicional: tipo se e somente se concluida", () => {
  // Trabalho feito SEMPRE tem tipo.
  expect(isTaskShapeValid("done", "checkout")).toBe(true);
  expect(isTaskShapeValid("done", "stayover")).toBe(true);
  expect(isTaskShapeValid("done", null)).toBe(false);

  // Trabalho NAO feito nunca tem. Gravar `stayover` numa dispensa faria o relatorio do mes
  // contar como permanencia realizada um quarto onde ninguem entrou.
  for (const outcome of ["pending", "declined", "cancelled"] as const) {
    expect(isTaskShapeValid(outcome, null)).toBe(true);
    expect(isTaskShapeValid(outcome, "stayover")).toBe(false);
    expect(isTaskShapeValid(outcome, "checkout")).toBe(false);
  }

  // Varredura completa: nenhuma combinacao fora do bicondicional passa.
  let validas = 0;

  for (const outcome of HOUSEKEEPING_TASK_OUTCOME_VALUES) {
    for (const type of [null, ...HOUSEKEEPING_SERVICE_TYPE_VALUES] as Array<HousekeepingServiceType | null>) {
      if (isTaskShapeValid(outcome, type)) {
        validas += 1;
        expect(outcome === "done" ? type !== null : type === null).toBe(true);
      }
    }
  }

  // done x 2 tipos + 3 desfechos x null = 5.
  expect(validas).toBe(5);
});

test("5c - o atalho tipa sozinho: chegar em inspected e' saida por definicao", () => {
  // Permanencia para em `clean`, logo nao ha outro caminho ate `inspected`. E' isto que fecha
  // o atalho `cleaning -> inspected` sem exigir um passo a mais da governanta.
  expect(serviceTypeImpliedBy("inspected")).toBe("checkout");

  // Nenhum outro destino implica tipo -- o tipo dos demais vem do fecho, com a sugestao da
  // ocupacao e a edicao dela.
  for (const to of HOUSEKEEPING_STATUS_VALUES.filter((s) => s !== "inspected")) {
    expect(serviceTypeImpliedBy(to)).toBeNull();
  }
});

// ---------------------------------------------------------------------------- §7.6

test("6 - dispensa encerra e exige origem", () => {
  const origens: HousekeepingDeclineOrigin[] = ["front_desk", "housekeeper"];

  for (const origem of origens) {
    expect(isDeclineShapeValid("declined", origem)).toBe(true);
  }

  // Dispensa sem origem nao grava: saber POR QUAL caminho ela chegou e' o que permite avaliar
  // depois se o aviso da recepcao esta funcionando.
  expect(isDeclineShapeValid("declined", null)).toBe(false);

  // E origem em qualquer outro desfecho e' rejeitada -- `cancelled` nao e' dispensa.
  for (const outcome of ["pending", "done", "cancelled"] as const) {
    expect(isDeclineShapeValid(outcome, null)).toBe(true);
    expect(isDeclineShapeValid(outcome, "front_desk")).toBe(false);
  }

  // `declined` e `cancelled` sao desfechos DISTINTOS: dispensa e' decisao do hospede,
  // cancelamento e' o apartamento ter saido de operacao. Achatar os dois faria o relatorio do
  // mes dizer que o hospede dispensou arrumacao num quarto que estava em obra.
  expect(HOUSEKEEPING_TASK_OUTCOME_VALUES).toContain("declined");
  expect(HOUSEKEEPING_TASK_OUTCOME_VALUES).toContain("cancelled");

  // Nenhum dos dois conta como pendencia: o numero que a governanta olha no fim do dia e' "o
  // que ficou por fazer", e nem dispensa nem cancelamento sao isso.
  const pendentes = HOUSEKEEPING_TASK_OUTCOME_VALUES.filter((o) => o === "pending");
  expect(pendentes).toEqual(["pending"]);
});

// ---------------------------------------------------------------------------- §7.7

test("7 - bloquear e desbloquear NO MESMO DIA devolve a tarefa para a fila", () => {
  // A manutencao que resolve em duas horas e' a maioria. Bloquear cancela a tarefa pendente;
  // desbloquear tem que RESSUSCITA-LA -- senao o apartamento sai da obra, cai para `dirty`,
  // volta a precisar de arrumacao e continua fora da fila. E' o proprio defeito que o efeito
  // de desbloqueio existe para evitar, e a primeira versao da 091 o reintroduzia com um
  // `on conflict do nothing`.
  const cancelada = taskOutcomeAfterBlock("pending");
  expect(cancelada).toBe("cancelled");
  expect(taskOutcomeAfterUnblock(cancelada)).toBe("pending");

  // Bloquear nao desfaz trabalho ja feito nem dispensa ja decidida.
  expect(taskOutcomeAfterBlock("done")).toBe("done");
  expect(taskOutcomeAfterBlock("declined")).toBe("declined");

  // E desbloquear NUNCA ressuscita esses dois: desbloquear um quarto nao desfaz o trabalho que
  // aconteceu nem a decisao do hospede.
  expect(taskOutcomeAfterUnblock("done")).toBe("done");
  expect(taskOutcomeAfterUnblock("declined")).toBe("declined");
  expect(taskOutcomeAfterUnblock("pending")).toBe("pending");

  // Ciclo completo, na ordem em que acontece no corredor.
  let outcome = taskOutcomeAfterBlock("pending");   // 9h: manutencao bloqueia
  outcome = taskOutcomeAfterUnblock(outcome);        // 11h: manutencao encerra
  expect(outcome).toBe("pending");                   // o quarto volta para a fila do dia
});

// ---------------------------------------------------------------------------- §7.8

test("8 - so' permanencia fecha a tarefa em clean; saida segue pendente ate a vistoria", () => {
  // Permanencia termina em `clean` -- nao ha vistoria num quarto ocupado.
  expect(closesTaskAtClean("stayover")).toBe(true);

  // Saida NAO terminou: falta a vistoria. A tarefa segue `pending` e SEM tipo, e isso e'
  // verdade, nao perda -- o tipo dela e' gravado ao chegar em `inspected`.
  expect(closesTaskAtClean("checkout")).toBe(false);

  // E o bicondicional continua valendo nos dois desfechos.
  expect(isTaskShapeValid("done", "stayover")).toBe(true);
  expect(isTaskShapeValid("pending", null)).toBe(true);

  // Um quarto que fica em `clean` como saida ate o fim do dia termina pendente e sem tipo --
  // certo: a vistoria nao aconteceu, o trabalho nao acabou.
  expect(isTaskShapeValid("pending", "checkout")).toBe(false);
});

// ---------------------------------------------------------------------------- §7.10

test("10 - data operacional e' a do fuso da unidade, nao a do servidor", () => {
  const SP = "America/Sao_Paulo";

  // 23h00 em Sao Paulo = 02h00 UTC do dia seguinte. A data operacional e' HOJE.
  const noite = new Date("2026-09-02T23:00:00-03:00");

  expect(housekeepingServiceDate(noite, SP)).toBe("2026-09-02");

  // E' exatamente onde o defeito estava: em UTC o mesmo instante ja e' o dia seguinte, e a RPC
  // procuraria o housekeeping_days de amanha, nao acharia, e pularia os efeitos na tarefa em
  // silencio -- todo dia depois das 21h.
  expect(noite.toISOString().slice(0, 10)).toBe("2026-09-03");
  expect(housekeepingServiceDate(noite, SP)).not.toBe(noite.toISOString().slice(0, 10));

  // 20h50 e 21h10 sao o MESMO dia operacional. Sem isso a trava de ordem para de conferir
  // justamente no fim do dia, que e' quando o lancamento retroativo e' mais provavel.
  const antes = new Date("2026-09-02T20:50:00-03:00");
  const depois = new Date("2026-09-02T21:10:00-03:00");

  expect(housekeepingServiceDate(antes, SP)).toBe(housekeepingServiceDate(depois, SP));
  // Em UTC elas cairiam em dias diferentes -- 23h50 e 00h10.
  expect(antes.toISOString().slice(0, 10)).not.toBe(depois.toISOString().slice(0, 10));

  // A virada REAL do dia, no fuso da unidade, continua funcionando.
  expect(housekeepingServiceDate(new Date("2026-09-02T23:59:59-03:00"), SP)).toBe("2026-09-02");
  expect(housekeepingServiceDate(new Date("2026-09-03T00:00:01-03:00"), SP)).toBe("2026-09-03");

  // E o fuso e' por UNIDADE: o mesmo instante em outro fuso da outra data. E' o que o SaaS vai
  // precisar no primeiro hotel fora do horario de Brasilia.
  expect(housekeepingServiceDate(noite, "UTC")).toBe("2026-09-03");
});
