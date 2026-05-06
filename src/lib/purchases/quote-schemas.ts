import { z } from "zod";

export const purchaseQuoteStatusSchema = z.enum(["received", "selected", "rejected", "expired", "cancelled"]);
export const purchaseQuoteSourceTypeSchema = z.enum([
  "formal_proposal",
  "email",
  "whatsapp",
  "phone_call",
  "in_person",
  "website_catalog",
  "recurring_supplier",
  "emergency",
  "other"
]);
export const purchaseQuoteEvidenceTypeSchema = z.enum([
  "attached_file",
  "email_copy",
  "whatsapp_screenshot",
  "call_note",
  "in_person_note",
  "catalog_link",
  "none",
  "other"
]);
export const purchaseQuoteEvidenceConfidenceSchema = z.enum(["high", "medium", "low", "critical"]);
export const purchaseQuoteSourceContactChannelSchema = z.enum(["email", "whatsapp", "phone", "in_person", "website", "other"]);

export type PurchaseQuoteSourceType = z.infer<typeof purchaseQuoteSourceTypeSchema>;
export type PurchaseQuoteEvidenceType = z.infer<typeof purchaseQuoteEvidenceTypeSchema>;
export type PurchaseQuoteEvidenceConfidence = z.infer<typeof purchaseQuoteEvidenceConfidenceSchema>;
export type PurchaseQuoteSourceContactChannel = z.infer<typeof purchaseQuoteSourceContactChannelSchema>;
export type PurchaseQuoteDocumentaryClassification = "formal_sufficient" | "acceptable_with_reservation" | "fragile" | "critical";
export type PurchaseQuoteDocumentaryClassificationSeverity = "success" | "info" | "warning" | "danger";

export type PurchaseQuoteEvidenceClassificationInput = {
  quoteSourceType?: PurchaseQuoteSourceType | "" | null;
  evidenceType?: PurchaseQuoteEvidenceType | "" | null;
  sourceContactName?: string | null;
  sourceContactChannel?: PurchaseQuoteSourceContactChannel | "" | null;
  sourceReference?: string | null;
  sourceUrl?: string | null;
  sourceNotes?: string | null;
  evidenceMissingReason?: string | null;
  isVerbalQuote?: boolean | null;
  isEmergencyQuote?: boolean | null;
  emergencyReason?: string | null;
  regularizationRequired?: boolean | null;
  regularizationDeadline?: string | null;
  hasAttachment?: boolean | null;
};

export type PurchaseQuoteEvidenceClassification = {
  status: PurchaseQuoteDocumentaryClassification;
  label: string;
  severity: PurchaseQuoteDocumentaryClassificationSeverity;
  alerts: string[];
  requiresAttachment: boolean;
  requiresJustification: boolean;
  hasFormalEvidence: boolean;
  requiresDirectorApproval: boolean;
  reason: string;
};

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

export const purchaseQuoteSourceTypeLabelMap: Record<PurchaseQuoteSourceType, string> = {
  formal_proposal: "Proposta formal/PDF",
  email: "E-mail",
  whatsapp: "WhatsApp",
  phone_call: "Ligação",
  in_person: "Presencial",
  website_catalog: "Site/Catálogo",
  recurring_supplier: "Fornecedor recorrente",
  emergency: "Emergência",
  other: "Outro"
};

export const purchaseQuoteEvidenceTypeLabelMap: Record<PurchaseQuoteEvidenceType, string> = {
  attached_file: "Arquivo anexado",
  email_copy: "Cópia de e-mail",
  whatsapp_screenshot: "Print de WhatsApp",
  call_note: "Nota de ligação",
  in_person_note: "Nota presencial",
  catalog_link: "Link de catálogo",
  none: "Sem evidência formal",
  other: "Outra evidência"
};

export const purchaseQuoteEvidenceConfidenceLabelMap: Record<PurchaseQuoteEvidenceConfidence, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  critical: "Crítica"
};

export const purchaseQuoteSourceContactChannelLabelMap: Record<PurchaseQuoteSourceContactChannel, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  in_person: "Presencial",
  website: "Site",
  other: "Outro"
};

export const purchaseQuoteDocumentaryClassificationLabelMap: Record<PurchaseQuoteDocumentaryClassification, string> = {
  formal_sufficient: "Formal suficiente",
  acceptable_with_reservation: "Aceitavel com ressalva",
  fragile: "Fragil",
  critical: "Critica"
};

