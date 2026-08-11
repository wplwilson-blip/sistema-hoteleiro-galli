import { expect, test } from "@playwright/test";

import { getAccessibleUnitIdsForPermission } from "../../src/lib/auth/permissions";
import type { SessionContext } from "../../src/lib/auth/types";

// Runner puro. Cobre o achado #9 (plano 53, Fatia A): memoizacao por-request das folhas
// invariantes do resolver de permissao.
//
// A GARANTIA que estes testes existem para dar e' EQUIVALENCIA: o resultado de autorizacao
// tem de ser byte a byte o mesmo com e sem cache. O baseline "sem cache" e' obtido passando
// um objeto SessionContext NOVO a cada resolucao — o que desliga o cache por construcao,
// ja que a chave e' a identidade do objeto. Isso reproduz exatamente o comportamento
// anterior sem precisar manter a versao antiga do codigo por perto.

type QueryLog = string[];

// Duplo de supabase encadeavel. Registra CADA consulta com um rotulo preciso e devolve a
// fixture certa. Precisa olhar o `select`: as duas consultas do resolver em user_unit_links
// (sonda de super admin e links ativos) sao na MESMA tabela, e um duplo que so' olhasse o
// nome da tabela devolveria a mesma coisa para as duas — foi o que mascarou a primeira
// versao deste teste, transformando todo usuario em super admin.
type Fixtures = {
  superCheck?: unknown[];
  links?: unknown[];
  permissions?: unknown[];
  profilePermissions?: unknown[];
  overrides?: unknown[];
  units?: unknown[];
  failOn?: string;
};

function rotulo(table: string, select: string): string {
  if (table === "user_unit_links") {
    return select.includes("access_profiles!inner(code)") && !select.includes("unit_id")
      ? "superCheck"
      : "links";
  }
  if (table === "permissions") return "permissions";
  if (table === "profile_permissions") return "profilePermissions";
  if (table === "user_permission_overrides") return "overrides";
  if (table === "units") return "units";
  return table;
}

function makeSupabase(fixtures: Fixtures, log: QueryLog) {
  return {
    from(table: string): any {
      let label = table;

      const chain: any = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              const failed = fixtures.failOn && fixtures.failOn === label;
              const data = failed ? null : ((fixtures as any)[label] ?? []);
              const error = failed ? { message: "boom", name: "PostgrestError" } : null;
              log.push(label);
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve({ data, error }).then(resolve, reject);
            }

            if (prop === "select") {
              return (arg: string) => {
                label = rotulo(table, arg ?? "");
                return chain;
              };
            }

            return () => chain;
          }
        }
      );

      return chain;
    }
  } as any;
}

const UNIT_A = "unit-a";
const UNIT_B = "unit-b";
const PROFILE = "profile-1";

// Fabrica: cada chamada devolve um OBJETO NOVO. Passar objetos distintos = sem cache.
function makeSession(): SessionContext {
  return {
    user: { id: "user-1", name: "Ana", username: "ana" },
    profile: { id: PROFILE, name: "Gerente", code: "DEPARTMENT_MANAGER" },
    units: [{ id: UNIT_A }, { id: UNIT_B }],
    activeUnit: { id: UNIT_A },
    permissions: []
  } as unknown as SessionContext;
}

const NAO_SUPER: Fixtures = {
  superCheck: [], // nao e' super admin
  links: [
    { unit_id: UNIT_A, access_profile_id: PROFILE, access_profiles: { code: "DEPARTMENT_MANAGER" } },
    { unit_id: UNIT_B, access_profile_id: PROFILE, access_profiles: { code: "DEPARTMENT_MANAGER" } }
  ],
  permissions: [{ id: "perm-1" }],
  profilePermissions: [{ access_profile_id: PROFILE }],
  overrides: [],
  units: [{ id: UNIT_A }, { id: UNIT_B }]
};

