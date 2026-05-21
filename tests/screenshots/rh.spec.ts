import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authStatePath = "playwright/.auth/user.json";
const screenshotsDir = "docs/manual-rh/assets/screenshots";
const reportPath = path.join(screenshotsDir, "capture-report.json");

const viewports = [
  { label: "1366x768", width: 1366, height: 768 },
  { label: "1440x900", width: 1440, height: 900 },
  { label: "1920x1080", width: 1920, height: 1080 }
] as const;

type StaticTarget = {
  kind: "static";
  route: string;
  title: string;
  fileSlug: string;
  expectedText: string | RegExp;
};

type DynamicTarget = {
  kind: "dynamic";
  routeTemplate: string;
  title: string;
  fileSlug: string;
  sourceRoute: string;
  sourceExpectedText: string | RegExp;
  intermediateLinkPattern?: RegExp;
  linkPattern: RegExp;
  expectedText: string | RegExp;
};

type CaptureTarget = StaticTarget | DynamicTarget;

type CaptureResult = {
  title: string;
  route: string;
  viewport: string;
  captured: boolean;
  file?: string;
  reason?: string;
};

const captureTargets: CaptureTarget[] = [
  {
    kind: "static",
    route: "/rh",
    title: "Painel do RH",
    fileSlug: "01-painel-rh",
    expectedText: /Painel do RH|RH/i
  },
  {
    kind: "static",
    route: "/rh/inbox",
    title: "Fila de RH",
    fileSlug: "02-fila-rh",
    expectedText: /Fila de RH|processos aguardando/i
  },
  {
    kind: "dynamic",
    routeTemplate: "/rh/workflows/[id]",
    title: "Detalhe do processo de RH",
    fileSlug: "03-detalhe-processo-rh",
    sourceRoute: "/rh/inbox",
    sourceExpectedText: /Fila de RH|processos aguardando/i,
    linkPattern: /^\/rh\/workflows\/[^/]+$/,
    expectedText: /Processo de RH|Resumo operacional|Hist.rico/i
  },
  {
    kind: "static",
    route: "/rh/vagas",
    title: "Vagas",
    fileSlug: "04-vagas",
    expectedText: /Vagas|Aberturas/i
  },
  {
    kind: "static",
    route: "/rh/vagas/nova",
    title: "Nova vaga",
    fileSlug: "05-nova-vaga",
    expectedText: /Nova vaga|solicita/i
  },
  {
    kind: "dynamic",
    routeTemplate: "/rh/vagas/[id]/candidatos",
    title: "Candidatos da vaga",
    fileSlug: "06-candidatos-vaga",
    sourceRoute: "/rh/vagas",
    sourceExpectedText: /Vagas|Aberturas/i,
    linkPattern: /^\/rh\/vagas\/[^/]+\/candidatos$/,
    expectedText: /Candidatos|vaga/i
  },
  {
    kind: "dynamic",
    routeTemplate: "/rh/vagas/[id]/candidatos/[candidateId]",
    title: "Detalhe do candidato",
    fileSlug: "07-detalhe-candidato",
    sourceRoute: "/rh/vagas",
    sourceExpectedText: /Vagas|Aberturas/i,
    intermediateLinkPattern: /^\/rh\/vagas\/[^/]+\/candidatos$/,
    linkPattern: /^\/rh\/vagas\/[^/]+\/candidatos\/(?!novo$)[^/]+$/,
    expectedText: /Candidato|Avalia/i
  },
  {
    kind: "static",
    route: "/rh/admissoes/nova",
    title: "Nova admissao",
    fileSlug: "08-nova-admissao",
    expectedText: /admiss.o|roteiro/i
  },
  {
    kind: "static",
    route: "/rh/employees",
    title: "Colaboradores",
    fileSlug: "09-colaboradores",
    expectedText: /Colaboradores|RH/i
  },
  {
    kind: "dynamic",
    routeTemplate: "/rh/employees/[id]",
    title: "Detalhe do colaborador",
    fileSlug: "10-detalhe-colaborador",
    sourceRoute: "/rh/employees",
    sourceExpectedText: /Colaboradores|RH/i,
    linkPattern: /^\/rh\/employees\/[^/]+$/,
    expectedText: /Colaborador|Documentos|Hist.rico/i
  },
  {
    kind: "static",
    route: "/rh/gestao",
    title: "Gestao RH",
    fileSlug: "11-gestao-rh",
    expectedText: /Gest.o|Indicadores|RH/i
  },
  {
    kind: "static",
    route: "/rh/gestao/auditoria",
    title: "Historico e auditoria",
    fileSlug: "12-auditoria-rh",
    expectedText: /auditoria|hist.rico/i
  },
  {
    kind: "static",
    route: "/rh/gestao/jobs",
    title: "Rotinas automaticas",
    fileSlug: "13-rotinas-rh",
    expectedText: /Rotinas|autom.ticas|RH/i
  }
];

test.use({
  storageState: fs.existsSync(authStatePath) ? authStatePath : undefined
});

