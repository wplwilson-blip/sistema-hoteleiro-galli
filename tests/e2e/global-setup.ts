import type { FullConfig } from "@playwright/test";

// GUARD ANTI-PRODUCAO (critico).
// Aborta TODA a suite E2E se o alvo (PLAYWRIGHT_BASE_URL) nao for staging local.
// E2E = Next dev local apontando para o Supabase de STAGING. NUNCA roda contra producao.
//
// Allowlist padrao: apenas localhost / 127.0.0.1 / ::1.
// Para estender (ex.: host de container local), use E2E_ALLOWED_HOSTS (lista por virgula).

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  let host: string;
  try {
    host = new URL(baseURL).hostname;
  } catch {
    throw new Error(`[e2e][guard] PLAYWRIGHT_BASE_URL invalida: ${baseURL}`);
  }

  const extra = (process.env.E2E_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ALLOWED_HOSTS, ...extra]);

  if (!allowed.has(host)) {
    throw new Error(
      `[e2e][guard] ABORTADO: host "${host}" (de PLAYWRIGHT_BASE_URL=${baseURL}) nao esta na ` +
        `allowlist de staging local [${Array.from(allowed).join(", ")}]. ` +
        "E2E nunca roda contra producao. Para liberar um host local, use E2E_ALLOWED_HOSTS."
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[e2e][guard] OK: alvo permitido -> ${baseURL}`);
}
