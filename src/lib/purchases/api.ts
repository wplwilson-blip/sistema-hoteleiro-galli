import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeOptionalDate(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeOptionalUuid(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildPurchaseRequestInitialFlags() {
  return {
    quotationRequired: false,
    requiredQuoteCount: 0,
    approvalRequired: false,
    directorApprovalRequired: false
  };
}

export function calculatePurchaseRequestFlags(totalEstimatedAmount: number) {
  if (totalEstimatedAmount > 200) {
    return {
      quotationRequired: true,
      requiredQuoteCount: 3,
      approvalRequired: true,
      directorApprovalRequired: true
    };
  }

  return {
    quotationRequired: false,
    requiredQuoteCount: 0,
    approvalRequired: false,
    directorApprovalRequired: false
  };
}

export function calculateWinningQuoteApprovalFlags(totalAmount: number) {
  return {
    quotationRequired: totalAmount > 200,
    requiredQuoteCount: totalAmount > 200 ? 3 : 0,
    approvalRequired: true,
    directorApprovalRequired: totalAmount > 200
  };
}

export type PurchaseApprovalLevel = "administrative_management" | "general_directorate";
export type PurchaseApprovalStatus = "pending" | "approved" | "rejected" | "returned_to_purchases";

export function getPurchaseApprovalLevel(totalAmount: number): PurchaseApprovalLevel {
  return totalAmount > 200 ? "general_directorate" : "administrative_management";
}

export function getPurchaseApprovalLevelLabel(level: PurchaseApprovalLevel | string | null | undefined) {
  return level === "general_directorate" ? "Diretoria Geral" : "Gerência Administrativa";
}

export function sumPurchaseRequestItems(items: Array<{ quantity: number; estimatedUnitPrice: number }>) {
  return roundMoney(items.reduce((accumulator, item) => accumulator + item.quantity * item.estimatedUnitPrice, 0));
}

export function sumPurchaseQuoteItems(items: Array<{ quantity: number; unitPrice: number }>) {
  return roundMoney(items.reduce((accumulator, item) => accumulator + item.quantity * item.unitPrice, 0));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildNextPurchaseQuoteNumber(requestNumber: string | null | undefined, existingQuoteNumbers: string[]) {
  const normalizedRequestNumber = requestNumber?.trim();

  if (normalizedRequestNumber) {
    const prefix = `${normalizedRequestNumber}-COT-`;
    const sequencePattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
    const legacySequencePattern = new RegExp(`^CQ-${escapeRegExp(normalizedRequestNumber)}-(\\d+)$`);
    const latestSequence = existingQuoteNumbers.reduce((latest, quoteNumber) => {
      const sequence = quoteNumber.match(sequencePattern)?.[1] ?? quoteNumber.match(legacySequencePattern)?.[1];
      const parsed = sequence ? Number.parseInt(sequence, 10) : 0;
      return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
    }, 0);

    return `${prefix}${String(latestSequence + 1).padStart(2, "0")}`;
  }

  const year = new Date().getFullYear();
  const prefix = `COT-${year}-`;
  const sequencePattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  const latestSequence = existingQuoteNumbers.reduce((latest, quoteNumber) => {
    const sequence = quoteNumber.match(sequencePattern)?.[1];
    const parsed = sequence ? Number.parseInt(sequence, 10) : 0;
    return Number.isFinite(parsed) && parsed > latest ? parsed : latest;
  }, 0);

  return `${prefix}${String(latestSequence + 1).padStart(6, "0")}`;
}

export async function buildNextPurchaseRequestNumber(supabase: SupabaseAdmin, organizationId: string) {
  const year = new Date().getFullYear();
  const prefix = `SC-${year}-`;
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("request_number")
    .eq("organization_id", organizationId)
    .like("request_number", `${prefix}%`)
    .order("request_number", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const latest = data?.[0]?.request_number;
  const latestSequence = latest?.startsWith(prefix) ? Number.parseInt(latest.slice(prefix.length), 10) : 0;
  const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

  return `${prefix}${String(nextSequence).padStart(6, "0")}`;
}
