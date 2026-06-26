import { test as setup } from "@playwright/test";
import { createAuthState } from "./helpers/auth";

// Projeto "setup" do Playwright: loga programaticamente os dois usuarios de teste e
// grava o storageState de cada um. Os specs (projeto chromium) dependem deste projeto,
// entao isto roda ANTES dos testes de fumaca/fluxo.

setup("autenticar E2E_ADMIN", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_ADMIN", baseURL);
});

setup("autenticar E2E_MULTI", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_MULTI", baseURL);
});
