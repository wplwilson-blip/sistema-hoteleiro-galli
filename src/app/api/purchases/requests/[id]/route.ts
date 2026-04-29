import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logBaseCadastroError, requireAuthenticatedRequest } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildPurchaseRequestInitialFlags,
  normalizeOptionalDate,
  normalizeOptionalUuid,
  roundMoney,
} from "@/lib/purchases/api";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
  getPurchaseUnitOfMeasureLabel,
  type PurchaseUnitOfMeasure,
  purchaseRequestPatchSchema,
  purchaseRequestWriteSchema
} from "@/lib/purchases/schemas";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type PurchaseRequestType = "normal" | "emergency";
type PurchasePriority = "low" | "normal" | "high" | "critical";
type PurchaseRequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "quotation"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "awaiting_purchase"
  | "purchase_ordered"
  | "partially_received"
  | "received_total"
  | "received_with_divergence"
  | "closed"
  | "cancelled";

type PurchaseRequestRow = {
  id: string;
  organization_id: string;
  unit_id: string;
  department_id: string | null;
  cost_center_id: string | null;
  requested_by: string | null;
  request_number: string;
  title: string;
  description: string | null;
  justification: string;
  request_type: PurchaseRequestType;
  priority: PurchasePriority;
  desired_date: string | null;
  total_estimated_amount: string | number;
  total_approved_amount: string | number | null;
  quotation_required: boolean;
  required_quote_count: number;
  approval_required: boolean;
  director_approval_required: boolean;
  status: PurchaseRequestStatus;
  approval_request_id: string | null;
  budget_period_id: string | null;
  budget_line_id: string | null;
  budget_reservation_id: string | null;
  over_budget: boolean;
  over_budget_justification: string | null;
  payment_request_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

type PurchaseRequestItemRow = {
  id: string;
  purchase_request_id: string;
  item_description: string;
  quantity: string | number;
  unit_of_measure: string;
  estimated_unit_price: string | number;
  estimated_total_price: string | number;
  approved_unit_price: string | number | null;
  approved_total_price: string | number | null;
  notes: string | null;
};

type UnitRow = {
  id: string;
  code: string;
  name: string;
};

type DepartmentRow = {
  id: string;
  unit_id: string;
  code: string;
  name: string;
};

type CostCenterRow = {
  id: string;
  unit_id: string;
  code: string;
  name: string;
};

type RequesterRow = {
  id: string;
  display_name: string;
  username: string;
};

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function mapItemRow(item: PurchaseRequestItemRow) {
  return {
    id: item.id,
    description: item.item_description,
    quantity: toNumber(item.quantity),
    unitOfMeasure: item.unit_of_measure,
    unitOfMeasureLabel: getPurchaseUnitOfMeasureLabel(item.unit_of_measure as PurchaseUnitOfMeasure),
    estimatedUnitPrice: toNumber(item.estimated_unit_price),
    estimatedTotalPrice: toNumber(item.estimated_total_price),
    approvedUnitPrice: item.approved_unit_price === null ? null : toNumber(item.approved_unit_price),
    approvedTotalPrice: item.approved_total_price === null ? null : toNumber(item.approved_total_price),
    notes: item.notes ?? ""
  };
}

function mapRequestRow(
  request: PurchaseRequestRow,
  meta: {
    requesterName?: string;
    unit?: UnitRow;
    department?: DepartmentRow;
    costCenter?: CostCenterRow | null;
    items?: PurchaseRequestItemRow[];
  }
) {
  return {
    id: request.id,
    organizationId: request.organization_id,
    unitId: request.unit_id,
    unitCode: meta.unit?.code ?? "",
    unitName: meta.unit?.name ?? "",
    departmentId: request.department_id ?? "",
    departmentCode: meta.department?.code ?? "",
    departmentName: meta.department?.name ?? "",
    costCenterId: request.cost_center_id ?? "",
    costCenterCode: meta.costCenter?.code ?? "",
    costCenterName: meta.costCenter?.name ?? "",
    requestedById: request.requested_by ?? "",
    requestedByName: meta.requesterName ?? "",
    requestNumber: request.request_number,
    title: request.title,
    description: request.description ?? "",
    justification: request.justification,
    requestType: request.request_type,
    requestTypeLabel: getPurchaseRequestTypeLabel(request.request_type),
    priority: request.priority,
    priorityLabel: getPurchasePriorityLabel(request.priority),
    desiredDate: request.desired_date ?? "",
    totalEstimatedAmount: roundMoney(toNumber(request.total_estimated_amount)),
    totalApprovedAmount: roundMoney(toNumber(request.total_approved_amount)),
    quotationRequired: request.quotation_required,
    requiredQuoteCount: request.required_quote_count,
    approvalRequired: request.approval_required,
    directorApprovalRequired: request.director_approval_required,
    status: request.status,
    statusLabel: getPurchaseRequestStatusLabel(request.status),
    approvalRequestId: request.approval_request_id ?? "",
    budgetPeriodId: request.budget_period_id ?? "",
    budgetLineId: request.budget_line_id ?? "",
    budgetReservationId: request.budget_reservation_id ?? "",
    overBudget: request.over_budget,
    overBudgetJustification: request.over_budget_justification ?? "",
    paymentRequestId: request.payment_request_id ?? "",
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    items: (meta.items ?? []).map(mapItemRow)
  };
}

async function validateUnitScope(supabase: SupabaseAdmin, unitId: string, accessibleUnitIds: string[]) {
  if (!accessibleUnitIds.includes(unitId)) {
    throw new Error("Voce nao tem acesso a esta unidade.");
  }

  const { data, error } = await supabase.from("units").select("id").eq("id", unitId).is("deleted_at", null).limit(1);

  if (error) {
    logBaseCadastroError("purchase_requests.unit_lookup_failed", error);
    throw new Error("Nao foi possivel validar a unidade informada.");
  }

  if (!data?.[0]) {
    throw new Error("Unidade nao encontrada.");
  }
}

async function validateDepartmentForUnit(supabase: SupabaseAdmin, departmentId: string, unitId: string) {
  const { data, error } = await supabase
    .from("departments")
    .select("id, unit_id")
    .eq("id", departmentId)
    .eq("unit_id", unitId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("purchase_requests.department_lookup_failed", error);
    throw new Error("Nao foi possivel validar o departamento informado.");
  }

  if (!data?.[0]) {
    throw new Error("Departamento nao encontrado para a unidade selecionada.");
  }
}

async function validateCostCenterForUnit(supabase: SupabaseAdmin, costCenterId: string, unitId: string) {
  const { data, error } = await supabase
    .from("cost_centers")
    .select("id, unit_id")
    .eq("id", costCenterId)
    .eq("unit_id", unitId)
    .is("deleted_at", null)
    .limit(1);

  if (error) {
    logBaseCadastroError("purchase_requests.cost_center_lookup_failed", error);
    throw new Error("Nao foi possivel validar o centro de custo informado.");
  }

  if (!data?.[0]) {
    throw new Error("Centro de custo nao encontrado para a unidade selecionada.");
  }
}

async function fetchRequestById(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, department_id, cost_center_id, requested_by, request_number, title, description, justification, request_type, priority, desired_date, total_estimated_amount, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, status, approval_request_id, budget_period_id, budget_line_id, budget_reservation_id, over_budget, over_budget_justification, payment_request_id, created_at, updated_at, created_by, updated_by"
    )
    .eq("id", requestId)
    .is("deleted_at", null)
    .single();

  if (error) {
    logBaseCadastroError("purchase_requests.lookup_failed", error);
    throw new Error("Nao foi possivel localizar a solicitacao.");
  }

  return data as PurchaseRequestRow;
}

