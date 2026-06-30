# Plano — `data-testid` no fluxo de Compras para robustez do E2E (T2)

> **Plano. Sem código de app ainda.** Aprovar antes de implementar. Mudança de app será
> **puramente aditiva** (apenas atributos `data-testid`): zero alteração de lógica, validação,
> estilo ou texto visível. Não toca auth/RLS/schema/API/migrations. Sem libs novas.

## 1. Problema

O spec T2 (`tests/e2e/compras-fluxo.e2e.spec.ts`) trava ao ler o `<select>` **Departamento**:
as opções existem (confirmado por screenshot), mas o helper — ancorado em **XPath por texto do
label** + `waitFor` de timing — não as lê de forma confiável, porque o select é populado de forma
**assíncrona/reativa** (filtrado pela unidade; para não-super a unidade vem da unidade ativa após
o render inicial). Causa raiz: **fragilidade dos locators**. Os forms usam `<Field>`
(`crud-components.tsx`) que renderiza `<Label>` **sem `htmlFor`** e controles **sem `data-testid`**,
então não há `getByLabel`/`getByTestId` — só XPath por texto + heurística de timing.

## 2. Abordagem recomendada (decisão sua na revisão)

**Pendurar `data-testid` diretamente em cada controle/botão** que o spec T2 percorre — **sem**
alterar o wrapper `Field`/`crud-components`.

Por quê esta opção (mais localizada, menor risco):

- `Button` (`ui/button.tsx`), `Input` (`ui/input.tsx`), `SelectField` e `TextArea`
  (`crud-components.tsx`) **já fazem `{...props}`** no elemento DOM. Logo, passar
  `data-testid="..."` na instância do controle **chega ao DOM** sem nenhuma mudança de
  componente compartilhado.
- Evita mexer no `Field` (componente usado por todo o sistema) — menor superfície, menor risco
  de regressão em telas fora de Compras.

**Alternativa avaliada e NÃO recomendada:** adicionar uma prop `dataTestId` ao `Field` e repassá-la
ao controle. É mais invasiva (o `Field` não renderiza o controle; ele recebe `children`), exigiria
refatorar a forma como cada controle é passado, e altera um componente global. Maior risco para
ganho nenhum frente à opção direta. **Recomendo a opção direta.**

> Decisão pedida: confirmar **opção direta** (atributos nos controles) vs **prop no `Field`**.

## 3. Convenção de nomes

`area-campo` em kebab-case, prefixado pela etapa do fluxo:
`solicitacao-*`, `cotacao-*`, `fornecedor-*`, `aprovacao-*`. Itens de lista (field arrays) levam o
índice: `solicitacao-item-${index}-*`, `cotacao-item-${index}-valor-unitario`.

## 4. Inventário EXATO dos `data-testid`

Linhas são aproximadas (referência; o atributo entra na instância exata do controle/botão).

### 4.1 Nova Solicitação — `src/components/purchases/purchase-requests-client.tsx`

| Elemento (UI) | Tipo | testid | ~linha |
|---|---|---|---|
| Botão "Nova solicitação" | Button | `solicitacao-nova` | 480 |
| Select "Unidade" | SelectField (Controller) | `solicitacao-unidade` | 504 |
| Select "Departamento" | SelectField (Controller) | `solicitacao-departamento` | 529 |
| Input "Título" | TextInput (Controller) | `solicitacao-titulo` | 579 |
| TextArea "O que precisa ser comprado?" | TextArea (Controller) | `solicitacao-descricao` | 644 |
| TextArea "Por que essa compra é necessária?" | TextArea (Controller) | `solicitacao-justificativa` | 662 |
| Input item "Descrição" | TextInput (Controller) | `solicitacao-item-${index}-descricao` | 700 |
| Input item "Quantidade" | TextInput (Controller) | `solicitacao-item-${index}-quantidade` | 717 |
| Select item "Unidade de medida" | SelectField (Controller) | `solicitacao-item-${index}-unidade-medida` | 736 |
| Botão "Salvar rascunho/Salvar alterações" | Button | `solicitacao-salvar` | 787 |
| Botão "Enviar para análise" | Button | `solicitacao-enviar` | 792 |

> `Unidade` permanece **condicional no spec** (oculto p/ não-super — já tratado): o testid existe
> quando o campo é renderizado; o spec checa `count() > 0` antes de usar.

### 4.2 Cotação — `src/components/purchases/purchase-quotes-client.tsx`

| Elemento (UI) | Tipo | testid | ~linha |
|---|---|---|---|
| Botão "Ver cotações" (card da solicitação) | Button | `cotacao-ver` | 1829 |
| Botão "Iniciar cotação" (resumo do modal) | Button | `cotacao-iniciar` | 1911 |
| Botão "Nova cotação" | Button | `cotacao-nova` | 1995 |
| Botão "Novo fornecedor" (no form de cotação) | Button | `cotacao-novo-fornecedor` | 2795 |
| Select "Origem da cotação" | SelectField | `cotacao-origem` | 2941 |
| Select "Tipo de evidência" | SelectField | `cotacao-tipo-evidencia` | 2949 |
| Input item "Valor unitário" | TextInput | `cotacao-item-${index}-valor-unitario` | 3165 |
| Botão "Salvar cotação" | Button | `cotacao-salvar` | 3220 |
| Botão "Selecionar" (vencedora, no card da cotação) | Button | `cotacao-selecionar` | 2114 |
| Botão toggle "Anexos" (card da cotação) | Button | `cotacao-anexos` | 2175 |
| Input file de anexo | Input[type=file] | `cotacao-anexo-arquivo` | 2259 |
| Botão "Enviar anexo" | Button | `cotacao-anexo-enviar` | 2272 |
| Botão "Ver detalhes" (card da cotação) | Button | `cotacao-ver-detalhes` | 2169 |
| Valor da "Classificação:" (no bloco de detalhes) | `<strong>` | `cotacao-classificacao` | 2189 |
| Botão "Enviar para aprovação" (rodapé do modal) | Button | `cotacao-enviar-aprovacao` | 3254 |

