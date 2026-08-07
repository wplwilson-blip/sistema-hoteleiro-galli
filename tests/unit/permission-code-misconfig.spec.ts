import { expect, test } from "@playwright/test";

import {
  PermissionAuthorizationError,
  getAccessibleUnitIdsForPermission
} from "../../src/lib/auth/permissions";

// Runner puro (@playwright/test): sem browser, sem rede, sem Supabase real.
// Cobre o achado #5 (plano 48): code de permissao inexistente/inativo virava 403 silencioso.
//
// Decisao de produto aprovada:
//   - code ausente/inativo no catalogo => MISCONFIG => log observavel + 500;
//   - code valido e usuario sem grant  => negacao legitima => 403 (hasPermission:false);
//   - super admin                      => bypass intacto (nem consulta `permissions`).

const UNIT_A = "11111111-1111-1111-1111-111111111111";
const PERMISSION_ID = "22222222-2222-2222-2222-222222222222";
const PROFILE_ID = "33333333-3333-3333-3333-333333333333";

type TableResult = { data: unknown[]; error: unknown };

// Dublê encadeavel do query builder do supabase-js: qualquer metodo devolve o proprio
// builder; o `await` resolve a fixture da tabela.
//
// As fixtures sao FILAS por tabela, consumidas na ordem das chamadas a `from()`. Isso e'
// necessario porque `user_unit_links` e' consultada DUAS vezes por resolucao, com filtros
// diferentes e significados opostos: primeiro por userHasActiveSuperAdminProfile (perfil
// SUPER_ADMIN) e depois por getActiveUserUnitLinks (todos os vinculos). O dublê nao aplica
// filtros, entao um valor unico por tabela faria a primeira consulta responder como se o
// usuario fosse super admin. A fila resolve isso sem simular o WHERE.
// Fila esgotada => repete o ultimo valor.
function makeSupabaseDouble(fixtures: Record<string, TableResult | TableResult[]>) {
  const tablesQueried: string[] = [];
  const cursors: Record<string, number> = {};

  const nextResult = (table: string): TableResult => {
    const fixture = fixtures[table];
    if (!fixture) return { data: [], error: null };
    if (!Array.isArray(fixture)) return fixture;
    const index = Math.min(cursors[table] ?? 0, fixture.length - 1);
    cursors[table] = (cursors[table] ?? 0) + 1;
    return fixture[index] ?? { data: [], error: null };
  };

  const builder = (result: TableResult): any =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: TableResult) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(result).then(resolve, reject);
          }
          return () => builder(result);
        }
      }
    );

  return {
    supabase: {
      from(table: string) {
        tablesQueried.push(table);
        return builder(nextResult(table));
      }
    } as any,
    tablesQueried
  };
}

function makeSession(profileCode: string) {
  return {
    user: { id: "44444444-4444-4444-4444-444444444444" },
    profile: { code: profileCode },
    activeUnit: { id: UNIT_A }
  } as any;
}

const NO_ROWS: TableResult = { data: [], error: null };

// Usuario comum (NAO super admin) com vinculo ativo na unidade A, perfil que concede a
// permissao. A fila de `user_unit_links` e' [super-check vazio, vinculos reais].
function linkedUserFixtures(overrides: Partial<Record<string, TableResult | TableResult[]>> = {}) {
  return {
    user_unit_links: [
      NO_ROWS, // userHasActiveSuperAdminProfile -> nao e' super admin
      {
        data: [
          {
            unit_id: UNIT_A,
            access_profile_id: PROFILE_ID,
            units: { id: UNIT_A, status: "active" },
            access_profiles: { id: PROFILE_ID, status: "active", code: "HR_OPERATOR" }
          }
        ],
        error: null
      }
    ],
    permissions: { data: [{ id: PERMISSION_ID }], error: null },
    profile_permissions: { data: [{ access_profile_id: PROFILE_ID }], error: null },
    user_permission_overrides: NO_ROWS,
    ...overrides
  } as Record<string, TableResult | TableResult[]>;
}

// ---------------------------------------------------------------------------
// 1. MISCONFIG — code ausente no catalogo
// ---------------------------------------------------------------------------

test("misconfig: code ausente no catalogo rejeita com 500 (nao 403)", async () => {
  // `permissions` vazia = getPermissionId -> undefined. Antes do fix isto resolvia com
  // hasPermission:false, virando 403 silencioso.
  const { supabase } = makeSupabaseDouble(linkedUserFixtures({ permissions: NO_ROWS }));

  const error = await getAccessibleUnitIdsForPermission(
    supabase,
    makeSession("HR_OPERATOR"),
    "HR:code.inexistente"
  ).then(
    (value) => ({ resolved: value }),
    (err) => err
  );

  expect(error, "deveria rejeitar, nao resolver").toBeInstanceOf(PermissionAuthorizationError);
  expect((error as PermissionAuthorizationError).status).toBe(500);
});

