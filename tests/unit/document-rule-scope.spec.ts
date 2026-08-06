import { expect, test } from "@playwright/test";

import {
  decideHrDocumentRuleMutation,
  type HrDocumentRuleScopeActor,
  type HrDocumentRuleScopeDecision
} from "../../src/lib/hr/document-rule-scope";

// Runner puro (@playwright/test como test runner): sem browser, sem webServer.
// Cobre o achado #1 (plano 47): PATCH de regra documental mutando recurso de outra unidade.
//
// Decisao de produto aprovada:
//   1. valida SEMPRE a unidade do recurso EXISTENTE, nunca a do corpo;
//   2. transferencia de unidade proibida (so super admin);
//   3. regra de rede (unit_id null) so para super admin ou network manager.

const UNIT_A = "unit-a";
const UNIT_B = "unit-b";

const manager = (units: string[] = [UNIT_A]): HrDocumentRuleScopeActor => ({
  isSuperAdmin: false,
  isNetworkManager: false,
  accessibleUnitIds: units
});

const networkManager = (units: string[] = [UNIT_A, UNIT_B]): HrDocumentRuleScopeActor => ({
  isSuperAdmin: false,
  isNetworkManager: true,
  accessibleUnitIds: units
});

const superAdmin = (): HrDocumentRuleScopeActor => ({
  isSuperAdmin: true,
  isNetworkManager: true,
  accessibleUnitIds: []
});

type Case = {
  name: string;
  actor: HrDocumentRuleScopeActor;
  existingUnitId: string | null;
  nextUnitId: string | null;
  expected: HrDocumentRuleScopeDecision;
};

const allow: HrDocumentRuleScopeDecision = { allowed: true };
const deny = (refusal: Exclude<HrDocumentRuleScopeDecision, { allowed: true }>["refusal"]): HrDocumentRuleScopeDecision => ({
  allowed: false,
  refusal
});

const CASES: Case[] = [
  // --- Os 4 casos obrigatorios ---
  {
    // Bug critico: hoje passa quando o corpo manda unitId = A, e o update move a regra de B para A.
    name: "gerente da unidade A editando regra da unidade B (corpo manda A) -> bloqueado",
    actor: manager([UNIT_A]),
    existingUnitId: UNIT_B,
    nextUnitId: UNIT_A,
    expected: deny("existing_unit_out_of_scope")
  },
  {
    name: "gerente transferindo regra da propria unidade para outra -> bloqueado",
    actor: manager([UNIT_A, UNIT_B]),
    existingUnitId: UNIT_A,
    nextUnitId: UNIT_B,
    expected: deny("unit_transfer_forbidden")
  },
  {
    name: "nao-super editando regra de rede (unit_id null) -> bloqueado",
    actor: manager([UNIT_A]),
    existingUnitId: null,
    nextUnitId: null,
    expected: deny("network_rule_requires_network_scope")
  },
  {
    name: "caminho feliz: gerente edita regra da propria unidade sem trocar de unidade",
    actor: manager([UNIT_A]),
    existingUnitId: UNIT_A,
    nextUnitId: UNIT_A,
    expected: allow
  },

  // --- Bordas adicionais do plano 47 ---
  {
    name: "gerente da unidade A editando regra da unidade B sem mandar unitId -> bloqueado",
    actor: manager([UNIT_A]),
    existingUnitId: UNIT_B,
    nextUnitId: UNIT_B,
    expected: deny("existing_unit_out_of_scope")
  },
  {
    name: "gerente tentando sequestrar regra de rede para a propria unidade -> bloqueado",
    actor: manager([UNIT_A]),
    existingUnitId: null,
    nextUnitId: UNIT_A,
    expected: deny("network_rule_requires_network_scope")
  },
  {
    name: "network manager edita regra de rede mantendo unit_id null -> permitido",
    actor: networkManager(),
    existingUnitId: null,
    nextUnitId: null,
    expected: allow
  },
  {
    name: "network manager convertendo regra de rede em regra de unidade -> bloqueado",
    actor: networkManager(),
    existingUnitId: null,
    nextUnitId: UNIT_A,
    expected: deny("unit_transfer_forbidden")
  },
  {
    name: "network manager editando regra de unidade fora do escopo dele -> bloqueado",
    actor: networkManager([UNIT_A]),
    existingUnitId: UNIT_B,
    nextUnitId: UNIT_B,
    expected: deny("existing_unit_out_of_scope")
  },
  {
    name: "super admin transfere regra entre unidades -> permitido",
    actor: superAdmin(),
    existingUnitId: UNIT_A,
    nextUnitId: UNIT_B,
    expected: allow
  },
  {
    name: "super admin edita regra de rede -> permitido",
    actor: superAdmin(),
    existingUnitId: null,
    nextUnitId: null,
    expected: allow
  },
  {
    name: "gerente convertendo regra da propria unidade em regra de rede -> bloqueado",
    actor: manager([UNIT_A]),
    existingUnitId: UNIT_A,
    nextUnitId: null,
    expected: deny("unit_transfer_forbidden")
  }
];

for (const testCase of CASES) {
  test(`escopo: ${testCase.name}`, () => {
    const decision = decideHrDocumentRuleMutation({
      actor: testCase.actor,
      existingUnitId: testCase.existingUnitId,
      nextUnitId: testCase.nextUnitId
    });

    expect(decision).toEqual(testCase.expected);
  });
}

// A unidade do CORPO nunca pode, sozinha, autorizar a mutacao: qualquer que seja o
// nextUnitId, uma regra existente fora do escopo do ator continua recusada. Este e' o
// invariante que o bug violava.
test("invariante: o unitId do corpo nunca autoriza recurso existente fora de escopo", () => {
  const actor = manager([UNIT_A]);

  for (const nextUnitId of [UNIT_A, UNIT_B, null, "unit-c"]) {
    const decision = decideHrDocumentRuleMutation({ actor, existingUnitId: UNIT_B, nextUnitId });
    expect(decision, `nextUnitId=${String(nextUnitId)}`).toEqual(deny("existing_unit_out_of_scope"));
  }
});
