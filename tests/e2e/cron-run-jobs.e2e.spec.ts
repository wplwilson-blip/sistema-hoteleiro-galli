import { expect, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";

// CORE Fatia 2 — E2E do runner de jobs (POST /api/cron/run-jobs) + prova de que o disparo MANUAL das
// varreduras continua restrito. 100% via API, SEM service_role.
//
// Runner: gated por CRON_SECRET (requireCronAuth). Se o segredo faltar -> test.skip nesse bloco.
// Asserção via caminho de leitura real GET /api/hr/background-jobs (jobs do dia por job_type).
//
// LIMITACAO: applied/estado de dominio nao e' reexposto aqui; a idempotencia diaria e' afirmada pela
// contagem de linhas de job do dia (pre-check por correlation_id impede nova linha na 2a run).

const RUN_JOBS_URL = "/api/cron/run-jobs";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
// UUID valido mas garantidamente FORA do escopo de qualquer ator (nao e' unidade real do staging).
const FOREIGN_UNIT_ID = "00000000-0000-4000-8000-000000000000";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function okJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  const body = (await response.json()) as { ok?: boolean };
  if (!response.ok()) {
    throw new Error(`[e2e] GET ${url} falhou (HTTP ${response.status()}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as T;
}

/** Conta os jobs do DIA (correlation_id '{tipo}:{unit}:{yyyy-mm-dd}') para um job_type. */
async function countTodayJobs(request: APIRequestContext, jobType: string): Promise<number> {
  const body = await okJson<{ data: Array<{ job_type: string; correlation_id: string | null }> }>(
    request,
    `/api/hr/background-jobs?job_type=${jobType}`
  );
  const suffix = `:${isoToday()}`;
  return (body.data ?? []).filter((j) => j.job_type === jobType && (j.correlation_id ?? "").endsWith(suffix)).length;
}

function postRunJobs(request: APIRequestContext, token: string | null) {
  return request.post(RUN_JOBS_URL, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

test.describe("CORE Fatia 2: runner de jobs (cron)", () => {
  test.use({ storageState: authStatePath("E2E_ADMIN") });
  test.skip(!CRON_SECRET, "CRON_SECRET ausente no .env.e2e.local — runner nao testavel via API.");

  test("runner processa via segredo, e' barrado sem segredo e e' idempotente no dia", async ({ request }) => {
    // Barrado sem/errado segredo.
    expect((await postRunJobs(request, null)).status()).toBe(401);
    expect((await postRunJobs(request, "segredo-errado")).status()).toBe(401);

    // Run 1.
    const run1 = await postRunJobs(request, CRON_SECRET);
    expect(run1.status()).toBe(200);
    const body1 = (await run1.json()) as { ok: boolean; failed: number };
    expect(body1.ok).toBe(true);
    expect(body1.failed).toBe(0); // criterio de aceite: workflow falha se failed > 0

    const trainingsAfter1 = await countTodayJobs(request, "training_expiration_scan");
    const occupationalAfter1 = await countTodayJobs(request, "occupational_expiration_scan");

    // Run 2 — pre-check por correlation_id deve impedir novas linhas do dia.
    const run2 = await postRunJobs(request, CRON_SECRET);
    expect(run2.status()).toBe(200);
    const body2 = (await run2.json()) as { ok: boolean; failed: number };
    expect(body2.ok).toBe(true);
    expect(body2.failed).toBe(0);

    const trainingsAfter2 = await countTodayJobs(request, "training_expiration_scan");
    const occupationalAfter2 = await countTodayJobs(request, "occupational_expiration_scan");

    // Idempotencia diaria: a 2a run NAO cria linha nova (mesmo correlation_id do dia).
    expect(trainingsAfter2).toBe(trainingsAfter1);
    expect(occupationalAfter2).toBe(occupationalAfter1);
  });
});

test.describe("CORE Fatia 2: disparo manual continua restrito", () => {
  test.use({ storageState: authStatePath("E2E_MULTI") });

  test("nao-admin: varredura manual fora do escopo NAO processa (403 ou 404)", async ({ request }) => {
    // Unidade fora do escopo do ator: a rota barra ANTES do handler (403 sem permissao de verify, ou 404
    // por unidade fora do escopo). Nunca 200.
    const trainings = await request.post("/api/hr/trainings/process-expirations", { data: { unitId: FOREIGN_UNIT_ID } });
    expect([403, 404]).toContain(trainings.status());

    const occupational = await request.post("/api/hr/occupational-records/process-expirations", { data: { unitId: FOREIGN_UNIT_ID } });
    expect([403, 404]).toContain(occupational.status());
  });
});
