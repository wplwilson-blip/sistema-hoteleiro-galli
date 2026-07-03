import { expect, test, type APIRequestContext } from "@playwright/test";
import { authStatePath } from "./helpers/auth";

// Fase 3-C — comportamento (b): o perfil SUPER_ADMIN e' INTOCAVEL na rota de permissoes de perfil.
//
// Nivel API (HTTP puro via `request`), ator E2E_ADMIN (super admin). Sem UI, sem banco, sem
// service_role, sem fixture: o super admin PASSA o gate ADMIN:profiles.manage e bate DIRETO na
// regra do Super Admin (route.ts:248-250 no PUT, :370-372 no DELETE), que retorna 422.
//
// Plano: docs/codex/10-plano-specs-3c.md, secao "DECISAO: Opcao 2".
// (c) soft-delete e (d) userCount estao ADIADOS (exigem fixture de banco); nao entram aqui.

const PROFILES_URL = "/api/admin/permissions/profiles";
const SUPER_ADMIN_CODE = "SUPER_ADMIN"; // espelha SUPER_ADMIN_PROFILE_CODE (src/lib/auth/session.ts:9).
const BLOCK_MESSAGE = "O perfil Super Administrador nao pode ser editado."; // string real da rota.

// E2E_ADMIN e' super admin: passa o gate e alcanca a regra (b). storageState gravado pelo projeto "setup".
test.use({ storageState: authStatePath("E2E_ADMIN") });

type ProfilePermission = { code: string };
type ProfileRecord = { id: string; code: string; permissions: ProfilePermission[] };
type ProfilesResponse = { ok: boolean; profiles: ProfileRecord[] };

/** GET dos perfis (gate ADMIN:permissions.view, que E2E_ADMIN tem). Falha claro se nao-ok. */
async function fetchProfiles(request: APIRequestContext): Promise<ProfileRecord[]> {
  const response = await request.get(PROFILES_URL);
  expect(response.status(), `GET ${PROFILES_URL} deveria retornar 200`).toBe(200);
  const body = (await response.json()) as ProfilesResponse;
  expect(body.ok, "GET de perfis retornou ok=false").toBe(true);
  return body.profiles ?? [];
}

/** Localiza o perfil SUPER_ADMIN; falha com mensagem clara se ausente. */
function findSuperAdmin(profiles: ProfileRecord[]): ProfileRecord {
  const superAdmin = profiles.find((profile) => profile.code === SUPER_ADMIN_CODE);
  expect(
    superAdmin,
    `Perfil ${SUPER_ADMIN_CODE} nao encontrado no GET ${PROFILES_URL} (seed 070 deveria garanti-lo no staging).`
  ).toBeTruthy();
  return superAdmin as ProfileRecord;
}

/** Conjunto ordenado dos codigos de permissao efetivos do SUPER_ADMIN (para o diff "nada mudou"). */
async function superAdminPermissionCodes(request: APIRequestContext): Promise<string[]> {
  const superAdmin = findSuperAdmin(await fetchProfiles(request));
  return superAdmin.permissions.map((permission) => permission.code).sort();
}

test.describe("Fase 3-C (b): SUPER_ADMIN intocavel", () => {
  test("PUT e DELETE no perfil SUPER_ADMIN sao barrados com 422 (nao 403) e nada muda", async ({
    request
  }) => {
    // ===== Alvo + payload REAL (nao inventado) =====
    const profiles = await fetchProfiles(request);
    const superAdmin = findSuperAdmin(profiles);

    // Usa um permissionCode que o SUPER_ADMIN COMPROVADAMENTE possui hoje (vindo do proprio GET).
    // Assim o 422 so pode vir da regra do Super Admin — NUNCA de payload invalido/codigo desconhecido
    // (que tambem daria 422, mas de validacao/permissao inexistente). O uuid do perfil vem do GET.
    expect(
      superAdmin.permissions.length,
      `SUPER_ADMIN sem permissoes no GET — impossivel escolher um permissionCode real.`
    ).toBeGreaterThan(0);
    const permissionCode = superAdmin.permissions[0].code;
    const body = { profileId: superAdmin.id, permissionCode };

    // Snapshot ANTES (reforco "nada mudou").
    const before = await superAdminPermissionCodes(request);

    // ===== (b1) PUT — conceder/alterar permissao no SUPER_ADMIN =====
    const putResponse = await request.put(PROFILES_URL, { data: body });
    expect(putResponse.status(), "PUT no SUPER_ADMIN deveria ser barrado com 422").toBe(422);
    // NAO e' falha de gate: o super admin passa o gate; o bloqueio e' a regra especifica do Super Admin.
    expect(putResponse.status(), "PUT nao deveria ser 403 (ator passa o gate)").not.toBe(403);
    const putBody = (await putResponse.json()) as { ok: boolean; message?: string };
    expect(putBody.ok).toBe(false);
    expect(putBody.message).toBe(BLOCK_MESSAGE);

    // ===== (b2) DELETE — revogar permissao do SUPER_ADMIN =====
    const deleteResponse = await request.delete(PROFILES_URL, { data: body });
    expect(deleteResponse.status(), "DELETE no SUPER_ADMIN deveria ser barrado com 422").toBe(422);
    expect(deleteResponse.status(), "DELETE nao deveria ser 403 (ator passa o gate)").not.toBe(403);
    const deleteBody = (await deleteResponse.json()) as { ok: boolean; message?: string };
    expect(deleteBody.ok).toBe(false);
    expect(deleteBody.message).toBe(BLOCK_MESSAGE);

    // ===== Reforco "nada mudou" (best-effort HTTP) =====
    // Limitacao (conforme plano): o GET so expoe permissoes EFETIVAS (is_allowed=true, status=active,
    // deleted_at null). NAO enxerga soft-delete nem is_allowed=false. Ainda assim, QUALQUER mutacao
    // real no conjunto concedido (insert/soft-delete/flip) mudaria este conjunto e seria detectada.
    // A prova a nivel de linha (status/deleted_at/is_allowed) fica no bloco ADIADO (a), com service_role.
    const after = await superAdminPermissionCodes(request);
    expect(after, "As permissoes efetivas do SUPER_ADMIN nao deveriam mudar apos PUT/DELETE barrados").toEqual(
      before
    );
  });
});
