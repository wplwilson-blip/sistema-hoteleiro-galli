# Sprint 5C - Compras: Cotacoes e Comparacao de Fornecedores

## Objetivo
Implementar a camada funcional de cotacoes do modulo de Compras, permitindo iniciar cotacao a partir de solicitacoes enviadas, registrar propostas de fornecedores, comparar valores e selecionar a cotacao vencedora.

## Rotas criadas
- `/compras/cotacoes`

## APIs criadas
- `GET /api/purchases/quotes`
- `POST /api/purchases/requests/[id]/quotes`
- `PATCH /api/purchases/requests/[id]/quotes/[quoteId]`
- `DELETE /api/purchases/requests/[id]/quotes/[quoteId]`

## Tabelas usadas
- `purchase_requests`
- `purchase_request_items`
- `purchase_quotes`
- `purchase_quote_items`
- `purchase_request_events`
- `suppliers`

## Fluxo de cotacao
1. A lista de cotacoes mostra solicitacoes com status `submitted`, `under_review` e `quotation`.
2. O usuario pode iniciar a cotacao de uma solicitacao enviada.
3. A tela permite cadastrar cotacoes de fornecedores ativos.
4. Cada cotacao usa os itens da solicitacao como base.
5. O usuario compara as propostas e pode selecionar a vencedora.
6. A cotacao selecionada atualiza o valor aprovado da solicitacao para uso futuro em aprovacao.

## Numeracao automatica da cotacao
- O numero interno da cotacao (`quote_number`) e gerado no servidor no cadastro da cotacao.
- O formato preferencial usa o numero da solicitacao com sufixo sequencial por solicitacao: `SC-2026-000001-COT-01`, `SC-2026-000001-COT-02`.
- Se a solicitacao nao tiver `request_number`, o fallback e `COT-ANO-000001`, por exemplo `COT-2026-000001`.
- A tela nao solicita numero interno ao usuario; apos salvar, a listagem exibe o `quote_number` retornado do cadastro.
- Hardening futuro: criar uma constraint unica por `purchase_request_id` e `quote_number` para eliminar duplicidade em concorrencia entre fornecedores diferentes. Nesta sprint nao foi criada migration.

## Regra dos R$ 200,00
- Se a cotacao selecionada for menor ou igual a R$ 200,00, a solicitacao permanece sem exigencia de aprovacao e sem quantidade minima de cotacoes.
- Se a cotacao selecionada for maior que R$ 200,00, a solicitacao passa a exigir 3 cotacoes e flags de aprovacao ficam preparadas para a proxima etapa.

## Regra das 3 cotacoes
- A tela exibe aviso quando a solicitacao exige 3 cotacoes e ainda nao atingiu esse minimo.
- Nesta sprint o sistema nao bloqueia o fluxo de selecao, apenas sinaliza a pendencia.

## Eventos registrados
- `quotation_started`
- `quote_created`
- `quote_updated`
- `quote_selected`
- `quote_cancelled`

## O que ficou fora da sprint
- Aprovacao final
- Pedido de compra
- Recebimento
- Contas a pagar
- Financeiro completo
- PMS

## Proxima sprint recomendada
Sprint 5D: aprovacao das compras e fechamento do fluxo entre cotacao selecionada, aprovacao e preparacao para execucao.
