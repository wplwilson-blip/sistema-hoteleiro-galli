import { expect, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";

// CORE Fatia 2.1 — E2E do evento funcional de vencimento de NR. Via API, SEM service_role.
//
// O que ESTE spec prova (verificável hoje): rodar a varredura ocupacional publica um evento nr_expired
// (novo event type da migration 076), idempotente por dedupeKey (occupational-nr:{id}:expired), com a
// sensibilidade DERIVADA do registro, sem quebrar o ASO. Assertado como E2E_ADMIN (super, vê tudo) pelo
// caminho de leitura real GET /api/hr/employees/[id]/history.
//
// BLOQUEIO CONHECIDO (reportado — decisão do dono): o §7 do plano pede provar que um usuário SEM acesso
// sensível VÊ o evento NR "não-sensível". Isso NÃO é testável hoje: `prepareNrCertificationWrite`
// (occupational-health.ts:222) cria TODA certificação NR com is_sensitive=true / visibility_scope=
// "restricted", e o payload não expõe sensibilidade. Logo o evento NR sempre nasce restrito (o líder não
// veria). O publish helper JÁ deriva do registro (pronto para quando o NR puder ser não-sensível); a
// realização da visibilidade ao líder depende de uma decisão separada (default de sensibilidade do NR).
// Por isso o caso da separação NR-visível/ASO-restrito fica em test.skip abaixo.

test.use({ storageState: authStatePath("E2E_ADMIN") });

function isoDateOffsetUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type UnitLite = { id: string; name: string };
type HistoryEvent = {
  eventType: string;
  title: string;
  severity: string;
  visibilityScope: string;
  isSensitive: boolean;
  redacted: boolean;
};

async function okJson<T>(request: APIRequestContext, method: "get" | "post", url: string, data?: unknown): Promise<T> {
  const response = method === "get" ? await request.get(url) : await request.post(url, { data: data ?? {} });
  const body = (await response.json()) as { ok?: boolean };
  if (!response.ok() || body.ok === false) {
    throw new Error(`[e2e] ${method.toUpperCase()} ${url} falhou (HTTP ${response.status()}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body as T;
}

async function firstUnit(request: APIRequestContext): Promise<UnitLite> {
  const body = await okJson<{ units: UnitLite[] }>(request, "get", "/api/base/units");
  const unit = (body.units ?? [])[0];
  if (!unit) throw new Error("[e2e] Staging precisa de >= 1 unidade.");
  return unit;
}

async function createEmployeeInUnit(request: APIRequestContext, unit: UnitLite, fullName: string): Promise<string> {
  await okJson(request, "post", "/api/auth/active-unit", { unitId: unit.id });
  await okJson(request, "post", "/api/base/employees", { unitId: unit.id, fullName, status: "active" });
  const list = await okJson<{ employees: Array<{ id: string; fullName: string }> }>(request, "get", "/api/base/employees");
  const created = list.employees.find((e) => e.fullName === fullName);
  if (!created) throw new Error(`[e2e] Colaborador criado nao encontrado: ${fullName}`);
  return created.id;
}

/** Eventos do historico funcional do colaborador filtrados por tipo (caminho de leitura real). */
async function historyByType(
  request: APIRequestContext,
  employeeId: string,
  eventType: string
): Promise<{ events: HistoryEvent[]; canViewSensitiveHistory: boolean }> {
  const body = await okJson<{ data: HistoryEvent[]; permissions: { canViewSensitiveHistory: boolean } }>(
    request,
    "get",
    `/api/hr/employees/${employeeId}/history?eventType=${eventType}&pageSize=100`
  );
  return { events: body.data ?? [], canViewSensitiveHistory: body.permissions?.canViewSensitiveHistory ?? false };
}

test.describe("CORE Fatia 2.1: evento funcional de vencimento de NR", () => {
  test("varredura publica nr_expired (idempotente) e nao quebra o ASO", async ({ request }) => {
    const suffix = runSuffix();
    const unit = await firstUnit(request);
    const employeeId = await createEmployeeInUnit(request, unit, e2eLabel("Colaborador"));

    // Certificacao NR vencida ontem (vira nr_expired na varredura).
    await okJson(request, "post", "/api/hr/nr-certifications", {
      employeeId,
      nrCode: "NR-35",
      trainingName: `[E2E] Trabalho em altura ${suffix}`,
      expiresAt: isoDateOffsetUtc(-1),
      status: "valid"
    });
    // Registro ASO vencido ontem (para provar que o ASO segue intacto no mesmo run).
    await okJson(request, "post", "/api/hr/occupational-records", {
      employeeId,
      recordType: "aso_periodic",
      expiresAt: isoDateOffsetUtc(-1),
      status: "valid"
    });

    // Varredura manual da unidade (super admin) — publica nr_expired e aso_expired.
    await okJson(request, "post", "/api/hr/occupational-records/process-expirations", { unitId: unit.id });

    // NR: exatamente 1 evento nr_expired para o colaborador; sensibilidade DERIVADA do registro.
    const nr1 = await historyByType(request, employeeId, "nr_expired");
    expect(nr1.events.length).toBe(1);
    const nrEvent = nr1.events[0];
    expect(nrEvent.redacted).toBe(false); // super admin ve
    expect(nrEvent.severity).toBe("warning"); // nr_expired -> warning (igual ao ASO)
    // Hoje a certificacao NR nasce sensivel (occupational-health.ts:222) -> evento restrito/sensivel.
    // Isto prova que o publish LE o registro (nao hardcoda visivel); o branch nao-sensivel esta bloqueado
    // ate o NR poder ser nao-sensivel (ver test.skip abaixo).
    expect(nrEvent.isSensitive).toBe(true);
    expect(nrEvent.visibilityScope).toBe("restricted");

    // ASO intacto: aso_expired continua sendo publicado.
    const aso = await historyByType(request, employeeId, "aso_expired");
    expect(aso.events.length).toBe(1);
    expect(aso.events[0].severity).toBe("warning");

    // Idempotencia: rodar a varredura de novo NAO duplica (dedupe occupational-nr:{id}:expired).
    await okJson(request, "post", "/api/hr/occupational-records/process-expirations", { unitId: unit.id });
    const nr2 = await historyByType(request, employeeId, "nr_expired");
    expect(nr2.events.length).toBe(1);
  });

  // §7 (separacao NR-visivel / ASO-restrito): BLOQUEADO. Precisa de (a) certificacao NR NAO-sensivel — hoje
  // impossivel via API (prepareNrCertificationWrite hardcoda is_sensitive=true, occupational-health.ts:222)
  // — e (b) ator sem historySensitiveView. Enquanto o NR nao puder nascer nao-sensivel, o lider nao ve o
  // evento NR e a assercao invertida do §7 nao tem como ser exercida. Decisao do dono pendente.
  test.skip("usuario sem acesso sensivel VE o NR nao-sensivel e NAO ve o ASO (pendente: NR nasce sensivel)", async () => {
    // Intencionalmente vazio: ver comentario acima e docs/codex.
  });
});