const CODES = [
  "HR:employees.sensitive.view", "HR:documents.view", "HR:documents.manage",
  "HR:documents.sensitive.view", "HR:documents.verify", "HR:history.view",
  "HR:history.sensitive.view", "HR:movements.view", "HR:movements.sensitive.view",
  "HR:trainings.view", "HR:trainings.sensitive.view", "HR:occupational.view",
  "HR:occupational.sensitive.view", "HR:conduct.view", "HR:conduct.sensitive.view",
  "HR:terminations.view", "HR:terminations.sensitive.view"
];

// Executa N resolucoes. `sharedSession` = uma sessao para todas (cache ligado);
// caso contrario, uma sessao nova por resolucao (cache desligado = comportamento anterior).
async function resolveAll(fixtures: Fixtures, sharedSession: boolean) {
  const log: QueryLog = [];
  const supabase = makeSupabase(fixtures, log);
  const shared = makeSession();
  const results = [];

  for (const code of CODES) {
    results.push(await getAccessibleUnitIdsForPermission(supabase, sharedSession ? shared : makeSession(), code));
  }

  return { results, log };
}

function normalize(r: any) {
  return {
    isSuperAdmin: r.isSuperAdmin,
    accessibleUnitIds: [...r.accessibleUnitIds].sort(),
    hasPermission: r.hasPermission,
    hasPermissionInScope: r.hasPermissionInScope
  };
}

// ------------------------------------------------------------------ EQUIVALENCIA

test("equivalencia: resultado identico com e sem cache (nao-super, 17 codes)", async () => {
  const semCache = await resolveAll(NAO_SUPER, false);
  const comCache = await resolveAll(NAO_SUPER, true);

  expect(comCache.results.map(normalize)).toEqual(semCache.results.map(normalize));
});

test("equivalencia: super admin por perfil — resultado identico", async () => {
  const fixtures: Fixtures = { ...NAO_SUPER, superCheck: [{ id: "link-super" }] };

  const semCache = await resolveAll(fixtures, false);
  const comCache = await resolveAll(fixtures, true);

  expect(comCache.results.map(normalize)).toEqual(semCache.results.map(normalize));
  expect(comCache.results.every((r) => r.isSuperAdmin)).toBe(true);
});

test("equivalencia: usuario sem grant — hasPermission:false preservado", async () => {
  const fixtures: Fixtures = { ...NAO_SUPER, profilePermissions: [] };

  const semCache = await resolveAll(fixtures, false);
  const comCache = await resolveAll(fixtures, true);

  expect(comCache.results.map(normalize)).toEqual(semCache.results.map(normalize));
  expect(comCache.results.every((r) => r.hasPermission === false)).toBe(true);
});

test("equivalencia: override de deny — resultado identico", async () => {
  const fixtures: Fixtures = { ...NAO_SUPER, overrides: [{ unit_id: UNIT_B, is_allowed: false }] };

  const semCache = await resolveAll(fixtures, false);
  const comCache = await resolveAll(fixtures, true);

  expect(comCache.results.map(normalize)).toEqual(semCache.results.map(normalize));
  expect(comCache.results.every((r) => r.accessibleUnitIds.join() === UNIT_A)).toBe(true);
});

test("equivalencia: override de allow global — resultado identico", async () => {
  const fixtures: Fixtures = { ...NAO_SUPER, profilePermissions: [], overrides: [{ unit_id: null, is_allowed: true }] };

  const semCache = await resolveAll(fixtures, false);
  const comCache = await resolveAll(fixtures, true);

  expect(comCache.results.map(normalize)).toEqual(semCache.results.map(normalize));
});

// ------------------------------------------------------------------ CONTAGEM DE QUERIES

