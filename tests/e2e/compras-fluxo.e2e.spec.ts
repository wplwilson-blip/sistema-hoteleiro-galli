import { expect, test, type Page } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";
import { expectAbsentFromList, expectVisibleInList, switchActiveUnit } from "./helpers/active-unit";
import { filterSolicitacoesAll, openAuthenticated, selectByOptionText, selectFirstReal } from "./helpers/purchases-ui";

// T2 — Fluxo de COMPRAS completo (100% UI) com E2E_MULTI (Gerente Departamental, nao-super,
// 2 unidades, com autoridade de aprovacao administrativa) + invariante de unidade ativa (Leva 2).
//
// LOCALIZACAO: via data-testid (ver docs/codex/12 + commit feat(testid)). Elimina ancoragem por
// texto de label e heuristica de timing. Tabs/textos de status seguem por texto (sem testid).
//
// LICAO DE BUG REAL: a cotacao DEVE ter anexo para classificar "Formal suficiente". Sem anexo =>
// "Critica" => forca alcada de Diretoria (que o Gerente nao tem). Por isso: valor <= R$200 +
// origem "Proposta formal/PDF" + tipo "Arquivo anexado" + UPLOAD de fixture (espera o POST
// /api/attachments retornar antes de prosseguir). Assim a alcada e' Gerencia Administrativa.
//
// Pre-requisitos de staging: E2E_UNIT_A_NAME/B_NAME; E2E_MULTI com acesso as duas e autoridade
// de aprovacao administrativa; ao menos 1 departamento na unidade A; ao menos 1 fornecedor ativo
// na unidade A (para habilitar "Nova cotacao"; o [E2E] e' criado via dialogo dentro do form).