export const purchaseQuoteDocumentaryClassificationSeverityMap: Record<PurchaseQuoteDocumentaryClassification, PurchaseQuoteDocumentaryClassificationSeverity> = {
  formal_sufficient: "success",
  acceptable_with_reservation: "info",
  fragile: "warning",
  critical: "danger"
};

export function getPurchaseQuoteStatusLabel(status: z.infer<typeof purchaseQuoteStatusSchema>) {
  return purchaseQuoteStatusLabelMap[status];
}

export function getPurchaseQuoteStatusTone(status: z.infer<typeof purchaseQuoteStatusSchema>) {
  return purchaseQuoteStatusToneMap[status];
}

export function getPurchaseQuoteSourceTypeLabel(value: PurchaseQuoteSourceType | null | undefined) {
  return value ? purchaseQuoteSourceTypeLabelMap[value] : "Não informado";
}

export function getPurchaseQuoteEvidenceTypeLabel(value: PurchaseQuoteEvidenceType | null | undefined) {
  return value ? purchaseQuoteEvidenceTypeLabelMap[value] : "Não informado";
}

export function getPurchaseQuoteEvidenceConfidenceLabel(value: PurchaseQuoteEvidenceConfidence | null | undefined) {
  return value ? purchaseQuoteEvidenceConfidenceLabelMap[value] : "Não informado";
}

