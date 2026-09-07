import { request as playwrightRequest } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Helpers de autenticacao para a suite E2E (tests/e2e).
//
// Login PROGRAMATICO: faz POST em /api/auth/login com username+senha vindos de
// variaveis de ambiente (NUNCA hardcoded/commitado) e captura os cookies de sessao
// num storageState por usuario. Reaproveita o fluxo real de auth, sem UI.
// O login manual headed (tests/screenshots/auth.manual.spec.ts) permanece intacto.
//
// Variaveis de ambiente exigidas (ver .env.e2e.example):
//   E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD  -> super admin existente
//   E2E_MULTI_USERNAME / E2E_MULTI_PASSWORD  -> nao-super com acesso as 2 unidades
//   E2E_GOVERNANCA_USERNAME / _PASSWORD      -> perfil LIDER_GOVERNANCA (plano 70)
//   E2E_MANUTENCAO_USERNAME / _PASSWORD      -> perfil LIDER_MANUTENCAO (plano 70)
// Se faltar alguma, o helper FALHA com mensagem clara (nunca silencioso).

export type E2EUserKey =
  | "E2E_ADMIN"
  | "E2E_MULTI"
  | "E2E_GOVERNANCA"
  | "E2E_MANUTENCAO"
  /** Plano 78: perfil RECEPCAO. So' existe depois da migration 093 aplicada. */
  | "E2E_RECEPCAO";

export const E2E_USERS: readonly E2EUserKey[] = [
  "E2E_ADMIN",
  "E2E_MULTI",
  "E2E_GOVERNANCA",
  "E2E_MANUTENCAO",
  "E2E_RECEPCAO"
];

/**
 * O ator esta' configurado no ambiente?
 *
 * Existe por causa da ORDEM: a suite da fatia 78 e' escrita ANTES de a migration 093 ser
 * aplicada e antes de o usuario de recepcao existir no banco de staging. Sem esta funcao, os
 * casos novos falhariam por falta de credencial -- uma falha que nao diz nada sobre o produto
 * e que ensina a suite a ficar vermelha por motivo errado.
 *
 * Com ela, os casos PULAM COM MOTIVO ate' o ator existir, e passam a rodar sozinhos no dia em
 * que as duas variaveis forem definidas. Pular com motivo e' honesto; passar sem executar nao.
 */
export function isUserConfigured(user: E2EUserKey): boolean {
  return Boolean(process.env[`${user}_USERNAME`]?.trim() && process.env[`${user}_PASSWORD`]?.trim());
}

const AUTH_DIR = path.join("playwright", ".auth");

/** Caminho do storageState (gitignored) para um usuario de teste. */
export function authStatePath(user: E2EUserKey): string {
  return path.join(AUTH_DIR, `${user.toLowerCase()}.json`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `[e2e] Variavel de ambiente ausente: ${name}. ` +
        "Defina-a no ambiente local (NUNCA commitar). Veja .env.e2e.example."
    );
  }
  return value;
}

/** Le username+senha do usuario a partir do ambiente. */
export function getCredentials(user: E2EUserKey): { username: string; password: string } {
  return {
    username: requireEnv(`${user}_USERNAME`),
    password: requireEnv(`${user}_PASSWORD`)
  };
}

// Espelha normalizeStoredCookieValues de tests/screenshots/auth.manual.spec.ts:
// cookies de auth do Supabase podem vir URL-encoded; o Playwright precisa do valor cru.
function normalizeStoredCookieValues(statePath: string): void {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
    cookies?: Array<{ value?: string }>;
  };

  for (const cookie of state.cookies ?? []) {
    if (typeof cookie.value === "string" && cookie.value.startsWith("%")) {
      cookie.value = decodeURIComponent(cookie.value);
    }
  }

  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Loga programaticamente o usuario e grava o storageState (cookies de sessao).
 * Retorna o caminho do arquivo gerado. Falha com mensagem clara se o login nao
 * for bem-sucedido (credenciais/permissoes/env).
 */
export async function createAuthState(user: E2EUserKey, baseURL: string): Promise<string> {
  const { username, password } = getCredentials(user);

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const statePath = authStatePath(user);

  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await ctx.post("/api/auth/login", {
      data: { username, password },
      headers: { "content-type": "application/json" }
    });

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `[e2e] Login programatico falhou para ${user} (HTTP ${response.status()}). ` +
          "Verifique credenciais/permissoes/env e se o usuario existe no STAGING. " +
          `Resposta: ${body.slice(0, 300)}`
      );
    }

    await ctx.storageState({ path: statePath });
  } finally {
    await ctx.dispose();
  }

  normalizeStoredCookieValues(statePath);
  return statePath;
}
