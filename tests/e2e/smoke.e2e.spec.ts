import { expect, test, type Page } from "@playwright/test";
import { authStatePath, E2E_USERS } from "./helpers/auth";

// Spec minimo de fumaca (T1): para cada usuario de teste, carrega o storageState
// gravado pelo projeto "setup" e AFIRMA que a sessao esta ativa.
//
// Como afirmamos login (nao so "abriu"): o layout autenticado (app)/layout.tsx
// redireciona para /login quando NAO ha sessao. Logo, abrir uma rota protegida e
// permanecer FORA de /login (com o <main> visivel) prova que o usuario esta logado.
// T1 nao cria/aprova nada (escrita e' T2+).

const PROTECTED_ROUTE = "/dashboard";

async function assertLoggedIn(page: Page): Promise<void> {
  await page.goto(PROTECTED_ROUTE, { waitUntil: "domcontentloaded" });

  // Sessao invalida cairia em /login.
  await expect(page, "Redirecionado para /login: sessao nao foi aplicada.").not.toHaveURL(
    /\/login(?:$|[/?#])/
  );

  // Chrome autenticado renderizado (layout (app) montou).
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
}

for (const user of E2E_USERS) {
  test.describe(`fumaca: sessao ${user}`, () => {
    test.use({ storageState: authStatePath(user) });

    test(`${user} esta autenticado em ${PROTECTED_ROUTE}`, async ({ page }) => {
      await assertLoggedIn(page);
    });
  });
}
