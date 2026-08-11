import { expect, test } from "@playwright/test";

import {
  buildClearedWinnerRequestPatch,
  buildRequestEvents,
  buildStartQuotationRequestPatch,
  buildWinnerRequestPatch,
  getReviewApprovalStatusUpdate,
  getReviewDecisionResetFields,
  isReturnedToPurchases,
  mergeRequestPatches,
  type QuoteMutationRequestRow
} from "../../src/lib/purchases/quote-mutation-payloads";

// Runner puro. Cobre o achado #7 (plano 51): as mutacoes de cotacao passam a ser
// transacionais (migration 083) e os payloads vao por jsonb para as RPCs.
//
// O que estes testes provam: os objetos montados aqui sao IDENTICOS aos que a rota
// escrevia direto no banco antes do refactor. Se um campo mudar de nome, sumir ou trocar de
// valor, a RPC passa a escrever algo diferente do que o codigo antigo escrevia — e o
// caminho e' o do dinheiro (total_approved_amount alimenta a alcada de aprovacao).

const ACTOR = "user-ana";

const inQuotation: QuoteMutationRequestRow = { status: "quotation", approval_status: null };
const returned: QuoteMutationRequestRow = { status: "quotation", approval_status: "returned_to_purchases" };
const pending: QuoteMutationRequestRow = { status: "quotation", approval_status: "pending" };

// ---------------------------------------------------------------- predicados de revisao

test("isReturnedToPurchases: so' true para approval_status returned_to_purchases", () => {
  expect(isReturnedToPurchases(returned)).toBe(true);
  for (const row of [inQuotation, pending, { status: "quotation", approval_status: "approved" } as QuoteMutationRequestRow]) {
    expect(isReturnedToPurchases(row)).toBe(false);
  }
});

test("getReviewApprovalStatusUpdate: preserva o marcador de devolvida, zera o resto", () => {
  expect(getReviewApprovalStatusUpdate(returned)).toEqual({ approval_status: "returned_to_purchases" });
  expect(getReviewApprovalStatusUpdate(inQuotation)).toEqual({ approval_status: null });
  expect(getReviewApprovalStatusUpdate(pending)).toEqual({ approval_status: null });
});

test("getReviewDecisionResetFields: devolvida NAO toca nos campos de decisao", () => {
  // {} e' proposital: chave ausente no patch preserva o valor atual no banco.
  expect(getReviewDecisionResetFields(returned)).toEqual({});
  expect(getReviewDecisionResetFields(inQuotation)).toEqual({
    approval_decided_at: null,
    approval_decided_by: null,
    approval_decision_notes: null
  });
});

// ---------------------------------------------------------------- patch de "sem vencedora"

test("buildClearedWinnerRequestPatch: identico ao update do unselect/cancel antigo", () => {
  expect(buildClearedWinnerRequestPatch({ requestRow: inQuotation, actorId: ACTOR })).toEqual({
    total_approved_amount: 0,
    quotation_required: false,
    required_quote_count: 0,
    approval_required: false,
    director_approval_required: false,
    approval_status: null,
    approval_level: null,
    approval_decided_at: null,
    approval_decided_by: null,
    approval_decision_notes: null,
    updated_by: ACTOR
  });
});

test("buildClearedWinnerRequestPatch: em devolvida, mantem marcador e omite campos de decisao", () => {
  const patch = buildClearedWinnerRequestPatch({ requestRow: returned, actorId: ACTOR });

  expect(patch.approval_status).toBe("returned_to_purchases");
  expect("approval_decided_at" in patch).toBe(false);
  expect("approval_decided_by" in patch).toBe(false);
  expect("approval_decision_notes" in patch).toBe(false);
});

// ---------------------------------------------------------------- patch de vencedora

test("buildWinnerRequestPatch: <= R$200 -> alcada administrativa", () => {
  const patch = buildWinnerRequestPatch({ requestRow: inQuotation, totalAmount: 100, actorId: ACTOR });

  expect(patch.total_approved_amount).toBe(100);
  expect(patch.approval_level).toBe("administrative_management");
  // Fora de "devolvida", as exigencias de aprovacao sao zeradas — comportamento anterior.
  expect(patch.approval_required).toBe(false);
  expect(patch.director_approval_required).toBe(false);
  expect(patch.updated_by).toBe(ACTOR);
});