const APROVACOES_SEARCH = "Número, título, fornecedor ou solicitante";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[e2e] Variavel de ambiente ausente: ${name}. Veja .env.e2e.example.`);
  }
  return value;
}

/** Executa `action` e espera a resposta da API casar (URL + metodo) com status ok. */
async function withApi(page: Page, match: { url: string; method: string }, action: () => Promise<void>): Promise<void> {
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

test("compras: fluxo completo (<=R$200, com anexo) + invariante de unidade ativa — E2E_MULTI", async ({
  browser
}) => {
  test.setTimeout(240_000);

  const unitA = requireEnv("E2E_UNIT_A_NAME");
  const unitB = requireEnv("E2E_UNIT_B_NAME");
  const suffix = runSuffix();
  const title = e2eLabel("Compra");
  const supplierName = e2eLabel("Fornecedor");
  const fixturePath = "tests/e2e/fixtures/evidencia.pdf";

  const context = await browser.newContext({ storageState: authStatePath("E2E_MULTI") });
  const page = await context.newPage();

  try {
    // Unidade A ativa (ponto de partida do fluxo operacional). Navega UMA vez e estabiliza antes
    // do clique — evita a corrida do refetch da troca de unidade engolir o clique em "Nova solicitacao".
    await openAuthenticated(page, "/compras/solicitacoes");
    await switchActiveUnit(page, unitA);
    await page.waitForLoadState("networkidle");

    // ===== 2. Criar SOLICITACAO [E2E] (unidade A) =====
    await page.getByTestId("solicitacao-nova").click();

    // O form pode nao abrir se o clique competir com o refetch/navegacao -> retry leve: aguarda o
    // form (campo Departamento) aparecer; se nao abriu apos o timeout, clica de novo uma vez.
    const departamento = page.getByTestId("solicitacao-departamento");
    try {
      await expect(departamento).toBeVisible({ timeout: 10_000 });
    } catch {
      await page.getByTestId("solicitacao-nova").click();
      await expect(departamento).toBeVisible({ timeout: 10_000 });
    }

    // "Unidade" so aparece para super admin; para nao-super (E2E_MULTI) a solicitacao herda a
    // unidade ativa (definida via switchActiveUnit acima). Condicional.
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

    // AFIRMA que a solicitacao aparece na lista (Fila = Todas + busca pelo titulo unico).
    await filterSolicitacoesAll(page, title);
    await expectVisibleInList(page, title);

    // ===== 3. Cotacao =====
    await openAuthenticated(page, "/compras/cotacoes");
    await page.locator("main select").first().selectOption("all");
    await page.locator("article").filter({ hasText: title }).getByTestId("cotacao-ver").click();
    const modal = page.getByRole("dialog");

    // Inicia a cotacao (solicitacao enviada -> em cotacao).
    await withApi(page, { url: "/quotes", method: "POST" }, () => modal.getByTestId("cotacao-iniciar").click());

    // Aba Cotacoes (sem testid) -> Nova cotacao.
    await modal.getByRole("button", { name: "Cotações", exact: true }).click();
    await modal.getByTestId("cotacao-nova").click();

    // Fornecedor [E2E] via dialogo "Novo fornecedor" dentro do form (auto-selecionado ao salvar).
    await modal.getByTestId("cotacao-novo-fornecedor").click();
    const supplierDialog = page.getByRole("dialog", { name: /cadastrar novo fornecedor/i });
    await supplierDialog.getByTestId("fornecedor-razao-social").fill(supplierName);
    await selectByOptionText(supplierDialog.getByTestId("fornecedor-tipo-documento"), "Outro");
    await supplierDialog.getByTestId("fornecedor-documento").fill(`E2E-${suffix}`);
    await withApi(page, { url: "/api/base/suppliers", method: "POST" }, () =>
      supplierDialog.getByTestId("fornecedor-salvar").click()
    );

    // Evidencia formal + valor <= R$200.
    await selectByOptionText(modal.getByTestId("cotacao-origem"), "Proposta formal/PDF");
    await selectByOptionText(modal.getByTestId("cotacao-tipo-evidencia"), "Arquivo anexado");
    await modal.getByTestId("cotacao-item-0-valor-unitario").fill("150");
    await withApi(page, { url: "/quotes", method: "POST" }, () => modal.getByTestId("cotacao-salvar").click());

    // AFIRMA que a cotacao salvou e aparece (card com o fornecedor [E2E]).
    await expect(modal.getByText(supplierName).first()).toBeVisible({ timeout: 30_000 });

    // Anexa a evidencia (fixture) e espera o POST /api/attachments retornar.
    await modal.getByTestId("cotacao-anexos").click();
    await modal.getByTestId("cotacao-anexo-arquivo").setInputFiles(fixturePath);
    await withApi(page, { url: "/api/attachments", method: "POST" }, () =>
      modal.getByTestId("cotacao-anexo-enviar").click()
    );

    // AFIRMA classificacao "Formal suficiente" (nao "Crítica") — recalculada ao vivo com o anexo.
    await modal.getByTestId("cotacao-ver-detalhes").first().click();
    await expect(modal.getByTestId("cotacao-classificacao").first()).toContainText("Formal suficiente", {
      timeout: 30_000
    });

    // SELECIONA vencedora.
    await withApi(page, { url: "/quotes/", method: "PATCH" }, () => modal.getByTestId("cotacao-selecionar").click());
    await expect(modal.getByText("Vencedora", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // ===== 4. ENVIAR para aprovacao =====
    await withApi(page, { url: "/resubmit", method: "POST" }, () =>
      modal.getByTestId("cotacao-enviar-aprovacao").click()
    );

    // AFIRMA status na lista de Solicitacoes.
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    // Matcher tolerante a quebra de linha/espacamento (badge em coluna estreita fragmenta o texto).
    await expect(
      page.getByText(/Aguardando\s+aprovação[\s\S]*Gerência\s+Administrativa/).first()
    ).toBeVisible({ timeout: 30_000 });

    // ===== INVARIANTE — estreitamento por unidade ativa =====
    // Unidade A ativa: consta. Unidade B ativa: some da lista operacional.
    await expectVisibleInList(page, title);
    await switchActiveUnit(page, unitB);
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    await expectAbsentFromList(page, title);

    // ===== INVARIANTE — Aprovacoes permanece AGGREGATE =====
    // Com unidade B ativa, a compra (da unidade A) continua visivel em Aprovacoes (visao de rede).
    await openAuthenticated(page, "/compras/aprovacoes");
    await page.getByPlaceholder(APROVACOES_SEARCH).fill(title);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

    // ===== 5. APROVAR (como E2E_MULTI) =====
    await page.locator("article").filter({ hasText: title }).getByTestId("aprovacao-ver-dossie").click();
    // Ancora cada dialog pelo botao que SO existe nele (evita ambiguidade entre o dossie e o modal
    // de decisao, que ficam abertos ao mesmo tempo; nomes/accessible names se sobrepoem).
    const approvalModal = page.getByRole("dialog").filter({ has: page.getByTestId("aprovacao-aprovar") });
    await approvalModal.getByTestId("aprovacao-aprovar").click();
    const decisionModal = page.getByRole("dialog").filter({ has: page.getByTestId("aprovacao-confirmar") });
    await withApi(page, { url: "/decision", method: "POST" }, () =>
      decisionModal.getByTestId("aprovacao-confirmar").click()
    );

    // AFIRMA "Compra aprovada" (unidade A ativa).
    await switchActiveUnit(page, unitA);
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    // Matcher tolerante a quebra de linha/espacamento (badge em coluna estreita pode quebrar).
    await expect(page.getByText(/Compra\s+aprovada/).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    // ===== Teardown (decisao A) =====
    // Compra aprovada e' imutavel pela regra de negocio: nao ha cancelamento via UI. O registro
    // permanece como residual identificavel por [E2E]+sufixo (sem hard-delete). Sem acao destrutiva.
    // eslint-disable-next-line no-console
    console.log(`[e2e][teardown] residual identificavel: ${title} (compra aprovada e' imutavel).`);
    await context.close();
  }
});
