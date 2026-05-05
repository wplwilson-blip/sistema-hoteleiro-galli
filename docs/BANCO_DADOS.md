# Banco de Dados

## Observação Geral

O banco usa Supabase/PostgreSQL. Dados operacionais devem preservar multiunidade, auditoria, histórico e rastreabilidade. Não criar ou alterar tabelas sem sprint específica.

## Tabelas Conhecidas

### `units`

- Finalidade: unidades da rede hoteleira.
- Campos conhecidos: `id`, `organization_id`, `code`, `name`, cidade/estado/status quando aplicável.
- Relações: usada por departamentos, colaboradores, usuários e compras.
- Observação: todo fluxo operacional deve considerar unidade.

### `departments`

- Finalidade: departamentos por unidade.
- Campos conhecidos: `id`, `unit_id`, `code`, `name`, `description`, `status`.
- Relações: colaboradores, cargos e solicitações.

### `job_positions`

- Finalidade: cargos por unidade/departamento.
- Campos conhecidos: `id`, `unit_id`, `department_id`, `code`, `name`, status e marcação de liderança quando aplicável.
- Relações: colaboradores.

### `employees`

- Finalidade: colaboradores de RH.
- Campos conhecidos: dados pessoais/operacionais, `unit_id`, `department_id`, `job_position_id`, `status`.
- Relações: pode ser vinculado a usuário interno.
- Observação: colaborador não é necessariamente usuário.

### `app_users`

- Finalidade: usuários internos do sistema.
- Campos conhecidos: `id`, `username`, `display_name`, dados de autenticação técnica.
- Relações: vínculos com colaborador, unidades e perfis.
- Observação: login é por username; não expor `auth_email`.

### `user_employee_links`

- Finalidade: vínculo entre usuário interno e colaborador.
- Observação: vínculo opcional; nem todo usuário precisa ser colaborador.

### `user_unit_links`

- Finalidade: unidades e perfil de acesso permitidos para usuário.
- Campos conhecidos: `app_user_id`, `unit_id`, `access_profile_id`, `status`.
- Relações: `units`, `access_profiles`, `app_users`.

### `access_profiles`

- Finalidade: perfis de acesso internos.
- Códigos conhecidos: `SUPER_ADMIN`, `NETWORK_MANAGER`, `UNIT_DIRECTOR`, `DEPARTMENT_MANAGER`, `SUPERVISOR`, `FINANCE`, `AUDIT`, `EMPLOYEE`, `EXTERNAL_TECHNICIAN`.
- Observação: códigos são internos; interface deve mostrar labels em português.

### `suppliers`

- Finalidade: fornecedores usados em compras e módulos futuros.
- Campos conhecidos: razão social/nome, nome fantasia, documento, telefone/WhatsApp, status.
- Relações: cotações.
- Observação: não permitir duplicidade de CNPJ/CPF por organização.

### `purchase_requests`

- Finalidade: solicitação de compra.
- Campos conhecidos: número, unidade, departamento, solicitante, justificativa, status, flags de cotação/aprovação, total aprovado, `approval_status`, `approval_level`, decisão e observação.
- Relações: itens, cotações, eventos e decisões.

### `purchase_request_items`

- Finalidade: itens solicitados.
- Campos conhecidos: descrição, quantidade, unidade de medida, observações.
- Relações: `purchase_requests`.

### `purchase_quotes`

- Finalidade: cotação de fornecedor para solicitação.
- Campos conhecidos: número automático, fornecedor, validade, prazo, condição de pagamento, status, total, seleção de vencedora.
- Relações: `purchase_requests`, `suppliers`, itens de cotação e anexos.
- Rodadas de negociação:
  - `quote_round = 1`, `original_quote_id = null` e `parent_quote_id = null` indicam proposta original.
  - Proposta renegociada deve ser uma nova linha em `purchase_quotes`, vinculada à proposta original por `original_quote_id` e à proposta anterior por `parent_quote_id`.
  - `superseded_by_quote_id`, `superseded_at` e `superseded_by` registram quando uma proposta foi superada por nova rodada.

### `purchase_quote_items`

- Finalidade: itens e valores da cotação.
- Campos conhecidos: descrição, quantidade, valor unitário, total.
- Relações: `purchase_quotes`.

### `purchase_quote_negotiations`

- Finalidade: registrar o ato de negociação entre uma proposta anterior e uma nova proposta do mesmo fornecedor.
- Campos conhecidos: solicitação, fornecedor, cotação original, cotação anterior, nova cotação, rodada, valores anterior/novo, economia absoluta, percentual, observação, negociador e data.
- Observação: os valores ficam congelados para auditoria e relatórios futuros.
- Desconto por item/produto fica para sprint futura, com modelagem específica de itens negociados.

### `purchase_receipts`

- Finalidade: base futura para recebimento de compras.
- Observação: não implementar recebimento sem sprint específica.

### `purchase_receipt_items`

- Finalidade: itens de recebimento.
- Observação: base futura.

### `purchase_request_events`

- Finalidade: eventos operacionais da solicitação.
- Exemplos: criação, envio, seleção de vencedora, devolução, reenvio.
- Observação: preservar histórico e rastreabilidade.

### `purchase_approval_decisions`

- Finalidade: histórico formal de decisões de aprovação.
- Campos conhecidos: `purchase_request_id`, `purchase_quote_id`, `approval_level`, `decision`, `justification`, `decided_by`, `decided_at`.
- Decisões: `approved`, `rejected`, `returned_to_purchases`.
- Observação: reprovação e devolução exigem justificativa.

### `purchase_approval_snapshots`

- Finalidade: snapshots formais e históricos do dossiê enviado para aprovação de compras.
- Origem: criada pela migration `019_purchase_approval_snapshots.sql`.
- Campos principais: `purchase_request_id`, `selected_quote_id`, `selected_supplier_id`, `snapshot_number`, `snapshot_status`, `approval_status_at_creation`, `approval_rule`, `approval_level`, `total_amount`, `currency`, `is_selected_quote_recommended`, `recommendation_reason`, `submitted_by`, `submitted_at`, `decided_by`, `decided_at`, `decision`, `decision_reason`, `snapshot_payload`.
- Status: `pending`, `approved`, `rejected`, `returned_to_purchases`, `superseded`.
- Índices/regra ativa: há apenas um snapshot `pending` por solicitação ativa e a numeração é sequencial por solicitação.
- Payload: JSONB com fotografia do dossiê no envio formal, incluindo solicitação, unidade, departamento, itens, cotação vencedora, fornecedor, anexos, cotações concorrentes, recomendação, alçada e usuário de envio.
- Observação: selecionar cotação vencedora não cria snapshot; o snapshot nasce apenas no envio ou reenvio formal para aprovação.

### `attachments`

- Finalidade: metadados de anexos.
- Campos conhecidos: módulo, tipo de entidade, id da entidade, nome do arquivo, MIME, tamanho, descrição, caminho no storage.
- Storage: bucket privado `attachments`.
- Para cotações: `module = purchases`, `entity_type = purchase_quote`, `entity_id = purchase_quotes.id`.
