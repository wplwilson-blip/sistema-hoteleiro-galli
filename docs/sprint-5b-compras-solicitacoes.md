# Sprint 5B - Compras: Solicitação de compra

## 1. Objetivo

Entregar a primeira tela funcional do módulo de Compras para abrir, listar, editar, cancelar e enviar solicitações de compra.

## 2. Rotas criadas

- `/compras`
- `/compras/solicitacoes`

## 3. APIs criadas

- `GET /api/purchases/requests`
- `POST /api/purchases/requests`
- `GET /api/purchases/requests/[id]`
- `PATCH /api/purchases/requests/[id]`

## 4. Tabelas usadas

- `purchase_requests`
- `purchase_request_items`
- `purchase_request_events`
- `units`
- `departments`
- `cost_centers`
- `app_users`

## 5. Regra de R$ 200,00

A regra foi aplicada no servidor:

- até `R$ 200,00`:
  - `quotation_required = false`
  - `required_quote_count = 0`
  - `approval_required = false`
  - `director_approval_required = false`
- acima de `R$ 200,00`:
  - `quotation_required = true`
  - `required_quote_count = 3`
  - `approval_required = true`
  - `director_approval_required = true`

## 6. Gravação dos itens

Os itens são enviados no payload da solicitação e gravados em `purchase_request_items` com:

- descrição
- quantidade
- unidade de medida
- valor unitário estimado
- valor total estimado
- observações

## 7. Cálculo do total

O total estimado é calculado server-side pela soma dos itens:

- `quantity * estimated_unit_price`

A API recalcula o total antes de gravar a solicitação.

## 8. Registro de eventos

Ao criar a solicitação, a API grava um evento em `purchase_request_events`.

Ao alterar status para envio ou cancelamento, a API registra novo evento operacional com:

- `event_type`
- `from_status`
- `to_status`
- `description`
- `created_by`

## 9. Proteção da API

A API exige autenticação server-side via helper de sessão do sistema.

O client não acessa o banco direto. Toda operação passa pelas rotas `/api/purchases/requests`.

## 10. Arquivos criados e alterados

- `src/app/(app)/compras/page.tsx`
- `src/app/(app)/compras/solicitacoes/page.tsx`
- `src/app/api/purchases/requests/route.ts`
- `src/app/api/purchases/requests/[id]/route.ts`
- `src/components/purchases/purchase-requests-client.tsx`
- `src/lib/purchases/api.ts`
- `src/lib/purchases/schemas.ts`
- `docs/sprint-5b-compras-solicitacoes.md`

## 11. O que nao foi criado

- Migration nova.
- Login.
- Autenticacao.
- Cotacao completa.
- Fornecedor dentro de Compras.
- Aprovacao final.
- Reserva orcamentaria.
- `budget_movement`.
- Recebimento.
- Contas a Pagar.
- Financeiro completo.

## 12. Proxima sprint sugerida

Sprint 5C:

- detalhe da solicitacao
- cotacoes
- escolha de fornecedor
- status operacionais adicionais
- integracao inicial com anexos