async function fetchRequestItems(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .select("id, purchase_request_id, item_description, quantity, unit_of_measure, estimated_unit_price, estimated_total_price, approved_unit_price, approved_total_price, notes")
    .eq("purchase_request_id", requestId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_requests.items_lookup_failed", error);
    throw new Error("Nao foi possivel carregar os itens da solicitacao.");
  }

  return (data ?? []) as PurchaseRequestItemRow[];
}

async function fetchRequestEvents(supabase: SupabaseAdmin, requestId: string) {
  const { data, error } = await supabase
    .from("purchase_request_events")
    .select("id, event_type, from_status, to_status, description, created_by, created_at")
    .eq("purchase_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    logBaseCadastroError("purchase_requests.events_lookup_failed", error);
    throw new Error("Nao foi possivel carregar o historico da solicitacao.");
  }

  return data ?? [];
}

async function insertPurchaseRequestEvent(
  supabase: SupabaseAdmin,
  input: {
    organizationId: string;
    unitId: string;
    purchaseRequestId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    description: string;
    createdBy: string;
  }
) {
  const { error } = await supabase.from("purchase_request_events").insert({
    organization_id: input.organizationId,
    unit_id: input.unitId,
    purchase_request_id: input.purchaseRequestId,
    event_type: input.eventType,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    description: input.description,
    created_by: input.createdBy
  });

  if (error) {
    logBaseCadastroError("purchase_requests.event_create_failed", error);
    throw new Error("Nao foi possivel registrar o evento operacional da solicitacao.");
  }
}

