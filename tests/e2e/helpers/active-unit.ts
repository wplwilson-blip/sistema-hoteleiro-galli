import { expect, type Page } from "@playwright/test";

// Helpers de unidade ativa (seletor do header: ActiveUnitSwitcher).
// O <select> tem aria-label "Trocar unidade ativa" e so aparece para usuarios multiunidade.
// As opcoes exibem "CODE - Nome" ou apenas "Nome" (quando sem code).

const SWITCHER_LABEL = "Trocar unidade ativa";

/**
 * Troca a unidade ativa pelo seletor do header. `unitName` casa por texto parcial
 * com o rotulo da opcao (cobre tanto "Nome" quanto "CODE - Nome").
 * Aguarda o POST /api/auth/active-unit + refetch estabilizarem.
 */
export async function switchActiveUnit(page: Page, unitName: string): Promise<void> {
  const select = page.getByLabel(SWITCHER_LABEL);
  await expect(
    select,
    "Seletor de unidade ativa nao encontrado no header (usuario e' multiunidade?)."
  ).toBeVisible();

  const optionValue = await select.locator("option", { hasText: unitName }).first().getAttribute("value");
  if (!optionValue) {
    throw new Error(`[e2e] Unidade "${unitName}" nao encontrada no seletor de unidade ativa.`);
  }

  await select.selectOption(optionValue);

  // Asserção determinística: o select passou a refletir a unidade alvo (não depende
  // de texto do header, que pode colidir entre nomes de unidades parecidos).
  await expect(select).toHaveValue(optionValue);

  // A troca dispara o endpoint /api/auth/active-unit + refetch das listas escopadas;
  // espera a rede assentar antes de seguir com as asserções.
  await page.waitForLoadState("networkidle");
}

/** Afirma que um texto consta na lista/pagina visivel. */
export async function expectVisibleInList(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
}

/** Afirma que um texto NAO consta (count 0) na lista/pagina visivel. */
export async function expectAbsentFromList(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: false })).toHaveCount(0);
}
