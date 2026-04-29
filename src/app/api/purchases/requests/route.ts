import { NextResponse } from "next/server";
import { z } from "zod";
import { getUnitOrganizationId, logBaseCadastroError, requireAuthenticatedRequest, apiError } from "@/lib/base-cadastros/api-helpers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildNextPurchaseRequestNumber,
  buildPurchaseRequestInitialFlags,
  roundMoney
} from "@/lib/purchases/api";
import {
  getPurchasePriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
  getPurchaseUnitOfMeasureLabel,
  type PurchaseUnitOfMeasure,
  purchaseRequestWriteSchema,
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

type RequesterRow = {
  id: string;
  display_name: string;
  username: string;
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

async function loadPurchaseOptions(supabase: SupabaseAdmin, accessibleUnitIds: string[]) {
  if (!accessibleUnitIds.length) {
    return {
      units: [] as UnitRow[],
      departments: [] as DepartmentRow[],
      costCenters: [] as CostCenterRow[]
    };
  }

  const [{ data: units, error: unitsError }, { data: departments, error: departmentsError }, { data: costCenters, error: costCentersError }] =
    await Promise.all([
      supabase.from("units").select("id, code, name").in("id", accessibleUnitIds).is("deleted_at", null).order("name", { ascending: true }),
      supabase.from("departments").select("id, unit_id, code, name").in("unit_id", accessibleUnitIds).is("deleted_at", null).order("name", { ascending: true }),
      supabase.from("cost_centers").select("id, unit_id, code, name").in("unit_id", accessibleUnitIds).is("deleted_at", null).order("name", { ascending: true })
    ]);

  if (unitsError) {
    logBaseCadastroError("purchase_requests.units_list_failed", unitsError);
    throw new Error("Nao foi possivel carregar as unidades.");
  }

  if (departmentsError) {
    logBaseCadastroError("purchase_requests.departments_list_failed", departmentsError);
    throw new Error("Nao foi possivel carregar os departamentos.");
  }

  if (costCentersError) {
    logBaseCadastroError("purchase_requests.cost_centers_list_failed", costCentersError);
    throw new Error("Nao foi possivel carregar os centros de custo.");
  }

  return {
    units: (units ?? []) as UnitRow[],
    departments: (departments ?? []) as DepartmentRow[],
    costCenters: (costCenters ?? []) as CostCenterRow[]
  };
}

function findOptionById<T extends { id: string }>(collection: T[], id: string | null) {
  if (!id) {
    return undefined;
  }

  return collection.find((entry) => entry.id === id);
}

async function loadPurchasesForList(supabase: SupabaseAdmin, accessibleUnitIds: string[]) {
  if (!accessibleUnitIds.length) {
    return {
      requests: [] as ReturnType<typeof mapRequestRow>[],
      requestRows: [] as PurchaseRequestRow[],
      itemsByRequest: new Map<string, PurchaseRequestItemRow[]>(),
      requestersById: new Map<string, RequesterRow>(),
      unitsById: new Map<string, UnitRow>(),
      departmentsById: new Map<string, DepartmentRow>(),
      costCentersById: new Map<string, CostCenterRow>()
    };
  }

  const { data: requestRows, error: requestsError } = await supabase
    .from("purchase_requests")
    .select(
      "id, organization_id, unit_id, department_id, cost_center_id, requested_by, request_number, title, description, justification, request_type, priority, desired_date, total_estimated_amount, total_approved_amount, quotation_required, required_quote_count, approval_required, director_approval_required, status, approval_request_id, budget_period_id, budget_line_id, budget_reservation_id, over_budget, over_budget_justification, payment_request_id, created_at, updated_at, created_by, updated_by"
    )
    .in("unit_id", accessibleUnitIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (requestsError) {
    logBaseCadastroError("purchase_requests.list_failed", requestsError);
    throw new Error("Nao foi possivel carregar as solicitacoes.");
  }

  const rows = (requestRows ?? []) as PurchaseRequestRow[];
  const requestIds = rows.map((request) => request.id);
  const requesterIds = Array.from(new Set(rows.map((request) => request.requested_by).filter(Boolean))) as string[];
  const unitIds = Array.from(new Set(rows.map((request) => request.unit_id)));
  const departmentIds = Array.from(new Set(rows.map((request) => request.department_id).filter(Boolean))) as string[];
  const costCenterIds = Array.from(new Set(rows.map((request) => request.cost_center_id).filter(Boolean))) as string[];

  const [itemsResult, requestersResult, unitsResult, departmentsResult, costCentersResult] = await Promise.all([
    requestIds.length
      ? supabase
          .from("purchase_request_items")
          .select("id, purchase_request_id, item_description, quantity, unit_of_measure, estimated_unit_price, estimated_total_price, approved_unit_price, approved_total_price, notes")
          .in("purchase_request_id", requestIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    requesterIds.length
      ? supabase.from("app_users").select("id, display_name, username").in("id", requesterIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length ? supabase.from("units").select("id, code, name").in("id", unitIds) : Promise.resolve({ data: [], error: null }),
    departmentIds.length
      ? supabase.from("departments").select("id, unit_id, code, name").in("id", departmentIds)
      : Promise.resolve({ data: [], error: null }),
    costCenterIds.length
      ? supabase.from("cost_centers").select("id, unit_id, code, name").in("id", costCenterIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (itemsResult.error) {
    logBaseCadastroError("purchase_requests.items_list_failed", itemsResult.error);
    throw new Error("Nao foi possivel carregar os itens das solicitacoes.");
  }

  if (requestersResult.error) {
    logBaseCadastroError("purchase_requests.requesters_list_failed", requestersResult.error);
    throw new Error("Nao foi possivel carregar os solicitantes.");
  }

  if (unitsResult.error) {
    logBaseCadastroError("purchase_requests.units_lookup_failed", unitsResult.error);
    throw new Error("Nao foi possivel carregar as unidades.");
  }

  if (departmentsResult.error) {
    logBaseCadastroError("purchase_requests.departments_lookup_failed", departmentsResult.error);
    throw new Error("Nao foi possivel carregar os departamentos.");
  }

  if (costCentersResult.error) {
    logBaseCadastroError("purchase_requests.cost_centers_lookup_failed", costCentersResult.error);
    throw new Error("Nao foi possivel carregar os centros de custo.");
  }

  const itemsByRequest = new Map<string, PurchaseRequestItemRow[]>();
  for (const item of (itemsResult.data ?? []) as PurchaseRequestItemRow[]) {
    itemsByRequest.set(item.purchase_request_id, [...(itemsByRequest.get(item.purchase_request_id) ?? []), item]);
  }

  const requestersById = new Map((requestersResult.data ?? []).map((requester: RequesterRow) => [requester.id, requester]));
  const unitsById = new Map((unitsResult.data ?? []).map((unit: UnitRow) => [unit.id, unit]));
  const departmentsById = new Map((departmentsResult.data ?? []).map((department: DepartmentRow) => [department.id, department]));
  const costCentersById = new Map((costCentersResult.data ?? []).map((costCenter: CostCenterRow) => [costCenter.id, costCenter]));

  return {
    requestRows: rows,
    itemsByRequest,
    requestersById,
    unitsById,
    departmentsById,
    costCentersById
  };
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

function buildCreateEventDescription(action: "save" | "submit") {
  return action === "submit" ? "Solicitacao criada e enviada para analise." : "Solicitacao criada como rascunho.";
}

function buildStatusChangeDescription(fromStatus: string, toStatus: string) {
  return `Status alterado de ${fromStatus} para ${toStatus}.`;
}

export async function GET() {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);
    const [options, list] = await Promise.all([loadPurchaseOptions(supabase, accessibleUnitIds), loadPurchasesForList(supabase, accessibleUnitIds)]);

    return NextResponse.json({
      ok: true,
      requests: list.requestRows.map((request) => {
        const unit = options.units.find((entry) => entry.id === request.unit_id) ?? list.unitsById.get(request.unit_id);
        const department = options.departments.find((entry) => entry.id === request.department_id) ?? (request.department_id ? list.departmentsById.get(request.department_id) : null);
        const costCenter = options.costCenters.find((entry) => entry.id === request.cost_center_id) ?? (request.cost_center_id ? list.costCentersById.get(request.cost_center_id) : null);
        const requester = request.requested_by ? list.requestersById.get(request.requested_by) : null;

        return mapRequestRow(request, {
          requesterName: requester?.display_name ?? requester?.username ?? "",
          unit: unit ?? undefined,
          department: department ?? undefined,
          costCenter: costCenter ?? null,
          items: list.itemsByRequest.get(request.id) ?? []
        });
      }),
      units: options.units,
      departments: options.departments,
      costCenters: options.costCenters
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Nao foi possivel carregar as solicitacoes.", 500);
  }
}

export async function POST(request: Request) {
  const { session, response } = await requireAuthenticatedRequest();

  if (response || !session) {
    return response;
  }

  try {
    const payload = purchaseRequestWriteSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const accessibleUnitIds = session.units.map((unit) => unit.id);

    await validateUnitScope(supabase, payload.unitId, accessibleUnitIds);
    await validateDepartmentForUnit(supabase, payload.departmentId, payload.unitId);
    if (payload.costCenterId) {
      await validateCostCenterForUnit(supabase, payload.costCenterId, payload.unitId);
    }

    const organizationId = await getUnitOrganizationId(supabase, payload.unitId);
    const totalEstimatedAmount = 0;
    const flags = buildPurchaseRequestInitialFlags();
    const status = payload.action === "submit" ? "submitted" : "draft";
    const options = await loadPurchaseOptions(supabase, accessibleUnitIds);
    let requestId = "";
    let requestNumber = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      requestNumber = await buildNextPurchaseRequestNumber(supabase, organizationId);

      const { data, error } = await supabase
        .from("purchase_requests")
        .insert({
          organization_id: organizationId,
          unit_id: payload.unitId,
          department_id: payload.departmentId,
          cost_center_id: payload.costCenterId ?? null,
          requested_by: session.user.id,
          request_number: requestNumber,
          title: payload.title,
          description: payload.description ?? null,
          justification: payload.justification,
          request_type: payload.requestType,
          priority: payload.priority,
          desired_date: payload.desiredDate ?? null,
          total_estimated_amount: totalEstimatedAmount,
          total_approved_amount: 0,
          quotation_required: flags.quotationRequired,
          required_quote_count: flags.requiredQuoteCount,
          approval_required: flags.approvalRequired,
          director_approval_required: flags.directorApprovalRequired,
          status,
          budget_period_id: null,
          budget_line_id: null,
          budget_reservation_id: null,
          over_budget: false,
          over_budget_justification: null,
          payment_request_id: null,
          created_by: session.user.id,
          updated_by: session.user.id
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505" && attempt < 2) {
          continue;
        }

        logBaseCadastroError("purchase_requests.create_failed", error);
        return apiError("Nao foi possivel salvar a solicitacao.", 500);
      }

      requestId = data.id;
      break;
    }

    if (!requestId) {
      return apiError("Nao foi possivel gerar o numero da solicitacao.", 500);
    }

    const requestItems = payload.items.map((item) => ({
      organization_id: organizationId,
      unit_id: payload.unitId,
      purchase_request_id: requestId,
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

    const { error: itemsError } = await supabase.from("purchase_request_items").insert(requestItems);

    if (itemsError) {
      logBaseCadastroError("purchase_requests.items_create_failed", itemsError);
      await supabase.from("purchase_requests").delete().eq("id", requestId);
      return apiError("Nao foi possivel salvar os itens da solicitacao.", 500);
    }

    try {
      await insertPurchaseRequestEvent(supabase, {
        organizationId,
        unitId: payload.unitId,
        purchaseRequestId: requestId,
        eventType: "created",
        fromStatus: null,
        toStatus: status,
        description: buildCreateEventDescription(payload.action),
        createdBy: session.user.id
      });
    } catch (eventError) {
      await supabase.from("purchase_request_items").delete().eq("purchase_request_id", requestId);
      await supabase.from("purchase_requests").delete().eq("id", requestId);
      return apiError(eventError instanceof Error ? eventError.message : "Nao foi possivel registrar o evento da solicitacao.", 500);
    }

    const createdRequest = await fetchRequestById(supabase, requestId);
    const createdItems = await fetchRequestItems(supabase, requestId);

    return NextResponse.json({
      ok: true,
      request: mapRequestRow(createdRequest, {
        unit: findOptionById(options.units, createdRequest.unit_id),
        department: findOptionById(options.departments, createdRequest.department_id),
        costCenter: findOptionById(options.costCenters, createdRequest.cost_center_id) ?? null,
        requesterName: session.user.name,
        items: createdItems
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors[0]?.message ?? "Dados invalidos.", 422);
    }

    return apiError(error instanceof Error ? error.message : "Nao foi possivel salvar a solicitacao.", 500);
  }
}
