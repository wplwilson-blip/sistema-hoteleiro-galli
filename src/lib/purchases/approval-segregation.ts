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

// Segregacao irmã (plano 62): quem SELECIONOU a cotacao vencedora nao APROVA a compra.
//
// Por que um segundo predicado e nao um parametro do primeiro: sao dois conflitos distintos.
// A solicitacao diz "preciso de X"; a selecao diz "compro de Y, por Z" — este e' o ato com
// mais poder discricionario sobre o destino do dinheiro. Separados, cada um tem sua mensagem
// de 403 e seu proprio conjunto de casos de teste.
//
// Herda as MESMAS quatro decisoes da #3, pelo mesmo raciocinio:
//   1. bloqueia SOMENTE decision === "approved";
//   2. SEM excecao para super admin — e' justamente o perfil que pode selecionar E aprovar,
//      isenta-lo esvaziaria o controle. O predicado nem recebe perfil/permissao: se um dia
//      houver excecao, ela entra como `if` VISIVEL na rota, nunca escondida aqui;
//   3. selectedBy nulo NAO bloqueia — e' legado (migration 082 nao fez backfill) ou usuario
//      removido via `on delete set null`; sem saber quem selecionou nao da' para afirmar o
//      conflito. A cobertura cresce sozinha conforme novas selecoes gravam o campo;
//   4. o bloqueio e' por ATO, nao por pessoa: quem selecionou continua podendo reprovar ou
//      devolver para Compras a mesma compra, e aprovar qualquer outra que nao selecionou.
export function isPurchaseSelfSelectionApproval(input: {
  selectedBy: string | null | undefined;
  actorId: string;
  decision: PurchaseApprovalDecision;
}): boolean {
  if (input.decision !== "approved") {
    return false;
  }

  if (!input.selectedBy) {
    return false;
  }

  return input.selectedBy === input.actorId;
}

/**
 * Espelho de UI (plano 64): a mesma resposta que a rota de decisao daria para uma tentativa
 * de APROVAR, calculada na listagem para a tela desabilitar o botao antes do clique.
 *
 * Reusa os dois predicados acima — nao reimplementa regra nenhuma. `decision: "approved"`
 * e' fixo de proposito: e' a unica decisao que os guards bloqueiam, e deixar explicito aqui
 * evita que alguem leia o flag como "bloqueado para tudo". Reprovar e devolver para Compras
 * seguem liberados, inclusive para o solicitante e para o selecionador.
 *
 * Puro: recebe os ids ja' carregados, nao toca no banco, e por isso e' testavel no runner
 * puro junto dos predicados que espelha.
 */
export function getApprovalActionGuard(input: {
  requestedBy: string | null | undefined;
  selectedBy: string | null | undefined;
  actorId: string;
}): { selfApprovalBlocked: boolean; selfApprovalBlockedReason: string } {
  const blockedBySelfRequest = isPurchaseSelfApproval({
    requestedBy: input.requestedBy,
    actorId: input.actorId,
    decision: "approved"
  });
  const blockedBySelfSelection = isPurchaseSelfSelectionApproval({
    selectedBy: input.selectedBy,
    actorId: input.actorId,
    decision: "approved"
  });

  if (blockedBySelfRequest && blockedBySelfSelection) {
    return {
      selfApprovalBlocked: true,
      selfApprovalBlockedReason:
        "Voce criou esta solicitacao e selecionou a cotacao vencedora. Outra pessoa precisa aprovar; voce ainda pode reprovar ou devolver para Compras."
    };
  }

  if (blockedBySelfRequest) {
    return {
      selfApprovalBlocked: true,
      selfApprovalBlockedReason:
        "Voce criou esta solicitacao. Outra pessoa precisa aprovar; voce ainda pode reprovar ou devolver para Compras."
    };
  }

  if (blockedBySelfSelection) {
    return {
      selfApprovalBlocked: true,
      selfApprovalBlockedReason:
        "Voce selecionou a cotacao vencedora. Outra pessoa precisa aprovar; voce ainda pode reprovar ou devolver para Compras."
    };
  }

  return { selfApprovalBlocked: false, selfApprovalBlockedReason: "" };
}
