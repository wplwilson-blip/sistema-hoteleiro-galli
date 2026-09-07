import { expect, test } from "@playwright/test";

import {
  HOUSEKEEPING_SERVICE_TYPE_VALUES,
  HOUSEKEEPING_STATUS_VALUES,
  HOUSEKEEPING_TASK_OUTCOME_VALUES,
  isBatchAllowed,
  isDeclineShapeValid,
  isServiceComplete,
  isTaskShapeValid,
  carriesOverToNextDay,
  closesTaskAtClean,
  isCarryOverShapeValid,
  nextCarryOver,
  parseTransitionConflict,
  taskOutcomeAfterDayClose,
  taskOutcomeAfterDayReopen,
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
  for (const outcome of ["pending", "declined", "cancelled", "not_done"] as const) {
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

  // DERIVADO, e nao fixo: `done` com cada tipo, mais um desfecho x null para cada um dos
  // demais. Fixar o numero faria este teste quebrar a cada valor novo do enum -- foi o que
  // aconteceu quando `not_done` entrou (plano 77, D2) --, e quebrar por contagem esconde o que
  // o teste realmente protege, que e' NENHUMA combinacao fora do bicondicional passar.
  expect(validas).toBe(
    HOUSEKEEPING_SERVICE_TYPE_VALUES.length + (HOUSEKEEPING_TASK_OUTCOME_VALUES.length - 1)
  );

  // E o valor novo esta do lado certo: trabalho NAO feito nunca tem tipo.
  expect(HOUSEKEEPING_TASK_OUTCOME_VALUES).toContain("not_done");
  expect(isTaskShapeValid("not_done", null)).toBe(true);
  expect(isTaskShapeValid("not_done", "checkout")).toBe(false);
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

// ================================================================== plano 77 (migration 092)

test("9 - fechar o dia converte pending em not_done, e so isso", () => {
  expect(taskOutcomeAfterDayClose("pending")).toBe("not_done");

  // Nada mais e' tocado: fechar o dia nao desfaz trabalho feito nem decisao do hospede.
  for (const outcome of ["done", "declined", "cancelled", "not_done"] as const) {
    expect(taskOutcomeAfterDayClose(outcome)).toBe(outcome);
  }
});

test("10 - reabrir devolve SO as not_done, e a assimetria com o desbloqueio e deliberada", () => {
  expect(taskOutcomeAfterDayReopen("not_done")).toBe("pending");

  for (const outcome of ["done", "declined", "cancelled", "pending"] as const) {
    expect(taskOutcomeAfterDayReopen(outcome)).toBe(outcome);
  }

  // A assimetria, lado a lado: desbloquear ressuscita `cancelled` e NAO `not_done`; reabrir o
  // dia ressuscita `not_done` e NAO `cancelled`. As naturezas sao diferentes, nao a regra --
  // `done` e `declined` sao fatos consumados; `not_done` e' a conclusao de que o dia acabou
  // antes do trabalho, e reabrir desfaz essa premissa.
  expect(taskOutcomeAfterUnblock("cancelled")).toBe("pending");
  expect(taskOutcomeAfterUnblock("not_done")).toBe("not_done");
  expect(taskOutcomeAfterDayReopen("cancelled")).toBe("cancelled");
});

test("11 - a sobra ACUMULA: a data original propaga, nao a de ontem", () => {
  // Sexta: o quarto fica sem arrumar. Sabado herda a data de SEXTA.
  const sabado = nextCarryOver("not_done", null, "2026-09-04", 1);
  expect(sabado).toEqual({ since: "2026-09-04", days: 1 });

  // Domingo herda a data de SEXTA de novo -- nao a de sabado. Este e' O teste que trava o
  // "reset": se alguem copiar a data do dia anterior em vez de propagar a original, ele quebra.
  const domingo = nextCarryOver("not_done", sabado!.since, "2026-09-05", 2);
  expect(domingo!.since).toBe("2026-09-04");
  expect(domingo!.since).not.toBe("2026-09-05");
  expect(domingo!.days).toBe(2);

  // E a contagem cresce enquanto a data nao muda -- "sobra desde sexta" em vez de "sobra de
  // ontem", que e' o mesmo raciocinio do housekeeping_changed_at.
  expect(domingo!.days).toBeGreaterThan(sabado!.days);
});

test("12 - so not_done carrega: dispensa e cancelamento nao sao sobra", () => {
  expect(carriesOverToNextDay("not_done")).toBe(true);

  // Dispensa nao e' sobra: nada ficou por fazer -- o hospede recusou. Cancelamento tampouco:
  // o apartamento saiu de operacao.
  for (const outcome of ["done", "declined", "cancelled", "pending"] as const) {
    expect(carriesOverToNextDay(outcome)).toBe(false);
    expect(nextCarryOver(outcome, "2026-09-04", "2026-09-05", 3)).toBeNull();
  }
});

test("13 - carried_over_since nulo se e somente se carried_over_days zero", () => {
  expect(isCarryOverShapeValid(null, 0)).toBe(true);
  expect(isCarryOverShapeValid("2026-09-04", 2)).toBe(true);

  // Sobra sem data seria sobra que nao sabe desde quando -- o defeito que a D6 evita.
  expect(isCarryOverShapeValid(null, 2)).toBe(false);
  expect(isCarryOverShapeValid("2026-09-04", 0)).toBe(false);
});

test("14 - o 409 diz qual apartamento, e falha para o generico quando nao da", () => {
  const bom = parseTransitionConflict(
    JSON.stringify({ room_id: "abc", expected: "clean", current: "dirty", dimension: "housekeeping" })
  );

  expect(bom).toEqual({ roomId: "abc", expected: "clean", current: "dirty", dimension: "housekeeping" });

  // DEFENSIVA: qualquer coisa que nao sirva cai no generico. O erro nunca fica PIOR do que ja
  // era -- e o que se le aqui vem de outra camada.
  expect(parseTransitionConflict(undefined)).toBeNull();
  expect(parseTransitionConflict("")).toBeNull();
  expect(parseTransitionConflict("nao e json")).toBeNull();
  expect(parseTransitionConflict("[1,2,3]")).toBeNull();
  expect(parseTransitionConflict(JSON.stringify({ current: "dirty" }))).toBeNull();
  expect(parseTransitionConflict(JSON.stringify({ room_id: "abc" }))).toBeNull();

  // Campos secundarios ausentes NAO invalidam: room_id e current sao o minimo util.
  const parcial = parseTransitionConflict(JSON.stringify({ room_id: "abc", current: "dirty" }));
  expect(parcial?.roomId).toBe("abc");
  expect(parcial?.expected).toBe("");
});
