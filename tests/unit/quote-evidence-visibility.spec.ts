import { expect, test } from "@playwright/test";

import {
  EVIDENCE_BLOCK_FIELDS,
  evidenceTypeExpectsFile,
  getFirstEvidenceFieldError,
  hasOrphanPendingAttachment,
  isSourceNotesRequired,
  shouldShowAttachmentBlock,
  shouldShowEvidenceClassification
} from "../../src/components/purchases/purchase-quotes-utils";
import { purchaseQuoteFormSchema } from "../../src/lib/purchases/quote-schemas";

// Runner puro. Cobre a fatia visual da Nova cotacao (plano docs/codex/60): M1.1 (bloco de anexo
// gateado no tipo de evidencia), M2-b (justificativa substitui a observacao no caminho verbal),
// P3 (classificacao so' depois de haver o que classificar) e o auto-open do bloco recolhivel.
//
// Sao testes da LOGICA que a tela consome, nao da tela: se um destes cair, a tela esconde campo
// obrigatorio, orfana arquivo, ou volta a acusar "Critica" num form recem-aberto.


// Base valida do schema: precisa passar no parse do objeto para o superRefine chegar a rodar.
const SUPPLIER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ITEM_ID = "22222222-2222-4222-8222-222222222222";

function quoteFormPayload(overrides: Record<string, unknown>) {
  return {
    supplierId: SUPPLIER_ID,
    quoteDate: "2026-08-25",
    validUntil: "2026-09-25",
    items: [
      {
        purchaseRequestItemId: REQUEST_ITEM_ID,
        itemDescription: "Item de teste",
        quantity: "1",
        unitPrice: "10,00"
      }
    ],
    ...overrides
  };
}

// ------------------------------------------------- M1.1 — bloco de anexo gateado no tipo

const TYPES_WITH_FILE = ["attached_file", "email_copy", "whatsapp_screenshot", "other"] as const;
const TYPES_WITHOUT_FILE = ["call_note", "in_person_note", "catalog_link", "none"] as const;

test("bloco de anexo: escondido nos 4 tipos que nao usam arquivo", () => {
  for (const evidenceType of TYPES_WITHOUT_FILE) {
    expect(evidenceTypeExpectsFile(evidenceType), evidenceType).toBe(false);
    expect(shouldShowAttachmentBlock({ evidenceType, pendingFileCount: 0 }), evidenceType).toBe(false);
  }
});

test("bloco de anexo: visivel nos 4 tipos que usam arquivo", () => {
  for (const evidenceType of TYPES_WITH_FILE) {
    expect(evidenceTypeExpectsFile(evidenceType), evidenceType).toBe(true);
    expect(shouldShowAttachmentBlock({ evidenceType, pendingFileCount: 0 }), evidenceType).toBe(true);
  }
});

test("arquivo pendente nao orfana ao trocar para um tipo sem arquivo", () => {
  // O usuario anexou em attached_file e depois trocou para call_note: o bloco CONTINUA visivel,
  // senao ele perde a lista "Selecionados" e o botao Remover, com arquivo preso no estado.
  expect(shouldShowAttachmentBlock({ evidenceType: "call_note", pendingFileCount: 1 })).toBe(true);
  expect(hasOrphanPendingAttachment({ evidenceType: "call_note", pendingFileCount: 1 })).toBe(true);

  // Sem arquivo pendente nao ha' aviso de orfao.
  expect(hasOrphanPendingAttachment({ evidenceType: "call_note", pendingFileCount: 0 })).toBe(false);
  expect(hasOrphanPendingAttachment({ evidenceType: "attached_file", pendingFileCount: 2 })).toBe(false);
});

test("edicao com anexo ja' vinculado mantem o bloco visivel mesmo em tipo sem arquivo", () => {
  expect(
    shouldShowAttachmentBlock({ evidenceType: "none", pendingFileCount: 0, linkedAttachmentCount: 3 })
  ).toBe(true);
});

// ------------------------------------------------- auto-open

test("auto-open: pega o primeiro campo do bloco com erro, na ordem visual", () => {
  // emergencyReason e' o ultimo da lista, evidenceType o segundo: vence o mais alto na tela.
  expect(getFirstEvidenceFieldError({ emergencyReason: {}, evidenceType: {} })).toBe("evidenceType");
  expect(getFirstEvidenceFieldError({ sourceNotes: {} })).toBe("sourceNotes");
});

test("auto-open: erro fora do bloco NAO abre o bloco", () => {
  expect(getFirstEvidenceFieldError({ supplierId: {}, validUntil: {}, items: {} })).toBeNull();
  expect(getFirstEvidenceFieldError({})).toBeNull();
  expect(getFirstEvidenceFieldError(null)).toBeNull();
});

