# Banco de Dados - Sprint 2

Este diretório contém a estrutura inicial do banco do Módulo Base do Sistema Administrativo Hotel Galli. As migrations são SQL puro para Supabase/PostgreSQL e ainda não conectam o projeto a um Supabase remoto.

## Ordem das Migrations

1. `001_extensions_and_enums.sql`: habilita `pgcrypto` e cria enums compartilhados de status, aprovações, notificações, locais, quartos, equipamentos e auditoria.
2. `002_base_organization_units.sql`: cria organizações, unidades, configurações por unidade, departamentos e cargos.
3. `003_users_employees_permissions.sql`: cria usuários da aplicação, colaboradores, vínculo usuário-colaborador, perfis, permissões e vínculos usuário-unidade.
4. `004_operational_structure.sql`: cria blocos, andares, UHs/quartos, áreas operacionais, locais operacionais e equipamentos.
5. `005_classification_and_workflow_base.sql`: cria centros de custo, categorias, tipos de solicitação, tipos de anexo e status padronizados.
6. `006_approval_flows.sql`: cria fluxos, níveis, instâncias, etapas e ações de aprovação.
7. `007_notifications_logs_audit.sql`: cria regras de notificação, notificações, logs técnicos e trilha de auditoria.
8. `008_triggers_updated_at_soft_delete_audit.sql`: cria função de `updated_at`, triggers e auditoria base.
9. `009_rls_policies_base.sql`: habilita RLS e cria helpers para policies futuras.
10. `010_seed_base_data.sql`: cria seeds genéricos de perfis, departamentos, permissões BASE, status, categorias, tipos de anexo e regras de notificação.
11. `011_shared_foundation_tables.sql`: cria fornecedores, anexos, comentários e histórico operacional de status das UHs.
12. `012_budget_control_base.sql`: cria a base gerencial de orcamento integrada a compras, com periodos, linhas, movimentos, reservas, solicitacoes de ajuste e view de saldos.

## Principais Tabelas

- Identidade organizacional: `organizations`, `units`, `unit_settings`.
- Estrutura administrativa: `departments`, `job_positions`, `cost_centers`.
- Acesso: `app_users`, `access_profiles`, `permissions`, `profile_permissions`, `user_unit_links`, `user_permission_overrides`.
- Colaboradores: `employees`, `user_employee_links`.
- Estrutura operacional: `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`.
- Entidades transversais: `suppliers`, `attachments`, `comments`, `room_status_history`.
- Workflow base: `request_types`, `attachment_types`, `system_statuses`, `approval_flows`, `approval_levels`, `approval_requests`, `approval_steps`, `approval_actions`.
- Observabilidade e auditoria: `notification_rules`, `notifications`, `system_logs`, `audit_trail`.

## app_users x employees

`app_users` representa quem pode acessar o sistema. Um usuário pode ser auditor, consultor ou técnico externo e não precisa ser colaborador CLT.

`employees` representa colaboradores da operação. Um colaborador pode existir sem login no sistema.

`user_employee_links` faz o vínculo opcional entre essas entidades. Essa separação preserva auditoria, segurança e flexibilidade operacional.

## Username e auth_email

O login oficial será por `username` + senha. O campo `username` é único e aceita apenas letras minúsculas, números, ponto, underline e hífen:

```text
^[a-z0-9._-]{3,50}$
```

E-mail não é login. E-mails pessoais ou corporativos são opcionais e servem apenas para contato ou notificações futuras.

`auth_email` é um campo técnico interno para compatibilidade futura com Supabase Auth, caso seja necessário usar um e-mail fictício invisível ao usuário. Esse campo não deve aparecer em telas, APIs públicas ou logs de interface.

## Multiunidade

Tabelas operacionais possuem `unit_id` desde o início. A estrutura permite que um usuário esteja vinculado a múltiplas unidades por `user_unit_links`, com perfil e departamento por escopo.

As policies futuras devem filtrar dados operacionais com base no vínculo do usuário à unidade ativa.

## Entidades Transversais da Sprint 2C

`suppliers` é o cadastro compartilhado de fornecedores. Ele será usado por Compras, Contas a Pagar, Administrativo, Manutenção e A&B. O fornecedor pode ser global da organização ou específico de uma unidade.

