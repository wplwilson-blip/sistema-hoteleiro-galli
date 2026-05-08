import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authStatePath = "playwright/.auth/user.json";
const screenshotsDir = "docs/manual-compras/assets/screenshots";

type CaptureTarget = {
  route: string;
  fileName: string;
  expectedText: string | RegExp;
};

const captureTargets: CaptureTarget[] = [
  {
    route: "/compras",
    fileName: "01-dashboard-compras.png",
    expectedText: "Compras"
  },
  {
    route: "/compras/solicitacoes",
    fileName: "02-solicitacoes-compras.png",
    expectedText: /Solicita/i
  },
  {
    route: "/compras/cotacoes",
    fileName: "03-cotacoes-compras.png",
    expectedText: /Cota/i
  },
  {
    route: "/compras/aprovacoes",
    fileName: "04-aprovacoes-compras.png",
    expectedText: /Aprova/i
  },
  {
    route: "/compras/pendencias-documentais",
    fileName: "05-pendencias-documentais-compras.png",
    expectedText: /Pend.ncias Documentais/i
  }
];

test.use({
  storageState: authStatePath
});

test.beforeAll(() => {
  if (!fs.existsSync(authStatePath)) {
    throw new Error("Sessão local não encontrada. Rode `npm run screenshots:auth` antes de capturar screenshots.");
  }

  fs.mkdirSync(screenshotsDir, { recursive: true });
});

function isLoginUrl(url: string) {
  return new URL(url).pathname.startsWith("/login");
}

async function assertAuthenticatedRoute(page: Page) {
  if (isLoginUrl(page.url())) {
    throw new Error("Sessão inválida ou expirada. Rode `npm run screenshots:auth` novamente.");
  }

  await expect(page).not.toHaveURL(/\/login(?:$|[/?#])/);
}

async function waitForStyledApp(page: Page, expectedText: string | RegExp) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "attached" });
  await assertAuthenticatedRoute(page);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible({
    timeout: 30_000
  });

  await page.waitForFunction(
    () => {
      const body = document.body;
      const bodyStyle = window.getComputedStyle(body);
      const fontFamily = bodyStyle.fontFamily.toLowerCase();
      const hasStylesheets = Array.from(document.styleSheets).length > 0;
      const usesBrowserDefaultFont =
        fontFamily.includes("times") || (fontFamily.includes("serif") && !fontFamily.includes("inter"));
      const bodyMarginWasReset = bodyStyle.margin === "0px";

      const flexElement = document.querySelector(".flex");
      const gridElement = document.querySelector(".grid");
      const roundedElement = document.querySelector("[class*='rounded']");
      const shadowElement = document.querySelector("[class*='shadow']");

      const hasAppliedTailwindLayout =
        (flexElement ? window.getComputedStyle(flexElement).display === "flex" : false) ||
        (gridElement ? window.getComputedStyle(gridElement).display === "grid" : false) ||
        (roundedElement ? window.getComputedStyle(roundedElement).borderRadius !== "0px" : false) ||
        (shadowElement ? window.getComputedStyle(shadowElement).boxShadow !== "none" : false);

      return hasStylesheets && bodyMarginWasReset && !usesBrowserDefaultFont && hasAppliedTailwindLayout;
    },
    undefined,
    { timeout: 30_000 }
  );

  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForFunction(
    () =>
      !Array.from(document.body.querySelectorAll("*")).some((element) => {
        const text = element.textContent ?? "";

        if (!/Carregando/i.test(text)) {
          return false;
        }

        const style = window.getComputedStyle(element);

        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      }),
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_500);
}

async function capturePage(page: Page, target: CaptureTarget) {
  await page.goto(target.route, { waitUntil: "domcontentloaded" });
  await waitForStyledApp(page, target.expectedText);

  await page.screenshot({
    path: path.join(screenshotsDir, target.fileName),
    fullPage: true
  });
}

test("capturar telas principais do modulo de compras", async ({ page }) => {
  for (const target of captureTargets) {
    await capturePage(page, target);
  }
});