function mapUnits(units: UnitRow[], unitId: string) {
  return units.find((unit) => unit.id === unitId);
}

function mapDepartments(departments: DepartmentRow[], departmentId: string | null) {
  if (!departmentId) {
    return undefined;
  }

  return departments.find((department) => department.id === departmentId);
}

function mapCostCenters(costCenters: CostCenterRow[], costCenterId: string | null) {
  if (!costCenterId) {
    return null;
  }

  return costCenters.find((costCenter) => costCenter.id === costCenterId) ?? null;
}

function buildRequestUpdateBody(
  input: {
    unitId: string;
    departmentId: string;
    costCenterId?: string;
    title: string;
    description?: string;
    justification: string;
    requestType: PurchaseRequestType;
    priority: PurchasePriority;
    desiredDate?: string;
    action: "save" | "submit";
    updatedBy: string;
  },
  currentStatus: PurchaseRequestStatus
) {
  const flags = buildPurchaseRequestInitialFlags();

  return {
    unit_id: input.unitId,
    department_id: input.departmentId,
    cost_center_id: normalizeOptionalUuid(input.costCenterId),
    title: input.title,
    description: input.description ?? null,
    justification: input.justification,
    request_type: input.requestType,
    priority: input.priority,
    desired_date: normalizeOptionalDate(input.desiredDate),
    total_estimated_amount: 0,
    total_approved_amount: 0,
    quotation_required: flags.quotationRequired,
    required_quote_count: flags.requiredQuoteCount,
    approval_required: flags.approvalRequired,
    director_approval_required: flags.directorApprovalRequired,
    updated_by: input.updatedBy,
    status: input.action === "submit" ? "submitted" : currentStatus
  };
}

