// Trava de seguranca PRE-BUILD para a suite E2E de producao local (next build + next start).
//
// POR QUE EXISTE: as variaveis NEXT_PUBLIC_* sao "inlined" em BUILD TIME. Se `next build` rodar com
// .env.local apontando para PRODUCAO, o bundle sai CONGELADO com a URL de producao — e o `next start`
// falaria com producao mesmo com PLAYWRIGHT_BASE_URL=localhost. O guard de host do global-setup
// (tests/e2e/global-setup.ts) so valida o ALVO (localhost), NAO o banco embutido no build — logo NAO
// pegaria esse caso. Esta trava roda ANTES do `next build` (encadeada por `&&` no script
// test:e2e:prod): se abortar (exit 1), o `&&` interrompe a cadeia e o `next build` NUNCA roda.
//
// Le NEXT_PUBLIC_SUPABASE_URL de process.env (se ja setado) ou direto de .env.local (mesma fonte que
// o Next usa no build) e exige o projeto de STAGING. Nunca deixa buildar contra producao.

import fs from "node:fs";
import path from "node:path";

const STAGING_REF = "jascnmgagejlvjlenduv"; // galli-staging (unico permitido)
const PRODUCTION_REF = "chnamldrlwohaudmjrez"; // hotel-galli-admin (PROIBIDO)

function readEnvLocalValue(key) {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return undefined;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match || match[1] !== key) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvLocalValue("NEXT_PUBLIC_SUPABASE_URL");

if (!url) {
  console.error("[e2e:guard] ABORTADO: NEXT_PUBLIC_SUPABASE_URL ausente (nem em process.env nem em .env.local). Build cancelado.");
  process.exit(1);
}

let ref;
try {
  ref = new URL(url).hostname.split(".")[0];
} catch {
  console.error(`[e2e:guard] ABORTADO: NEXT_PUBLIC_SUPABASE_URL invalida: ${url}. Build cancelado.`);
  process.exit(1);
}

if (ref === PRODUCTION_REF) {
  console.error(`[e2e:guard] ABORTADO: .env.local aponta para PRODUCAO (ref ${ref}). E2E NUNCA builda/roda contra producao.`);
  process.exit(1);
}

if (ref !== STAGING_REF) {
  console.error(
    `[e2e:guard] ABORTADO: NEXT_PUBLIC_SUPABASE_URL ref "${ref}" nao e' o staging esperado (${STAGING_REF}). Build cancelado.`
  );
  process.exit(1);
}

console.log(`[e2e:guard] OK: build/E2E de producao local apontando para STAGING (ref ${ref}).`);