`attachments` é a tabela genérica de anexos. Ela usa relação polimórfica por `module`, `entity_type` e `entity_id`, evitando criar tabelas de anexos duplicadas em cada módulo. Acesso futuro deve considerar `unit_id`, `visibility_scope` e `is_sensitive`.

`comments` é a tabela de comentários e histórico conversacional compartilhado. Ela também usa relação polimórfica e permite respostas por `parent_comment_id`.

`room_status_history` registra a trilha operacional de mudanças de status das UHs/quartos. Essa tabela é necessária para rastrear transições feitas por Recepção, Manutenção, Governança e Gerência Operacional. A regra de que a UH só volta para “Disponível Operacionalmente” por Governanta ou Gerente Operacional será aplicada futuramente na aplicação/RLS.

Essas tabelas foram adicionadas antes dos módulos operacionais para reduzir duplicidade futura e garantir que Compras, Pagamentos, Manutenção, Governança, Recepção, RH, A&B, POPs, Documentos e Auditoria usem a mesma base transversal.

## Seeds Genéricos

Os seeds da Sprint 2 são apenas referências genéricas: perfis padrão, departamentos template, permissões do módulo BASE, status, categorias, tipos de anexo e regras de notificação in-app.

Eles não criam organização real, unidade real, usuário real, colaborador real ou dados operacionais do Hotel Galli. A criação desses dados deve ocorrer futuramente por um fluxo de setup assistido ou script específico aprovado.

## Foreign Keys e Auditoria de Autoria

As foreign keys usam `on delete restrict` em entidades críticas ou de escopo obrigatório, e `on delete set null` em referências históricas opcionais, como ator de uma aprovação ou local operacional removido logicamente.

Os campos `created_by`, `updated_by` e `deleted_by` permanecem como `uuid` nullable sem foreign key nesta sprint. Essa decisão evita circularidade e permite criar tabelas antes de `app_users`. As FKs para autoria podem ser adicionadas em migration futura depois que autenticação, usuários e estratégia de bootstrap estiverem definidos.

## RLS e Auditoria

RLS foi habilitado nas tabelas críticas na migration `009`. As policies finais ainda não foram criadas porque a Sprint 2 não implementa autenticação real. Os helpers `current_app_user_id()` e `user_has_unit_access(unit_id)` preparam a base para Sprint 3/4.

`audit_trail` registra `old_value` e `new_value` em JSONB. A auditoria base por trigger já existe para tabelas críticas, mas o contexto real de usuário, IP e user agent será enriquecido quando a autenticação e a camada de aplicação estiverem implementadas.

## Aplicação no Supabase Futuramente

Quando houver projeto Supabase remoto, estas migrations devem ser aplicadas na ordem numérica usando Supabase CLI ou pipeline de deploy. Antes disso, deve-se revisar variáveis de ambiente, roles, policies e estratégia de seed por ambiente.

## Fica para Sprint 3

- Implementar login real por `username` + senha.
- Integrar Supabase Auth sem expor `auth_email`.
- Criar fluxo de autenticação na aplicação.
- Mapear `auth.users.id` para `app_users.auth_user_id`.
- Criar policies RLS finais por perfil, unidade e permissao.
- Validar criacao inicial de usuarios e vinculos com colaboradores.

## Migration 012 - Orcamento Integrado a Compras

`012_budget_control_base.sql` cria a base gerencial de orcamento integrada a compras. Ela adiciona enums, periodos mensais por unidade, linhas por centro de custo/departamento/gestor, movimentos, reservas, solicitacoes de ajuste e a view `budget_line_balances`.

O objetivo e permitir que o futuro modulo de Compras consulte saldo disponivel antes de seguir, bloqueie compras normais sem orcamento ou encaminhe ajuste aprovado, e registre compras emergenciais como excecoes auditaveis.

O orcamento nao e financeiro completo. Ele apoia compras, solicitacoes de pagamento, manutencao, A&B, governanca, administrativo e dashboards por meio de saldo gerencial:

```text
original_amount + approved_adjustments_amount - reserved_amount - committed_amount - realized_amount
```

RLS foi habilitado nas novas tabelas. As policies finais serao criadas em sprint futura com `unit_id`, `user_unit_links`, `access_profiles`, `permissions`, perfil do usuario e centros de custo permitidos.
