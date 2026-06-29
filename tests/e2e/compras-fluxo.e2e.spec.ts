import { expect, test, type Page } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";
import { expectAbsentFromList, expectVisibleInList, switchActiveUnit } from "./helpers/active-unit";
import {
  fieldControl,
  fillField,
  filterSolicitacoesAll,
  openAuthenticated,
  selectByOptionText,
  selectFieldOptionByText,
  selectFirstRealOption
} from "./helpers/purchases-ui";

// T2 — Fluxo de COMPRAS completo (100% UI) com E2E_MULTI (Gerente Departamental, nao-super,
// 2 unidades, com autoridade de aprovacao administrativa) + invariante de unidade ativa (Leva 2).
//
// LICAO DE BUG REAL: a cotacao DEVE ter anexo para classificar "Formal suficiente". Sem anexo =>
// "Critica" => forca alcada de Diretoria (que o Gerente nao tem). Por isso: valor <= R$200 +
// origem "Proposta formal/PDF" + tipo "Arquivo anexado" + UPLOAD de fixture (espera o POST
// /api/attachments retornar antes de prosseguir). Assim a alcada e' Gerencia Administrativa.
//
// GAP DE TESTABILIDADE (relatado): os formularios usam <Field> com <Label> sem htmlFor e sem
// data-testid => locators ancorados no TEXTO EXATO do label (ver helpers/purchases-ui.ts).
//
// Pre-requisitos de staging: E2E_UNIT_A_NAME/B_NAME; E2E_MULTI com acesso as duas e autoridade
// de aprovacao administrativa; ao menos 1 departamento na unidade A; ao menos 1 fornecedor ativo
// na unidade A (para habilitar "Nova cotacao"; o [E2E] e' criado via dialogo dentro do form).

