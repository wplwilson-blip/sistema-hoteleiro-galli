import { test as setup } from "@playwright/test";
import { createAuthState } from "./helpers/auth";

// Projeto "setup" do Playwright: loga programaticamente os usuarios de teste e grava o
// storageState de cada um. Os specs (projeto chromium) dependem deste projeto, entao isto
// roda ANTES dos testes de fumaca/fluxo.

setup("autenticar E2E_ADMIN", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_ADMIN", baseURL);
});

setup("autenticar E2E_MULTI", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_MULTI", baseURL);
});

// Plano 70 (transicao de estado de apartamento). Os dois NAO sao super admin de proposito:
// super admin passa por bypass em userHasPermissionForUnit, e a suite existe justamente para
// provar a matriz de permissao.
setup("autenticar E2E_GOVERNANCA", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_GOVERNANCA", baseURL);
});

setup("autenticar E2E_MANUTENCAO", async ({ baseURL }) => {
  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_MANUTENCAO", baseURL);
});
