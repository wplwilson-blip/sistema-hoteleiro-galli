import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";

// Helper de fluxo de Compras para a suite E2E.
//
// Decisao de design (T2): os DADOS do fluxo (fornecedor -> solicitacao -> cotacao ->
// vencedora -> envio -> aprovacao) sao criados pelos ENDPOINTS REST reais do app,
// autenticados pelos cookies de sessao (mesma trilha de auth/RLS/escopo que a UI usa).
// As ASSERCOES de unidade ativa e de status ficam na UI (specs), onde o escopo se
// manifesta. O plano (docs/codex/11, secao 5) autoriza "criacao via API quando estavel".
//
// NAO altera o backend: apenas consome a API publica do app como qualquer cliente.

type PurchaseOptions = {
  units: Array<{ id: string; code: string; name: string }>;
  departments: Array<{ id: string; unit_id: string; code: string; name: string }>;
  costCenters: Array<{ id: string; unit_id: string; code: string; name: string }>;
};

type CreatedRequest = {
  id: string;
  requestNumber: string;
  unitId: string;
  items: Array<{ id: string; description: string; quantity: number }>;
};

/** Cria um APIRequestContext autenticado a partir do storageState de um usuario. */
export async function newApiContext(storageStatePath: string, baseURL: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL, storageState: storageStatePath });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `[e2e] Variavel de ambiente ausente: ${name}. ` +
        "Defina os nomes das 2 unidades de staging (NUNCA commitar). Veja .env.e2e.example."
    );
  }
  return value;
}

/** Nomes (de staging) das 2 unidades usadas no teste de unidade ativa. */
export function getRequiredUnitNames(): { unitA: string; unitB: string } {
  return { unitA: requireEnv("E2E_UNIT_A_NAME"), unitB: requireEnv("E2E_UNIT_B_NAME") };
}

async function readJson(response: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok() || (payload as { ok?: boolean }).ok === false) {
    const message = (payload as { message?: string }).message ?? text.slice(0, 300);
    throw new Error(`[e2e] ${label} falhou (HTTP ${response.status()}): ${message}`);
  }

  return payload as Record<string, unknown>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** GET /api/purchases/requests -> opcoes (units/departments/costCenters) no escopo do usuario. */
export async function getPurchaseOptions(ctx: APIRequestContext): Promise<PurchaseOptions> {
  const payload = await readJson(await ctx.get("/api/purchases/requests"), "Carregar opcoes de compras");
  return {
    units: (payload.units as PurchaseOptions["units"]) ?? [],
    departments: (payload.departments as PurchaseOptions["departments"]) ?? [],
    costCenters: (payload.costCenters as PurchaseOptions["costCenters"]) ?? []
  };
}

export function pickUnitByName(options: PurchaseOptions, unitName: string) {
  const unit = options.units.find((entry) => entry.name === unitName || `${entry.code} - ${entry.name}` === unitName);
  if (!unit) {
    throw new Error(
      `[e2e] Unidade "${unitName}" nao encontrada no escopo do usuario. ` +
        `Unidades disponiveis: ${options.units.map((entry) => entry.name).join(", ") || "(nenhuma)"}.`
    );
  }
  return unit;
}

export function pickDepartmentForUnit(options: PurchaseOptions, unitId: string) {
  const department = options.departments.find((entry) => entry.unit_id === unitId);
  if (!department) {
    throw new Error(
      `[e2e] Nenhum departamento cadastrado na unidade ${unitId} (pre-requisito de staging para criar solicitacao).`
    );
  }
  return department;
}

/** POST /api/base/suppliers — fornecedor [E2E] na unidade informada. */
export async function createSupplier(ctx: APIRequestContext, input: { unitId: string; name: string }): Promise<string> {
  const payload = await readJson(
    await ctx.post("/api/base/suppliers", {
      data: { unitId: input.unitId, name: input.name, documentType: "OTHER", status: "active" }
    }),
    "Criar fornecedor"
  );
  const supplier = payload.supplier as { id?: string } | undefined;
  if (!supplier?.id) {
    throw new Error("[e2e] Criar fornecedor: resposta sem id.");
  }
  return supplier.id;
}

