import { z } from "zod";

export const purchaseQuoteStatusSchema = z.enum(["received", "selected", "rejected", "expired", "cancelled"]);

export const purchaseQuoteStatusLabelMap: Record<z.infer<typeof purchaseQuoteStatusSchema>, string> = {
  received: "Recebida",
  selected: "Selecionada",
  rejected: "Rejeitada",
  expired: "Vencida",
  cancelled: "Cancelada"
};

export const purchaseQuoteStatusToneMap: Record<z.infer<typeof purchaseQuoteStatusSchema>, "visual" | "warning" | "danger" | "success" | "info"> = {
  received: "info",
  selected: "success",
  rejected: "danger",
  expired: "warning",
  cancelled: "visual"
};

export function getPurchaseQuoteStatusLabel(status: z.infer<typeof purchaseQuoteStatusSchema>) {
  return purchaseQuoteStatusLabelMap[status];
}

export function getPurchaseQuoteStatusTone(status: z.infer<typeof purchaseQuoteStatusSchema>) {
  return purchaseQuoteStatusToneMap[status];
}

function parseLocalizedDecimal(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : value;
}

function parseLocalizedInteger(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed.replace(",", "."));

  return Number.isFinite(parsed) ? parsed : value;
}

const purchaseMoneySchema = z.preprocess(
  parseLocalizedDecimal,
  z.number({
    required_error: "Informe um valor valido.",
    invalid_type_error: "Informe um valor valido."
  }).nonnegative("Informe um valor valido.")
);

const purchaseOptionalIntegerSchema = z.preprocess(
  parseLocalizedInteger,
  z.number({
    invalid_type_error: "Informe um prazo valido."
  }).int("Informe um prazo valido.").nonnegative("Informe um prazo valido.").optional()
);

const purchaseQuoteDateSchema = z
  .string({ required_error: "Selecione uma data valida.", invalid_type_error: "Selecione uma data valida." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecione uma data valida.");

export const purchaseQuoteItemSchema = z.object({
  purchaseRequestItemId: z
    .string({ required_error: "Selecione um item da solicitacao.", invalid_type_error: "Selecione um item da solicitacao." })
    .uuid("Selecione um item da solicitacao."),
  itemDescription: z
    .string({ required_error: "Informe a descricao do item.", invalid_type_error: "Informe a descricao do item." })
    .trim()
    .min(2, "Informe a descricao do item."),
  quantity: z.preprocess(
    parseLocalizedDecimal,
    z.number({
      required_error: "Informe uma quantidade valida.",
      invalid_type_error: "Informe uma quantidade valida."
    }).positive("Informe uma quantidade valida.")
  ),
  unitPrice: purchaseMoneySchema,
  deliveryNotes: z.string().trim().optional().or(z.literal("").transform(() => undefined))
});

const purchaseQuoteFormBaseSchema = z.object({
  supplierId: z
    .string({ required_error: "Selecione um fornecedor.", invalid_type_error: "Selecione um fornecedor." })
    .uuid("Selecione um fornecedor."),
  quoteDate: purchaseQuoteDateSchema,
  validUntil: purchaseQuoteDateSchema,
  deliveryDays: purchaseOptionalIntegerSchema,
  paymentTerms: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  isRecurringSupplierQuote: z.boolean().optional().default(false),
  quoteValidityException: z.boolean().optional().default(false),
  quoteValidityExceptionReason: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  items: z.array(purchaseQuoteItemSchema).min(1, "Informe pelo menos um item cotado.")
});

function validatePurchaseQuoteForm(value: z.infer<typeof purchaseQuoteFormBaseSchema>, ctx: z.RefinementCtx) {
  if (value.quoteValidityException && !value.quoteValidityExceptionReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quoteValidityExceptionReason"],
      message: "Informe a justificativa da excecao de validade."
    });
  }

  if (value.validUntil < value.quoteDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "A validade deve ser maior ou igual a data da cotacao."
    });
  }
}

export const purchaseQuoteFormSchema = purchaseQuoteFormBaseSchema.superRefine(validatePurchaseQuoteForm);

export const purchaseQuoteStartSchema = z.object({
  action: z.literal("start")
});

export const purchaseQuoteCreateSchema = purchaseQuoteFormBaseSchema.extend({
  action: z.literal("save")
}).superRefine(validatePurchaseQuoteForm);

export const purchaseQuoteUpdateSchema = purchaseQuoteFormBaseSchema.extend({
  action: z.literal("save")
}).superRefine(validatePurchaseQuoteForm);

export const purchaseQuoteSelectSchema = z.object({
  action: z.literal("select")
});

export const purchaseQuoteUnselectSchema = z.object({
  action: z.literal("unselect")
});

export const purchaseQuotePostSchema = z.union([purchaseQuoteStartSchema, purchaseQuoteCreateSchema]);
export const purchaseQuotePatchSchema = z.union([purchaseQuoteUpdateSchema, purchaseQuoteSelectSchema, purchaseQuoteUnselectSchema]);
