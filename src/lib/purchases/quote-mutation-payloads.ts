// Montagem dos payloads das mutacoes de cotacao (achado #7 / plano 51).
//
// Funcoes PURAS, sem I/O e sem `server-only`: a rota as usa para montar o que vai por jsonb
// para as RPCs transacionais (migration 083), e o runner puro de tests/unit prova que os
// objetos produzidos sao IDENTICOS aos que a rota escrevia antes, campo a campo.
//
// Toda a regra de negocio continua aqui, em TypeScript. As RPCs sao apenas envelope
// transacional — nenhum calculo de alcada, total ou flag migrou para SQL.

import { calculateWinningQuoteApprovalFlags, getPurchaseApprovalLevel } from "@/lib/purchases/api";

export type QuoteMutationRequestRow = {
  status: string;
  approval_status: "pending" | "approved" | "rejected" | "returned_to_purchases" | null;
};

export type PurchaseRequestPatch = Record<string, unknown>;

export type PurchaseRequestEventPayload = {
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  description: string;
  ordinal: number;
};

export function isReturnedToPurchases(requestRow: QuoteMutationRequestRow) {
  return requestRow.approval_status === "returned_to_purchases";
}

// Solicitacao devolvida para Compras mantem o marcador; qualquer outra volta a null.
export function getReviewApprovalStatusUpdate(requestRow: QuoteMutationRequestRow) {
  return isReturnedToPurchases(requestRow)
    ? { approval_status: "returned_to_purchases" as const }
    : { approval_status: null };
}

// Em solicitacao devolvida, NAO tocar nos campos de decisao (retorna {} de proposito: as
// chaves ausentes preservam o valor atual quando o patch e' aplicado no banco).
export function getReviewDecisionResetFields(requestRow: QuoteMutationRequestRow) {
  return isReturnedToPurchases(requestRow)
    ? {}
    : {
        approval_decided_at: null,
        approval_decided_by: null,
        approval_decision_notes: null
      };
}

// Patch aplicado quando a solicitacao passa a NAO ter cotacao vencedora
// (unselect e cancelamento da vencedora): zera totais e exigencias.
export function buildClearedWinnerRequestPatch(input: {
  requestRow: QuoteMutationRequestRow;
  actorId: string;
}): PurchaseRequestPatch {
  return {
    total_approved_amount: 0,
    quotation_required: false,
    required_quote_count: 0,
    approval_required: false,
    director_approval_required: false,
    ...getReviewApprovalStatusUpdate(input.requestRow),
    approval_level: null,
    ...getReviewDecisionResetFields(input.requestRow),
    updated_by: input.actorId
  };
}

// Patch aplicado quando uma cotacao passa a ser (ou continua sendo) a vencedora.
// `keepApprovalRequirement`: em solicitacao devolvida para Compras as exigencias de
// aprovacao sao preservadas; fora dela, zeradas — comportamento identico ao anterior.
export function buildWinnerRequestPatch(input: {
  requestRow: QuoteMutationRequestRow;
  totalAmount: number;
  actorId: string;
}): PurchaseRequestPatch {
  const flags = calculateWinningQuoteApprovalFlags(input.totalAmount);
  const keepApprovalRequirement = isReturnedToPurchases(input.requestRow);

  return {
    total_approved_amount: input.totalAmount,
    quotation_required: flags.quotationRequired,
    required_quote_count: flags.requiredQuoteCount,
    approval_required: keepApprovalRequirement ? flags.approvalRequired : false,
    director_approval_required: keepApprovalRequirement ? flags.directorApprovalRequired : false,
    ...getReviewApprovalStatusUpdate(input.requestRow),
    approval_level: getPurchaseApprovalLevel(input.totalAmount),
    ...getReviewDecisionResetFields(input.requestRow),
    updated_by: input.actorId
  };
}

// Auto-start da cotacao (submitted/under_review -> quotation) no caminho de salvar valores.
export function buildStartQuotationRequestPatch(actorId: string): PurchaseRequestPatch {
  return { status: "quotation", updated_by: actorId };
}

// Mescla os patches na ordem em que a rota os aplicava (auto-start primeiro, depois o
// patch de totais), produzindo UM unico patch para a transacao.
export function mergeRequestPatches(...patches: Array<PurchaseRequestPatch | null>): PurchaseRequestPatch | null {
  const present = patches.filter((patch): patch is PurchaseRequestPatch => Boolean(patch));

  if (!present.length) {
    return null;
  }

  return present.reduce<PurchaseRequestPatch>((accumulator, patch) => ({ ...accumulator, ...patch }), {});
}

// `ordinal` preserva a ordem de insercao dentro da transacao (a RPC ordena por ele).
export function buildRequestEvents(
  events: Array<{ eventType: string; fromStatus: string | null; toStatus: string | null; description: string }>
): PurchaseRequestEventPayload[] {
  return events.map((event, index) => ({
    event_type: event.eventType,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    description: event.description,
    ordinal: index
  }));
}