test("buildWinnerRequestPatch: > R$200 -> alcada de diretoria (o campo que a janela corrompia)", () => {
  const patch = buildWinnerRequestPatch({ requestRow: inQuotation, totalAmount: 5000, actorId: ACTOR });

  expect(patch.total_approved_amount).toBe(5000);
  expect(patch.approval_level).toBe("general_directorate");
});

test("buildWinnerRequestPatch: em devolvida, PRESERVA as exigencias de aprovacao", () => {
  const patch = buildWinnerRequestPatch({ requestRow: returned, totalAmount: 5000, actorId: ACTOR });

  expect(patch.approval_required).toBe(true);
  expect(patch.director_approval_required).toBe(true);
  expect(patch.approval_status).toBe("returned_to_purchases");
  expect("approval_decided_at" in patch).toBe(false);
});

test("buildWinnerRequestPatch: total e nivel andam sempre juntos (invariante da alcada)", () => {
  for (const total of [0, 1, 199.99, 200, 200.01, 1000, 999999]) {
    const patch = buildWinnerRequestPatch({ requestRow: inQuotation, totalAmount: total, actorId: ACTOR });
    const expected = total > 200 ? "general_directorate" : "administrative_management";

    expect(patch.approval_level, `total=${total}`).toBe(expected);
    expect(patch.total_approved_amount, `total=${total}`).toBe(total);
  }
});

// ---------------------------------------------------------------- merge e idempotencia

test("mergeRequestPatches: auto-start + vencedora viram UM patch, com o segundo prevalecendo", () => {
  const merged = mergeRequestPatches(
    buildStartQuotationRequestPatch(ACTOR),
    buildWinnerRequestPatch({ requestRow: inQuotation, totalAmount: 300, actorId: ACTOR })
  );

  expect(merged?.status).toBe("quotation");
  expect(merged?.approval_level).toBe("general_directorate");
  expect(merged?.updated_by).toBe(ACTOR);
});

test("mergeRequestPatches: sem patches -> null (a RPC nao toca na solicitacao)", () => {
  expect(mergeRequestPatches(null, null)).toBeNull();
  expect(mergeRequestPatches()).toBeNull();
});

test("mergeRequestPatches: um so' patch atravessa inalterado", () => {
  const patch = buildWinnerRequestPatch({ requestRow: inQuotation, totalAmount: 42, actorId: ACTOR });
  expect(mergeRequestPatches(null, patch)).toEqual(patch);
});

test("idempotencia: mesma entrada produz sempre o mesmo payload", () => {
  const build = () => ({
    winner: buildWinnerRequestPatch({ requestRow: returned, totalAmount: 777, actorId: ACTOR }),
    cleared: buildClearedWinnerRequestPatch({ requestRow: inQuotation, actorId: ACTOR }),
    start: buildStartQuotationRequestPatch(ACTOR)
  });

  expect(build()).toEqual(build());
});

// ---------------------------------------------------------------- eventos

test("buildRequestEvents: mapeia para snake_case e numera a ordem", () => {
  expect(
    buildRequestEvents([
      { eventType: "quotation_started", fromStatus: "submitted", toStatus: "quotation", description: "Cotacao iniciada." },
      { eventType: "quote_updated", fromStatus: "quotation", toStatus: "quotation", description: "Cotacao atualizada." }
    ])
  ).toEqual([
    { event_type: "quotation_started", from_status: "submitted", to_status: "quotation", description: "Cotacao iniciada.", ordinal: 0 },
    { event_type: "quote_updated", from_status: "quotation", to_status: "quotation", description: "Cotacao atualizada.", ordinal: 1 }
  ]);
});

test("buildRequestEvents: lista vazia -> array vazio (a RPC nao insere nada)", () => {
  expect(buildRequestEvents([])).toEqual([]);
});
