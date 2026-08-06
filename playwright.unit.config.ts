import { defineConfig } from "@playwright/test";

// Runner puro para tests/unit: sem webServer, sem browser (nenhum teste usa `page`),
// sem globalSetup. Isolado dos configs de screenshots e e2e (cada um com seu testDir).
export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  reporter: "list"
});
