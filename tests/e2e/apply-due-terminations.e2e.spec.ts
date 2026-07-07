import { expect, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";

// RH-E-05 — E2E do efetivador de desligamento (endpoint UNIFICADO POST /api/hr/apply-due).
//
// 100% via API como usuario real (padrao de apply-due-movements.e2e.spec.ts): ator E2E_ADMIN (super
// admin), HTTP puro (request), SEM service_role e SEM acesso direto ao banco. Setup pela cadeia real de
// rotas: criar colaborador (/api/base/employees) -> criar desligamento (/api/hr/terminations) ->
// concluir checklist obrigatorio -> submit -> approve -> implement. effective_date = HOJE qualifica no
// mesmo run (o efetivador filtra effective_date <= current_date).
//
// PRE-REQUISITOS: migration 075 aplicada no staging (coluna applied_at) e CRON_SECRET no
// .env.e2e.local (nunca no repo). Se CRON_SECRET faltar -> test.skip.
//
// LIMITACAO CONHECIDA (reportada): applied_at nao e' exposto por nenhuma rota de leitura. Por isso a
// EFETIVACAO e a IDEMPOTENCIA sao afirmadas pelo CAMINHO DE LEITURA REAL do cadastro:
// GET /api/hr/employees/[id] -> data.status muda active->inactive exatamente UMA vez. O GET usa
// assertCanAccessHrEmployee, que filtra so deleted_at (NAO status), entao o colaborador inativado
// continua legivel. NAO inventamos um campo inexistente.
//
// RESIDUAL: sem DELETE de colaborador na API, seguimos a disciplina dos specs de purchases — dado
// marcado [E2E]+sufixo unico, residual identificavel (sem hard-delete).

const APPLY_DUE_URL = "/api/hr/apply-due";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

test.use({ storageState: authStatePath("E2E_ADMIN") });

test.skip(!CRON_SECRET, "CRON_SECRET ausente no .env.e2e.local — efetivador nao testavel via API.");

function isoDateOffsetUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type UnitLite = { id: string; name: string };

async function okJson<T>(request: APIRequestContext, method: "get" | "post" | "patch", url: string, data?: unknown): Promise<T> {
  const response =
    method === "get"
      ? await request.get(url)
      : method === "patch"
        ? await request.patch(url, { data: data ?? {} })
        : await request.post(url, { data: data ?? {} });
  const body = (await response.json()) as { ok?: boolean; message?: string };
  if (!response.ok() || body.ok === false) {
    throw new Error(`[e2e] ${method.toUpperCase()} ${url} falhou (HTTP ${response.status()}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as T;
}

/** Duas unidades distintas visiveis ao super admin (GET /api/base/units). */
async function resolveTwoUnits(request: APIRequestContext): Promise<{ unitA: UnitLite; unitB: UnitLite }> {
  const body = await okJson<{ units: UnitLite[] }>(request, "get", "/api/base/units");
  const units = body.units ?? [];
  if (units.length < 2) throw new Error("[e2e] Staging precisa de >= 2 unidades para o teste de ordem termination+transfer.");
  return { unitA: units[0], unitB: units[1] };
}

/** Cria um colaborador na unidade dada e retorna o id (o POST nao retorna id -> localiza pela lista). */
async function createEmployeeInUnit(request: APIRequestContext, unit: UnitLite, fullName: string): Promise<string> {
  await okJson(request, "post", "/api/auth/active-unit", { unitId: unit.id });
  await okJson(request, "post", "/api/base/employees", { unitId: unit.id, fullName, status: "active" });

  const list = await okJson<{ employees: Array<{ id: string; fullName: string; unitId: string }> }>(request, "get", "/api/base/employees");
  const created = list.employees.find((e) => e.fullName === fullName);
  if (!created) throw new Error(`[e2e] Colaborador criado nao encontrado na lista: ${fullName}`);
  return created.id;
}

/** Leva um desligamento de draft -> implemented pela cadeia real (checklist obrigatorio incluido). */
async function createImplementedTermination(
  request: APIRequestContext,
  input: { employeeId: string; effectiveDate: string; suffix: string }
): Promise<string> {
  const created = await okJson<{
    data: { id: string; checklist: Array<{ id: string; isRequired: boolean; isCompleted: boolean }> };
  }>(request, "post", "/api/hr/terminations", {
    employeeId: input.employeeId,
    terminationType: "voluntary",
    terminationReason: `[E2E] desligamento ${input.suffix}`,
    effectiveDate: input.effectiveDate,
    status: "draft"
  });
  const terminationId = created.data.id;

  for (const item of created.data.checklist) {
    if (item.isRequired && !item.isCompleted) {
      await okJson(request, "patch", `/api/hr/terminations/${terminationId}/checklist/${item.id}`, { isCompleted: true });
    }
  }

  await okJson(request, "post", `/api/hr/terminations/${terminationId}/submit`, {});
  await okJson(request, "post", `/api/hr/terminations/${terminationId}/approve`, {});
  await okJson(request, "post", `/api/hr/terminations/${terminationId}/implement`, {});
  return terminationId;
}

/** Leva uma transferencia de draft -> implemented pela cadeia real de rotas. Retorna o movementId. */
async function createImplementedTransfer(
  request: APIRequestContext,
  input: { employeeId: string; toUnit: UnitLite; effectiveDate: string; suffix: string }
): Promise<string> {
  const created = await okJson<{ data: { id: string } }>(request, "post", "/api/hr/movements", {
    employeeId: input.employeeId,
    movementType: "transfer",
    effectiveDate: input.effectiveDate,
    newUnitId: input.toUnit.id,
    reason: `[E2E] transferencia ${input.suffix}`
  });
  const movementId = created.data.id;

  await okJson(request, "post", `/api/hr/movements/${movementId}/submit`, {});
  await okJson(request, "post", `/api/hr/movements/${movementId}/approve`, {});
  await okJson(request, "post", `/api/hr/movements/${movementId}/implement`, {});
  return movementId;
}

async function employeeDetail(request: APIRequestContext, employeeId: string): Promise<{ status: string; unitId: string }> {
  const body = await okJson<{ data: { status: string; unitId: string } }>(request, "get", `/api/hr/employees/${employeeId}`);
  return { status: body.data.status, unitId: body.data.unitId };
}

/** Cancela um desligamento; retorna a resposta crua (para checar status HTTP em casos negativos). */
function cancelTermination(request: APIRequestContext, terminationId: string, comments?: string) {
  return request.post(`/api/hr/terminations/${terminationId}/cancel`, { data: comments ? { comments } : {} });
}

function postApplyDue(request: APIRequestContext, token: string | null) {
  return request.post(APPLY_DUE_URL, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

test.describe("RH-E-05: efetivador de desligamento (apply-due unificado)", () => {
  test("desligamento vencido (hoje) e' efetivado (status=inactive), e' idempotente, barrado sem segredo", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(0), suffix });

    // Antes de efetivar: ainda ativo.
    expect((await employeeDetail(request, employeeId)).status).toBe("active");

    // 401 sem/errado segredo (nao efetiva).
    expect((await postApplyDue(request, null)).status()).toBe(401);
    expect((await postApplyDue(request, "segredo-errado")).status()).toBe(401);
    expect((await employeeDetail(request, employeeId)).status).toBe("active");

    // Run 1: efetiva (status -> inactive).
    const run1 = await postApplyDue(request, CRON_SECRET);
    expect(run1.status()).toBe(200);
    expect((await employeeDetail(request, employeeId)).status).toBe("inactive");

    // Run 2: idempotente (status continua inactive).
    const run2 = await postApplyDue(request, CRON_SECRET);
    expect(run2.status()).toBe(200);
    expect((await employeeDetail(request, employeeId)).status).toBe("inactive");
  });

  test("desligamento com effective_date futura NAO e' efetivado", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(1), suffix });

    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);

    // Futura: o cadastro permanece ativo.
    expect((await employeeDetail(request, employeeId)).status).toBe("active");
  });

  test("cancelar ANTES de efetivar COM justificativa: permitido e nao efetiva", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    const terminationId = await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(0), suffix });

    // Janela de cancelamento tardio (implemented + applied_at null): exige justificativa.
    const cancelled = await cancelTermination(request, terminationId, `[E2E] cancelamento justificado ${suffix}`);
    expect(cancelled.status()).toBe(200);

    // Mesmo com effective_date=hoje, o desligamento cancelado nao efetiva.
    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);
    expect((await employeeDetail(request, employeeId)).status).toBe("active");
  });

  test("cancelar na janela SEM justificativa: 422", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    const terminationId = await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(0), suffix });

    const cancelled = await cancelTermination(request, terminationId); // sem comments
    expect(cancelled.status()).toBe(422);
  });

  test("cancelar DEPOIS de efetivado: 422", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    const terminationId = await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(0), suffix });

    // Efetiva primeiro (applied_at preenchido).
    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);
    expect((await employeeDetail(request, employeeId)).status).toBe("inactive");

    // Agora o cancelamento e' bloqueado mesmo com justificativa.
    const cancelled = await cancelTermination(request, terminationId, `[E2E] tentativa tardia ${suffix}`);
    expect(cancelled.status()).toBe(422);
  });

  test("ordem no mesmo colaborador: desligamento efetiva e transferencia e' pulada", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA, unitB } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    // Transferencia vencida (hoje) para B + desligamento vigente (hoje).
    await createImplementedTransfer(request, { employeeId, toUnit: unitB, effectiveDate: isoDateOffsetUtc(0), suffix });
    await createImplementedTermination(request, { employeeId, effectiveDate: isoDateOffsetUtc(0), suffix });

    const before = await employeeDetail(request, employeeId);
    expect(before.status).toBe("active");
    expect(before.unitId).toBe(unitA.id);

    // O endpoint unificado roda desligamento ANTES da movimentacao: o colaborador e' inativado e a
    // transferencia e' pulada (desligamento vigente vence a movimentacao).
    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);

    const after = await employeeDetail(request, employeeId);
    expect(after.status).toBe("inactive");
    expect(after.unitId).toBe(unitA.id); // transferencia NAO aplicada
  });
});
