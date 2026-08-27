import { z } from "zod";
import { usernameSchema } from "@/lib/auth/schemas";

export const recordStatusSchema = z.enum(["active", "inactive", "archived"]);

// Valida CPF (digito verificador). Aceita com ou sem mascara (normaliza antes).
// Rejeita tamanho != 11 e sequencias repetidas (ex.: 111.111.111-11).
export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");

  if (cpf.length !== 11) {
    return false;
  }

  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

// Valida CNPJ (digitos verificadores). Aceita com ou sem mascara (normaliza antes).
// Rejeita tamanho != 14 e sequencias repetidas (ex.: 11.111.111/1111-11).
// Irmao do isValidCpf acima: mesma forma, mesmos criterios, mesmo arquivo.
export function isValidCnpj(raw: string): boolean {
  const cnpj = raw.replace(/\D/g, "");

  if (cnpj.length !== 14) {
    return false;
  }

  if (/^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  // Pesos do modulo 11 do CNPJ: comecam em 5 (1o digito) / 6 (2o) e caem ate' 2,
  // reiniciando em 9 quando passam de 2.
  const checkDigit = (length: number): number => {
    let sum = 0;
    let weight = length - 7;

    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * weight;
      weight -= 1;

      if (weight < 2) {
        weight = 9;
      }
    }

    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(12) === Number(cnpj[12]) && checkDigit(13) === Number(cnpj[13]);
}

export const unitPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Use 2 a 20 caracteres: letras maiusculas, numeros, underline ou hifen."),
  name: z.string().trim().min(2, "Informe o nome da unidade."),
  city: z.string().trim().min(2, "Informe a cidade."),
  state: z.string().trim().min(2, "Informe o estado."),
  status: recordStatusSchema.default("active")
});

export const departmentPayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  code: z
    .string()
    .trim()
    .min(2, "Informe um codigo de departamento.")
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "Use um codigo padrao com 2 a 20 caracteres, sem espacos."),
  name: z.string().trim().min(2, "Informe o nome do departamento."),
  description: z.string().trim().optional(),
  status: recordStatusSchema.default("active")
});

export const supplierDocumentTypeSchema = z.enum(["CNPJ", "CPF", "OTHER"]);

export const supplierDocumentTypeLabelMap: Record<z.infer<typeof supplierDocumentTypeSchema>, string> = {
  CNPJ: "CNPJ",
  CPF: "CPF",
  OTHER: "Outro"
};

export function getSupplierDocumentTypeLabel(value: string | null | undefined) {
  return supplierDocumentTypeLabelMap[value as z.infer<typeof supplierDocumentTypeSchema>] ?? "Outro";
}

/** Meios de CONTATO que satisfazem a regua. `contactName` NAO conta sozinho: um nome sem
 *  telefone/e-mail nao e' forma de contato — nao da' para ligar nem escrever (regua 4-b). */
function hasSupplierContact(value: { email?: string; phone?: string; whatsapp?: string }) {
  return Boolean(value.email?.trim() || value.phone?.trim() || value.whatsapp?.trim());
}

/**
 * Validacao cruzada do fornecedor (plano 63).
 *
 * 1. DIGITO: documentNumber e' validado conforme documentType — CNPJ exige CNPJ valido,
 *    CPF exige CPF valido, OTHER e' livre. Vale SEMPRE, em qualquer status: documento
 *    gravado errado e' sujeira independente de o cadastro estar ativo ou nao.
 *
 * 2. PRESENCA: e' preciso ter documento OU um meio de contato. Exigir documento sempre
 *    quebraria o cadastro rapido dentro da cotacao (quick-supplier-dialog), onde o
 *    comprador precisa registrar o fornecedor na hora; um contato registrado ja' cumpre
 *    o objetivo de nao existir fornecedor-fantasma.
 *
 *    EXCECAO (6-b): a regra de presenca NAO se aplica quando o status nao e' "active".
 *    Sem isso, um fornecedor legado sujo ficaria impossivel de INATIVAR — justamente a
 *    acao que se quer tomar sobre cadastro ruim.
 *
 * Documento vazio com tipo CNPJ/CPF nao dispara a regra 1: quem fala nesse caso e' a
 * regra 2, com a mensagem dela. Evita "CNPJ invalido" num campo em branco.
 */
