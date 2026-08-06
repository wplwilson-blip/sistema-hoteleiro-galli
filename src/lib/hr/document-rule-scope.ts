// Predicado PURO de escopo para mutacao de regra documental (achado #1 / plano 47).
// Sem I/O e sem `server-only` de proposito: e' consumido por document-rule-actions.ts
// (que e' server-only) e testado direto em tests/unit pelo runner puro.
//
// Decisao de produto aprovada:
//   1. valida SEMPRE a unidade do recurso EXISTENTE, nunca a unidade vinda no corpo;
//   2. unit_id preenchido -> so edita quem tem escopo naquela unidade; TRANSFERENCIA de
//      unidade proibida (mudar unit_id so super admin);
//   3. unit_id null (regra de rede) -> so super admin ou network manager.

export type HrDocumentRuleScopeActor = {
  isSuperAdmin: boolean;
  isNetworkManager: boolean;
  accessibleUnitIds: readonly string[];
};

export type HrDocumentRuleScopeRefusal =
  | "existing_unit_out_of_scope"
  | "network_rule_requires_network_scope"
  | "unit_transfer_forbidden";

export type HrDocumentRuleScopeDecision = { allowed: true } | { allowed: false; refusal: HrDocumentRuleScopeRefusal };

export function decideHrDocumentRuleMutation(input: {
  actor: HrDocumentRuleScopeActor;
  existingUnitId: string | null;
  nextUnitId: string | null;
}): HrDocumentRuleScopeDecision {
  const { actor, existingUnitId, nextUnitId } = input;

  if (actor.isSuperAdmin) {
    return { allowed: true };
  }

  if (existingUnitId === null) {
    // Regra de rede: vale para a rede inteira, entao exige escopo de rede.
    if (!actor.isNetworkManager) {
      return { allowed: false, refusal: "network_rule_requires_network_scope" };
    }
  } else if (!actor.accessibleUnitIds.includes(existingUnitId)) {
    // O recurso EXISTENTE esta fora do escopo do ator. E' o bug critico: sem isto o
    // service_role escreve em regra de outra unidade via .eq("id", id).
    return { allowed: false, refusal: "existing_unit_out_of_scope" };
  }

  // Transferencia de unidade (inclusive de/para rede) e' privilegio de super admin.
  if (nextUnitId !== existingUnitId) {
    return { allowed: false, refusal: "unit_transfer_forbidden" };
  }

  return { allowed: true };
}
