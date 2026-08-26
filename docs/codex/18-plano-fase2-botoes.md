# Plano — Fase 2: esconder BOTÕES DE AÇÃO por permissão (telas de Compras)

> **Plano. Sem código ainda.** Aprovar antes de implementar. Área sensível (autorização/UX do fluxo de
> compras). Reaproveita `store.permissions` (Fase 1). **Mecanismo UNIÃO** (botão aparece se o usuário
> tem a permissão em ALGUMA unidade); o backend continua barrando por unidade/nível (T3 prova o 403).
> Super admin (`permissions` inclui `"*"`) vê tudo. **Não** toca backend/rotas/schema/RLS/session/store
> (só LÊ `permissions`). Cirúrgico e aditivo; sem refatorar os componentes gigantes.

## 1. Helper puro (compartilhado)

Novo arquivo **`src/lib/auth/permissions-ui.ts`** (client-safe, sem `server-only`):
```ts
export function canDo(permissions: string[], code: string): boolean {
  return permissions.includes("*") || permissions.includes(code);
}
export function canAny(permissions: string[], codes: string[]): boolean {
  return permissions.includes("*") || codes.some((c) => permissions.includes(c));
}
```
- Espelha a semântica de `canSee` da sidebar (`"*"` → true; senão includes/some).
- **Reuso da sidebar (opcional, baixo risco):** `app-sidebar.tsx#canSee` pode passar a delegar a
  `canDo`/`canAny` sem mudar comportamento. Recomendo fazer, mas é opcional — se preferir não tocar a
  sidebar agora, o helper é só consumido pelas telas de Compras. (Decisão sua.)

## 2. Integração por componente (onde ler `store.permissions`)

- `purchase-requests-client.tsx`: **já** lê a store (`useAppStore((s) => s.activeUnit.id)`). Adicionar
  `const permissions = useAppStore((s) => s.permissions);`.
- `purchase-quotes-client.tsx`: **já** lê a store (`activeUnitId`). Adicionar leitura de `permissions`.
- `purchase-approvals-client.tsx`: **NÃO** lê a store hoje. Integrar: `import { useAppStore }` +
  `const permissions = useAppStore((s) => s.permissions);`. (Único componente que ganha a dependência.)

## 3. Levantamento botão-por-botão (verificado)

Legenda: **Esconder** = não renderizar sem permissão. **Fluxo** = manter o `disabled` de regra de
negócio já existente (permissão COMPÕE por AND: some se sem permissão; desabilita se tem permissão mas o
fluxo não permite).

### 3.1 Aprovações — `purchase-approvals-client.tsx`
POST decisão: `/api/purchases/approvals/[requestId]/decision` → gate `approvalsView` **+**
`assertCanDecidePurchaseApprovalLevel` (decide.administrative **ou** decide.directorate conforme o nível
do dossiê) para **as três** decisões (approved/rejected/returned).

| Botão (testid/label) | ~linha | Permissão da ação | Condição atual | Gate proposto |
|---|---|---|---|---|
| `aprovacao-aprovar` (Aprovar) | 699 | decide.* (nível do dossiê) | dentro de `approvalStatus==="pending" && !isLegacyWithoutSnapshot` | **Esconder** se `!canAny([decide.administrative, decide.directorate])` |
| Devolver para Compras (sem testid) | 703 | decide.* | idem | idem (esconder junto) |
| Reprovar (sem testid) | 707 | decide.* | idem | idem (esconder junto) |
| `aprovacao-confirmar` (Confirmar decisão) | 888 | decide.* | modal de decisão aberto | **Esconder**/inócuo se `!canAny(decide.*)` (defensivo; o modal nem abre se os openers somem) |

- **UNIÃO dos dois `decide.*` (não por nível).** Motivo crítico: manter o T3 verde — `e2e_multi` tem
  `decide.administrative` e o T3 exige que **Aprovar apareça** num dossiê de **Diretoria** e o clique
  retorne **403**. Se gatássemos por nível (Diretoria → exigir `decide.directorate`), o botão sumiria
  para `e2e_multi` e o T3 quebraria. Com `canAny(decide.*)`, quem tem qualquer `decide` vê o botão; o
  servidor recusa (403) quando o nível não confere. "Esconder ≠ segurança".
- Implementação sugerida: envolver o **bloco "Decisão administrativa" (695-713)** no gate `canAny(decide.*)`
  (esconde os 3 openers de uma vez) e, por robustez, o `aprovacao-confirmar` no mesmo gate.
