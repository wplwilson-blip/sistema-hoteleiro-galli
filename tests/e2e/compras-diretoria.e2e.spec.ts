import { expect, test } from "@playwright/test";
import { authStatePath } from "./helpers/auth";
import { filterSolicitacoesAll, openAuthenticated } from "./helpers/purchases-ui";
import { createPurchaseAwaitingApproval, expectApiStatus } from "./helpers/purchases-flow";

// T3 — Alcada de DIRETORIA (>R$200) + BLOQUEIO de aprovacao (seguranca server-side).
//
// Reusa a jornada comum do T2 (helpers/purchases-flow) com unitPrice=300 (>R$200 -> Diretoria).
// O anexo mantem a evidencia "Formal suficiente", entao a alcada de Diretoria vem PURAMENTE do valor
// (isola o roteamento por valor do roteamento por evidencia critica).
//
// Cerne: E2E_MULTI (DEPARTMENT_MANAGER) tem so approvals.decide.administrative, NAO tem
// approvals.decide.directorate. A UI MOSTRA o botao Aprovar (sem gate de alcada), mas o servidor
// retorna 403 em POST .../decision. O teste prova o 403 (seguranca real), nao a UI.
//
// Pre-requisito de staging (verificado): e2e_multi SEM decide.directorate.

const APROVACOES_SEARCH = "Número, título, fornecedor ou solicitante";
const STATUS_DIRETORIA = /Aguardando\s+aprovação[\s\S]*Diretoria\s+Geral/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[e2e] Variavel de ambiente ausente: ${name}. Veja .env.e2e.example.`);
  }
  return value;
}

test("compras: alcada de Diretoria (>R$200) bloqueia aprovacao de Gerencia (403) — E2E_MULTI", async ({
  browser
}) => {
  test.setTimeout(240_000);

  const unitA = requireEnv("E2E_UNIT_A_NAME");
  const context = await browser.newContext({ storageState: authStatePath("E2E_MULTI") });
  const page = await context.newPage();
  let title = "";

  try {
    // Jornada comum com valor > R$200 (anexo mantem "Formal suficiente" -> Diretoria vem do VALOR).
    ({ title } = await createPurchaseAwaitingApproval({ page, unitA, unitPrice: 300 }));

    // ===== (a) ROTEAMENTO: alcada de Diretoria pelo valor =====
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    await expect(page.getByText(STATUS_DIRETORIA).first()).toBeVisible({ timeout: 30_000 });

    // ===== (b) BLOQUEIO: E2E_MULTI (Gerencia) NAO aprova Diretoria -> POST /decision = 403 =====
    await openAuthenticated(page, "/compras/aprovacoes");
    await page.getByPlaceholder(APROVACOES_SEARCH).fill(title);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

    await page.locator("article").filter({ hasText: title }).getByTestId("aprovacao-ver-dossie").click();
    // Ancora cada dialog pelo botao que so existe nele (dossie + modal de decisao ficam sobrepostos).
    const approvalModal = page.getByRole("dialog").filter({ has: page.getByTestId("aprovacao-aprovar") });
    await approvalModal.getByTestId("aprovacao-aprovar").click();
    const decisionModal = page.getByRole("dialog").filter({ has: page.getByTestId("aprovacao-confirmar") });

    // Prova server-side: o clique dispara POST /decision, que o servidor recusa com 403.
    await expectApiStatus(
      page,
      { url: "/decision", method: "POST" },
      () => decisionModal.getByTestId("aprovacao-confirmar").click(),
      403
    );

    // Reforco (opcional): a UI exibe a mensagem de autoridade restrita dentro do modal de decisao.
    await expect(decisionModal.getByText(/autoridade/i).first()).toBeVisible({ timeout: 10_000 });

    // ===== (c) O 403 preservou o estado: NAO virou "Compra aprovada"; segue pendente de Diretoria =====
    await openAuthenticated(page, "/compras/solicitacoes");
    await filterSolicitacoesAll(page, title);
    await expect(page.getByText(STATUS_DIRETORIA).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Compra\s+aprovada/)).toHaveCount(0);
  } finally {
    // Teardown (decisao A): a compra fica PENDENTE de Diretoria (nao aprovada) e nao e' cancelavel via
    // UI (tem dossie pendente) -> residual identificavel [E2E]+sufixo, sem hard-delete.
    // eslint-disable-next-line no-console
    console.log(`[e2e][teardown] residual identificavel: ${title || "(sem titulo)"} (pendente de Diretoria).`);
    await context.close();
  }
});
