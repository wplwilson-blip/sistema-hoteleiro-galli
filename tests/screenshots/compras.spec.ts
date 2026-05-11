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
  prepare?: (page: Page) => Promise<void>;
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
    expectedText: /Solicita/i,
    prepare: async (page) => {
      await page.locator("main select").first().selectOption("all");
      await page.getByPlaceholder("Número, título, unidade, departamento ou solicitante").fill("SC-2026-000013");
      await expect(page.getByText("Compra de material de limpeza para governança")).toBeVisible({ timeout: 30_000 });
    }
  },
  {
    route: "/compras/cotacoes",
    fileName: "03-cotacoes-compras.png",
    expectedText: /Cota/i,
    prepare: async (page) => {
      await page.getByPlaceholder("Número, título, justificativa, status ou prioridade").fill("Compra de insumos para A&B");
      await expect(page.getByText("SC-2026-000015")).toBeVisible({ timeout: 30_000 });
    }
  },
  {
    route: "/compras/aprovacoes",
    fileName: "04-aprovacoes-compras.png",
    expectedText: /Aprova/i,
    prepare: async (page) => {
      await page.getByPlaceholder("Número, título, fornecedor ou solicitante").fill("SC-2026-000017");
      await expect(page.getByText("Serviço terceirizado emergencial")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Evidência documental crítica", { exact: false })).toBeVisible({ timeout: 30_000 });
    }
  },
  {
    route: "/compras/pendencias-documentais",
    fileName: "05-pendencias-documentais-compras.png",
    expectedText: /Pend.ncias Documentais/i,
    prepare: async (page) => {
      await page.getByLabel("Buscar cotação, solicitação, unidade ou fornecedor").fill("Demo");
      await expect(page.getByText("Demo Serviços Terceirizados").first()).toBeVisible({ timeout: 30_000 });
    }
  }
];

test.use({
  storageState: authStatePath
});

test.setTimeout(180_000);

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

async function maskSensitiveTexts(page: Page) {
  await page.evaluate(() => {
    const replacements: Array<[string | RegExp, string]> = [
      ["Wilson Pinheiro", "Usuário Treinamento"],
      ["@wilson.admin", "@usuario.demo"],
      ["wilson.admin", "usuario.demo"],
      [/\bWilson\b/g, "Usuário"]
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text);
      }
    }

    for (const node of textNodes) {
      let value = node.nodeValue ?? "";

      for (const [from, to] of replacements) {
        value = value.replaceAll(from as string, to);
      }

      node.nodeValue = value;
    }
  });
}

async function capturePage(page: Page, target: CaptureTarget) {
  await page.goto(target.route, { waitUntil: "domcontentloaded" });
  await waitForStyledApp(page, target.expectedText);
  await target.prepare?.(page);
  await maskSensitiveTexts(page);
  await expect(page.getByText("Usuário Treinamento").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("@usuario.demo").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(750);

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