test("cobertura: todo path que o superRefine emite esta' no bloco ou e' declarado fora dele", () => {
  // Paths que o formulario renderiza FORA do bloco recolhivel.
  const outsideBlock = ["supplierId", "quoteDate", "validUntil", "quoteValidityExceptionReason", "items", "paymentTerms", "deliveryDays", "notes"];

  // Form vazio o suficiente para o superRefine disparar o maximo de issues de uma vez.
  const result = purchaseQuoteFormSchema.safeParse(
    quoteFormPayload({
      validUntil: "2026-08-01",
      quoteValidityException: true,
      quoteSourceType: "other",
      evidenceType: "none",
      isVerbalQuote: true,
      isEmergencyQuote: true
    })
  );

  expect(result.success).toBe(false);

  if (result.success) {
    return;
  }

  const known = new Set<string>([...EVIDENCE_BLOCK_FIELDS, ...outsideBlock]);

  for (const issue of result.error.issues) {
    const root = String(issue.path[0] ?? "");
    expect(known.has(root), `path desconhecido do superRefine: ${root}`).toBe(true);
  }
});

// ------------------------------------------------- M2-b

test("M2-b: cotacao verbal com justificativa e sem observacao passa", () => {
  const result = purchaseQuoteFormSchema.safeParse(
    quoteFormPayload({
      quoteSourceType: "phone_call",
      evidenceType: "call_note",
      sourceContactName: "Joao",
      sourceContactChannel: "phone",
      isVerbalQuote: true,
      sourceNotes: "",
      evidenceMissingReason: "Fornecedor nao emite proposta escrita; cotacao confirmada por telefone."
    })
  );
  const sourceNotesIssues = result.success
    ? []
    : result.error.issues.filter((issue) => issue.path[0] === "sourceNotes");

  expect(sourceNotesIssues, JSON.stringify(sourceNotesIssues)).toHaveLength(0);
});

test("M2-b: cotacao verbal sem justificativa e sem observacao continua barrada", () => {
  const result = purchaseQuoteFormSchema.safeParse(
    quoteFormPayload({
      quoteSourceType: "phone_call",
      evidenceType: "call_note",
      sourceContactName: "Joao",
      isVerbalQuote: true,
      sourceNotes: "",
      evidenceMissingReason: ""
    })
  );

  expect(result.success).toBe(false);

  if (result.success) {
    return;
  }

  const paths = result.error.issues.map((issue) => String(issue.path[0]));
  expect(paths).toContain("evidenceMissingReason");
  expect(paths).toContain("sourceNotes");
});

test("M2-b: a justificativa continua obrigatoria onde ja' era", () => {
  // evidence_type = none sem justificativa: barrado, como antes da fatia.
  const result = purchaseQuoteFormSchema.safeParse(
    quoteFormPayload({
      quoteSourceType: "formal_proposal",
      evidenceType: "none",
      sourceNotes: "Qualquer observacao.",
      evidenceMissingReason: ""
    })
  );

  expect(result.success).toBe(false);

  if (!result.success) {
    expect(result.error.issues.map((issue) => String(issue.path[0]))).toContain("evidenceMissingReason");
  }
});

test("isSourceNotesRequired espelha o superRefine (rotulo honesto de opcional)", () => {
  // "other" exige observacao independentemente de justificativa.
  expect(isSourceNotesRequired({ quoteSourceType: "other", evidenceMissingReason: "tem justificativa" })).toBe(true);

  // Verbal: a justificativa dispensa a observacao.
  expect(isSourceNotesRequired({ quoteSourceType: "phone_call", evidenceMissingReason: "" })).toBe(true);
  expect(isSourceNotesRequired({ quoteSourceType: "phone_call", evidenceMissingReason: "motivo" })).toBe(false);
  expect(isSourceNotesRequired({ quoteSourceType: "formal_proposal", isVerbalQuote: true, evidenceMissingReason: "" })).toBe(true);
  expect(isSourceNotesRequired({ quoteSourceType: "formal_proposal", isVerbalQuote: true, evidenceMissingReason: "motivo" })).toBe(false);

  // Presencial com contato ja' nao exigia observacao.
  expect(isSourceNotesRequired({ quoteSourceType: "in_person", sourceContactName: "Maria", evidenceMissingReason: "" })).toBe(false);

  // Caminho de 90%: proposta formal, nada exigido.
  expect(isSourceNotesRequired({ quoteSourceType: "formal_proposal", evidenceMissingReason: "" })).toBe(false);
});

// ------------------------------------------------- P3

test("P3: form recem-aberto nao mostra classificacao (nem com os defaults formal_proposal + attached_file)", () => {
  expect(
    shouldShowEvidenceClassification({
      hasDirtyEvidenceField: false,
      pendingFileCount: 0,
      linkedAttachmentCount: 0,
      isEditing: false,
      submitFailed: false
    })
  ).toBe(false);
});

test("P3: passa a mostrar apos dirty, anexo, edicao ou submit falhado", () => {
  const closed = {
    hasDirtyEvidenceField: false,
    pendingFileCount: 0,
    linkedAttachmentCount: 0,
    isEditing: false,
    submitFailed: false
  };

  expect(shouldShowEvidenceClassification({ ...closed, hasDirtyEvidenceField: true })).toBe(true);
  expect(shouldShowEvidenceClassification({ ...closed, pendingFileCount: 1 })).toBe(true);
  expect(shouldShowEvidenceClassification({ ...closed, linkedAttachmentCount: 1 })).toBe(true);
  expect(shouldShowEvidenceClassification({ ...closed, isEditing: true })).toBe(true);
  expect(shouldShowEvidenceClassification({ ...closed, submitFailed: true })).toBe(true);
});