export function getPurchaseQuoteSourceContactChannelLabel(value: PurchaseQuoteSourceContactChannel | null | undefined) {
  return value ? purchaseQuoteSourceContactChannelLabelMap[value] : "Não informado";
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function classifyPurchaseQuoteEvidence(input: PurchaseQuoteEvidenceClassificationInput): PurchaseQuoteEvidenceClassification {
  const quoteSourceType = input.quoteSourceType || undefined;
  const evidenceType = input.evidenceType || undefined;
  const hasAttachment = Boolean(input.hasAttachment);
  const hasUrl = hasText(input.sourceUrl);
  const hasJustification = hasText(input.evidenceMissingReason);
  const hasNotes = hasText(input.sourceNotes);
  const hasContact = hasText(input.sourceContactName) || Boolean(input.sourceContactChannel);
  const isEmergency = Boolean(input.isEmergencyQuote) || quoteSourceType === "emergency";
  const isVerbal = Boolean(input.isVerbalQuote) || quoteSourceType === "phone_call" || quoteSourceType === "in_person";
  const alerts: string[] = [];
  let status: PurchaseQuoteDocumentaryClassification = "critical";
  let reason = "Ausencia de dados essenciais para sustentar a cotacao.";

  if (evidenceType === "none") {
    alerts.push("Cotacao sem evidencia formal.");
  }

  if (isVerbal) {
    alerts.push("Cotacao verbal ou sem proposta formal.");
  }

  if (isEmergency) {
    alerts.push("Cotacao emergencial.");
  }

  if (input.regularizationRequired) {
    alerts.push("Regularizacao posterior necessaria.");
  }

  if (quoteSourceType === "formal_proposal" && evidenceType === "attached_file" && hasAttachment) {
    status = "formal_sufficient";
    reason = "Proposta formal registrada com arquivo anexado.";
  } else if (quoteSourceType === "email" && (evidenceType === "email_copy" || evidenceType === "attached_file") && (hasAttachment || hasText(input.sourceReference))) {
    status = "formal_sufficient";
    reason = "Cotacao por e-mail com copia, anexo ou referencia documental.";
  } else if (quoteSourceType === "whatsapp" && evidenceType === "whatsapp_screenshot" && hasAttachment) {
    status = "acceptable_with_reservation";
    reason = "WhatsApp com print/anexo: aceitavel com ressalva, sem equivaler a proposta formal suficiente.";
    alerts.push("WhatsApp com print: aceitavel com ressalva.");
  } else if (quoteSourceType === "website_catalog" && (hasUrl || hasAttachment)) {
    status = "acceptable_with_reservation";
    reason = "Site/catalogo com URL ou print/anexo disponivel.";
  } else if (quoteSourceType === "recurring_supplier" && (hasAttachment || hasText(input.sourceReference) || hasNotes)) {
    status = "acceptable_with_reservation";
    reason = "Fornecedor recorrente com referencia, documento ou observacao minima.";
  } else if ((quoteSourceType === "phone_call" || quoteSourceType === "in_person") && hasNotes && hasContact && hasJustification) {
    status = "fragile";
    reason = quoteSourceType === "phone_call"
      ? "Ligacao sem proposta formal, documentada por contato, observacao e justificativa."
      : "Cotacao presencial sem proposta formal, documentada por contato/observacao e justificativa.";
  } else if (quoteSourceType === "whatsapp" && hasJustification && (hasContact || hasText(input.sourceReference))) {
    status = "fragile";
    reason = "WhatsApp sem print/anexo, mas com justificativa e referencia operacional.";
  } else if (!hasAttachment && hasJustification && (hasNotes || hasContact || hasUrl || hasText(input.sourceReference))) {
    status = "fragile";
    reason = "Cotacao sem anexo, mas com justificativa e dados minimos registrados.";
  }

  if (isEmergency && !hasAttachment && !hasUrl && !hasJustification) {
    status = "critical";
    reason = "Emergencia sem documentacao minima, URL ou justificativa.";
  }

  if (evidenceType === "none" && !hasJustification) {
    status = "critical";
    reason = "Sem evidencia formal e sem justificativa.";
  }

  if (!quoteSourceType || !evidenceType) {
    status = "critical";
    reason = "Origem ou tipo de evidencia nao informado.";
  }

  if (quoteSourceType === "website_catalog" && !hasUrl && !hasAttachment && !hasJustification) {
    status = "critical";
    reason = "Site/catalogo sem URL, anexo ou justificativa.";
  }

  if (quoteSourceType === "other" && !hasNotes) {
    status = "critical";
    reason = "Origem outro exige descricao/observacao da evidencia.";
  }

  if (status === "fragile") {
    alerts.push("Evidencia fragil.");
  }

  if (status === "critical") {
    alerts.push("Evidencia critica: aprovacao restrita a Diretoria.");
  }

  return {
    status,
    label: purchaseQuoteDocumentaryClassificationLabelMap[status],
    severity: purchaseQuoteDocumentaryClassificationSeverityMap[status],
    alerts: Array.from(new Set(alerts)),
    requiresAttachment: !hasAttachment && status !== "formal_sufficient",
    requiresJustification: status === "fragile" || status === "critical",
    hasFormalEvidence: status === "formal_sufficient",
    requiresDirectorApproval: status === "critical",
    reason
  };
}

export function getPurchaseQuoteEvidenceConfidenceFromClassification(status: PurchaseQuoteDocumentaryClassification): PurchaseQuoteEvidenceConfidence {
  if (status === "formal_sufficient") {
    return "high";
  }

  if (status === "acceptable_with_reservation") {
    return "medium";
  }

  if (status === "fragile") {
    return "low";
  }

  return "critical";
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

const optionalTrimmedStringSchema = z.string().trim().optional().or(z.literal("").transform(() => undefined));
const optionalUrlSchema = optionalTrimmedStringSchema.refine(
  (value) => !value || z.string().url().safeParse(value).success,
  "Informe uma URL valida."
);

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
  deliveryNotes: optionalTrimmedStringSchema
});

const purchaseQuoteEvidenceSchema = z.object({
  quoteSourceType: purchaseQuoteSourceTypeSchema.optional(),
  evidenceType: purchaseQuoteEvidenceTypeSchema.optional(),
  evidenceConfidence: purchaseQuoteEvidenceConfidenceSchema.optional(),
  sourceContactName: optionalTrimmedStringSchema,
  sourceContactChannel: purchaseQuoteSourceContactChannelSchema.optional(),
  sourceReference: optionalTrimmedStringSchema,
  sourceUrl: optionalUrlSchema,
  sourceNotes: optionalTrimmedStringSchema,
  evidenceMissingReason: optionalTrimmedStringSchema,
  requiresAttachment: z.boolean().optional().default(false),
  requiresJustification: z.boolean().optional().default(false),
  hasFormalEvidence: z.boolean().optional().default(true),
  isVerbalQuote: z.boolean().optional().default(false),
  isEmergencyQuote: z.boolean().optional().default(false),
  emergencyReason: optionalTrimmedStringSchema,
  regularizationRequired: z.boolean().optional().default(false),
  regularizationDeadline: purchaseQuoteDateSchema.optional().or(z.literal("").transform(() => undefined))
});

