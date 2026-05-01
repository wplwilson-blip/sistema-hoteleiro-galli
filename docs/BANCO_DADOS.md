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

### `purchase_quote_items`

- Finalidade: itens e valores da cotação.
- Campos conhecidos: descrição, quantidade, valor unitário, total.
- Relações: `purchase_quotes`.

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

### `attachments`

- Finalidade: metadados de anexos.
- Campos conhecidos: módulo, tipo de entidade, id da entidade, nome do arquivo, MIME, tamanho, descrição, caminho no storage.
- Storage: bucket privado `attachments`.
- Para cotações: `module = purchases`, `entity_type = purchase_quote`, `entity_id = purchase_quotes.id`.
