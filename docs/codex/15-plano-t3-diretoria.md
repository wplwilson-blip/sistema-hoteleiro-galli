# Plano — T3: alçada de DIRETORIA (>R$200) + bloqueio de aprovação

> **Plano. Sem código de teste ainda.** Aprovar antes. Toca asserção de autorização (segurança).
> Reaproveita a infra do T2. Só `tests/e2e/` (nenhum `data-testid` novo necessário — ver §5).

## 1. Regra de negócio (confirmada no código)

- Total > R$200 → `approval_level = general_directorate` (`src/lib/purchases/api.ts` `getPurchaseApprovalLevel`).
- Decidir `general_directorate` exige `PURCHASES:approvals.decide.directorate` na unidade
  (`src/lib/purchases/approval-authorization.ts` → `assertCanDecidePurchaseApprovalLevel`).
- `E2E_MULTI` (DEPARTMENT_MANAGER) tem **só** `decide.administrative` → **não** pode aprovar Diretoria.
- Envio para aprovação exige **1 cotação selecionada** (sem trava de "3 cotações"). Fluxo de criação =
  igual ao T2, só muda o valor.
- Status na lista para Diretoria: **"Aguardando aprovação da Diretoria Geral"**
  (`purchase-requests-client.tsx:206`).

## 2. Investigação do botão (ponto crítico) — RESULTADO

O bloco de decisão em `purchase-approvals-client.tsx:695-713` é renderizado por:

```tsx
{selectedApproval.approvalStatus === "pending" && !selectedApproval.isLegacyWithoutSnapshot ? (
  ... <Button data-testid="aprovacao-aprovar"> ... </Button> ...
) : null}
```

**Não há checagem de alçada/permissão na UI.** Logo a tela **MOSTRA** o botão "Aprovar" também para
quem não tem `decide.directorate`. "Esconder botão não é segurança" — e aqui nem esconde: a garantia é
**server-side** (o `POST .../decision` retorna **403**).

### Estratégia de prova (server-side, o cerne do T3)

Como o botão é mostrado, o teste **dirige pela UI** até "Confirmar aprovação" e **captura a resposta do
`POST /api/purchases/approvals/{id}/decision`, asseverando HTTP 403** (autoridade restrita). Isso prova a
segurança real (não a UI). O `withApi` do T2 **falha** em não-2xx, então o T3 usa um matcher próprio:

```ts
// aguarda a resposta e afirma o status (sem lancar em 4xx, ao contrario do withApi)
async function expectApiStatus(page, match: {url;method}, action, status) {
  const [res] = await Promise.all([page.waitForResponse(r => r.url().includes(match.url) && r.request().method()===match.method), action()]);
  expect(res.status()).toBe(status);
  return res;
}
```

