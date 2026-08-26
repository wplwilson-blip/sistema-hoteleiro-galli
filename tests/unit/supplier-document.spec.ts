import { expect, test } from "@playwright/test";

import {
  isValidCnpj,
  isValidCpf,
  supplierPayloadSchema,
  getSupplierDocumentTypeLabel
} from "../../src/lib/base-cadastros/schemas";

// Runner puro. Cobre a fatia C1 (plano docs/codex/63): validacao de documento e contato no
// cadastro de fornecedor.
//
// Antes desta fatia dava para gravar fornecedor com nome e mais nada: documentNumber era
// string opcional sem validacao nenhuma, e esse fornecedor entrava em cotacao e virava
// compra aprovada. isValidCpf ja' existia, mas so' era usado em colaborador.

// ------------------------------------------------------------------ isValidCnpj

// CNPJs com digito verificador correto (raizes reais de dominio publico).
const CNPJ_VALIDOS = [
  "11222333000181",
  "11.222.333/0001-81",
  "  11222333000181  ",
  "34028316000103", // Correios
  "34.028.316/0001-03",
  "00000000000191", // Banco do Brasil
  "60746948000112"
];

test("isValidCnpj: aceita CNPJ valido com e sem mascara", () => {
  for (const value of CNPJ_VALIDOS) {
    expect(isValidCnpj(value), value).toBe(true);
  }
});

test("isValidCnpj: rejeita digito verificador errado", () => {
  // Um digito trocado em cada CNPJ valido: o resto do numero continua plausivel.
  const invalidos = ["11222333000182", "11222333000191", "34028316000104", "00000000000192", "60746948000113"];

  for (const value of invalidos) {
    expect(isValidCnpj(value), value).toBe(false);
  }
});

test("isValidCnpj: rejeita as 10 sequencias de digitos repetidos", () => {
  for (let digit = 0; digit <= 9; digit++) {
    const repeated = String(digit).repeat(14);
    expect(isValidCnpj(repeated), repeated).toBe(false);
  }
});

test("isValidCnpj: rejeita tamanho errado, vazio e lixo", () => {
  const invalidos = [
    "",
    "   ",
    "1122233300018", // 13
    "112223330001811", // 15
    "11.222.333/0001-", // so' mascara
    "abcdefghijklmn",
    "11222333000181 99" // digitos demais apos normalizar (16)
  ];

  // Nota de comportamento: como o isValidCpf irmao, o validador NORMALIZA antes de conferir.
  // Entao texto ao redor de um numero valido passa — "CNPJ 11222333000181" vira 14 digitos
  // validos. E' o contrato existente do CPF, mantido aqui de proposito.

  for (const value of invalidos) {
    expect(isValidCnpj(value), JSON.stringify(value)).toBe(false);
  }

  expect(isValidCnpj("CNPJ 11222333000181"), "normaliza e aceita").toBe(true);
});

// ------------------------------------------------------------------ isValidCpf
// Nao mudou nesta fatia, mas nao tinha teste nenhum no repositorio — e agora passou a ser
// consumido tambem pelo fornecedor.

test("isValidCpf: aceita valido com e sem mascara, rejeita digito errado", () => {
  expect(isValidCpf("52998224725")).toBe(true);
  expect(isValidCpf("529.982.247-25")).toBe(true);
  expect(isValidCpf("  52998224725  ")).toBe(true);
  expect(isValidCpf("52998224726")).toBe(false);
});

test("isValidCpf: rejeita sequencias repetidas e tamanho errado", () => {
  for (let digit = 0; digit <= 9; digit++) {
    expect(isValidCpf(String(digit).repeat(11)), String(digit)).toBe(false);
  }

  for (const value of ["", "5299822472", "529982247251", "abcdefghijk"]) {
    expect(isValidCpf(value), JSON.stringify(value)).toBe(false);
  }
});

// ------------------------------------------------------------------ schema do fornecedor

const CNPJ_OK = "11222333000181";
const CPF_OK = "52998224725";

function supplierPayload(overrides: Record<string, unknown> = {}) {
  return { name: "Fornecedor Teste", ...overrides };
}

function firstIssuePath(result: ReturnType<typeof supplierPayloadSchema.safeParse>) {
  return result.success ? null : String(result.error.issues[0]?.path[0] ?? "");
}

test("documentType default e' CNPJ quando ausente (C2)", () => {
  const result = supplierPayloadSchema.safeParse(supplierPayload({ documentNumber: CNPJ_OK }));

  expect(result.success).toBe(true);

  if (result.success) {
    expect(result.data.documentType).toBe("CNPJ");
  }
});

