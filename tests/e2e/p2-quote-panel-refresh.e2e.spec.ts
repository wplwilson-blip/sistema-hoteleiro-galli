import { expect, test, type Page, type Response } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";
import { switchActiveUnit } from "./helpers/active-unit";
import { createE2ESupplierViaDialog, filterSolicitacoesAll, openAuthenticated, selectByOptionText, selectFirstReal } from "./helpers/purchases-ui";

// P2 (plano 61) — EVIDENCIA, nao regressao.
//
// A pergunta que este teste responde, e que o plano 61 diz ser a discriminante:
//
//   depois de um save, o corpo do GET do detalhe ja' traz a cotacao nova?
//     SIM  -> read-after-write esta' ok; se a tela ficar vazia, o problema e' de client;
//     NAO  -> read-after-write no servidor, outra fatia.
//
// Tambem conta os GETs do detalhe disparados pela mutation: eram 2 (invalidateQueries de
// prefixo + refetchQueries explicito), devem passar a ser 1.
//
// Roda contra STAGING local (guard em global-setup). Cria dados [E2E], como as demais specs.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[e2e] Variavel de ambiente ausente: ${name}. Veja .env.e2e.example.`);
  }
  return value;
}

function isDetailGet(response: Response) {
  return (
    response.request().method() === "GET" &&
    response.url().includes("/api/purchases/quotes?requestId=")
  );
}

