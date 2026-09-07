import { expect, test, type Locator, type Page } from "@playwright/test";
import { authStatePath } from "./helpers/auth";

// ===========================================================================================
// A CASCA ABAIXO DE 1024px (plano docs/codex/73)
//
// POR QUE ESTE ARQUIVO EXISTE, e por que ele roda em projeto proprio: os dois configs do
// Playwright rodavam em 1440x1200. Se a gaveta quebrar, NINGUEM VE.
//
// E o modo de falha aqui NAO E' LOGICA -- e' CSS e DOM. `lg:hidden` trocado, z-index atras do
// header, foco preso, gaveta que nao fecha ao navegar. Teste unitario nao pega nada disso.
// Ja pagamos tres vezes por defeito que so' a execucao real pegou: o `organization_id` da 089,
// o `errcode` da 090 e o `PGRST203` da 091. A licao vale aqui, com outra fantasia.
//
// Roda nos projetos `tablet-retrato` (834x1112) e `tablet-paisagem` (1000x768) -- os dois
// ABAIXO do corte de 1024. A paisagem e' 1000 de proposito: e' a faixa do tablet pequeno
// deitado, onde um corte por ORIENTACAO (e nao por largura) erraria.
// ===========================================================================================

const GOVERNANCA = authStatePath("E2E_GOVERNANCA");
const ADMIN = authStatePath("E2E_ADMIN");

/**
 * Abre TODOS os grupos da arvore. Sem isto a comparacao do teste 5 nao vale nada: em
 * `/dashboard` nenhum grupo esta ativo, entao os dois lados renderizam dois links (`Dashboard` e
 * `Relatorios`) e a igualdade passa ate' contra a lista curada que o teste existe para proibir.
 * Medido: gaveta=2, barra=2, identico para governanta e para super admin.
 */
async function expandirGrupos(scope: Locator): Promise<void> {
  const fechados = scope.getByTestId("app-nav-tree").locator('button[aria-expanded="false"]');

  // Reavalia a cada volta: cada clique muda o conjunto que ainda esta fechado.
  for (let volta = 0; volta < 20; volta += 1) {
    if ((await fechados.count()) === 0) return;

    await fechados.first().click();
  }

  throw new Error("grupos demais: a arvore nao terminou de abrir em 20 cliques");
}

/**
 * Os rotulos da arvore de navegacao DENTRO de um recipiente -- a gaveta ou a barra, com todos os
 * grupos abertos. Inclui os rotulos dos GRUPOS (botoes), nao so' os links: um grupo que sumisse
 * de um dos lados tambem e' divergencia.
 *
 * O escopo nao e' zelo: os DOIS existem no DOM ao mesmo tempo. A barra e' `hidden ... lg:flex` e
 * a gaveta e' `lg:hidden`; abaixo de 1024 a barra continua montada, e depois de redimensionar
 * para cima a gaveta continua montada. Um `getByTestId("app-nav-tree")` solto casaria duas vezes.
 */
async function rotulosDoMenu(scope: Locator): Promise<string[]> {
  const tree = scope.getByTestId("app-nav-tree");
  await expect(tree).toBeVisible();

  await expandirGrupos(scope);

  return (await tree.locator("a, button").allTextContents()).map((texto) => texto.trim()).filter(Boolean);
}

/** A arvore renderizada pela gaveta. */
function gaveta(page: Page): Locator {
  return page.getByTestId("app-nav-drawer");
}

/** A arvore renderizada pela barra lateral do desktop. */
function barra(page: Page): Locator {
  return page.getByTestId("app-sidebar");
}

