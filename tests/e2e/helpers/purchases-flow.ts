import { expect, type Page } from "@playwright/test";
import { e2eLabel, runSuffix } from "./data";
import { switchActiveUnit } from "./active-unit";
import { createE2ESupplierViaDialog, filterSolicitacoesAll, openAuthenticated, selectByOptionText, selectFirstReal } from "./purchases-ui";

// Jornada COMUM do fluxo de compras (100% UI, E2E_MULTI) extraida do T2, parametrizada por valor.
// Vai de "criar solicitacao" ate "enviar para aprovacao", deixando a compra pendente de aprovacao.
// Mantem o anexo (evidencia "Formal suficiente") para que a alcada dependa apenas do VALOR:
//   unitPrice <= 200 -> Gerencia Administrativa ; unitPrice > 200 -> Diretoria Geral.
// NAO altera o T2 (que mantem sua copia inline).

const DEFAULT_FIXTURE = "tests/e2e/fixtures/evidencia.pdf";

/** Espera a resposta da API (URL+metodo) e LANCA se nao for 2xx. */
export async function withApi(
  page: Page,
  match: { url: string; method: string },
  action: () => Promise<void>
): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(match.url) && r.request().method() === match.method,
      { timeout: 30_000 }
    ),
    action()
  ]);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`[e2e] ${match.method} ${match.url} falhou (HTTP ${response.status()}): ${body.slice(0, 300)}`);
  }
}

/** Espera a resposta da API (URL+metodo) e AFIRMA o status HTTP exato (NAO lanca em 4xx). */
export async function expectApiStatus(
  page: Page,
  match: { url: string; method: string },
  action: () => Promise<void>,
  status: number
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(match.url) && r.request().method() === match.method,
      { timeout: 30_000 }
    ),
    action()
  ]);
  expect(response.status(), `Esperado HTTP ${status} em ${match.method} ${match.url}`).toBe(status);
  return response;
}

type CreatePurchaseOptions = {
  page: Page;
  /** Nome da unidade ativa (unidade A). */
  unitA: string;
  /** Valor unitario do item da cotacao (define a alcada: <=200 Gerencia, >200 Diretoria). */
  unitPrice: number;
  /** Caminho do fixture de anexo (default: PDF minimo do repo). */
  fixturePath?: string;
};

/**
 * Cria uma compra ate ficar PENDENTE DE APROVACAO (como E2E_MULTI, unidade A ativa):
 * solicitacao -> iniciar cotacao -> fornecedor [E2E] -> cotacao com anexo (afirma "Formal suficiente")
 * -> selecionar vencedora -> enviar para aprovacao.
 * Retorna { title, suffix } para o spec afirmar status/bloqueio pelo titulo unico.
 */
export async function createPurchaseAwaitingApproval(
  options: CreatePurchaseOptions
): Promise<{ title: string; suffix: string }> {
  const { page, unitA, unitPrice } = options;
  const fixturePath = options.fixturePath ?? DEFAULT_FIXTURE;
  const suffix = runSuffix();
  const title = e2eLabel("Compra");
  const supplierName = e2eLabel("Fornecedor");

  // Unidade A ativa; navega UMA vez e estabiliza antes do clique (evita corrida com o refetch).
  await openAuthenticated(page, "/compras/solicitacoes");
  await switchActiveUnit(page, unitA);
  await page.waitForLoadState("networkidle");

  // ===== Criar solicitacao [E2E] =====
  await page.getByTestId("solicitacao-nova").click();
  const departamento = page.getByTestId("solicitacao-departamento");
  try {
    await expect(departamento).toBeVisible({ timeout: 10_000 });
  } catch {
    await page.getByTestId("solicitacao-nova").click();
    await expect(departamento).toBeVisible({ timeout: 10_000 });
  }
  // "Unidade" so aparece para super admin; nao-super herda a unidade ativa. Condicional.
  const unidadeField = page.getByTestId("solicitacao-unidade");
  if ((await unidadeField.count()) > 0) {
    await selectByOptionText(unidadeField, unitA);
  }
  await selectFirstReal(departamento, "Departamento");
  await page.getByTestId("solicitacao-titulo").fill(title);
  await page.getByTestId("solicitacao-descricao").fill(`Descricao ${suffix}`);
  await page.getByTestId("solicitacao-justificativa").fill(`[E2E] justificativa ${suffix}`);
  await page.getByTestId("solicitacao-item-0-descricao").fill(`Item ${suffix}`);
  await page.getByTestId("solicitacao-item-0-quantidade").fill("1");
  await selectByOptionText(page.getByTestId("solicitacao-item-0-unidade-medida"), "UN");
  await withApi(page, { url: "/api/purchases/requests", method: "POST" }, () =>
    page.getByTestId("solicitacao-enviar").click()
  );

  await filterSolicitacoesAll(page, title);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

  // ===== Cotacao =====
  await openAuthenticated(page, "/compras/cotacoes");
  await page.locator("main select").first().selectOption("all");
  await page.locator("article").filter({ hasText: title }).getByTestId("cotacao-ver").click();
  const modal = page.getByRole("dialog");

  await withApi(page, { url: "/quotes", method: "POST" }, () => modal.getByTestId("cotacao-iniciar").click());
  await modal.getByRole("button", { name: "Cotações", exact: true }).click();
  await modal.getByTestId("cotacao-nova").click();

  // Fornecedor [E2E] via dialogo (auto-selecionado ao salvar) — caminho unico compartilhado.
  await createE2ESupplierViaDialog(page, modal, supplierName);

  // Evidencia formal + valor parametrizado.
  await selectByOptionText(modal.getByTestId("cotacao-origem"), "Proposta formal/PDF");
  await selectByOptionText(modal.getByTestId("cotacao-tipo-evidencia"), "Arquivo anexado");
  await modal.getByTestId("cotacao-item-0-valor-unitario").fill(String(unitPrice));
  await withApi(page, { url: "/quotes", method: "POST" }, () => modal.getByTestId("cotacao-salvar").click());
  await expect(modal.getByText(supplierName).first()).toBeVisible({ timeout: 30_000 });

  // Anexa evidencia e espera o POST /api/attachments.
  await modal.getByTestId("cotacao-anexos").click();
  await modal.getByTestId("cotacao-anexo-arquivo").setInputFiles(fixturePath);
  await withApi(page, { url: "/api/attachments", method: "POST" }, () =>
    modal.getByTestId("cotacao-anexo-enviar").click()
  );

  // AFIRMA "Formal suficiente" (com o anexo) -> a alcada dependera apenas do valor.
  await modal.getByTestId("cotacao-ver-detalhes").first().click();
  await expect(modal.getByTestId("cotacao-classificacao").first()).toContainText("Formal suficiente", {
    timeout: 30_000
  });

  // Seleciona vencedora e envia para aprovacao.
  await withApi(page, { url: "/quotes/", method: "PATCH" }, () => modal.getByTestId("cotacao-selecionar").click());
  await expect(modal.getByText("Vencedora", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await withApi(page, { url: "/resubmit", method: "POST" }, () =>
    modal.getByTestId("cotacao-enviar-aprovacao").click()
  );

  return { title, suffix };
}