const SOLICITACOES_APROVACAO_SEARCH = "Número, título, fornecedor ou solicitante";

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
    // Unidade A ativa (ponto de partida do fluxo operacional).
    await openAuthenticated(page, "/compras/solicitacoes");
    await switchActiveUnit(page, unitA);

    // ===== 2. Criar SOLICITACAO [E2E] (unidade A) =====
    await openAuthenticated(page, "/compras/solicitacoes");
    await page.getByRole("button", { name: "Nova solicitação" }).click();
    const reqForm = page.locator("form");
    await selectByOptionText(fieldControl(reqForm, "Unidade"), unitA);
    await selectFirstRealOption(reqForm, "Departamento");
    await fillField(reqForm, "Título", title);
    await fillField(reqForm, "O que precisa ser comprado?", `Descricao ${suffix}`);
    await fillField(reqForm, "Por que essa compra é necessária?", `[E2E] justificativa ${suffix}`);
    await fillField(reqForm, "Descrição", `Item ${suffix}`);
    await fillField(reqForm, "Quantidade", "1");
    await selectFieldOptionByText(reqForm, "Unidade de medida", "UN");
    await withApi(page, { url: "/api/purchases/requests", method: "POST" }, () =>
      page.getByRole("button", { name: "Enviar para análise" }).click()
    );

    // AFIRMA que a solicitacao aparece na lista (Fila = Todas + busca pelo titulo unico).
    await filterSolicitacoesAll(page, title);
    await expectVisibleInList(page, title);

    // ===== 3. Cotacao =====
    await openAuthenticated(page, "/compras/cotacoes");
    await page.locator("main select").first().selectOption("all");
    const requestCard = page.locator("article").filter({ hasText: title });
    await requestCard.getByRole("button", { name: "Ver cotações" }).click();
    const modal = page.getByRole("dialog");

    // Inicia a cotacao (solicitacao enviada -> em cotacao).
    await withApi(page, { url: "/quotes", method: "POST" }, () =>
      modal.getByRole("button", { name: "Iniciar cotação" }).click()
    );

    // Aba Cotacoes -> Nova cotacao.
    await modal.getByRole("button", { name: "Cotações", exact: true }).click();
    await modal.getByRole("button", { name: "Nova cotação" }).click();

    // Fornecedor [E2E] via dialogo "Novo fornecedor" dentro do form (auto-selecionado ao salvar).
    await modal.getByRole("button", { name: "Novo fornecedor" }).click();
    const supplierDialog = page.getByRole("dialog", { name: "Cadastrar novo fornecedor" });
    await fillField(supplierDialog, "Razão social / Nome do fornecedor", supplierName);
    await selectFieldOptionByText(supplierDialog, "Tipo de documento", "Outro");
    await fillField(supplierDialog, "CNPJ/CPF", `E2E-${suffix}`);
    await withApi(page, { url: "/api/base/suppliers", method: "POST" }, () =>
      supplierDialog.getByRole("button", { name: "Salvar fornecedor" }).click()
    );

    // Evidencia formal + valor <= R$200.
    await selectFieldOptionByText(modal, "Origem da cotação", "Proposta formal/PDF");
    await selectFieldOptionByText(modal, "Tipo de evidência", "Arquivo anexado");
    await fillField(modal, "Valor unitário", "150");
    await withApi(page, { url: "/quotes", method: "POST" }, () =>
      modal.getByRole("button", { name: "Salvar cotação" }).click()
    );

    // AFIRMA que a cotacao salvou e aparece (card com o fornecedor [E2E]).
    await expect(modal.getByText(supplierName).first()).toBeVisible({ timeout: 30_000 });

    // Anexa a evidencia (fixture) e espera o POST /api/attachments retornar.
    await modal.getByRole("button", { name: /^Anexos/ }).click();
    await modal.locator('input[type="file"]').setInputFiles(fixturePath);
    await withApi(page, { url: "/api/attachments", method: "POST" }, () =>
      modal.getByRole("button", { name: "Enviar anexo" }).click()
    );

    // AFIRMA classificacao "Formal suficiente" (nao "Crítica") — recalculada ao vivo com o anexo.
    await modal.getByRole("button", { name: "Ver detalhes" }).first().click();
    await expect(modal.getByText("Formal suficiente").first()).toBeVisible({ timeout: 30_000 });

    // SELECIONA vencedora.
    await withApi(page, { url: "/quotes/", method: "PATCH" }, () =>
      modal.getByRole("button", { name: "Selecionar", exact: true }).click()
    );
    await expect(modal.getByText("Vencedora", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    // ===== 4. ENVIAR para aprovacao =====
    await withApi(page, { url: "/resubmit", method: "POST" }, () =>
      modal.getByRole("button", { name: "Enviar para aprovação" }).click()
    );

    // AFIRMA status na lista de Solicitacoes.
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    await expect(page.getByText("Aguardando aprovação da Gerência Administrativa").first()).toBeVisible({
      timeout: 30_000
    });

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
    await page.getByPlaceholder(SOLICITACOES_APROVACAO_SEARCH).fill(title);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

    // ===== 5. APROVAR (como E2E_MULTI) =====
    const approvalCard = page.locator("article").filter({ hasText: title });
    await approvalCard.getByRole("button", { name: "Ver dossiê" }).click();
    const approvalModal = page.getByRole("dialog");
    await approvalModal.getByRole("button", { name: "Aprovar", exact: true }).click();
    const decisionModal = page.getByRole("dialog", { name: "Aprovar compra" });
    await withApi(page, { url: "/decision", method: "POST" }, () =>
      decisionModal.getByRole("button", { name: /^Confirmar aprovação/ }).click()
    );

    // AFIRMA "Compra aprovada" (unidade A ativa).
    await switchActiveUnit(page, unitA);
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    await expect(page.getByText("Compra aprovada").first()).toBeVisible({ timeout: 30_000 });
  } finally {
    // ===== Teardown (decisao A) =====
    // Compra aprovada e' imutavel pela regra de negocio: nao ha cancelamento via UI. O registro
    // permanece como residual identificavel por [E2E]+sufixo (sem hard-delete). Sem acao destrutiva.
    // eslint-disable-next-line no-console
    console.log(`[e2e][teardown] residual identificavel: ${title} (compra aprovada e' imutavel).`);
    await context.close();
  }
});
