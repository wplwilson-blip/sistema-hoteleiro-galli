# Sprint 5A - Banco operacional do Módulo de Compras

## 1. Objetivo

Criar a base operacional do módulo de Compras sem telas, sem APIs e sem motor de aprovação completo.
O foco desta sprint é preparar o banco para solicitar compra, cotar, escolher fornecedor, registrar aprovação futura, reservar orçamento, receber itens e registrar histórico operacional.

## 2. Tabelas criadas

- `purchase_requests`
- `purchase_request_items`
- `purchase_quotes`
- `purchase_quote_items`
- `purchase_receipts`
- `purchase_receipt_items`
- `purchase_request_events`

## 3. Campos principais

### `purchase_requests`

- `organization_id`
- `unit_id`
- `department_id`
- `cost_center_id`
- `requested_by`
- `request_number`
- `title`
- `description`
- `justification`
- `request_type`
- `priority`
- `desired_date`
- `total_estimated_amount`
- `total_approved_amount`
- `quotation_required`
- `required_quote_count`
- `approval_required`
- `director_approval_required`
- `status`
- `approval_request_id`
- `budget_period_id`
- `budget_line_id`
- `budget_reservation_id`
- `over_budget`
- `over_budget_justification`
- `payment_request_id`

### `purchase_request_items`

- `organization_id`
- `unit_id`
- `purchase_request_id`
- `item_description`
- `quantity`
- `unit_of_measure`
- `estimated_unit_price`
- `estimated_total_price`
- `approved_unit_price`
- `approved_total_price`
- `notes`

### `purchase_quotes`

- `organization_id`
- `unit_id`
- `purchase_request_id`
- `supplier_id`
- `quote_number`
- `quote_date`
- `valid_until`
- `total_amount`
- `delivery_days`
- `payment_terms`
- `is_selected`
- `is_recurring_supplier_quote`
- `quote_validity_exception`
- `quote_validity_exception_reason`
- `notes`
- `status`

### `purchase_quote_items`

- `organization_id`
- `unit_id`
- `purchase_quote_id`
- `purchase_request_item_id`
- `item_description`
- `quantity`
- `unit_price`
- `total_price`
- `delivery_notes`

### `purchase_receipts`

- `organization_id`
- `unit_id`
- `purchase_request_id`
- `received_by`
- `received_at`
- `receipt_type`
- `status`
- `notes`

### `purchase_receipt_items`

- `organization_id`
- `unit_id`
- `purchase_receipt_id`
- `purchase_request_item_id`
- `quantity_received`
- `quantity_rejected`
- `divergence_reason`
- `notes`

### `purchase_request_events`

- `organization_id`
- `unit_id`
- `purchase_request_id`
- `event_type`
- `from_status`
- `to_status`
- `description`
- `created_by`
- `created_at`

## 4. Fluxo previsto

1. O usuário cria a solicitação de compra.
2. A solicitação entra em análise do setor de compras.
3. As cotações são registradas por fornecedor.
4. O fornecedor selecionado é marcado na cotação.
5. A solicitação pode seguir para aprovação formal, quando necessário.
6. O banco permite vincular reserva orçamentária futura.
7. O pedido segue para status de compra realizada.
8. O recebimento pode ser parcial, total ou com divergência.
9. O histórico operacional registra as transições principais.

## 5. Regras de negócio cobertas pelo banco

- Compra normal e compra emergencial.
- Prioridade baixa, normal, alta e crítica.
- Registro obrigatório mesmo para compras pequenas.
- Aprovação formal preparada para compras acima do limite.
- Exceção preparada para compra emergencial.
- Cotação obrigatória preparada para compras acima do limite.
- Validade de cotação preparada com exceção justificável.
- Múltiplos itens por solicitação.
- Controle de status do ciclo de compra.
- Preparação para vinculo futuro com Contas a Pagar.

## 6. Relação com orçamento

O módulo de compras foi conectado à base de orçamento já existente na Sprint 2.6 por meio de:

- `budget_period_id`
- `budget_line_id`
- `budget_reservation_id`

A sprint não bloqueia compras acima do orçamento. O banco apenas prepara os campos para a aplicação futura marcar `over_budget` e registrar `over_budget_justification`.

## 7. Relação com aprovação

O módulo usa a tabela genérica `approval_requests` por meio de `purchase_requests.approval_request_id`.
Não foi criado motor paralelo de aprovação.
O banco apenas prepara os campos para indicar quando a aprovação é obrigatória e quando a aprovação do diretor deve ser exigida.

## 8. Relação com fornecedores

A cotação usa a tabela compartilhada `suppliers`.
Não foi criado cadastro novo de fornecedor.
A escolha do fornecedor fica registrada na camada de cotação.

## 9. Relação com anexos e evidências

Não foi criada tabela nova de anexos.
O módulo deve usar a tabela genérica `attachments` com:

- `module = 'purchases'`
- `entity_type` correspondente
- `entity_id` da compra, cotação ou recebimento

## 10. O que não foi implementado ainda

- Telas de compras.
- Rotas `/compras`.
- APIs de compras.
- Motor completo de aprovação.
- Regra de permissão por cargo/perfil na aplicação.
- Geração automática de pedido de compra.
- Controle completo de contas a pagar.
- Cálculo de saldo orçamentário na aplicação.

## 11. Próxima sprint recomendada

Sprint 5B:

- Tela de solicitação de compra.
- API de criação e listagem.
- Inclusão de itens.
- Registro de cotação.
- Seleção de fornecedor.
- Primeira validação de fluxo de status.
- Integração inicial com anexos e reserva orçamentária.
