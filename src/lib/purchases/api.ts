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

export function sumPurchaseRequestItems(items: Array<{ quantity: number; estimatedUnitPrice: number }>) {
  return roundMoney(items.reduce((accumulator, item) => accumulator + item.quantity * item.estimatedUnitPrice, 0));
}

export function sumPurchaseQuoteItems(items: Array<{ quantity: number; unitPrice: number }>) {
  return roundMoney(items.reduce((accumulator, item) => accumulator + item.quantity * item.unitPrice, 0));
}

export function buildNextPurchaseQuoteNumber(requestNumber: string, existingCount: number) {
  const nextSequence = existingCount + 1;
  return `CQ-${requestNumber}-${String(nextSequence).padStart(2, "0")}`;
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
