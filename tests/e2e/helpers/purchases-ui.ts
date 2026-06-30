import { expect, type Locator, type Page } from "@playwright/test";

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

/** /compras/solicitacoes: Fila = Todas (1o select do main) + busca (mesmo padrao do screenshots spec). */
export async function filterSolicitacoesAll(page: Page, term: string): Promise<void> {
  // Fila = "Todas" via data-testid (o filtro usa <div><Label/>><SelectField/></div>, estrutura
  // diferente do <Field>, entao o XPath por label nao casava). O select tem <option value="all">.
  await page.getByTestId("solicitacao-filtro-fila").selectOption("all");
  const box = page.getByPlaceholder("Número, título, unidade, departamento ou solicitante");
  await box.fill("");
  await box.fill(term);
}