const purchaseQuoteFormBaseSchema = z.object({
  supplierId: z
    .string({ required_error: "Selecione um fornecedor.", invalid_type_error: "Selecione um fornecedor." })
    .uuid("Selecione um fornecedor."),
  quoteDate: purchaseQuoteDateSchema,
  validUntil: purchaseQuoteDateSchema,
  deliveryDays: purchaseOptionalIntegerSchema,
  paymentTerms: optionalTrimmedStringSchema,
  notes: optionalTrimmedStringSchema,
  isRecurringSupplierQuote: z.boolean().optional().default(false),
  quoteValidityException: z.boolean().optional().default(false),
  quoteValidityExceptionReason: optionalTrimmedStringSchema,
  items: z.array(purchaseQuoteItemSchema).min(1, "Informe pelo menos um item cotado.")
}).merge(purchaseQuoteEvidenceSchema);

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

  if (value.evidenceType === "none" && !value.evidenceMissingReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceMissingReason"],
      message: "Informe a justificativa para ausencia de evidencia formal."
    });
  }

  if (value.quoteSourceType === "website_catalog" && !value.sourceUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceUrl"],
      message: "Informe a URL para cotacao por site ou catalogo."
    });
  }

  if (value.quoteSourceType === "other" && !value.sourceNotes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceNotes"],
      message: "Descreva a origem ou evidencia da cotacao."
    });
  }

  if (value.isVerbalQuote && !value.sourceNotes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceNotes"],
      message: "Registre a observacao da cotacao verbal."
    });
  }

  if (value.isVerbalQuote && !value.sourceContactName && !value.sourceContactChannel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceContactName"],
      message: "Informe o contato ou canal da cotacao verbal."
    });
  }

  if (value.quoteSourceType === "phone_call") {
    if (!value.sourceContactName && !value.sourceContactChannel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceContactName"],
        message: "Informe o contato ou canal da ligacao."
      });
    }

    if (!value.sourceNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceNotes"],
        message: "Registre a observacao da ligacao."
      });
    }

    if (!value.evidenceMissingReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceMissingReason"],
        message: "Informe o motivo da ausencia de evidencia formal para cotacao por ligacao."
      });
    }
  }

  if (value.quoteSourceType === "in_person" && !value.sourceNotes && !value.sourceContactName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceNotes"],
      message: "Informe uma observacao ou contato para cotacao presencial."
    });
  }

  if (value.quoteSourceType === "in_person" && !value.evidenceMissingReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceMissingReason"],
      message: "Informe o motivo da ausencia de evidencia formal para cotacao presencial."
    });
  }

  if ((value.isEmergencyQuote || value.quoteSourceType === "emergency") && !value.emergencyReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emergencyReason"],
      message: "Informe o motivo da cotacao emergencial."
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

export const purchaseQuoteNegotiationCreateSchema = purchaseQuoteFormBaseSchema
  .omit({
    supplierId: true,
    isRecurringSupplierQuote: true,
    quoteValidityException: true,
    quoteValidityExceptionReason: true,
    notes: true
  })
  .extend({
    negotiationNotes: optionalTrimmedStringSchema,
    items: z
      .array(
        purchaseQuoteItemSchema.extend({
          notes: optionalTrimmedStringSchema
        })
      )
      .min(1, "Informe ao menos um item para a nova proposta.")
  })
  .superRefine((value, ctx) => {
    if (value.validUntil < value.quoteDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validUntil"],
        message: "A validade deve ser maior ou igual a data da cotacao."
      });
    }
  });

export const purchaseQuoteSelectSchema = z.object({
  action: z.literal("select")
});

export const purchaseQuoteUnselectSchema = z.object({
  action: z.literal("unselect")
});

export const purchaseQuotePostSchema = z.union([purchaseQuoteStartSchema, purchaseQuoteCreateSchema]);
export const purchaseQuotePatchSchema = z.union([purchaseQuoteUpdateSchema, purchaseQuoteSelectSchema, purchaseQuoteUnselectSchema]);