function validateSupplierPayload(
  value: {
    documentType: z.infer<typeof supplierDocumentTypeSchema>;
    documentNumber?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    status: z.infer<typeof recordStatusSchema>;
  },
  ctx: z.RefinementCtx
) {
  const documentNumber = value.documentNumber?.trim() ?? "";

  if (documentNumber) {
    if (value.documentType === "CNPJ" && !isValidCnpj(documentNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentNumber"],
        message: "Informe um CNPJ valido."
      });
    }

    if (value.documentType === "CPF" && !isValidCpf(documentNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documentNumber"],
        message: "Informe um CPF valido."
      });
    }

    return;
  }

  if (value.status !== "active") {
    return;
  }

  if (!hasSupplierContact(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["documentNumber"],
      message: "Informe o documento (CNPJ/CPF) ou pelo menos uma forma de contato (e-mail, telefone ou WhatsApp)."
    });
  }
}

export const supplierPayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade.").optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().min(2, "Informe o nome do fornecedor."),
  tradeName: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  documentType: supplierDocumentTypeSchema.default("CNPJ"),
  documentNumber: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  email: z.string().trim().email("Informe um e-mail valido.").optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  whatsapp: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  contactName: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  category: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  status: recordStatusSchema.default("active")
}).superRefine(validateSupplierPayload);

export const jobPositionPayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  departmentId: z.string().uuid("Selecione um departamento.").optional().or(z.literal("").transform(() => undefined)),
  code: z
    .string()
    .trim()
    .min(2, "Informe um codigo de cargo.")
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,30}$/, "Use um codigo padrao com 2 a 30 caracteres, sem espacos. Hifen e permitido."),
  name: z.string().trim().min(2, "Informe o nome do cargo."),
  description: z.string().trim().optional(),
  isLeadership: z.boolean().default(false),
  status: recordStatusSchema.default("active")
});

export const employeePayloadSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  departmentId: z.string().uuid("Selecione um departamento.").optional().or(z.literal("").transform(() => undefined)),
  jobPositionId: z.string().uuid("Selecione um cargo.").optional().or(z.literal("").transform(() => undefined)),
  fullName: z.string().trim().min(3, "Informe o nome completo do colaborador."),
  preferredName: z.string().trim().optional(),
  documentNumber: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isValidCpf(value), "Informe um CPF valido."),
  corporateEmail: z.string().trim().email("Informe um e-mail corporativo valido.").optional().or(z.literal("").transform(() => undefined)),
  personalEmail: z.string().trim().email("Informe um e-mail pessoal valido.").optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().optional(),
  hireDate: z.string().trim().optional(),
  terminationDate: z.string().trim().optional(),
  status: recordStatusSchema.default("active")
});

const userUnitsSchema = z.array(z.string().uuid("Selecione uma unidade valida.")).min(1, "Selecione ao menos uma unidade.");

export const internalUserCreatePayloadSchema = z.object({
  employeeId: z.string().uuid("Selecione um colaborador."),
  username: usernameSchema,
  password: z.string().min(8, "A senha inicial deve ter pelo menos 8 caracteres."),
  accessProfileId: z.string().uuid("Selecione um perfil de acesso."),
  unitIds: userUnitsSchema,
  status: z.enum(["active", "inactive", "blocked", "pending"]).default("active")
});

export const internalUserUpdatePayloadSchema = z.object({
  employeeId: z.string().uuid("Selecione um colaborador."),
  accessProfileId: z.string().uuid("Selecione um perfil de acesso."),
  unitIds: userUnitsSchema,
  status: z.enum(["active", "inactive", "blocked", "pending"]).default("active")
});

export const internalUserResetPasswordSchema = z.object({
  password: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres.")
});

/**
 * Troca da PROPRIA senha (#C7, plano docs/codex/65).
 *
 * Nao ha' id de usuario aqui de proposito: o alvo vem SEMPRE da sessao na rota. Se este
 * schema aceitasse um id, a rota viraria "trocar a senha de qualquer um" -- o campo e' a
 * unica coisa que um atacante precisaria manipular.
 *
 * `currentPassword` e' exigido mesmo com sessao valida: sem ele, um cookie roubado (ou uma
 * maquina destravada) permite TOMAR a conta, trocando a senha e expulsando o dono.
 */
export const changePasswordPayloadSchema = z
  .object({
    currentPassword: z.string().min(8, "Informe a senha atual."),
    newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres.")
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "A nova senha deve ser diferente da atual."
      });
    }
  });
