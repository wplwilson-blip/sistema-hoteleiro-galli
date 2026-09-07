import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Config DEDICADA aos testes E2E (tests/e2e). Separada de playwright.config.ts
// (screenshots) para nao interferir nos scripts existentes.
// Rode com: npm run test:e2e  (ou test:e2e:headed para depurar).

// Carrega .env.e2e.local (gitignored) se existir — sem dependencia externa.
// Nao sobrescreve variaveis ja presentes no ambiente.
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(".env.e2e.local");
// `.env.local` DEPOIS: loadDotEnv nao sobrescreve o que ja existe, entao `.env.e2e.local`
// continua vencendo. Entra para a suite enxergar NEXT_PUBLIC_SUPABASE_URL / ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY (tests/e2e/helpers/db.ts) sem COPIAR segredo para um segundo
// arquivo -- duplicar a service key em dois .env e' mais arriscado que le-la de onde ela ja
// mora. O guard de staging do helper roda sobre o valor lido, venha ele de onde vier.
loadDotEnv(".env.local");

export default defineConfig({
  testDir: "./tests/e2e",
  // Guard anti-producao: aborta a suite se o alvo nao for staging local.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  // Producao local (opt-in via E2E_WEBSERVER=1, setado pelo script test:e2e:prod): o Playwright sobe
  // `next start` (build ja feito antes, no script) e derruba ao final. `reuseExistingServer` permite
  // reaproveitar um servidor ja no ar (ex.: um next start manual). Sem a flag, este bloco fica
  // undefined => o fluxo `test:e2e` (dev, servidor manual) permanece 100% intacto.
  // A URL do webServer deriva de PLAYWRIGHT_BASE_URL, e nao e' mais fixa em :3000. Estava
  // fixa, e isso quebrava a suite quando a porta ja estava ocupada por OUTRO projeto local
  // (aconteceu: o site-hotel-galli respondendo 404 em /login fez o Playwright concluir "nao
  // esta pronto", tentar subir o proprio servidor e morrer com EADDRINUSE). Com a URL
  // derivada, basta `PORT=3001 PLAYWRIGHT_BASE_URL=http://localhost:3001` para rodar ao lado.
  webServer:
    process.env.E2E_WEBSERVER === "1"
      ? {
          command: "npm run start",
          url: `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"}/login`,
          reuseExistingServer: true,
          timeout: 180_000
        }
      : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 1200 },
    screenshot: "only-on-failure",
    video: "off",
    trace: "off"
  },
  projects: [
    // Loga os usuarios e grava o storageState antes dos specs.
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chromium",
      // A casca abaixo de 1024px tem projeto proprio (abaixo); este roda todo o RESTO.
      testMatch: /.*\.e2e\.spec\.ts$/,
      testIgnore: /shell-mobile\.e2e\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
      dependencies: ["setup"]
    },
    // ------------------------------------------------------------------ casca abaixo de 1024px
    //
    // POR QUE PROJETOS PROPRIOS (plano docs/codex/73, §5): os dois configs do Playwright rodam
    // em 1440x1200. Se a gaveta quebrar, NINGUEM VE -- e o modo de falha aqui nao e' logica, e'
    // CSS e DOM: z-index atras do header, foco preso, gaveta que nao fecha ao navegar. Teste
    // unitario nao pega nada disso.
    //
    // Ja pagamos tres vezes por defeito que so' a execucao real pegou: o organization_id da
    // 089, o errcode da 090 e o PGRST203 da 091.
    //
    // DUAS ORIENTACOES, porque os tablets ainda nao foram comprados e a decisao e' nao amarrar
    // a compra a uma limitacao que nos mesmos criariamos.
    {
      name: "tablet-retrato",
      testMatch: /shell-mobile\.e2e\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1112 }, trace: "retain-on-failure" },
      dependencies: ["setup"]
    },
    {
      name: "tablet-paisagem",
      // 1000px e' de proposito: abaixo do corte de 1024, para exercitar a faixa do tablet
      // pequeno DEITADO -- que e' onde um corte por orientacao (e nao por largura) erraria.
      testMatch: /shell-mobile\.e2e\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1000, height: 768 }, trace: "retain-on-failure" },
      dependencies: ["setup"]
    }
  ]
});