- Asserção primária: `expectApiStatus(page, {url:"/decision", method:"POST"}, () => confirmar.click(), 403)`.
- Asserção secundária (opcional, tolerante): a UI mostra a mensagem de erro
  (`decisionMutation.onError` → texto "restrita a Diretoria Geral"/"nao possui autoridade"); afirmável
  com `toContainText(/Diretoria Geral|autoridade/i)` no container de erro. Mensagem-fonte:
  `approval-authorization.ts` ("Aprovacao restrita a Diretoria Geral. Seu perfil nao possui autoridade
  para decidir este dossie nesta unidade."). Mantida como reforço, não como garantia.

## 3. Como força > R$200 (roteamento por VALOR)

- Mesma criação do T2, com **`cotacao-item-0-valor-unitario` = "300"** (qty 1 → total R$300 > 200).
- **Manter o anexo** (origem "Proposta formal/PDF" + "Arquivo anexado" + upload do fixture) → evidência
  classifica **"Formal suficiente"** (não "Crítica"). Assim a alçada de Diretoria vem **puramente do
  valor** (`getPurchaseApprovalLevel(300)`), isolando o roteamento por valor — sem o confundir com o
  roteamento por evidência crítica (que também levaria a Diretoria). Isso torna a asserção (a) limpa.

## 4. Estrutura do spec (`tests/e2e/compras-diretoria.e2e.spec.ts`)

Usuário **E2E_MULTI**, unidade A ativa. Passos:
1. (reuso) criar solicitação `[E2E]` na unidade A → iniciar cotação → criar fornecedor `[E2E]` →
   cotação **R$300 com anexo** → afirmar classificação "Formal suficiente" → selecionar vencedora →
   enviar para aprovação.
2. **(a) ROTEAMENTO:** em `/compras/solicitacoes` (Fila=Todas + busca por título), afirmar status
   **/Aguardando\s+aprovação[\s\S]*Diretoria\s+Geral/** (regex tolerante a quebra, como no T2).
3. **(b) BLOQUEIO:** em `/compras/aprovacoes`, abrir o dossiê (`aprovacao-ver-dossie` no card do título),
   clicar **Aprovar** (`aprovacao-aprovar`) → **Confirmar aprovação** (`aprovacao-confirmar`), capturando
   o `POST /decision` e afirmando **403**. (+ opcional: mensagem de autoridade restrita na UI.)
4. **Afirmar que NÃO aprovou:** o status permanece "Aguardando aprovação da Diretoria Geral" (a compra
   não vira "Compra aprovada"). Reforça que o 403 preservou o estado.

Invariante de unidade ativa **não** é foco do T3 (já coberto no T2); o T3 foca alçada/segurança.

## 5. Reaproveitamento (e o que NÃO duplicar)

- **Extrair helper compartilhado** `tests/e2e/helpers/purchases-flow.ts` com a jornada comum
  "criar solicitação → cotação com anexo → vencedora → enviar", parametrizada por `unitPrice`
  (T2 usa 150, T3 usa 300) e retornando `{ title }`. Reusa `purchases-ui.ts` (fieldControl/selects,
  `filterSolicitacoesAll`, `openAuthenticated`), os `data-testid`, `withApi`, `switchActiveUnit`.
- **T3** consome esse helper. **T2**: recomendo **NÃO** refatorar agora (acabou de ficar verde após
  muitas iterações) — migrar o T2 para o helper compartilhado fica como passo separado/opcional, para
  não reabrir risco no T2. **Decisão pedida:** (i) helper novo + T3 só (recomendado), ou (ii) helper +
  refatorar T2 junto.
- `data-testid`: **nenhum novo é necessário** — `aprovacao-ver-dossie/-aprovar/-confirmar`,
  `solicitacao-filtro-fila`, busca e os campos de cotação/fornecedor já existem (do T2). **Não toca app.**

## 6. Credenciais / pré-requisitos

- Mesmos do T2: `E2E_MULTI` (DEPARTMENT_MANAGER, 2 unidades, cria/cota/anexa/envia), `E2E_UNIT_A_NAME`,
  fornecedor/departamento na unidade A. **Confirmado:** E2E_MULTI tem `decide.administrative` mas **não**
  `decide.directorate` — pré-condição do bloqueio. Se em staging o E2E_MULTI tiver `directorate`, o teste
  (b) falharia por design — relatar/ajustar o perfil no staging (não no código).

## 7. Teardown

Após o 403 a compra fica **pendente de Diretoria** (não aprovada). Não é cancelável via UI (tem dossiê
pendente) → permanece **residual identificável `[E2E]`+sufixo**, sem hard-delete (decisão A). Sem ação
destrutiva.

## 8. Garantias / aceite (após código aprovado)

- Novo spec `compras-diretoria.e2e.spec.ts`; helper compartilhado; sem novo `data-testid`; sem tocar
  API/schema/auth/RLS. `tsc`/`eslint`/`build` verdes; discovery lista o novo teste; T2 e smokes intactos.
- Verde real depende do staging (servidor + credenciais + perfil E2E_MULTI sem directorate).