test.describe("Casca abaixo de 1024px", () => {
  test.use({ storageState: GOVERNANCA });

  test("1 - o usuario CONSEGUE sair da pagina em que caiu", async ({ page }) => {
    // A regressao que esta fatia existe para impedir. Antes dela, a barra lateral sumia abaixo
    // de 1024px e nao havia NADA no lugar: quem abrisse num tablet ficava preso na primeira
    // tela. Se um unico teste desta fatia tiver que passar, e' este.
    await page.goto("/dashboard");
    await expect(page.getByTestId("app-sidebar")).toBeHidden();

    await page.getByTestId("abrir-menu").click();
    await expect(page.getByTestId("app-nav-drawer")).toBeVisible();

    await gaveta(page).getByRole("link", { name: "Relatórios" }).click();

    await expect(page).toHaveURL(/\/relatorios/);
  });

  test("2 - o botao de menu existe abaixo de 1024 e NAO existe em 1440", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("abrir-menu")).toBeVisible();
    await expect(page.getByTestId("app-sidebar")).toBeHidden();

    // O SEGUNDO SENTIDO e' o que prova a D4: acima do corte, a casca e' a de hoje. Um teste que
    // so' afirmasse a presenca deixaria passar uma gaveta vazando para o desktop.
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.getByTestId("abrir-menu")).toBeHidden();
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
  });

  test("3 - a gaveta fecha ao navegar", async ({ page }) => {
    // Sem isto ela cobre exatamente a tela que a pessoa acabou de abrir, e ela precisa de um
    // segundo gesto para ver o resultado do primeiro.
    await page.goto("/dashboard");
    await page.getByTestId("abrir-menu").click();
    await gaveta(page).getByRole("link", { name: "Relatórios" }).click();

    await expect(page.getByTestId("app-nav-drawer")).toBeHidden();
  });

  test("4 - Esc e toque fora fecham a gaveta", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByTestId("abrir-menu").click();
    await expect(page.getByTestId("app-nav-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-nav-drawer")).toBeHidden();

    // Toque fora: o clique no overlay, longe do painel (que fica a esquerda).
    await page.getByTestId("abrir-menu").click();
    await expect(page.getByTestId("app-nav-drawer")).toBeVisible();
    const viewport = page.viewportSize();
    await page.mouse.click((viewport?.width ?? 800) - 20, 400);
    await expect(page.getByTestId("app-nav-drawer")).toBeHidden();

    // E o botao de fechar, que e' o alvo obvio para quem esta com o tablet numa mao so'.
    await page.getByTestId("abrir-menu").click();
    await page.getByTestId("fechar-menu").click();
    await expect(page.getByTestId("app-nav-drawer")).toBeHidden();
  });

  test("6 - todo alvo da gaveta tem ao menos 44px de altura", async ({ page }) => {
    // Dedo nao e' cursor, e este e' o piso pratico para uma mao em movimento. Medido no DOM
    // RENDERIZADO, nao na classe: e' a altura que o dedo encontra que importa.
    await page.goto("/dashboard");
    await page.getByTestId("abrir-menu").click();

    const alvos = page.getByTestId("app-nav-drawer").locator("a, button");
    const total = await alvos.count();

    expect(total).toBeGreaterThan(0);

    for (let indice = 0; indice < total; indice += 1) {
      const caixa = await alvos.nth(indice).boundingBox();

      if (!caixa) continue;

      expect(caixa.height, `alvo ${indice} tem ${caixa.height}px`).toBeGreaterThanOrEqual(44);
    }
  });

  test("7 - girar para o desktop nao reposiciona: o item ativo continua o mesmo", async ({ page }) => {
    await page.goto("/relatorios");
    await page.getByTestId("abrir-menu").click();
    await expect(page.getByTestId("app-nav-drawer")).toBeVisible();

    const ativoNaGaveta = await page
      .getByTestId("app-nav-drawer")
      .locator('[aria-current="page"]')
      .textContent();

    // Passa para acima do corte -- o equivalente a girar o tablet para paisagem num aparelho
    // grande. A gaveta some, a barra aparece, e o lugar da pessoa nao muda.
    await page.setViewportSize({ width: 1440, height: 900 });

    await expect(page.getByTestId("app-nav-drawer")).toBeHidden();
    await expect(page.getByTestId("app-sidebar")).toBeVisible();

    const ativoNaBarra = await page
      .getByTestId("app-sidebar")
      .locator('[aria-current="page"]')
      .textContent();

    expect(ativoNaBarra?.trim()).toBe(ativoNaGaveta?.trim());
  });
});

// ===========================================================================================
// O teste que trava a volta de uma SEGUNDA FONTE DE VERDADE (plano 73, D1).
//
// Roda nos DOIS extremos de menu: LIDER_GOVERNANCA (curto -- Apartamentos, Recepcao,
// Manutencao) e SUPER_ADMIN (longo, com grupos e subitens). Se alguem trocar a arvore
// compartilhada por uma lista curada, as duas divergem -- e divergencia de navegacao e'
// invisivel ate' alguem nao achar a tela.
// ===========================================================================================

test.describe("A gaveta e a barra mostram o MESMO menu", () => {
  for (const [perfil, estado] of [
    ["E2E_GOVERNANCA (menu curto)", GOVERNANCA],
    ["E2E_ADMIN (menu longo, com grupos)", ADMIN]
  ] as const) {
    test(`5 - ${perfil}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: estado, viewport: { width: 834, height: 1112 } });
      const page = await context.newPage();

      try {
        await page.goto("/dashboard");

        await page.getByTestId("abrir-menu").click();
        const naGaveta = await rotulosDoMenu(gaveta(page));

        // Mesma pagina, acima do corte: agora quem renderiza a arvore e' a barra lateral.
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(page.getByTestId("app-sidebar")).toBeVisible();
        const naBarra = await rotulosDoMenu(barra(page));

        // PISO EXPLICITO: com os grupos abertos, qualquer perfil que chegue aqui ve' muito mais
        // que os dois links do estado colapsado. Sem este piso, a igualdade passaria vazia.
        expect(naGaveta.length).toBeGreaterThan(8);
        expect(naGaveta).toEqual(naBarra);
      } finally {
        await context.close();
      }
    });
  }
});
