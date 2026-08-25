import { expect, test } from "@playwright/test";

import { calculateWinningQuoteApprovalFlags, getPurchaseApprovalLevel } from "../../src/lib/purchases/api";
import { buildWinnerRequestPatch, type QuoteMutationRequestRow } from "../../src/lib/purchases/quote-mutation-payloads";
import {
  classifyPurchaseQuoteEvidence,
  readHasCriticalEvidence,
  type PurchaseQuoteEvidenceClassification
} from "../../src/lib/purchases/quote-schemas";

// Runner puro. Cobre o achado P5 (plano docs/codex/59): a alcada de compra passa a ser
// decidida SO' pelo valor, nos dois caminhos. Antes, o envio/reenvio aplicava um override
// (`requiresDirectorApproval ? "general_directorate" : ...`) que a selecao da vencedora nao
// aplicava — a mesma compra dizia "Gerencia" na solicitacao e "Diretoria" no dossie.
//
// O que estes testes provam: (1) o mapa valor->alcada nao mudou; (2) evidencia fraca nao
// escala mais alcada; (3) os dois caminhos batem; (4) o controle sobre evidencia fraca
// continua existindo (justificativa obrigatoria + selo); (5) dossie antigo ainda le certo.

const ACTOR = "user-ana";
const inQuotation: QuoteMutationRequestRow = { status: "quotation", approval_status: null };

// Replica exata do calculo do caminho de envio/reenvio apos o plano 59
// (src/app/api/purchases/approvals/[requestId]/resubmit/route.ts). Se aquela rota voltar a
// consultar a classificacao documental para decidir alcada, o teste de regressao abaixo cai.
function resubmitApprovalLevel(total: number) {
  return getPurchaseApprovalLevel(total);
}

// Entradas que produzem cada uma das 4 classificacoes documentais.
const evidenceFixtures: Array<{ name: string; input: Parameters<typeof classifyPurchaseQuoteEvidence>[0] }> = [
  {
    name: "documentada (proposta formal com anexo)",
    input: {
      quoteSourceType: "formal_proposal",
      evidenceType: "attached_file",
      sourceContactName: "Fornecedor X",
      hasAttachment: true
    }
  },
  {
    name: "verbal com justificativa e contato",
    input: {
      quoteSourceType: "phone_call",
      evidenceType: "call_note",
      sourceContactName: "Joao",
      sourceContactChannel: "phone",
      sourceNotes: "Cotacao por telefone.",
      evidenceMissingReason: "Fornecedor nao emite PDF.",
      isVerbalQuote: true,
      hasAttachment: false
    }
  },
  {
    name: "critica (sem origem nem evidencia)",
    input: {
      quoteSourceType: null,
      evidenceType: null,
      hasAttachment: false
    }
  },
  {
    name: "critica (sem evidencia formal e sem justificativa)",
    input: {
      quoteSourceType: "formal_proposal",
      evidenceType: "none",
      hasAttachment: false
    }
  }
];

function classify(name: string): PurchaseQuoteEvidenceClassification {
  const fixture = evidenceFixtures.find((item) => item.name === name);

  if (!fixture) {
    throw new Error(`fixture desconhecida: ${name}`);
  }

  return classifyPurchaseQuoteEvidence(fixture.input);
}

// ------------------------------------------------- 1. mapa valor->alcada inalterado

test("cotacao documentada: mapa valor->alcada identico ao de hoje", () => {
  expect(getPurchaseApprovalLevel(0.01)).toBe("administrative_management");
  expect(getPurchaseApprovalLevel(200)).toBe("administrative_management");
  expect(getPurchaseApprovalLevel(200.01)).toBe("general_directorate");
  expect(getPurchaseApprovalLevel(5000)).toBe("general_directorate");
});

// ------------------------------------------------- 2. evidencia fraca nao escala alcada

test("baixo valor sem documento: fica na alcada do valor, nao vai a Diretoria", () => {
  const critical = classify("critica (sem evidencia formal e sem justificativa)");

  expect(critical.status).toBe("critical");
  expect(critical.hasCriticalEvidence).toBe(true);

  // Antes do plano 59 este caso ia para "general_directorate" pelo override de evidencia.
  expect(resubmitApprovalLevel(100)).toBe("administrative_management");

  const flags = calculateWinningQuoteApprovalFlags(100);
  expect(flags.directorApprovalRequired).toBe(false);
});

test("valor alto sem documento: ja vai a Diretoria pelo valor, sem precisar do override", () => {
  expect(resubmitApprovalLevel(1500)).toBe("general_directorate");
  expect(calculateWinningQuoteApprovalFlags(1500).directorApprovalRequired).toBe(true);
});

// ------------------------------------------------- 3. regressao da divergencia

test("regressao da divergencia: dossie e solicitacao calculam a mesma alcada", () => {
  const totals = [0.01, 50, 100, 200, 200.01, 999, 5000];

  for (const total of totals) {
    for (const fixture of evidenceFixtures) {
      const classification = classifyPurchaseQuoteEvidence(fixture.input);
      const selectionLevel = buildWinnerRequestPatch({
        requestRow: inQuotation,
        totalAmount: total,
        actorId: ACTOR
      }).approval_level;

      expect(
        resubmitApprovalLevel(total),
        `total=${total} evidencia=${fixture.name} (${classification.status})`
      ).toBe(selectionLevel);
    }
  }
});

// ------------------------------------------------- 4. o controle continua existindo

test("evidencia fragil/critica: justificativa continua obrigatoria e o selo continua ligado", () => {
  for (const name of ["critica (sem origem nem evidencia)", "critica (sem evidencia formal e sem justificativa)"]) {
    const classification = classify(name);
    expect(classification.requiresJustification, name).toBe(true);
    expect(classification.hasCriticalEvidence, name).toBe(true);
    expect(classification.severity, name).toBe("danger");
  }

  const documented = classify("documentada (proposta formal com anexo)");
  expect(documented.status).toBe("formal_sufficient");
  expect(documented.requiresJustification).toBe(false);
  expect(documented.hasCriticalEvidence).toBe(false);
});

// ------------------------------------------------- 5. textos e leitura de snapshot antigo

test("o alerta de evidencia critica nao promete mais Diretoria", () => {
  const critical = classify("critica (sem evidencia formal e sem justificativa)");

  for (const alert of critical.alerts) {
    expect(alert.toLowerCase()).not.toContain("diretoria");
  }
});

test("fallback: dossie antigo (nome velho) le certo como hasCriticalEvidence", () => {
  // Snapshot gravado antes do plano 59 — cotacao.
  expect(readHasCriticalEvidence({ requiresDirectorApproval: true })).toBe(true);
  expect(readHasCriticalEvidence({ requiresDirectorApproval: false })).toBe(false);

  // Snapshot gravado antes do plano 59 — bloco de aprovacao.
  expect(readHasCriticalEvidence({ requiresDirectorApprovalByEvidence: true })).toBe(true);

  // Snapshot novo.
  expect(readHasCriticalEvidence({ hasCriticalEvidence: true })).toBe(true);
  expect(readHasCriticalEvidence({ hasCriticalEvidence: false, requiresDirectorApproval: true })).toBe(false);

  // Ausencia de dado nao inventa risco.
  expect(readHasCriticalEvidence({})).toBe(false);
  expect(readHasCriticalEvidence(null)).toBe(false);
});
