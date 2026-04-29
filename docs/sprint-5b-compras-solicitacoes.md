# Sprint 5B - Compras: Solicitacoes

## 1. Objetivo

Entregar a primeira tela funcional do modulo de Compras para abrir, listar, editar, cancelar e enviar solicitacoes de compra.

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

## 5. Regra de valor

Na solicitacao inicial o usuario nao informa valor.

O valor sera definido depois pelo setor de Compras na etapa de cotacao.

## 6. Itens da solicitacao

Cada item registra:

- descricao
- quantidade
- unidade de medida
- observacoes

## 7. Lista padronizada de unidade de medida

- UN - Unidade
- KG - Quilograma
- G - Grama
- CX - Caixa
- PCT - Pacote
- FD - Fardo
- LT - Litro
- ML - Mililitro
- M - Metro
- M2 - Metro quadrado
- PAR - Par
- JG - Jogo
- ROLO - Rolo
- SACO - Saco
- SERV - Servico
- OUTRO - Outro

## 8. Calculo do total

Nesta etapa o total nao e informado pelo solicitante.

O valor sera definido na cotacao.

## 9. Eventos operacionais

A criacao registra evento em `purchase_request_events`.

A mudanca de status para envio ou cancelamento registra novo evento operacional.

## 10. Protecao da API

A API exige autenticacao server-side via helper de sessao do sistema.

O client nao acessa o banco direto. Toda operacao passa pelas rotas `/api/purchases/requests`.

## 11. Arquivos criados e alterados

- `src/app/(app)/compras/page.tsx`
- `src/app/(app)/compras/solicitacoes/page.tsx`
- `src/app/api/purchases/requests/route.ts`
- `src/app/api/purchases/requests/[id]/route.ts`
- `src/components/purchases/purchase-requests-client.tsx`
- `src/lib/purchases/api.ts`
- `src/lib/purchases/schemas.ts`
- `src/components/layout/app-sidebar.tsx`
- `docs/sprint-5b-compras-solicitacoes.md`

## 12. O que nao foi criado

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

## 13. Proxima sprint sugerida

Sprint 5C:

- detalhe da solicitacao
- cotacoes
- escolha de fornecedor
- status operacionais adicionais
- integracao inicial com anexos