- `aprovacao-ver-dossie` (Ver dossiê, ~628) e filtros/busca: **não são ações** (POST) — só abrem/filtram
  (gate de tela já é `approvalsView`). **Não gatear** (mantêm-se; senão o T3 não abre o dossiê).

### 3.2 Solicitações — `purchase-requests-client.tsx`
POST/PATCH: `/api/purchases/requests` e `/[id]` → **`PURCHASES:requests.manage`** (route.ts:518 e 506;
inclui action save/submit/cancel).

| Botão (testid/label) | ~linha | Permissão | Condição atual | Gate proposto |
|---|---|---|---|---|
| `solicitacao-nova` (Nova solicitação) | 483 | requests.manage | sempre visível | **Esconder** se `!canDo(requests.manage)` |
| `solicitacao-enviar` (Enviar para análise) | 803 | requests.manage | `disabled={saveMutation.isPending}` | Esconder se sem perm; **Fluxo** mantém disabled |
| `solicitacao-salvar` (Salvar rascunho/alterações) | 798 | requests.manage | `disabled={saveMutation.isPending}` | idem |
| Cancelar solicitação (form) / Cancelar (linha) | ~805 / ~902 | requests.manage | `canCancelPurchaseRequest(...)` (regra de fluxo) | Esconder se sem perm; **Fluxo** mantém a regra atual |
| Editar (linha) / Itens (expandir) | ~896 / ~891 | Editar→requests.manage; Itens→nenhuma (só UI) | `canEdit(...)` | Editar: esconder se sem perm (mantém `canEdit`). Itens: **não gatear** |

> Como o form inteiro só abre via `Nova`/`Editar` (ambos gated por requests.manage), quem não tem a
> permissão não chega aos botões internos; ainda assim gateamos `enviar/salvar/cancelar` por robustez.

### 3.3 Cotações — `purchase-quotes-client.tsx`
POST/PATCH/DELETE cotação (`/api/purchases/requests/[id]/quotes[...]`) → **`PURCHASES:quotes.manage`**
(routes 253/505/918/417). Envio p/ aprovação (`/approvals/[id]/resubmit`) → **`PURCHASES:approvals.submit`**
(resubmit route:52).

| Botão (testid/label) | ~linha | Permissão | Condição atual | Gate proposto |
|---|---|---|---|---|
| `cotacao-nova` (Nova cotação) | 1995 | quotes.manage | `disabled={!selectedRequest \|\| !canCreateQuote}` (`canCreateQuote` = canOpenQuote && selectedRequestCanMutateQuotes && availableSuppliers>0, :1581) | **Esconder** se `!canDo(quotes.manage)`; **Fluxo** mantém o `disabled` inteiro |
| `cotacao-iniciar` (Iniciar cotação) + "Iniciar" (card) | 1911 / 1826 | quotes.manage (action start) | `disabled={startMutation.isPending}` / regra de status | Esconder se sem perm; **Fluxo** mantém |
| `cotacao-salvar` (Salvar cotação) | 3218 | quotes.manage | `disabled={saveMutation.isPending \|\| !availableSuppliers.length}` | Esconder se sem perm; **Fluxo** mantém |
| `cotacao-selecionar` (Selecionar vencedora) | 2114 | quotes.manage | `disabled={selectMutation.isPending \|\| !canMutateQuote}` | Esconder se sem perm; **Fluxo** mantém |
| Remover vencedora / Editar / Registrar nova proposta / Cancelar cotação | 2154/2138/2143/2149 | quotes.manage | `!canMutateQuote`/`canRegisterNegotiation` | Esconder se sem perm; **Fluxo** mantém |
| `cotacao-enviar-aprovacao` (Enviar/Reenviar p/ aprovação) | 3252/3258 | **approvals.submit** | `canSubmitApproval`/`canResubmitApproval` (regra de fluxo) | **Esconder** se `!canDo(approvals.submit)`; **Fluxo** mantém |
| `cotacao-novo-fornecedor` (Novo fornecedor) + amber | 2795/2006/2759 | **BASE:suppliers.manage** (cross-módulo) | dentro do form | **Ver §5** (decisão) |
| `cotacao-anexo-enviar` (Enviar anexo) | 2272 | **ATTACHMENTS:purchases.manage** (cross-módulo) | `disabled={uploadAttachmentMutation.isPending \|\| !canMutateQuote}` | **Ver §5** (decisão) |
| Remover anexo (Trash) | 2311 | ATTACHMENTS:purchases.manage | `!canMutateQuote` | **Ver §5** |
| `cotacao-ver` (Ver cotações) / `cotacao-anexos` / `cotacao-ver-detalhes` / abas | — | nenhuma (view/UI) | — | **Não gatear** |

