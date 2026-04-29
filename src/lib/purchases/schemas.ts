import { z } from "zod";

export const purchaseRequestTypeSchema = z.enum(["normal", "emergency"]);
export const purchasePrioritySchema = z.enum(["low", "normal", "high", "critical"]);
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

const optionalUuidSchema = z.string().uuid("Selecione uma opcao valida.").optional().or(z.literal("").transform(() => undefined));
const optionalTextSchema = z.string().trim().optional().or(z.literal("").transform(() => undefined));
const optionalDateSchema = z.string().trim().optional().or(z.literal("").transform(() => undefined));

export const purchaseRequestItemSchema = z.object({
  description: z.string().trim().min(2, "Informe a descricao do item."),
  quantity: z.coerce.number().positive("A quantidade deve ser maior que zero."),
  unitOfMeasure: z.string().trim().min(1, "Informe a unidade de medida."),
  estimatedUnitPrice: z.coerce.number().min(0, "O valor unitario estimado nao pode ser negativo."),
  notes: optionalTextSchema
});

const purchaseRequestBaseSchema = z.object({
  unitId: z.string().uuid("Selecione uma unidade."),
  departmentId: z.string().uuid("Selecione um departamento."),
  costCenterId: optionalUuidSchema,
  title: z.string().trim().min(3, "Informe o titulo da solicitacao."),
  description: optionalTextSchema,
  justification: z.string().trim().min(5, "Informe a justificativa da compra."),
  requestType: purchaseRequestTypeSchema,
  priority: purchasePrioritySchema,
  desiredDate: optionalDateSchema,
  items: z.array(purchaseRequestItemSchema).min(1, "Inclua pelo menos um item."),
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
  critical: "Critica"
};

export const purchaseRequestStatusLabelMap: Record<z.infer<typeof purchaseRequestStatusSchema>, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  under_review: "Em analise",
  quotation: "Em cotacao",
  pending_approval: "Aguardando aprovacao",
  approved: "Aprovada",
  rejected: "Rejeitada",
  awaiting_purchase: "Aguardando compra",
  purchase_ordered: "Pedido realizado",
  partially_received: "Recebida parcial",
  received_total: "Recebida total",
  received_with_divergence: "Recebida com divergencia",
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

