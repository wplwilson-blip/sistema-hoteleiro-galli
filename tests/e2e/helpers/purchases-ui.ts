import { expect, type Locator, type Page } from "@playwright/test";
import { uniqueE2ESupplierDocument } from "./data";

// Helpers de UI para o fluxo de Compras (T2).
//
// IMPORTANTE (gap de testabilidade): as telas usam o wrapper <Field> que renderiza um
// <Label> SEM htmlFor/id e os controles NAO tem data-testid nem placeholder na maioria.
// Logo, getByLabel NAO resolve. Ancoramos por TEXTO EXATO do label: o controle
// (input/select/textarea) e' o irmao seguinte do <label>, dentro do mesmo <div> do Field.
// E' a opcao mais estavel possivel sem tocar no codigo do app (copy dos labels e' estavel).

/** Localiza o controle (input/select/textarea) de um Field pelo texto EXATO do label. */
export function fieldControl(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(
    `xpath=.//label[normalize-space(.)=${xpathLiteral(labelText)}]/following-sibling::*[self::input or self::select or self::textarea][1]`
  );
}

function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat("${value.replace(/"/g, '", \'"\', "')}")`;
}

/** Preenche um input/textarea de Field pelo label. */
export async function fillField(scope: Page | Locator, labelText: string, value: string): Promise<void> {
  const control = fieldControl(scope, labelText);
  await control.fill(value);
}

/** Seleciona, num <select> de Field, a opcao cujo texto CONTEM optionText (casa por valor). */
export async function selectFieldOptionByText(scope: Page | Locator, labelText: string, optionText: string): Promise<void> {
  const select = fieldControl(scope, labelText);
  await selectByOptionText(select, optionText);
}

/** Seleciona num <select> a opcao cujo texto contem optionText (resolve o value real). */
export async function selectByOptionText(select: Locator, optionText: string): Promise<void> {
  // Selects assincronos (ex.: dependentes da unidade ativa) populam apos o render inicial.
  // Espera a opcao alvo existir antes de ler o value.
  const option = select.locator("option", { hasText: optionText }).first();
  try {
    await option.waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    throw new Error(`[e2e] Opcao contendo "${optionText}" nao encontrada no select apos aguardar carregamento.`);
  }

  const value = await option.getAttribute("value");
  if (!value) {
    throw new Error(`[e2e] Opcao contendo "${optionText}" nao encontrada no select.`);
  }
  await select.selectOption(value);
}

/** Seleciona a primeira opcao "real" (value nao-vazio) de um <select> ja localizado. */
export async function selectFirstReal(select: Locator, name = "select"): Promise<string> {
  // Select assincrono (ex.: Departamento depende da unidade ativa, setada apos o render inicial).
  // Espera a primeira opcao com value nao-vazio carregar antes de ler as opcoes.
  const firstReal = select.locator('option[value]:not([value=""])').first();
  try {
    await firstReal.waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    throw new Error(`[e2e] Nenhuma opcao valida no ${name} apos aguardar carregamento.`);
  }

  const values = await select.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => ({ value: o.value, text: o.textContent ?? "" }))
  );
  const real = values.find((o) => o.value && o.value.trim() !== "");
  if (!real) {
    throw new Error(`[e2e] Nenhuma opcao valida no ${name}.`);
  }
  await select.selectOption(real.value);
  return real.text.trim();
}

/** Variante por label (Field): mantida para compatibilidade. */
export async function selectFirstRealOption(scope: Page | Locator, labelText: string): Promise<string> {
  return selectFirstReal(fieldControl(scope, labelText), `select "${labelText}"`);
}

/** Abre uma rota autenticada e confirma que a sessao esta ativa. */
export async function openAuthenticated(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page, `Redirecionado para /login ao abrir ${route}.`).not.toHaveURL(/\/login(?:$|[/?#])/);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
}

/** /compras/solicitacoes: Fila = Todas (via data-testid, auto-verificado) + busca. */
export async function filterSolicitacoesAll(page: Page, term: string): Promise<void> {
  // O select Fila e' nativo CONTROLADO (value={statusFilter} + onChange setStatusFilter). Se a
  // selecao ocorre antes da hidratacao/refetch inicial, o onChange nao dispara e o React
  // re-renderiza de volta para "active". Por isso: (1) espera a tela assentar (networkidle) e
  // (2) re-tenta selecionar ate o value fixar em "all" (toPass + toHaveValue confirmam o estado).
  await page.waitForLoadState("networkidle");
  const fila = page.getByTestId("solicitacao-filtro-fila");
  await expect(async () => {
    await fila.selectOption("all");
    await expect(fila).toHaveValue("all");
  }).toPass({ timeout: 10_000 });

  const box = page.getByPlaceholder("Número, título, unidade, departamento ou solicitante");
  await box.fill("");
  await box.fill(term);
}

/**
 * Cria um fornecedor [E2E] via o dialogo "Novo fornecedor" dentro do modal de cotacao e espera o
 * POST /api/base/suppliers retornar 2xx (lanca com o corpo em caso de erro).
 *
 * CAMINHO UNICO de criacao de fornecedor [E2E]: tanto o helper T2 (purchases-flow) quanto a copia
 * inline do spec T2 chamam ISTO — nao ha mais geracao de documento por conta propria (evita
 * "corrigir num lugar e esquecer no outro"). O documento usa uniqueE2ESupplierDocument() (so
 * digitos, unico por rodada) para nao colidir no indice unico de suppliers (migration 014).
 * Mantem document_type "Outro" e a razao social [E2E] (que pode repetir — nao tem indice unico).
 */
export async function createE2ESupplierViaDialog(page: Page, modal: Locator, supplierName: string): Promise<void> {
  await modal.getByTestId("cotacao-novo-fornecedor").click();
  const supplierDialog = page.getByRole("dialog", { name: /cadastrar novo fornecedor/i });
  await supplierDialog.getByTestId("fornecedor-razao-social").fill(supplierName);
  await selectByOptionText(supplierDialog.getByTestId("fornecedor-tipo-documento"), "Outro");
  await supplierDialog.getByTestId("fornecedor-documento").fill(uniqueE2ESupplierDocument());

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/base/suppliers") && r.request().method() === "POST",
      { timeout: 30_000 }
    ),
    supplierDialog.getByTestId("fornecedor-salvar").click()
  ]);
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`[e2e] POST /api/base/suppliers falhou (HTTP ${response.status()}): ${body.slice(0, 300)}`);
  }
}
