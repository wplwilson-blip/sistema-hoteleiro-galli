import { defineConfig } from "@playwright/test";

// Runner puro para tests/unit: sem webServer, sem browser (nenhum teste usa `page`),
// sem globalSetup. Isolado dos configs de screenshots e e2e (cada um com seu testDir).
export default defineConfig({
  testDir: "./tests/unit",
  // tsconfig dedicado ao runner: mapeia `server-only` para um stub vazio. O pacote nao
  // existe em node_modules (o Next o resolve internamente no build), entao sem isto
  // qualquer modulo com `import "server-only"` — permissions.ts, por exemplo — quebra aqui
  // com MODULE_NOT_FOUND. O build de producao NAO usa este tsconfig: a protecao real do
  // `server-only` continua valendo.
  tsconfig: "./tests/unit/tsconfig.json",
  fullyParallel: true,
  reporter: "list"
});
