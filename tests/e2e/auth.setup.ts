import { test as setup } from "@playwright/test";
import { createAuthState, isUserConfigured } from "./helpers/auth";

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

// Plano 78 (a Recepcao escreve a ocupacao). PULA enquanto o ator nao existir: o perfil
// RECEPCAO nasce com a migration 093, e a suite foi escrita antes de ela ser aplicada.
setup("autenticar E2E_RECEPCAO", async ({ baseURL }) => {
  setup.skip(
    !isUserConfigured("E2E_RECEPCAO"),
    "E2E_RECEPCAO_USERNAME/_PASSWORD nao definidos: o perfil RECEPCAO nasce com a migration 093."
  );

  if (!baseURL) throw new Error("[e2e] baseURL ausente na config do Playwright.");
  await createAuthState("E2E_RECEPCAO", baseURL);
});