test("misconfig: registra log observavel com stage e code", async () => {
  const { supabase } = makeSupabaseDouble(linkedUserFixtures({ permissions: NO_ROWS }));
  const logged: Array<{ stage: string; error: { name?: string; message?: string; code?: string } }> = [];

  await getAccessibleUnitIdsForPermission(supabase, makeSession("HR_OPERATOR"), "HR:code.inexistente", {
    logError: (stage, err) => logged.push({ stage, error: err })
  }).catch(() => undefined);

  expect(logged).toHaveLength(1);
  expect(logged[0].stage).toBe("permission_code_not_found");
  // O code precisa estar no log — e' o unico jeito de descobrir QUAL constante quebrou.
  expect(logged[0].error.code).toBe("HR:code.inexistente");
  expect(logged[0].error.message).toContain("HR:code.inexistente");
  expect(logged[0].error.name).toBe("PermissionMisconfiguration");
});

test("misconfig: mensagem ao cliente e' generica (nao vaza o code)", async () => {
  const { supabase } = makeSupabaseDouble(linkedUserFixtures({ permissions: NO_ROWS }));

  const error: any = await getAccessibleUnitIdsForPermission(
    supabase,
    makeSession("HR_OPERATOR"),
    "HR:code.inexistente",
    { validationErrorMessage: "Nao foi possivel validar as permissoes de RH." }
  ).catch((err) => err);

  expect(error.message).toBe("Nao foi possivel validar as permissoes de RH.");
  expect(error.message).not.toContain("HR:code.inexistente");
});

// Code inativo/soft-deletado chega ao mesmo `undefined` (getPermissionId filtra
// status='active' e deleted_at is null na propria query) — mesmo tratamento.
test("misconfig: code inativo no catalogo tambem e' 500", async () => {
  const { supabase } = makeSupabaseDouble(linkedUserFixtures({ permissions: NO_ROWS }));

  const error: any = await getAccessibleUnitIdsForPermission(
    supabase,
    makeSession("HR_OPERATOR"),
    "HR:documents.manage"
  ).catch((err) => err);

  expect(error).toBeInstanceOf(PermissionAuthorizationError);
  expect(error.status).toBe(500);
});

// ---------------------------------------------------------------------------
// 2. NEGACAO LEGITIMA — inalterada
// ---------------------------------------------------------------------------

test("negacao legitima: code existe e usuario sem grant -> hasPermission:false (403), sem lancar", async () => {
  // `permissions` resolve, mas o perfil do usuario nao tem a permissao concedida.
  const { supabase } = makeSupabaseDouble(linkedUserFixtures({ profile_permissions: NO_ROWS }));
  const logged: string[] = [];

  const access = await getAccessibleUnitIdsForPermission(supabase, makeSession("HR_OPERATOR"), "HR:documents.manage", {
    logError: (stage) => logged.push(stage)
  });

  expect(access.hasPermission).toBe(false);
  expect(access.hasPermissionInScope).toBe(false);
  expect(access.accessibleUnitIds).toEqual([]);
  expect(access.isSuperAdmin).toBe(false);
  // Negacao legitima NAO e' misconfiguracao: nao pode poluir o log de erro.
  expect(logged).toEqual([]);
});

test("negacao legitima: usuario sem vinculo nenhum -> hasPermission:false, sem lancar", async () => {
  const { supabase } = makeSupabaseDouble(
    linkedUserFixtures({ user_unit_links: [NO_ROWS, NO_ROWS], profile_permissions: NO_ROWS })
  );

  const access = await getAccessibleUnitIdsForPermission(supabase, makeSession("HR_OPERATOR"), "HR:documents.manage");

  expect(access.hasPermission).toBe(false);
});

test("caminho feliz: code valido + grant -> hasPermission:true", async () => {
  const { supabase } = makeSupabaseDouble(linkedUserFixtures());

  const access = await getAccessibleUnitIdsForPermission(supabase, makeSession("HR_OPERATOR"), "HR:documents.manage");

  expect(access.hasPermission).toBe(true);
  expect(access.accessibleUnitIds).toEqual([UNIT_A]);
});

// ---------------------------------------------------------------------------
// 3. SUPER ADMIN — bypass intacto
// ---------------------------------------------------------------------------

test("super admin por codigo de sessao: resolve sem consultar `permissions`", async () => {
  const { supabase, tablesQueried } = makeSupabaseDouble({
    units: { data: [{ id: UNIT_A }, { id: "outra" }], error: null }
  });

  const access = await getAccessibleUnitIdsForPermission(supabase, makeSession("SUPER_ADMIN"), "HR:code.inexistente");

  expect(access.isSuperAdmin).toBe(true);
  expect(access.hasPermission).toBe(true);
  expect(access.accessibleUnitIds).toEqual([UNIT_A, "outra"]);
  // Ancora: o ramo super admin nem chega ao getPermissionId. Um code inexistente
  // NAO derruba o super admin.
  expect(tablesQueried).not.toContain("permissions");
});

test("super admin por perfil vinculado: resolve sem consultar `permissions`", async () => {
  const { supabase, tablesQueried } = makeSupabaseDouble({
    user_unit_links: { data: [{ id: "link-1", access_profiles: { code: "SUPER_ADMIN" } }], error: null },
    units: { data: [{ id: UNIT_A }], error: null }
  });

  const access = await getAccessibleUnitIdsForPermission(supabase, makeSession("HR_OPERATOR"), "HR:code.inexistente");

  expect(access.isSuperAdmin).toBe(true);
  expect(access.hasPermission).toBe(true);
  expect(tablesQueried).not.toContain("permissions");
});
