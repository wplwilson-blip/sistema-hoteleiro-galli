# Sprint 5C.1 - Cadastro de Fornecedores

## Objetivo
Criar o cadastro de fornecedores compartilhados para liberar a operação de cotacoes no modulo de Compras.

## Tabela usada
- `suppliers`

## Campos encontrados
- `organization_id`
- `unit_id`
- `name`
- `trade_name`
- `document_type`
- `document_number`
- `email`
- `phone`
- `whatsapp`
- `contact_name`
- `address_json`
- `bank_data_json`
- `category`
- `notes`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `deleted_at`
- `deleted_by`

## Regras de fornecedor ativo
- Fornecedor ativo usa `status = 'active'`.
- Fornecedor ativo nao pode estar com `deleted_at` preenchido.
- A listagem do modulo de cotações considera somente fornecedores ativos e nao deletados.

## Fornecedor global x fornecedor por unidade
- Fornecedor global usa `unit_id = null`.
- Fornecedor vinculado a unidade usa `unit_id` preenchido.
- O cadastro permite ambos os cenarios sem criar migration.

## Relacao com Cotacoes
- O cadastro de fornecedores alimenta a tela `/compras/cotacoes`.
- Sem fornecedor ativo, o botao de nova cotacao permanece desabilitado.
- Ao cadastrar um fornecedor ativo, a tela de cotacoes volta a liberar o fluxo.

## O que ficou fora da sprint
- Endereco bruto em JSON.
- Dados bancarios em JSON.
- Cotacao completa.
- Aprovacao final.
- Pedido de compra.
- Recebimento.
- Contas a pagar.
- Financeiro completo.
- Nova migration.
