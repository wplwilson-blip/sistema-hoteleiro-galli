import { expect, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";

// RH-E-01 — E2E do efetivador diario de movimentacao funcional (POST /api/hr/movements/apply-due).
//
// 100% via API como usuario real (padrao de perfis-super-admin.e2e.spec.ts + fixtures de purchases):
// ator E2E_ADMIN (super admin), HTTP puro (request), SEM service_role e SEM acesso direto ao banco.
// Setup pela cadeia real de rotas: criar colaborador (/api/base/employees) -> criar movimentacao
// (/api/hr/movements) -> submit -> approve -> implement. effective_date = HOJE (o efetivador filtra
// effective_date <= current_date, entao hoje ja qualifica no mesmo run).
//
// PRE-REQUISITOS: migration 073 aplicada no staging (coluna movement_applied_at) e CRON_SECRET no
// .env.e2e.local (nunca no repo). Se CRON_SECRET faltar -> test.skip.
//
// LIMITACAO CONHECIDA (reportada): nenhuma rota de leitura expoe movement_applied_at (nem o GET de
// movimentacao, cujo select nao inclui a coluna). Por isso a EFETIVACAO e a IDEMPOTENCIA sao afirmadas
// pelo CAMINHO DE LEITURA REAL do cadastro: GET /api/hr/employees/[id] -> data.unitId muda A->B
// exatamente UMA vez (run1 aplica; run2 nao remove de novo). NAO inventamos um campo inexistente.
//
// RESIDUAL: sem DELETE de colaborador na API, seguimos a disciplina dos specs de purchases — dado
// marcado [E2E]+sufixo unico, residual identificavel (sem hard-delete).

const APPLY_DUE_URL = "/api/hr/movements/apply-due";
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
  if (units.length < 2) throw new Error("[e2e] Staging precisa de >= 2 unidades para o teste de transferencia.");
  return { unitA: units[0], unitB: units[1] };
}

/** Cria um colaborador na unidade dada e retorna o id (o POST nao retorna id -> localiza pela lista). */
async function createEmployeeInUnit(request: APIRequestContext, unit: UnitLite, fullName: string): Promise<string> {
  // A lista base e' estreitada pela unidade ATIVA -> ativa a unidade alvo antes de criar/listar.
  await okJson(request, "post", "/api/auth/active-unit", { unitId: unit.id });
  await okJson(request, "post", "/api/base/employees", { unitId: unit.id, fullName, status: "active" });

  const list = await okJson<{ employees: Array<{ id: string; fullName: string; unitId: string }> }>(
    request,
    "get",
    "/api/base/employees"
  );
  const created = list.employees.find((e) => e.fullName === fullName);
  if (!created) throw new Error(`[e2e] Colaborador criado nao encontrado na lista: ${fullName}`);
  return created.id;
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

/**
 * Leva um desligamento de draft -> implemented pela cadeia real de rotas. O implement exige que TODOS
 * os itens obrigatorios do checklist (criados por padrao) estejam concluidos. Retorna o terminationId.
 */
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

async function employeeUnitId(request: APIRequestContext, employeeId: string): Promise<string> {
  const body = await okJson<{ data: { unitId: string } }>(request, "get", `/api/hr/employees/${employeeId}`);
  return body.data.unitId;
}

function postApplyDue(request: APIRequestContext, token: string | null) {
  return request.post(APPLY_DUE_URL, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

test.describe("RH-E-01: efetivador de movimentacao funcional (apply-due)", () => {
  test("transferencia vencida (hoje) e' efetivada, e' idempotente, e barrada sem segredo", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA, unitB } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    await createImplementedTransfer(request, {
      employeeId,
      toUnit: unitB,
      effectiveDate: isoDateOffsetUtc(0), // HOJE
      suffix
    });

    // Antes de efetivar: ainda na unidade de origem.
    expect(await employeeUnitId(request, employeeId)).toBe(unitA.id);

    // ===== 401 sem/errado segredo (nao efetiva) =====
    expect((await postApplyDue(request, null)).status()).toBe(401);
    expect((await postApplyDue(request, "segredo-errado")).status()).toBe(401);
    expect(await employeeUnitId(request, employeeId)).toBe(unitA.id);

    // ===== Run 1: efetiva (unidade muda para a nova) =====
    const run1 = await postApplyDue(request, CRON_SECRET);
    expect(run1.status()).toBe(200);
    expect(await employeeUnitId(request, employeeId)).toBe(unitB.id);

    // ===== Run 2: idempotente (unidade NAO muda de novo) =====
    const run2 = await postApplyDue(request, CRON_SECRET);
    expect(run2.status()).toBe(200);
    expect(await employeeUnitId(request, employeeId)).toBe(unitB.id);
  });

  test("transferencia com effective_date futura NAO e' efetivada", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA, unitB } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    await createImplementedTransfer(request, {
      employeeId,
      toUnit: unitB,
      effectiveDate: isoDateOffsetUtc(1), // AMANHA
      suffix
    });

    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);

    // Futura: o cadastro permanece na unidade de origem.
    expect(await employeeUnitId(request, employeeId)).toBe(unitA.id);
  });

  // Caso (e) — colaborador com desligamento VIGENTE antes da efetivacao: o efetivador PULA a
  // movimentacao (desligamento vence transferencia). O sinal de "desligado" vem da tabela
  // employee_terminations (o implement do desligamento NAO seta employees.deleted_at/status), entao
  // o setup usa a cadeia real de desligamento via API (draft -> checklist obrigatorio -> submit ->
  // approve -> implement) como super admin, SEM service_role.
  test("colaborador com desligamento vigente: cron PULA a aplicacao da movimentacao", async ({ request }) => {
    const suffix = runSuffix();
    const { unitA, unitB } = await resolveTwoUnits(request);

    const employeeId = await createEmployeeInUnit(request, unitA, e2eLabel("Colaborador"));
    await createImplementedTransfer(request, {
      employeeId,
      toUnit: unitB,
      effectiveDate: isoDateOffsetUtc(0), // HOJE
      suffix
    });
    // Desligamento vigente (hoje): vence a transferencia da mesma data.
    await createImplementedTermination(request, {
      employeeId,
      effectiveDate: isoDateOffsetUtc(0),
      suffix
    });

    expect(await employeeUnitId(request, employeeId)).toBe(unitA.id);

    const run = await postApplyDue(request, CRON_SECRET);
    expect(run.status()).toBe(200);
    const body = (await run.json()) as { ok: boolean; skippedTerminated: number };
    expect(body.ok).toBe(true);
    // skippedTerminated e' um contador GLOBAL (o efetivador varre todo o staging; pode haver residual
    // de outros runs/workers). Por isso >= 1, nao === 1. A assercao forte e' employee-especifica logo
    // abaixo: a unidade do colaborador NAO mudou -> a transferencia foi pulada pelo desligamento.
    expect(body.skippedTerminated).toBeGreaterThanOrEqual(1);
    expect(await employeeUnitId(request, employeeId)).toBe(unitA.id);
  });
});