async function loadRequestOptionsForId(supabase: SupabaseAdmin, request: PurchaseRequestRow) {
  const [unitResult, departmentResult, costCenterResult, requesterResult] = await Promise.all([
    supabase.from("units").select("id, code, name").eq("id", request.unit_id).is("deleted_at", null).limit(1),
    request.department_id
      ? supabase.from("departments").select("id, unit_id, code, name").eq("id", request.department_id).is("deleted_at", null).limit(1)
      : Promise.resolve({ data: [], error: null }),
    request.cost_center_id
      ? supabase.from("cost_centers").select("id, unit_id, code, name").eq("id", request.cost_center_id).is("deleted_at", null).limit(1)
      : Promise.resolve({ data: [], error: null }),
    request.requested_by ? supabase.from("app_users").select("id, display_name, username").eq("id", request.requested_by).limit(1) : Promise.resolve({ data: [], error: null })
  ]);

  if (unitResult.error) {
    logBaseCadastroError("purchase_requests.unit_detail_failed", unitResult.error);
    throw new Error("Nao foi possivel carregar a unidade da solicitacao.");
  }

  if ("error" in departmentResult && departmentResult.error) {
    logBaseCadastroError("purchase_requests.department_detail_failed", departmentResult.error);
    throw new Error("Nao foi possivel carregar o departamento da solicitacao.");
  }

  if ("error" in costCenterResult && costCenterResult.error) {
    logBaseCadastroError("purchase_requests.cost_center_detail_failed", costCenterResult.error);
    throw new Error("Nao foi possivel carregar o centro de custo da solicitacao.");
  }

  if ("error" in requesterResult && requesterResult.error) {
    logBaseCadastroError("purchase_requests.requester_detail_failed", requesterResult.error);
    throw new Error("Nao foi possivel carregar o solicitante da solicitacao.");
  }

  return {
    units: (unitResult.data ?? []) as UnitRow[],
    departments: ((departmentResult as { data: DepartmentRow[] | [] }).data ?? []) as DepartmentRow[],
    costCenters: ((costCenterResult as { data: CostCenterRow[] | [] }).data ?? []) as CostCenterRow[],
    requesters: ((requesterResult as { data: RequesterRow[] | [] }).data ?? []) as RequesterRow[]
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const requestRow = await fetchRequestById(supabase, params.id);

    if (!session.units.some((unit) => unit.id === requestRow.unit_id)) {
      return apiError("Voce nao tem acesso a esta solicitacao.", 403);
    }

    const items = await fetchRequestItems(supabase, requestRow.id);
    const events = await fetchRequestEvents(supabase, requestRow.id);
    const options = await loadRequestOptionsForId(supabase, requestRow);

    return NextResponse.json({
      ok: true,
      request: mapRequestRow(requestRow, {
        unit: mapUnits(options.units, requestRow.unit_id),
        department: mapDepartments(options.departments, requestRow.department_id),
        costCenter: mapCostCenters(options.costCenters, requestRow.cost_center_id),
        requesterName: options.requesters[0]?.display_name ?? options.requesters[0]?.username ?? "",
        items
      }),
      events
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar a solicitacao.", 500);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = purchaseRequestPatchSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const requestRow = await fetchRequestById(supabase, params.id);
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    if (!accessibleUnitIds.includes(requestRow.unit_id)) {
      return apiError("Voce nao tem acesso a esta solicitacao.", 403);
    }

    const existingItems = await fetchRequestItems(supabase, requestRow.id);

    if (payload.action === "cancel") {
      if (requestRow.status !== "draft" && requestRow.status !== "submitted") {
        return apiError("A solicitacao nao pode ser cancelada neste status.", 409);
      }

      const { error: updateError } = await supabase
        .from("purchase_requests")
        .update({ status: "cancelled", updated_by: session.user.id })
        .eq("id", requestRow.id);

      if (updateError) {
        logBaseCadastroError("purchase_requests.cancel_failed", updateError);
        return apiError("Nao foi possivel cancelar a solicitacao.", 500);
      }

      try {
        await insertPurchaseRequestEvent(supabase, {
          organizationId: requestRow.organization_id,
          unitId: requestRow.unit_id,
          purchaseRequestId: requestRow.id,
          eventType: "status_changed",
          fromStatus: requestRow.status,
          toStatus: "cancelled",
          description: `Status alterado de ${requestRow.status} para cancelled.`,
          createdBy: session.user.id
        });
      } catch (eventError) {
        await supabase.from("purchase_requests").update({ status: requestRow.status, updated_by: session.user.id }).eq("id", requestRow.id);
        return apiError(eventError instanceof Error ? eventError.message : "Nao foi possivel registrar o cancelamento.", 500);
      }

      const cancelledRequest = await fetchRequestById(supabase, requestRow.id);
      const options = await loadRequestOptionsForId(supabase, cancelledRequest);

      return NextResponse.json({
        ok: true,
        request: mapRequestRow(cancelledRequest, {
          unit: mapUnits(options.units, cancelledRequest.unit_id),
          department: mapDepartments(options.departments, cancelledRequest.department_id),
          costCenter: mapCostCenters(options.costCenters, cancelledRequest.cost_center_id),
          requesterName: options.requesters[0]?.display_name ?? options.requesters[0]?.username ?? "",
          items: existingItems
        })
      });
    }

    const payloadResult = purchaseRequestWriteSchema.parse({
      ...payload,
      action: payload.action
    });

    if (payloadResult.action === "submit" && requestRow.status !== "draft") {
      return apiError("Somente uma solicitacao em rascunho pode ser enviada para analise.", 409);
    }

    if (requestRow.status !== "draft" && requestRow.status !== "submitted") {
      return apiError("A solicitacao nao pode ser editada neste status.", 409);
    }

    await validateUnitScope(supabase, payloadResult.unitId, accessibleUnitIds);
    await validateDepartmentForUnit(supabase, payloadResult.departmentId, payloadResult.unitId);
    if (payloadResult.costCenterId) {
      await validateCostCenterForUnit(supabase, payloadResult.costCenterId, payloadResult.unitId);
    }

    const updateBody = buildRequestUpdateBody({ ...payloadResult, updatedBy: session.user.id }, requestRow.status);
    const oldRequestBody = {
      unit_id: requestRow.unit_id,
      department_id: requestRow.department_id,
      cost_center_id: requestRow.cost_center_id,
      title: requestRow.title,
      description: requestRow.description,
      justification: requestRow.justification,
      request_type: requestRow.request_type,
      priority: requestRow.priority,
      desired_date: requestRow.desired_date,
      total_estimated_amount: requestRow.total_estimated_amount,
      total_approved_amount: requestRow.total_approved_amount,
      quotation_required: requestRow.quotation_required,
      required_quote_count: requestRow.required_quote_count,
      approval_required: requestRow.approval_required,
      director_approval_required: requestRow.director_approval_required,
      status: requestRow.status,
      updated_by: session.user.id
    };

    const { error: updateError } = await supabase.from("purchase_requests").update(updateBody).eq("id", requestRow.id);

    if (updateError) {
      logBaseCadastroError("purchase_requests.update_failed", updateError);
      return apiError(updateError.message || "Nao foi possivel atualizar a solicitacao.", 500);
    }

    const { error: deleteItemsError } = await supabase.from("purchase_request_items").delete().eq("purchase_request_id", requestRow.id);

    if (deleteItemsError) {
      logBaseCadastroError("purchase_requests.items_delete_failed", deleteItemsError);
      await supabase.from("purchase_requests").update(oldRequestBody).eq("id", requestRow.id);
      return apiError("Nao foi possivel atualizar os itens da solicitacao.", 500);
    }

    const newItems = payloadResult.items.map((item) => ({
      organization_id: requestRow.organization_id,
      unit_id: payloadResult.unitId,
      purchase_request_id: requestRow.id,
      item_description: item.description,
      quantity: item.quantity,
      unit_of_measure: item.unitOfMeasure,
      estimated_unit_price: 0,
      estimated_total_price: 0,
      approved_unit_price: null,
      approved_total_price: null,
      notes: item.notes ?? null,
      created_by: session.user.id,
      updated_by: session.user.id
    }));

    const { error: insertItemsError } = await supabase.from("purchase_request_items").insert(newItems);

    if (insertItemsError) {
      logBaseCadastroError("purchase_requests.items_insert_failed", insertItemsError);
      await supabase.from("purchase_requests").update(oldRequestBody).eq("id", requestRow.id);
      await supabase.from("purchase_request_items").insert(existingItems.map((item) => ({ ...item, quantity: toNumber(item.quantity), estimated_unit_price: toNumber(item.estimated_unit_price), estimated_total_price: toNumber(item.estimated_total_price) })));
      return apiError("Nao foi possivel salvar os itens da solicitacao.", 500);
    }

    if (payloadResult.action === "submit") {
      try {
        await insertPurchaseRequestEvent(supabase, {
          organizationId: requestRow.organization_id,
          unitId: payloadResult.unitId,
          purchaseRequestId: requestRow.id,
          eventType: "status_changed",
          fromStatus: requestRow.status,
          toStatus: "submitted",
          description: buildStatusChangeDescription(requestRow.status, "submitted"),
          createdBy: session.user.id
        });
      } catch (eventError) {
        await supabase.from("purchase_requests").update(oldRequestBody).eq("id", requestRow.id);
        await supabase.from("purchase_request_items").delete().eq("purchase_request_id", requestRow.id);
        await supabase.from("purchase_request_items").insert(existingItems.map((item) => ({ ...item, quantity: toNumber(item.quantity), estimated_unit_price: toNumber(item.estimated_unit_price), estimated_total_price: toNumber(item.estimated_total_price) })));
        return apiError(eventError instanceof Error ? eventError.message : "Nao foi possivel registrar o evento da solicitacao.", 500);
      }
    }

    const updatedRequest = await fetchRequestById(supabase, requestRow.id);
    const updatedItems = await fetchRequestItems(supabase, requestRow.id);
    const options = await loadRequestOptionsForId(supabase, updatedRequest);

    return NextResponse.json({
      ok: true,
      request: mapRequestRow(updatedRequest, {
        unit: mapUnits(options.units, updatedRequest.unit_id),
        department: mapDepartments(options.departments, updatedRequest.department_id),
        costCenter: mapCostCenters(options.costCenters, updatedRequest.cost_center_id),
        requesterName: options.requesters[0]?.display_name ?? options.requesters[0]?.username ?? "",
        items: updatedItems
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel atualizar a solicitacao.", 500);
  }
}

function buildStatusChangeDescription(fromStatus: string, toStatus: string) {
  return `Status alterado de ${fromStatus} para ${toStatus}.`;
}
