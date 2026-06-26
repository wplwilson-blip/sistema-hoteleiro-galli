import { expect, test, type Page } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { e2eLabel, runSuffix } from "./helpers/data";
import { expectAbsentFromList, expectVisibleInList, switchActiveUnit } from "./helpers/active-unit";
import {
  approvePurchase,
  createQuote,
  createSubmittedRequest,
  createSupplier,
  getPurchaseOptions,
  getRequiredUnitNames,
  newApiContext,
  pickDepartmentForUnit,
  pickUnitByName,
  selectQuoteWinner,
  sendToApproval,
  tryCancelRequest
} from "./helpers/purchases";

// T2 — Fluxo de COMPRAS completo (com escrita) + invariante de unidade ativa (Leva 2).
//
// ESTRATEGIA (relatada no resumo da entrega):
//  - Os DADOS (fornecedor -> solicitacao -> cotacao -> vencedora -> envio -> aprovacao) sao
//    criados pelos ENDPOINTS REST reais do app, autenticados como E2E_ADMIN (super admin, que
//    tem todas as permissoes: userHasPermissionForUnit curto-circuita p/ super admin). Isso
//    cobre "cria->cota->vencedora->envia->aprova" com asseracao de status, sem depender de
//    grants incertos do E2E_MULTI (approvals.submit / approvals.decide.administrative /
//    BASE:suppliers.manage).
//  - O INVARIANTE de unidade ativa e' provado pela UI com E2E_MULTI (nao-super, 2 unidades) —
//    estreitamento so e' demonstravel com usuario nao-super.
//  - Valor da cotacao <= R$200 + evidencia NAO-critica (email + copia + referencia =>
//    "formal_sufficient") => alcada por VALOR = Gerencia Administrativa (sem forcar Diretoria).
//
// Pre-requisitos de staging: E2E_UNIT_A_NAME / E2E_UNIT_B_NAME (2 unidades reais), E2E_MULTI
// com acesso as duas, e um departamento na unidade A.

const SOLICITACOES_SEARCH = "Número, título, unidade, departamento ou solicitante";
const APROVACOES_SEARCH = "Número, título, fornecedor ou solicitante";