test("contagem: mesma sessao deduplica as folhas invariantes", async () => {
  const semCache = await resolveAll(NAO_SUPER, false);
  const comCache = await resolveAll(NAO_SUPER, true);

  const conta = (log: QueryLog, rot: string) => log.filter((t) => t === rot).length;
  const n = CODES.length;

  // Sem cache: as duas consultas em user_unit_links rodam a cada resolucao.
  expect(conta(semCache.log, "superCheck")).toBe(n);
  expect(conta(semCache.log, "links")).toBe(n);
  expect(semCache.log.length).toBe(n * 5);

  // Com cache: super-check 1x + links 1x no request inteiro.
  expect(conta(comCache.log, "superCheck")).toBe(1);
  expect(conta(comCache.log, "links")).toBe(1);
  // As folhas que variam com o code continuam por resolucao.
  expect(conta(comCache.log, "permissions")).toBe(n);
  expect(conta(comCache.log, "profilePermissions")).toBe(n);
  expect(conta(comCache.log, "overrides")).toBe(n);
  expect(comCache.log.length).toBe(2 + n * 3);

  console.log(`  queries nao-super: ${semCache.log.length} -> ${comCache.log.length}`);
});

test("contagem: super admin por perfil colapsa para 2 queries", async () => {
  const fixtures: Fixtures = { ...NAO_SUPER, superCheck: [{ id: "link-super" }] };

  const semCache = await resolveAll(fixtures, false);
  const comCache = await resolveAll(fixtures, true);

  expect(semCache.log.length).toBe(CODES.length * 2); // super-check + units, por resolucao
  expect(comCache.log.length).toBe(2); // super-check 1x + units 1x

  console.log(`  queries super admin: ${semCache.log.length} -> ${comCache.log.length}`);
});

// ------------------------------------------------------------------ ESCOPO DO CACHE

test("escopo: sessao NOVA nao le o cache da anterior (isolamento entre requests)", async () => {
  const log: QueryLog = [];
  const supabase = makeSupabase(NAO_SUPER, log);

  const sessaoRequest1 = makeSession();
  await getAccessibleUnitIdsForPermission(supabase, sessaoRequest1, CODES[0]);
  const aposRequest1 = log.length;

  await getAccessibleUnitIdsForPermission(supabase, sessaoRequest1, CODES[1]);
  const aposSegundaNaMesmaSessao = log.length;

  // Objeto NOVO = outro request. Tem de consultar tudo de novo.
  const sessaoRequest2 = makeSession();
  await getAccessibleUnitIdsForPermission(supabase, sessaoRequest2, CODES[0]);
  const aposRequest2 = log.length;

  expect(aposRequest1).toBe(5); // primeira resolucao: 5 consultas
  expect(aposSegundaNaMesmaSessao - aposRequest1).toBe(3); // cache: so' as 3 que variam
  expect(aposRequest2 - aposSegundaNaMesmaSessao).toBe(5); // sessao nova: 5 de novo
});

test("escopo: sessoes do MESMO usuario em objetos distintos nao compartilham cache", async () => {
  const log: QueryLog = [];
  const supabase = makeSupabase(NAO_SUPER, log);

  // Mesmo user.id, objetos diferentes — e' o cenario de dois requests do mesmo usuario.
  const a = makeSession();
  const b = makeSession();
  expect(a.user.id).toBe(b.user.id);
  expect(a).not.toBe(b);

  await getAccessibleUnitIdsForPermission(supabase, a, CODES[0]);
  await getAccessibleUnitIdsForPermission(supabase, b, CODES[0]);

  // Se houvesse compartilhamento por userId, seriam 5 + 3. Sao 5 + 5.
  expect(log.length).toBe(10);
});

test("escopo: erro NAO fica cacheado (proxima resolucao volta a consultar)", async () => {
  const log: QueryLog = [];
  const falha: Fixtures = { ...NAO_SUPER, failOn: "links" };
  const supabase = makeSupabase(falha, log);
  const session = makeSession();

  await expect(getAccessibleUnitIdsForPermission(supabase, session, CODES[0])).rejects.toThrow();
  const aposPrimeira = log.length;

  await expect(getAccessibleUnitIdsForPermission(supabase, session, CODES[0])).rejects.toThrow();

  // A folha que falhou foi consultada de novo — nao ficou memoizada.
  expect(log.length).toBeGreaterThan(aposPrimeira);
});
