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

export default defineConfig({
  testDir: "./tests/e2e",
  // Guard anti-producao: aborta a suite se o alvo nao for staging local.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
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
      testMatch: /.*\.e2e\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
      dependencies: ["setup"]
    }
  ]
});
