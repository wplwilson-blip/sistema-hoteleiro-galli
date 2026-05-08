import { expect, test } from "@playwright/test";

test("salvar sessao autenticada para screenshots", async ({ page, context }) => {
  console.log("");
  console.log("==============================================");
  console.log("Login manual para screenshots");
  console.log("1. O navegador sera aberto em /login.");
  console.log("2. Faca login manualmente com um usuario autorizado.");
  console.log("3. Aguarde o sistema carregar uma area autenticada.");
  console.log("4. O estado da sessao sera salvo localmente em playwright/.auth/user.json.");
  console.log("5. Esse arquivo esta ignorado pelo Git e nao deve ser versionado.");
  console.log("==============================================");
  console.log("");

  await page.goto("/login");

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 180_000
  });

  await expect(page.locator("body")).toBeVisible();

  await context.storageState({
    path: "playwright/.auth/user.json"
  });

  console.log("");
  console.log("Sessao salva em playwright/.auth/user.json");
  console.log("Nao faca commit desse arquivo.");
  console.log("");
});