test("P2: o GET do detalhe apos o save ja' traz a cotacao nova", async ({ browser }) => {
  test.setTimeout(240_000);

  const unitA = requireEnv("E2E_UNIT_A_NAME");
  const suffix = runSuffix();
  const title = e2eLabel("CompraP2");
  const supplierName = e2eLabel("FornecedorP2");

  const context = await browser.newContext({ storageState: authStatePath("E2E_MULTI") });
  const page = await context.newPage();

  // Captura TODOS os GETs do detalhe, com corpo, na ordem em que chegam.
  const detailResponses: Array<{ startedAt: number; endedAt: number; status: number; quoteCount: number; suppliers: string[]; cacheControl: string | undefined }> = [];
  const requestStartedAt = new WeakMap<object, number>();
  let savePostStartedAt = 0;
  let savePostEndedAt = 0;

  page.on("request", (request) => {
    requestStartedAt.set(request, Date.now());

    if (request.method() === "POST" && request.url().includes("/quotes")) {
      savePostStartedAt = Date.now();
    }
  });

  page.on("response", (response) => {
    if (response.request().method() === "POST" && response.url().includes("/quotes")) {
      savePostEndedAt = Date.now();
    }

    if (!isDetailGet(response)) {
      return;
    }

    const endedAt = Date.now();
    const startedAt = requestStartedAt.get(response.request()) ?? endedAt;

    void response
      .json()
      .then((body: { quotes?: Array<{ supplierTradeName?: string; supplierName?: string }> }) => {
        detailResponses.push({
          startedAt,
          endedAt,
          status: response.status(),
          quoteCount: body.quotes?.length ?? 0,
          suppliers: (body.quotes ?? []).map((quote) => quote.supplierTradeName || quote.supplierName || "?"),
          cacheControl: response.headers()["cache-control"]
        });
      })
      .catch(() => {
        /* corpo ja' consumido/abortado: ignora, nao e' o alvo da medicao */
      });
  });

  try {
    await openAuthenticated(page, "/compras/solicitacoes");
    await switchActiveUnit(page, unitA);
    await page.waitForLoadState("networkidle");

    // ---- solicitacao
    await page.getByTestId("solicitacao-nova").click();
    const departamento = page.getByTestId("solicitacao-departamento");
    await expect(departamento).toBeVisible({ timeout: 15_000 });

    const unidadeField = page.getByTestId("solicitacao-unidade");
    if ((await unidadeField.count()) > 0) {
      await selectByOptionText(unidadeField, unitA);
    }
    await selectFirstReal(departamento, "Departamento");
    await page.getByTestId("solicitacao-titulo").fill(title);
    await page.getByTestId("solicitacao-descricao").fill(`Descricao ${suffix}`);
    await page.getByTestId("solicitacao-justificativa").fill(`[E2E] P2 ${suffix}`);
    await page.getByTestId("solicitacao-item-0-descricao").fill(`Item ${suffix}`);
    await page.getByTestId("solicitacao-item-0-quantidade").fill("1");
    await selectByOptionText(page.getByTestId("solicitacao-item-0-unidade-medida"), "UN");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/purchases/requests") && r.request().method() === "POST"),
      page.getByTestId("solicitacao-enviar").click()
    ]);
    await filterSolicitacoesAll(page, title);

    // ---- abre o painel e inicia a cotacao
    await openAuthenticated(page, "/compras/cotacoes");
    await page.locator("main select").first().selectOption("all");
    await page.locator("article").filter({ hasText: title }).getByTestId("cotacao-ver").click();
    const modal = page.getByRole("dialog");

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/quotes") && r.request().method() === "POST"),
      modal.getByTestId("cotacao-iniciar").click()
    ]);

    await modal.getByRole("button", { name: "Cotações", exact: true }).click();
    await modal.getByTestId("cotacao-nova").click();
    await createE2ESupplierViaDialog(page, modal, supplierName);
    await modal.getByTestId("cotacao-item-0-valor-unitario").fill("150");

    // ---- O MOMENTO MEDIDO: salvar e olhar o GET que vem depois.
    detailResponses.length = 0;

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/quotes") && r.request().method() === "POST"),
      modal.getByTestId("cotacao-salvar").click()
    ]);

    // Espera o(s) GET(s) do detalhe assentarem.
    await page.waitForTimeout(4_000);

    const afterSave = [...detailResponses].sort((a, b) => a.startedAt - b.startedAt);
    // Relativo ao FIM do POST de save: um GET que comecou ANTES disso nao e' releitura, e'
    // requisicao que ja' estava em voo — nao serve para julgar read-after-write.
    const timeline = afterSave.map((entry) => ({
      comecou_ms_apos_o_post: entry.startedAt - savePostEndedAt,
      durou_ms: entry.endedAt - entry.startedAt,
      quoteCount: entry.quoteCount,
      suppliers: entry.suppliers,
      cacheControl: entry.cacheControl
    }));

    // eslint-disable-next-line no-console
    console.info(
      "[P2][evidencia] POST de save durou",
      savePostEndedAt - savePostStartedAt,
      "ms. GETs do detalhe:",
      JSON.stringify(timeline, null, 2)
    );

    const releituras = afterSave.filter((entry) => entry.startedAt >= savePostEndedAt);
    // eslint-disable-next-line no-console
    console.info(`[P2][evidencia] GETs iniciados APOS o POST (releituras reais): ${releituras.length}`);

    if (releituras.length) {
      // eslint-disable-next-line no-console
      console.info(
        `[P2][evidencia] a PRIMEIRA releitura trouxe ${releituras[0].quoteCount} cotacao(oes) -> ` +
          (releituras[0].quoteCount > 0
            ? "read-after-write OK (o corpo ja' traz a cotacao nova)"
            : "READ-AFTER-WRITE FALHOU no servidor (corpo sem a cotacao recem-gravada)")
      );
    }

    expect(afterSave.length, "nenhum GET do detalhe foi disparado apos o save").toBeGreaterThan(0);

    const withNewQuote = afterSave.filter((entry) => entry.suppliers.some((name) => name.includes(supplierName)));

    // eslint-disable-next-line no-console
    console.info(
      `[P2][evidencia] GETs=${afterSave.length} | com a cotacao nova=${withNewQuote.length} | ` +
        `cache-control=${afterSave[0]?.cacheControl ?? "(ausente)"}`
    );

    // DISCRIMINANTE: o corpo traz a cotacao nova?
    expect(
      withNewQuote.length,
      `Nenhum GET do detalhe apos o save trouxe a cotacao nova. Corpos: ${JSON.stringify(afterSave)}`
    ).toBeGreaterThan(0);

    // E a tela reflete? (se o corpo traz e a tela nao mostra, o problema e' de client)
    await expect(modal.getByText(supplierName).first()).toBeVisible({ timeout: 15_000 });

    // Duplo-GET eliminado: o save deve disparar UMA releitura do detalhe.
    expect(releituras.length, `esperado 1 releitura do detalhe por save, houve ${releituras.length}`).toBe(1);

    // Discriminante do plano 61: a primeira releitura ja' traz a cotacao nova?
    expect(
      releituras[0]?.quoteCount ?? 0,
      "a primeira releitura apos o save veio sem a cotacao -> read-after-write no servidor"
    ).toBeGreaterThan(0);

    // no-store chegando de verdade na resposta.
    expect(afterSave[0]?.cacheControl ?? "").toContain("no-store");
  } finally {
    await context.close();
  }
});
