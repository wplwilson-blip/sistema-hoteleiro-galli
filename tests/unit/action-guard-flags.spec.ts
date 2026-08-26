import { expect, test } from "@playwright/test";

import {
  getApprovalActionGuard,
  isPurchaseSelfApproval,
  isPurchaseSelfSelectionApproval,
  type PurchaseApprovalDecision
} from "../../src/lib/purchases/approval-segregation";
import { getUserDeletePermission } from "../../src/lib/auth/super-admin";

// Runner puro. Cobre a fatia M3 + C6 (plano docs/codex/64): a tela desabilita o que a API
// ja' barra, sem reimplementar a regra — o servidor calcula um booleano e um motivo.
//
// O valor destes testes esta' nos casos de COERENCIA: eles falham se o espelho descolar da
// trava. Um espelho errado e' pior que espelho nenhum — desabilita o que a API aceita, ou
// habilita o que ela recusa.

const ANA = "user-ana";
const BRUNO = "user-bruno";
const CARLA = "user-carla";

const DECISIONS: PurchaseApprovalDecision[] = ["approved", "rejected", "returned_to_purchases"];

// ------------------------------------------------------------------ M3

test("M3: bloqueia quem criou a solicitacao", () => {
  const guard = getApprovalActionGuard({ requestedBy: ANA, selectedBy: BRUNO, actorId: ANA });

  expect(guard.selfApprovalBlocked).toBe(true);
  expect(guard.selfApprovalBlockedReason).toContain("criou esta solicitacao");
});

test("M3: bloqueia quem selecionou a vencedora", () => {
  const guard = getApprovalActionGuard({ requestedBy: BRUNO, selectedBy: ANA, actorId: ANA });

  expect(guard.selfApprovalBlocked).toBe(true);
  expect(guard.selfApprovalBlockedReason).toContain("selecionou a cotacao vencedora");
});

test("M3: os dois papeis na mesma pessoa -> motivo combinado", () => {
  const guard = getApprovalActionGuard({ requestedBy: ANA, selectedBy: ANA, actorId: ANA });

  expect(guard.selfApprovalBlocked).toBe(true);
  expect(guard.selfApprovalBlockedReason).toContain("criou esta solicitacao");
  expect(guard.selfApprovalBlockedReason).toContain("selecionou a cotacao vencedora");
});

test("M3: nao sendo nenhum dos dois, libera", () => {
  const guard = getApprovalActionGuard({ requestedBy: BRUNO, selectedBy: CARLA, actorId: ANA });

  expect(guard.selfApprovalBlocked).toBe(false);
  expect(guard.selfApprovalBlockedReason).toBe("");
});

test("M3: nulos (legado) nao bloqueiam — mesma regra dos predicados", () => {
  // requested_by/selected_by nulos: legado, ou usuario removido via `on delete set null`.
  for (const requestedBy of [null, undefined]) {
    for (const selectedBy of [null, undefined]) {
      const guard = getApprovalActionGuard({ requestedBy, selectedBy, actorId: ANA });
      expect(guard.selfApprovalBlocked, `${String(requestedBy)}/${String(selectedBy)}`).toBe(false);
    }
  }
});

test("M3: a mensagem sempre lembra que reprovar e devolver seguem liberados", () => {
  const bloqueados = [
    getApprovalActionGuard({ requestedBy: ANA, selectedBy: BRUNO, actorId: ANA }),
    getApprovalActionGuard({ requestedBy: BRUNO, selectedBy: ANA, actorId: ANA }),
    getApprovalActionGuard({ requestedBy: ANA, selectedBy: ANA, actorId: ANA })
  ];

  for (const guard of bloqueados) {
    expect(guard.selfApprovalBlockedReason).toContain("reprovar");
    expect(guard.selfApprovalBlockedReason).toContain("devolver");
  }
});

test("M3 COERENCIA: o flag e' exatamente o OU dos dois predicados para 'approved'", () => {
  // Este e' o teste que impede o espelho de descolar da trava. Se alguem mudar um predicado
  // e nao o flag (ou vice-versa), ele cai.
  for (const requestedBy of [ANA, BRUNO, null]) {
    for (const selectedBy of [ANA, BRUNO, null]) {
      for (const actorId of [ANA, BRUNO]) {
        const esperado =
          isPurchaseSelfApproval({ requestedBy, actorId, decision: "approved" }) ||
          isPurchaseSelfSelectionApproval({ selectedBy, actorId, decision: "approved" });

        expect(
          getApprovalActionGuard({ requestedBy, selectedBy, actorId }).selfApprovalBlocked,
          `requestedBy=${requestedBy} selectedBy=${selectedBy} actor=${actorId}`
        ).toBe(esperado);
      }
    }
  }
});

test("M3: o flag fala SO' de aprovar — reprovar/devolver nunca sao bloqueados pelos predicados", () => {
  for (const decision of DECISIONS.filter((item) => item !== "approved")) {
    expect(isPurchaseSelfApproval({ requestedBy: ANA, actorId: ANA, decision }), decision).toBe(false);
    expect(isPurchaseSelfSelectionApproval({ selectedBy: ANA, actorId: ANA, decision }), decision).toBe(false);
  }
});

// ------------------------------------------------------------------ C6

test("C6: nao da' para excluir o proprio usuario", () => {
  const permission = getUserDeletePermission({ userId: ANA, actorId: ANA, activeSuperAdminIds: [BRUNO, CARLA] });

  expect(permission.canDelete).toBe(false);
  expect(permission.cannotDeleteReason).toContain("proprio usuario");
});

test("C6: nao da' para excluir o ultimo super admin ativo", () => {
  const permission = getUserDeletePermission({ userId: BRUNO, actorId: ANA, activeSuperAdminIds: [BRUNO] });

  expect(permission.canDelete).toBe(false);
  expect(permission.cannotDeleteReason).toContain("ultimo super admin");
});

test("C6: super admin com outro super admin ativo pode ser excluido", () => {
  const permission = getUserDeletePermission({ userId: BRUNO, actorId: ANA, activeSuperAdminIds: [BRUNO, CARLA] });

  expect(permission.canDelete).toBe(true);
  expect(permission.cannotDeleteReason).toBe("");
});

test("C6: usuario comum que nao e' o proprio pode ser excluido", () => {
  const permission = getUserDeletePermission({ userId: CARLA, actorId: ANA, activeSuperAdminIds: [ANA, BRUNO] });

  expect(permission.canDelete).toBe(true);
});

test("C6: proprio E ultimo super admin -> bloqueia, com o motivo do proprio (precedencia)", () => {
  const permission = getUserDeletePermission({ userId: ANA, actorId: ANA, activeSuperAdminIds: [ANA] });

  expect(permission.canDelete).toBe(false);
  expect(permission.cannotDeleteReason).toContain("proprio usuario");
});

test("C6: sem super admin nenhum na lista, so' a regra do proprio vale", () => {
  expect(getUserDeletePermission({ userId: BRUNO, actorId: ANA, activeSuperAdminIds: [] }).canDelete).toBe(true);
  expect(getUserDeletePermission({ userId: ANA, actorId: ANA, activeSuperAdminIds: [] }).canDelete).toBe(false);
});
