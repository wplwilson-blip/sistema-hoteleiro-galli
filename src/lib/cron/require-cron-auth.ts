import "server-only";

import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { logHrApiError } from "@/lib/hr/api-auth";

// CORE — autenticacao de MAQUINA (sem sessao de usuario) para rotas de cron. Portao unico reutilizavel:
// le CRON_SECRET do ambiente e valida o header Authorization: Bearer <segredo>. Comportamento observavel
// identico ao check inline que existia nos efetivadores (500 sem segredo / 401 sem Bearer / segue se ok),
// com a diferenca de a comparacao ser em TEMPO CONSTANTE.

export type CronAuthResult = { ok: true } | { response: NextResponse };

/**
 * Compara duas strings em tempo constante, sem lancar e sem vazar timing por tamanho: compara os digests
 * SHA-256 (sempre 32 bytes) via timingSafeEqual. Digests de mesmo tamanho evitam o throw de buffers
 * desiguais do timingSafeEqual e nao expoem o comprimento do segredo.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/**
 * Gate de cron. Retorna { ok: true } quando autorizado, ou { response } com a resposta de erro pronta
 * (mesmo estilo dos gates de sessao do repo, ex. requireHrPermission -> { context, response }).
 *
 * Uso: `const gate = requireCronAuth(request); if ("response" in gate) return gate.response;`
 */
export function requireCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  // Nunca rodar sem segredo configurado (evita endpoint aberto por engano).
  if (!secret) {
    logHrApiError("apply_due.missing_secret", { message: "CRON_SECRET nao definido no ambiente." });
    return { response: NextResponse.json({ error: "server_misconfigured" }, { status: 500 }) };
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqualStr(authorization, `Bearer ${secret}`)) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  return { ok: true };
}