test("CNPJ: valido passa, invalido erra em documentNumber", () => {
  expect(supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CNPJ", documentNumber: CNPJ_OK })).success).toBe(true);
  expect(supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CNPJ", documentNumber: "11.222.333/0001-81" })).success).toBe(true);

  const invalid = supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CNPJ", documentNumber: "123" }));
  expect(invalid.success).toBe(false);
  expect(firstIssuePath(invalid)).toBe("documentNumber");
});

test("CPF: valido passa, invalido erra em documentNumber", () => {
  expect(supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CPF", documentNumber: CPF_OK })).success).toBe(true);

  const invalid = supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CPF", documentNumber: "111.111.111-11" }));
  expect(invalid.success).toBe(false);
  expect(firstIssuePath(invalid)).toBe("documentNumber");
});

test("OTHER: documento livre — e' o caminho do cadastro rapido na cotacao", () => {
  for (const documentNumber of ["INSCRICAO-123", "sem numero", CNPJ_OK, "123"]) {
    expect(
      supplierPayloadSchema.safeParse(supplierPayload({ documentType: "OTHER", documentNumber })).success,
      documentNumber
    ).toBe(true);
  }
});

// ------------------------------------------------------------------ regua 4-b

test("regua: so' o nome nao basta", () => {
  const result = supplierPayloadSchema.safeParse(supplierPayload());

  expect(result.success).toBe(false);
  expect(firstIssuePath(result)).toBe("documentNumber");
});

test("regua: documento OU contato satisfaz", () => {
  // documento
  expect(supplierPayloadSchema.safeParse(supplierPayload({ documentNumber: CNPJ_OK })).success).toBe(true);
  // contatos, sem documento nenhum
  expect(supplierPayloadSchema.safeParse(supplierPayload({ email: "contato@fornecedor.com" })).success).toBe(true);
  expect(supplierPayloadSchema.safeParse(supplierPayload({ phone: "(11) 4002-8922" })).success).toBe(true);
  expect(supplierPayloadSchema.safeParse(supplierPayload({ whatsapp: "11999998888" })).success).toBe(true);
});

test("regua 4-b: contactName sozinho NAO conta como contato", () => {
  const result = supplierPayloadSchema.safeParse(supplierPayload({ contactName: "Joao" }));

  expect(result.success).toBe(false);
  expect(firstIssuePath(result)).toBe("documentNumber");

  // Mas conta como complemento de um contato de verdade.
  expect(supplierPayloadSchema.safeParse(supplierPayload({ contactName: "Joao", phone: "11999998888" })).success).toBe(true);
});

test("documento vazio com tipo CNPJ: a mensagem e' a da regua, nao 'CNPJ invalido'", () => {
  const result = supplierPayloadSchema.safeParse(supplierPayload({ documentType: "CNPJ", documentNumber: "" }));

  expect(result.success).toBe(false);

  if (!result.success) {
    expect(result.error.issues[0]?.message).toContain("forma de contato");
    expect(result.error.issues[0]?.message).not.toContain("valido");
  }
});

// ------------------------------------------------------------------ excecao 6-b

test("6-b: sem documento e sem contato PASSA quando o status nao e' ativo", () => {
  // Sem isto, um fornecedor legado sujo ficaria impossivel de INATIVAR — justamente a acao
  // que se quer tomar sobre cadastro ruim.
  for (const status of ["inactive", "archived"]) {
    expect(supplierPayloadSchema.safeParse(supplierPayload({ status })).success, status).toBe(true);
  }

  expect(supplierPayloadSchema.safeParse(supplierPayload({ status: "active" })).success).toBe(false);
});

test("6-b: a validacao de DIGITO continua valendo em qualquer status", () => {
  for (const status of ["active", "inactive", "archived"]) {
    const result = supplierPayloadSchema.safeParse(
      supplierPayload({ status, documentType: "CNPJ", documentNumber: "11222333000182" })
    );

    expect(result.success, status).toBe(false);
    expect(firstIssuePath(result), status).toBe("documentNumber");
  }
});

// ------------------------------------------------------------------ C3

test("C3: o enum e' traduzido para exibicao", () => {
  expect(getSupplierDocumentTypeLabel("CNPJ")).toBe("CNPJ");
  expect(getSupplierDocumentTypeLabel("CPF")).toBe("CPF");
  expect(getSupplierDocumentTypeLabel("OTHER")).toBe("Outro");
  expect(getSupplierDocumentTypeLabel(null)).toBe("Outro");
  expect(getSupplierDocumentTypeLabel("qualquer coisa")).toBe("Outro");
});