/** POST /api/purchases/requests (action submit) — solicitacao [E2E] com 1 item. */
export async function createSubmittedRequest(
  ctx: APIRequestContext,
  input: { unitId: string; departmentId: string; title: string; justification: string; itemDescription: string }
): Promise<CreatedRequest> {
  const payload = await readJson(
    await ctx.post("/api/purchases/requests", {
      data: {
        unitId: input.unitId,
        departmentId: input.departmentId,
        title: input.title,
        justification: input.justification,
        requestType: "normal",
        priority: "normal",
        items: [{ description: input.itemDescription, quantity: 1, unitOfMeasure: "UN" }],
        action: "submit"
      }
    }),
    "Criar solicitacao"
  );

  const requestRecord = payload.request as {
    id?: string;
    requestNumber?: string;
    unitId?: string;
    items?: Array<{ id: string; description: string; quantity: number }>;
  } | undefined;

  if (!requestRecord?.id || !requestRecord.requestNumber || !requestRecord.items?.length) {
    throw new Error("[e2e] Criar solicitacao: resposta sem id/numero/itens.");
  }

  return {
    id: requestRecord.id,
    requestNumber: requestRecord.requestNumber,
    unitId: requestRecord.unitId ?? input.unitId,
    items: requestRecord.items
  };
}

/**
 * POST /api/purchases/requests/{id}/quotes (action save) — cotacao com evidencia
 * NAO-critica (email + copia de e-mail + referencia => classificacao "formal_sufficient"),
 * para manter a alcada por VALOR (<= R$200 = Gerencia Administrativa), sem forcar Diretoria.
 * Retorna o quoteId. unitPrice <= 200 garante a alcada administrativa.
 */
export async function createQuote(
  ctx: APIRequestContext,
  request: CreatedRequest,
  input: { supplierId: string; unitPrice: number; sourceReference: string }
): Promise<string> {
  const payload = await readJson(
    await ctx.post(`/api/purchases/requests/${request.id}/quotes`, {
      data: {
        action: "save",
        supplierId: input.supplierId,
        quoteDate: todayIso(),
        validUntil: plusDaysIso(30),
        deliveryDays: 5,
        paymentTerms: "A vista",
        quoteSourceType: "email",
        evidenceType: "email_copy",
        sourceReference: input.sourceReference,
        items: request.items.map((item) => ({
          purchaseRequestItemId: item.id,
          itemDescription: item.description,
          quantity: item.quantity,
          unitPrice: input.unitPrice
        }))
      }
    }),
    "Criar cotacao"
  );

  const quoteId = payload.quoteId as string | undefined;
  if (!quoteId) {
    throw new Error("[e2e] Criar cotacao: resposta sem quoteId.");
  }
  return quoteId;
}

/** PATCH /api/purchases/requests/{id}/quotes/{quoteId} (action select) — marca vencedora. */
export async function selectQuoteWinner(ctx: APIRequestContext, requestId: string, quoteId: string): Promise<void> {
  await readJson(
    await ctx.patch(`/api/purchases/requests/${requestId}/quotes/${quoteId}`, { data: { action: "select" } }),
    "Selecionar cotacao vencedora"
  );
}

/** POST /api/purchases/approvals/{requestId}/resubmit — envia para aprovacao (cria dossie). */
export async function sendToApproval(ctx: APIRequestContext, requestId: string): Promise<void> {
  await readJson(
    await ctx.post(`/api/purchases/approvals/${requestId}/resubmit`, {}),
    "Enviar para aprovacao"
  );
}

/** POST /api/purchases/approvals/{requestId}/decision (approved) — aprova a compra. */
export async function approvePurchase(ctx: APIRequestContext, requestId: string): Promise<void> {
  await readJson(
    await ctx.post(`/api/purchases/approvals/${requestId}/decision`, {
      data: { decision: "approved", justification: "[E2E] aprovacao automatizada" }
    }),
    "Aprovar compra"
  );
}

/**
 * Teardown best-effort (decisao A: soft-delete via app). Tenta cancelar a solicitacao.
 * Uma compra aprovada NAO e cancelavel pela regra de negocio (retorna 409): nesse caso
 * o registro permanece como residual identificavel por [E2E]+sufixo, sem hard-delete.
 * Retorna true se cancelou, false se a regra bloqueou (residual esperado).
 */
export async function tryCancelRequest(ctx: APIRequestContext, requestId: string): Promise<boolean> {
  const response = await ctx.patch(`/api/purchases/requests/${requestId}`, { data: { action: "cancel" } });
  return response.ok();
}
