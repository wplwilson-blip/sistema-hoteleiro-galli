import { z } from "zod";

export const purchaseRequestTypeSchema = z.enum(["normal", "emergency"], {
  required_error: "Campo obrigatorio.",
  invalid_type_error: "Campo obrigatorio."
});

export const purchasePrioritySchema = z.enum(["low", "normal", "high", "critical"], {
  required_error: "Campo obrigatorio.",
  invalid_type_error: "Campo obrigatorio."
});

export const purchaseRequestStatusSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "quotation",
  "pending_approval",
  "approved",
  "rejected",
  "awaiting_purchase",
  "purchase_ordered",
  "partially_received",
  "received_total",
  "received_with_divergence",
  "closed",
  "cancelled"
]);

export const purchaseUnitOfMeasureSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["UN", "KG", "G", "CX", "PCT", "FD", "LT", "ML", "M", "M2", "PAR", "JG", "ROLO", "SACO", "SERV", "OUTRO"], {
    required_error: "Selecione uma unidade de medida.",
    invalid_type_error: "Selecione uma unidade de medida."
  })
);

export type PurchaseUnitOfMeasure = z.infer<typeof purchaseUnitOfMeasureSchema>;

export const purchaseUnitOfMeasureOptions: ReadonlyArray<{ code: PurchaseUnitOfMeasure; label: string }> = [
  { code: "UN", label: "UN - Unidade" },
  { code: "KG", label: "KG - Quilograma" },
  { code: "G", label: "G - Grama" },
  { code: "CX", label: "CX - Caixa" },
  { code: "PCT", label: "PCT - Pacote" },
  { code: "FD", label: "FD - Fardo" },
  { code: "LT", label: "LT - Litro" },
  { code: "ML", label: "ML - Mililitro" },
  { code: "M", label: "M - Metro" },
  { code: "M2", label: "M2 - Metro quadrado" },
  { code: "PAR", label: "PAR - Par" },
  { code: "JG", label: "JG - Jogo" },
  { code: "ROLO", label: "ROLO - Rolo" },
  { code: "SACO", label: "SACO - Saco" },
  { code: "SERV", label: "SERV - Servico" },
  { code: "OUTRO", label: "OUTRO - Outro" }
];

const optionalUuidSchema = z.string().uuid("Selecione uma opcao valida.").optional().or(z.literal("").transform(() => undefined));
const optionalTextSchema = z.string().trim().optional().or(z.literal("").transform(() => undefined));
const optionalDateSchema = z.string().trim().optional().or(z.literal("").transform(() => undefined));

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

const purchaseQuantitySchema = z.preprocess(
  parseLocalizedDecimal,
  z.number({
    required_error: "Informe uma quantidade válida.",
    invalid_type_error: "Informe uma quantidade válida."
  }).positive("Informe uma quantidade válida.")
);

export const purchaseRequestItemSchema = z.object({
  description: z
    .string({ required_error: "Informe a descrição do item.", invalid_type_error: "Informe a descrição do item." })
    .trim()
    .min(2, "Informe a descrição do item."),
  quantity: purchaseQuantitySchema,
  unitOfMeasure: purchaseUnitOfMeasureSchema,
  notes: optionalTextSchema
});

const purchaseRequestBaseSchema = z.object({
  unitId: z.string({ required_error: "Selecione uma unidade.", invalid_type_error: "Selecione uma unidade." }).uuid("Selecione uma unidade."),
  departmentId: z.string({ required_error: "Selecione um departamento.", invalid_type_error: "Selecione um departamento." }).uuid("Selecione um departamento."),
  costCenterId: optionalUuidSchema,
  title: z
    .string({ required_error: "Informe o título.", invalid_type_error: "Informe o título." })
    .trim()
    .min(3, "Informe o título."),
  description: optionalTextSchema,
  justification: z
    .string({ required_error: "Informe a justificativa.", invalid_type_error: "Informe a justificativa." })
    .trim()
    .min(5, "Informe a justificativa."),
  requestType: purchaseRequestTypeSchema,
  priority: purchasePrioritySchema,
  desiredDate: optionalDateSchema,
  items: z.array(purchaseRequestItemSchema).min(1, "Informe pelo menos um item.")
});

export const purchaseRequestWriteSchema = purchaseRequestBaseSchema.extend({
  action: z.enum(["save", "submit"])
});

export const purchaseRequestCancelSchema = z.object({
  action: z.literal("cancel")
});

export const purchaseRequestPatchSchema = z.union([purchaseRequestWriteSchema, purchaseRequestCancelSchema]);

export const purchaseRequestTypeLabelMap: Record<z.infer<typeof purchaseRequestTypeSchema>, string> = {
  normal: "Normal",
  emergency: "Emergencial"
};

export const purchasePriorityLabelMap: Record<z.infer<typeof purchasePrioritySchema>, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica"
};

export const purchaseRequestStatusLabelMap: Record<z.infer<typeof purchaseRequestStatusSchema>, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  under_review: "Em análise",
  quotation: "Em cotação",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  awaiting_purchase: "Aguardando compra",
  purchase_ordered: "Pedido realizado",
  partially_received: "Recebida parcial",
  received_total: "Recebida total",
  received_with_divergence: "Recebida com divergência",
  closed: "Encerrada",
  cancelled: "Cancelada"
};

export const purchaseRequestStatusToneMap: Record<z.infer<typeof purchaseRequestStatusSchema>, "visual" | "warning" | "danger" | "success" | "info"> = {
  draft: "visual",
  submitted: "info",
  under_review: "info",
  quotation: "warning",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
  awaiting_purchase: "warning",
  purchase_ordered: "info",
  partially_received: "warning",
  received_total: "success",
  received_with_divergence: "warning",
  closed: "visual",
  cancelled: "danger"
};

export function getPurchaseRequestStatusLabel(status: z.infer<typeof purchaseRequestStatusSchema>) {
  return purchaseRequestStatusLabelMap[status];
}

export function getPurchaseRequestStatusTone(status: z.infer<typeof purchaseRequestStatusSchema>) {
  return purchaseRequestStatusToneMap[status];
}

export function getPurchaseRequestTypeLabel(type: z.infer<typeof purchaseRequestTypeSchema>) {
  return purchaseRequestTypeLabelMap[type];
}

export function getPurchasePriorityLabel(priority: z.infer<typeof purchasePrioritySchema>) {
  return purchasePriorityLabelMap[priority];
}

export function getPurchaseUnitOfMeasureLabel(code: PurchaseUnitOfMeasure) {
  return purchaseUnitOfMeasureOptions.find((option) => option.code === code)?.label ?? code;
}