async function openAuthenticated(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page, `Redirecionado para /login ao abrir ${route}.`).not.toHaveURL(/\/login(?:$|[/?#])/);
  await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
}

// Solicitacoes: Fila = Todas (1o select do main, mesmo padrao do screenshots spec) + busca.
async function searchSolicitacoes(page: Page, term: string): Promise<void> {
  await page.locator("main select").first().selectOption("all");
  const box = page.getByPlaceholder(SOLICITACOES_SEARCH);
  await box.fill("");
  await box.fill(term);
}

test("compras: fluxo completo (<=R$200) + invariante de unidade ativa", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const base = baseURL ?? "http://localhost:3000";
  const { unitA, unitB } = getRequiredUnitNames();
  const suffix = runSuffix();
  const title = e2eLabel("Compra");

  const adminApi = await newApiContext(authStatePath("E2E_ADMIN"), base);
  const multiContext = await browser.newContext({ storageState: authStatePath("E2E_MULTI") });
  const adminContext = await browser.newContext({ storageState: authStatePath("E2E_ADMIN") });
  const multiPage = await multiContext.newPage();
  const adminPage = await adminContext.newPage();

  let requestId = "";
  let requestNumber = "";

  try {
    // ===== Fase 1 — setup de dados via API (E2E_ADMIN) =====
    const options = await getPurchaseOptions(adminApi);
    const unit = pickUnitByName(options, unitA);
    const department = pickDepartmentForUnit(options, unit.id);

    const supplierId = await createSupplier(adminApi, { unitId: unit.id, name: e2eLabel("Fornecedor") });
    const created = await createSubmittedRequest(adminApi, {
      unitId: unit.id,
      departmentId: department.id,
      title,
      justification: "[E2E] justificativa de teste automatizado.",
      itemDescription: e2eLabel("Item")
    });
    requestId = created.id;
    requestNumber = created.requestNumber;

    const quoteId = await createQuote(adminApi, created, {
      supplierId,
      unitPrice: 150,
      sourceReference: `REF-E2E-${suffix}`
    });
    await selectQuoteWinner(adminApi, requestId, quoteId);

    // AFIRMA estado pos-vencedora (E2E_ADMIN ve agregado): "Vencedora selecionada".
    await openAuthenticated(adminPage, "/compras/solicitacoes");
    await searchSolicitacoes(adminPage, title);
    await expect(adminPage.getByText(requestNumber).first()).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.getByText("Vencedora selecionada").first()).toBeVisible({ timeout: 30_000 });

    // ===== Fase 2 — invariante de unidade ativa em Solicitacoes (E2E_MULTI, UI) =====
    await openAuthenticated(multiPage, "/compras/solicitacoes");

    // Unidade A ativa -> a solicitacao [E2E] CONSTA na lista operacional.
    await switchActiveUnit(multiPage, unitA);
    await openAuthenticated(multiPage, "/compras/solicitacoes"); // reload: fetch escopado server-side a A
    await searchSolicitacoes(multiPage, title);
    await expectVisibleInList(multiPage, requestNumber);

    // Troca para unidade B -> a solicitacao da A SOME da lista operacional (estreitamento).
    await switchActiveUnit(multiPage, unitB);
    await openAuthenticated(multiPage, "/compras/solicitacoes"); // reload: fetch escopado server-side a B
    await searchSolicitacoes(multiPage, title);
    await expectAbsentFromList(multiPage, requestNumber);

    // ===== Fase 3 — enviar para aprovacao (API, E2E_ADMIN) =====
    await sendToApproval(adminApi, requestId);

    // AFIRMA status pos-envio (E2E_ADMIN): "Aguardando aprovação da Gerência Administrativa".
    await openAuthenticated(adminPage, "/compras/solicitacoes");
    await searchSolicitacoes(adminPage, title);
    await expect(adminPage.getByText("Aguardando aprovação da Gerência Administrativa").first()).toBeVisible({
      timeout: 30_000
    });

    // ===== Fase 4 — Aprovacoes permanece AGGREGATE (E2E_MULTI com unidade B ativa) =====
    // A compra e' da unidade A; com B ativa, ela DEVE continuar visivel em Aprovacoes (visao de rede).
    await openAuthenticated(multiPage, "/compras/aprovacoes");
    await switchActiveUnit(multiPage, unitB);
    await openAuthenticated(multiPage, "/compras/aprovacoes"); // reload: fetch com B ativa
    await multiPage.getByPlaceholder(APROVACOES_SEARCH).fill(title);
    await expect(multiPage.getByText(requestNumber).first()).toBeVisible({ timeout: 30_000 });

    // ===== Fase 5 — aprovar (API, E2E_ADMIN) e AFIRMAR "Compra aprovada" =====
    await approvePurchase(adminApi, requestId);

    await openAuthenticated(adminPage, "/compras/solicitacoes");
    await searchSolicitacoes(adminPage, title);
    await expect(adminPage.getByText(requestNumber).first()).toBeVisible({ timeout: 30_000 });
    await expect(adminPage.getByText("Compra aprovada").first()).toBeVisible({ timeout: 30_000 });
  } finally {
    // ===== Teardown (decisao A: soft-delete via app, sem hard-delete) =====
    // Compra aprovada e' imutavel pela regra de negocio (cancelamento retorna 409): nesse caso
    // o registro permanece como residual identificavel por [E2E]+sufixo. Best-effort, nao-fatal.
    if (requestId) {
      const cancelled = await tryCancelRequest(adminApi, requestId).catch(() => false);
      // eslint-disable-next-line no-console
      console.log(
        `[e2e][teardown] solicitacao ${requestNumber || requestId}: ` +
          (cancelled
            ? "cancelada (soft-delete via app)."
            : "nao cancelavel (compra aprovada e' imutavel) -> residual [E2E] esperado, sem hard-delete.")
      );
    }

    await adminApi.dispose();
    await multiContext.close();
    await adminContext.close();
  }
});
