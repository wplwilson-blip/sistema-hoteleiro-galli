// Segregacao de funcao na aprovacao de compras (achado #3 / plano 50).
// Predicado PURO, sem I/O e sem `server-only` de proposito: e' consumido pela rota de
// decisao (server) e testado direto em tests/unit pelo runner puro.
//
// Decisao de produto aprovada:
//   1. quem criou a solicitacao (purchase_requests.requested_by) NAO pode APROVA-la;
//   2. bloqueia SOMENTE decision === "approved" — reprovar e devolver para Compras nao
//      sao vetor de fraude, e travar geraria atrito operacional;
//   3. SEM excecao para super admin: e' controle de auditoria, nao de privilegio;
//   4. requested_by nulo (legado, ou usuario removido via `on delete set null`) NAO
//      bloqueia — nao ha como afirmar autoaprovacao sem saber quem pediu. Solicitacoes
//      novas sempre gravam o campo (requests/route.ts), entao a brecha nao cresce.

export type PurchaseApprovalDecision = "approved" | "rejected" | "returned_to_purchases";

export function isPurchaseSelfApproval(input: {
  requestedBy: string | null | undefined;
  actorId: string;
  decision: PurchaseApprovalDecision;
}): boolean {
  if (input.decision !== "approved") {
    return false;
  }

  if (!input.requestedBy) {
    return false;
  }

  return input.requestedBy === input.actorId;
}