## 4. Regra de composição (AND) — padrão

Para botão com `disabled` de fluxo:
```tsx
{canDo(permissions, CODE) ? (
  <Button disabled={<regra de fluxo existente>} ...>...</Button>
) : null}
```
Para botão sem `disabled` atual (ex.: Nova solicitação): apenas o wrapper `canDo(...) ? <Button/> : null`.
**Nunca** remover a lógica de `disabled`/condição atual — a permissão só ADICIONA (esconde). Grupos de
botões (ex.: bloco "Decisão administrativa") podem ser envolvidos por um único gate.

## 5. Botões CROSS-MÓDULO dentro de Cotações (decisão sua)

`Novo fornecedor` (POST `/api/base/suppliers` → **BASE:suppliers.manage**) e `Enviar anexo`/`Remover anexo`
(POST/DELETE `/api/attachments` → **ATTACHMENTS:purchases.manage**) **não são permissões de Compras**.
Gateá-los pela permissão real é correto, **mas** o T2 usa ambos com `e2e_multi` — se `e2e_multi` não
tiver `BASE:suppliers.manage` e `ATTACHMENTS:purchases.manage`, esses botões somem e **o T2 quebra**.

Opções:
- **(A) Gatear pela permissão real** (`suppliers.manage` / `attachments.manage`) e **garantir no staging**
  que `e2e_multi` tenha as duas.
- **(B) NÃO gatear** esses 2 botões nesta fase (escopo = permissões de **Compras**; fornecedor/anexo são
  de outros módulos, ficam para uma fase própria). Mantêm-se visíveis; o backend continua barrando.

**Recomendo (B)** (mantém o escopo "Compras", não arrisca o T2, e evita depender de grants cross-módulo).
Registrar como pendência para a fase de Cadastros/Anexos. **Decisão sua.**

## 6. Análise de impacto nos E2E (crítico)

Botões que os testes clicam com `e2e_multi` e a permissão que passaria a gateá-los:

| Teste | Botão | Permissão do gate | `e2e_multi` tem? |
|---|---|---|---|
| T2 | `solicitacao-nova`, `solicitacao-enviar` | requests.manage | **Confirmar** (perfil "compras manage") |
| T2 | `cotacao-iniciar`/`nova`/`salvar`/`selecionar` | quotes.manage | **Confirmar** |
| T2 | `cotacao-enviar-aprovacao` | **approvals.submit** | **Confirmar** (é PURCHASES, mas distinto de "manage") |
| T2 | `cotacao-novo-fornecedor` | suppliers.manage | **§5**: se (B), não gateado → OK |
| T2 | `cotacao-anexo-enviar` | attachments.manage | **§5**: se (B), não gateado → OK |
| T3 | `aprovacao-aprovar`/`confirmar` | canAny(decide.*) | **Sim** (tem decide.administrative — premissa do T3) → aparece → 403 ✓ |
| T2 | `aprovacao-*` | — (T2 aprova como Gerência ≤R$200) | decide.administrative → aparece ✓ |

**Pré-condição para os E2E não quebrarem:** `e2e_multi` precisa de `requests.manage`, `quotes.manage`,
`approvals.submit` e `decide.administrative`. As três primeiras são esperadas em "compras view+manage",
mas **`approvals.submit` é um código distinto** — confirmar no perfil do staging. Se faltar, ou concede-se
no staging, ou o botão `cotacao-enviar-aprovacao` fica fora do gate (não recomendado). Vou **confirmar o
conjunto de `e2e_multi` na implementação** (consulta read-only) e **relatar**; se faltar algo, aviso antes
de mergear.

## 7. Garantias
- Aditivo; **nenhuma** mudança em rotas/backend/RLS/schema/session/store (só leitura de `permissions`).
- Validação server-side intacta — esconder botão é UX; a API barra (403) por unidade/nível.
- Super admin (`"*"`) vê tudo. Fluxo/`disabled` atuais preservados (AND).
- `tsc`/`eslint`/`build` verdes; E2E T2/T3 verdes **sob** as pré-condições de perfil da §6.

## 8. Saída após aprovação
- `src/lib/auth/permissions-ui.ts` (helper) + gates cirúrgicos nos 3 clients.
- Relatório do conjunto de permissões do `e2e_multi` (confirmação §6) e a decisão §5 aplicada.
