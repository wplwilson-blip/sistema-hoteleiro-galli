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

  // WARM-UP DE HIDRATACAO (correcao 2 — docs/codex/15-plano-warmup-seletor.md).
  // O bloco do seletor (label sr-only + <select>) e' renderizado pelo CLIENT component
  // ActiveUnitSwitcher e so aparece quando `isMultiUnit = units.length > 1`
  // (active-unit-switcher.tsx:53,66). O array `units` vem do app-store, que INICIA VAZIO
  // (store/app-store.ts:47) e so e' semeado com as unidades APOS a hidratacao (seed do
  // SessionContext no AppProviders, "use client"). Logo esse bloco NAO existe no HTML inicial/SSR —
  // ele so e' ANEXADO ao DOM depois que o componente hidrata. Esperar o <select> ANEXAR e', portanto,
  // um sinal POSITIVO de que a hidratacao concluiu, absorvendo a 1a compilacao (fria) da rota /compras.
  // (Esperar um elemento sempre-presente/SSR — MapPin, nome da unidade ou nome do perfil — NAO
  // resolveria: eles aparecem ANTES da hidratacao e a instabilidade voltaria disfarcada.)
  await select.waitFor({ state: "attached", timeout: 30_000 });

  // Rede de seguranca (nao e' o conserto principal): apos a hidratacao a visibilidade e' quase
  // sincrona; 10s cobrem apenas o ultimo render.
  await expect(
    select,
    "Seletor de unidade ativa nao encontrado no header (usuario e' multiunidade?)."
  ).toBeVisible({ timeout: 10_000 });

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
