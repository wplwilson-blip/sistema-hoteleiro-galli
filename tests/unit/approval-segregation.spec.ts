import { expect, test } from "@playwright/test";

import {
  isPurchaseSelfApproval,
  type PurchaseApprovalDecision
} from "../../src/lib/purchases/approval-segregation";

// Runner puro (@playwright/test como test runner): sem browser, sem webServer.
// Cobre o achado #3 (plano 50): aprovacao de compra sem segregacao de funcao.
//
// Decisao de produto aprovada:
//   - quem criou (requested_by) nao APROVA a propria solicitacao;
//   - bloqueia SOMENTE decision === "approved";
//   - sem excecao para super admin (o predicado nem conhece o conceito);
//   - requested_by nulo nao bloqueia.

const ANA = "user-ana";
const BRUNO = "user-bruno";

const DECISIONS: PurchaseApprovalDecision[] = ["approved", "rejected", "returned_to_purchases"];

type Case = {
  name: string;
  requestedBy: string | null | undefined;
  actorId: string;
  decision: PurchaseApprovalDecision;
  expected: boolean;
};

const CASES: Case[] = [
  {
    name: "self + approved -> BLOQUEIA (o achado)",
    requestedBy: ANA,
    actorId: ANA,
    decision: "approved",
    expected: true
  },
  {
    name: "solicitante diferente + approved -> permite",
    requestedBy: BRUNO,
    actorId: ANA,
    decision: "approved",
    expected: false
  },
  {
    name: "self + rejected -> permite (nao e' vetor de fraude)",
    requestedBy: ANA,
    actorId: ANA,
    decision: "rejected",
    expected: false
  },
  {
    name: "self + returned_to_purchases -> permite",
    requestedBy: ANA,
    actorId: ANA,
    decision: "returned_to_purchases",
    expected: false
  },
  {
    name: "requested_by null + approved (mesmo ator irrelevante) -> permite",
    requestedBy: null,
    actorId: ANA,
    decision: "approved",
    expected: false
  },
  {
    name: "requested_by undefined + approved -> permite",
    requestedBy: undefined,
    actorId: ANA,
    decision: "approved",
    expected: false
  },
  {
    name: "requested_by string vazia + approved -> permite (nao identifica ninguem)",
    requestedBy: "",
    actorId: "",
    decision: "approved",
    expected: false
  }
];

for (const testCase of CASES) {
  test(`segregacao: ${testCase.name}`, () => {
    expect(
      isPurchaseSelfApproval({
        requestedBy: testCase.requestedBy,
        actorId: testCase.actorId,
        decision: testCase.decision
      })
    ).toBe(testCase.expected);
  });
}

// Invariante 1: a UNICA combinacao que bloqueia e' (mesmo ator) E (approved).
// Prova exaustiva sobre as 3 decisoes x {mesmo ator, outro ator} x {id, null}.
test("invariante: so' bloqueia em (requested_by === actor) && decision === approved", () => {
  for (const decision of DECISIONS) {
    for (const requestedBy of [ANA, BRUNO, null]) {
      for (const actorId of [ANA, BRUNO]) {
        const blocked = isPurchaseSelfApproval({ requestedBy, actorId, decision });
        const shouldBlock = decision === "approved" && requestedBy !== null && requestedBy === actorId;
        expect(blocked, `decision=${decision} requestedBy=${requestedBy} actor=${actorId}`).toBe(shouldBlock);
      }
    }
  }
});

// Invariante 2: reprovar e devolver NUNCA sao bloqueados, sob nenhuma combinacao.
test("invariante: rejected e returned_to_purchases nunca bloqueiam", () => {
  for (const decision of ["rejected", "returned_to_purchases"] as PurchaseApprovalDecision[]) {
    for (const requestedBy of [ANA, BRUNO, null, undefined, ""]) {
      for (const actorId of [ANA, BRUNO, ""]) {
        expect(
          isPurchaseSelfApproval({ requestedBy, actorId, decision }),
          `decision=${decision} requestedBy=${String(requestedBy)} actor=${actorId}`
        ).toBe(false);
      }
    }
  }
});