> Itens repetidos por **cotação** (Selecionar/Anexos/Ver detalhes/Valor unitário): o testid se
> repete por card. O spec continua **escopando pelo card/modal** (ex.: dentro do `dialog`, ou pela
> cotação do fornecedor `[E2E]`). Para `Valor unitário` (field array de itens) usa-se índice.
> `cotacao-classificacao` permite afirmar "Formal suficiente" sem depender do texto "Classificação:".

### 4.3 Diálogo de fornecedor — `src/components/purchases/quick-supplier-dialog.tsx`

| Elemento (UI) | Tipo | testid | ~linha |
|---|---|---|---|
| Input "Razão social / Nome do fornecedor" | TextInput | `fornecedor-razao-social` | 219 |
| Select "Tipo de documento" | SelectField | `fornecedor-tipo-documento` | 225 |
| Input "CNPJ/CPF" | TextInput | `fornecedor-documento` | 232 |
| Botão "Salvar fornecedor" | Button | `fornecedor-salvar` | 258 |

### 4.4 Aprovações — `src/components/purchases/purchase-approvals-client.tsx`

| Elemento (UI) | Tipo | testid | ~linha |
|---|---|---|---|
| Botão "Ver dossiê" (card de aprovação) | Button | `aprovacao-ver-dossie` | 628 |
| Botão "Aprovar" (decisão administrativa, no modal do dossiê) | Button | `aprovacao-aprovar` | 699 |
| Botão "Confirmar aprovação" (modal de decisão) | Button | `aprovacao-confirmar` | 888 |

> `aprovacao-ver-dossie` repete por card → o spec escopa pelo card que contém o título `[E2E]`.

## 5. Itens fora da lista literal do pedido (incluídos para migração completa)

O pedido enumerou um subconjunto. Para **eliminar todo XPath-por-label do caminho T2**, o plano
inclui também: `solicitacao-descricao`, `solicitacao-justificativa`, `solicitacao-item-*-descricao`,
`solicitacao-nova`, `cotacao-ver`, `cotacao-ver-detalhes`, `cotacao-classificacao`,
`cotacao-anexos`, `aprovacao-ver-dossie`. São todos campos/botões que **o spec já percorre**.
Se preferir manter o escopo estritamente na sua lista, removo estes na revisão.

## 6. Migração do teste (após o app aprovado)

`tests/e2e/helpers/purchases-ui.ts`:
- Adicionar helpers finos sobre testid: `byTestId(scope, id)`, `fillTestId`, `selectTestId`
  (este último resolvendo o value pela opção, **mantendo** o `waitFor attached` de carregamento
  assíncrono — o testid resolve o elemento, mas o select ainda popula reativo, então a espera da
  primeira opção real continua válida e some o XPath/heurística por label).
- Manter `selectByOptionText`/`selectFirstRealOption` por compatibilidade, mas o spec T2 passa a
  usar os helpers por testid. `fieldControl` (XPath por label) deixa de ser usado no caminho T2.

`tests/e2e/compras-fluxo.e2e.spec.ts`:
- Trocar cada interação por `getByTestId(...)` conforme a tabela. Ex.:
  - `selectByOptionText(fieldControl(reqForm,"Unidade"),unitA)` → `page.getByTestId("solicitacao-unidade")` (condicional por `count()`), selecionando a opção da unidade.
  - `selectFirstRealOption(reqForm,"Departamento")` → `selectTestId("solicitacao-departamento")` (1ª opção real, com espera de carregamento).
  - `modal.getByRole("button",{name:"Selecionar"})` → `modal.getByTestId("cotacao-selecionar")`.
  - Classificação: `expect(modal.getByTestId("cotacao-classificacao")).toHaveText("Formal suficiente")`.
- **Inalterados:** a lógica do fluxo, o `withApi`/`waitForResponse` nas mutações e **todo o
  invariante de unidade ativa** (`switchActiveUnit`, `expectVisibleInList`/`expectAbsentFromList`)
  e as asserções de status. O testid só troca a forma de **localizar**, não o que se afirma.

## 7. Garantias / aceite

- App: diff só adiciona atributos `data-testid` (nenhuma mudança de lógica/estilo/texto). `tsc`,
  `eslint` e `build` verdes. Discovery do Playwright intacto; smokes da T1 intactos.
- Teste: T2 passa a localizar por testid e **avança além do Departamento**.
- Execução real do T2 verde depende do staging (servidor + credenciais + pré-requisitos) — segue
  o ciclo de ajuste ao vivo, mas sem a fragilidade de locators por texto.

## 8. Sequenciamento

1. **Agora:** este plano (revisão sua).
2. Pós-OK: branch com o app (`data-testid` aditivo) — commit isolado "feat(testid)".
3. No mesmo branch (ou subsequente): migração do helper + spec para `getByTestId`.
4. Commit + push, sem merge; você revisa e roda ao vivo.