test.setTimeout(300_000);

test.beforeAll(() => {
  fs.mkdirSync(screenshotsDir, { recursive: true });

  for (const file of fs.readdirSync(screenshotsDir)) {
    if (file.endsWith(".png") || file === path.basename(reportPath)) {
      fs.unlinkSync(path.join(screenshotsDir, file));
    }
  }
});

function isLoginUrl(url: string) {
  return new URL(url).pathname.startsWith("/login");
}

function normalizeHref(href: string) {
  try {
    const url = new URL(href);
    return url.pathname;
  } catch {
    return href;
  }
}

async function waitForStyledApp(page: Page, expectedText: string | RegExp) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "attached" });

  if (isLoginUrl(page.url())) {
    return "Sessao autenticada ausente ou expirada.";
  }

  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible({ timeout: 30_000 });

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  await page.waitForFunction(
    () => {
      const bodyStyle = window.getComputedStyle(document.body);
      const hasStylesheets = Array.from(document.styleSheets).length > 0;
      const bodyMarginWasReset = bodyStyle.margin === "0px";
      const flexElement = document.querySelector(".flex");
      const gridElement = document.querySelector(".grid");

      return (
        hasStylesheets &&
        bodyMarginWasReset &&
        ((flexElement ? window.getComputedStyle(flexElement).display === "flex" : false) ||
          (gridElement ? window.getComputedStyle(gridElement).display === "grid" : false))
      );
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
  await page.waitForTimeout(750);

  return null;
}

async function maskSensitiveTexts(page: Page) {
  await page.evaluate(() => {
    const replacements: Array<[string | RegExp, string]> = [
      ["Wilson Pinheiro", "Usuario Treinamento"],
      ["@wilson.admin", "@usuario.demo"],
      ["wilson.admin", "usuario.demo"],
      [/\bWilson\b/g, "Usuario"]
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
        value = value.replaceAll(from, to);
      }

      node.nodeValue = value;
    }
  });
}

async function findDynamicRoute(page: Page, target: DynamicTarget) {
  await page.goto(target.sourceRoute, { waitUntil: "domcontentloaded" });
  const unavailableReason = await waitForStyledApp(page, target.sourceExpectedText);

  if (unavailableReason) {
    return { route: null, reason: unavailableReason };
  }

  let hrefs = await page.locator("a[href]").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href") ?? "")
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href, window.location.origin).pathname;
        } catch {
          return href;
        }
      })
  );

  if (target.intermediateLinkPattern) {
    const intermediateRoute = hrefs.find((href) => target.intermediateLinkPattern?.test(normalizeHref(href)));

    if (!intermediateRoute) {
      return {
        route: null,
        reason: `Nenhum registro encontrado em ${target.sourceRoute}.`
      };
    }

    await page.goto(intermediateRoute, { waitUntil: "domcontentloaded" });
    const intermediateUnavailableReason = await waitForStyledApp(page, /Candidatos|vaga/i);

    if (intermediateUnavailableReason) {
      return { route: null, reason: intermediateUnavailableReason };
    }

    hrefs = await page.locator("a[href]").evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href") ?? "")
        .filter(Boolean)
        .map((href) => {
          try {
            return new URL(href, window.location.origin).pathname;
          } catch {
            return href;
          }
        })
    );
  }

  const route = hrefs.find((href) => target.linkPattern.test(normalizeHref(href)));

  return {
    route: route ?? null,
    reason: route ? undefined : `Nenhum registro encontrado em ${target.sourceRoute}.`
  };
}

async function captureTarget(page: Page, target: CaptureTarget, viewportLabel: string, index: number): Promise<CaptureResult> {
  const route =
    target.kind === "dynamic"
      ? await findDynamicRoute(page, target)
      : { route: target.route, reason: undefined as string | undefined };

  if (!route.route) {
    return {
      title: target.title,
      route: target.kind === "dynamic" ? target.routeTemplate : target.route,
      viewport: viewportLabel,
      captured: false,
      reason: route.reason
    };
  }

  await page.goto(route.route, { waitUntil: "domcontentloaded" });
  const unavailableReason = await waitForStyledApp(page, target.expectedText);

  if (unavailableReason) {
    return {
      title: target.title,
      route: route.route,
      viewport: viewportLabel,
      captured: false,
      reason: unavailableReason
    };
  }

  await maskSensitiveTexts(page);

  const file = `${viewportLabel}-${String(index + 1).padStart(2, "0")}-${target.fileSlug}.png`;
  const screenshotPath = path.join(screenshotsDir, file);

  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  });

  return {
    title: target.title,
    route: route.route,
    viewport: viewportLabel,
    captured: true,
    file
  };
}

test("capturar telas principais do modulo de RH", async ({ page }) => {
  const results: CaptureResult[] = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (let index = 0; index < captureTargets.length; index += 1) {
      results.push(await captureTarget(page, captureTargets[index], viewport.label, index));
    }
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`);
});
