# Revisao Banco vs Arquitetura - Sprint 2B

## Resumo Executivo

As migrations da Sprint 2 criam uma base consistente para organizacao, unidade, usuarios, colaboradores, perfis, permissoes, estrutura operacional, classificacoes, aprovacoes, notificacoes, logs, auditoria, triggers de `updated_at` e preparacao de RLS.

Entretanto, comparando com `docs/arquitetura-logica-integrada.md`, o banco ainda nao esta completo o suficiente para commit de fechamento da Sprint 2 sem ajustes. Faltavam entidades transversais que sustentam varios modulos e evitam duplicacao futura: `suppliers`, `attachments`, `comments` e `room_status_history`. A Sprint 2C adicionou essas tabelas em `011_shared_foundation_tables.sql`, reduzindo o risco de duplicidade futura nos modulos.

Recomendacao final apos Sprint 2C: o banco ficou mais alinhado com a arquitetura logica. Ainda ha pontos para validacao futura, mas a principal lacuna transversal foi enderecada.

## Observacao Sprint 2.6

A Sprint 2.6 adicionou a base de orcamento integrada as compras por meio da migration `012_budget_control_base.sql`.

Foram incluidos periodos orcamentarios mensais, linhas por centro de custo/gestor/departamento, livro razao de movimentos, reservas de orcamento, solicitacoes de alteracao orcamentaria e a view `budget_line_balances`.

Essa base fecha a lacuna necessaria antes do modulo de Compras: compras normais poderao consultar saldo disponivel, compras sem saldo deverao ser bloqueadas ou encaminhadas para ajuste, e compras emergenciais terao rastreabilidade, evidencia, auditoria e ciencia/aprovacao posterior.

## Observacao Sprint 2C

A Sprint 2C adicionou:

- `suppliers`
- `attachments`
- `comments`
- `room_status_history`

Essas tabelas reduzem o risco de duplicidade futura porque fornecedores, anexos, comentarios e historico operacional de UHs passam a ser compartilhados por Compras, Contas a Pagar, Manutencao, Governanca, Recepcao, RH, A&B, Administrativo, POPs, Relatorios e Auditoria.

## 1. Modulo Base

| Item | Existe nas migrations? | Avaliacao |
|---|---:|---|
| `organizations` | Sim | Adequado para rede/organizacao e multiunidade futura. |
| `units` | Sim | Adequado; possui organizacao, status e campos de auditoria logica. |
| `unit_settings` | Sim | Adequado para configuracoes por unidade. |
| `departments` | Sim | Adequado; permite templates globais via `is_system_default`. |
| `job_positions` | Sim | Adequado; vincula departamento quando aplicavel. |
| `app_users` | Sim | Adequado; `username` unico e `auth_email` tecnico. |
| `employees` | Sim | Adequado; separado de `app_users`. |
| `user_employee_links` | Sim | Adequado; vinculo opcional. |
| `user_unit_links` | Sim | Adequado; suporta usuario em multiplas unidades/departamentos/perfis. |
| `access_profiles` | Sim | Adequado. Seeds atuais precisam revisao contra perfis definidos na arquitetura. |
| `permissions` | Sim | Adequado como base. Seeds ainda cobrem apenas BASE. |
| `profile_permissions` | Sim | Adequado. |
| `user_permission_overrides` | Sim | Adequado para excecoes. |
| `cost_centers` | Sim | Adequado, por unidade. |
| `operational_categories` | Sim | Adequado. |
| `request_types` | Sim | Adequado como classificacao de solicitacoes. |
| `attachment_types` | Sim | Adequado como catalogo de tipos. A tabela concreta `attachments` foi adicionada na Sprint 2C. |
| `system_statuses` | Sim | Adequado para padronizacao, mas precisa decisao sobre status de UH. |
| `notifications` | Sim | Adequado para V1 in-app. |
| `audit_trail` | Sim | Adequado como base, com `old_value` e `new_value`. |
| `system_logs` | Sim | Adequado para logs tecnicos. |

Conclusao: o Modulo Base estrutural esta forte. A lacuna de fornecedores, anexos e comentarios compartilhados foi tratada na Sprint 2C pela migration `011_shared_foundation_tables.sql`.

## 2. Estrutura Operacional

| Item | Existe nas migrations? | Avaliacao |
|---|---:|---|
| `rooms` | Sim | Adequado para UHs, com `unit_id`, `floor_id` e `block_id` opcionais. |
| `floors` | Sim | Adequado, com `unit_id` e `block_id` opcional. |
| `blocks` | Sim | Adequado, com `unit_id`. |
| `operational_areas` | Sim | Adequado para areas por unidade/departamento. |
| `operational_locations` | Sim | Adequado como cadastro generico de locais. |
| `equipment_assets` | Sim | Adequado, vinculado a unidade e local operacional opcional. |
| `room_status_history` | Sim | Adicionado na Sprint 2C para rastrear status operacional das UHs. |

`room_status_history` era necessario antes do commit porque a arquitetura exige rastrear mudancas de status da UH, incluindo liberacao tecnica pela manutencao e liberacao operacional por Governanta/Gerente Operacional. A Sprint 2C adicionou essa tabela.

## 3. Entidades Transversais

| Entidade | Existe? | Deve estar onde? | Justificativa |
|---|---:|---|---|
| `attachments` | Sim | Modulo Base ou workflow transversal | Adicionado na Sprint 2C para NF, boleto, fotos, POP, advertencia, avaliacao, comprovantes e evidencias. |
| `comments` | Sim | Workflow transversal | Adicionado na Sprint 2C para interacoes padronizadas em chamados, compras, pagamentos, RH e ocorrencias. |
| `documents` | Nao | Base/documentos ou Administrativo | Ponto a validar. Pode ser transversal se POPs/RH/Admin compartilharem documentos. |
| `action_plans` | Nao | Workflow transversal ou modulo de ocorrencias | Importante para ocorrencias e dashboards, mas pode ficar para modulo operacional. |
| `operational_occurrences` | Nao | Workflow transversal ou Recepcao | Usado por Recepcao e outros departamentos. Pode ser transversal. |
| `suppliers` | Sim | Modulo Base/transversal | Adicionado na Sprint 2C antes de Compras e Pagamentos. |

Status Sprint 2C: `suppliers`, `attachments`, `comments` e `room_status_history` foram adicionadas. `documents`, `action_plans` e `operational_occurrences` podem ser decididos como Sprint 2 complementar ou migrations futuras, mas precisam permanecer documentados.

## 4. Recepcao

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `reception_shift_logs` | Nao | Necessaria para passagem de turno, mas pode ficar para modulo Recepcao. |
| `reception_occurrences` | Nao | Ponto a validar: pode ser tabela especifica ou usar `operational_occurrences`. |
| `lost_and_found` | Nao | Necessario em Recepcao/Governanca; ponto a validar sobre ownership. |
| `guest_internal_notes` | Nao | Ponto a validar. Se existir, deve ser ocorrencia interna sem PMS/reserva. |

Recepcao e uma porta de entrada operacional importante. O banco base atual nao impede o modulo, mas ainda nao cria suas entidades.

## 5. Manutencao

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `maintenance_tickets` | Nao | Necessaria para modulo Manutencao. |
| `maintenance_ticket_status_history` | Nao | Necessaria para SLA e auditoria operacional. |
| `maintenance_ticket_materials` | Nao | Necessaria para materiais usados e necessidade de compra. |
| `maintenance_ticket_photos` | Nao | Pode ser substituida por `attachments` generico com tipo foto antes/depois. |
| `preventive_maintenance_plans` | Nao | Futuro; pode ficar para fase posterior. |
| Vinculos com `rooms`, `operational_locations`, `equipment_assets` | Parcial | As tabelas base existem, mas falta o ticket para referenciar esses locais. |

Recomendacao: nao criar manutencao completa na Sprint 2, mas garantir `attachments`, `comments` e `room_status_history` para nao duplicar depois.

## 6. Governanca

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `governance_checklists` | Nao | Necessaria para modulo Governanca. |
| `governance_checklist_items` | Nao | Necessaria para checklists configuraveis. |
| `room_inspections` | Nao | Necessaria para inspecao de UH e validacao final. |
| `housekeeping_tasks` | Nao | Necessaria para tarefas de limpeza/inspecao. |
| `room_status_history` | Sim | Adicionada na Sprint 2C. |
| Achados e perdidos | Nao | Ponto a validar: Recepcao, Governanca ou entidade compartilhada. |

O status final "Disponivel Operacionalmente" nao esta representado no enum atual `room_status`, que usa valores tecnicos em ingles como `available`, `dirty`, `maintenance` e `blocked`. Isso precisa revisao antes de uso operacional.

## 7. Compras

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `purchase_requests` | Nao | Necessaria para Compras. |
| `purchase_request_items` | Nao | Necessaria para itens solicitados. |
| `purchase_quotes` | Nao | Necessaria para minimo de 2 orcamentos. |
| `purchase_quote_files` | Nao | Pode ser `attachments` generico. |
| `purchase_orders` | Nao | Necessaria para pedido/fechamento. |
| `purchase_receipts` | Nao | Necessaria para recebimento. |
| `emergency_purchase_records` | Nao | Necessaria ou modelada como flag/tabela em compra. |

As migrations atuais criam base de aprovacao suficiente para compras, mas nao criam as tabelas do modulo. `suppliers`, que e transversal, foi adicionado na Sprint 2C antes de Compras/Pagamentos.

## 8. Solicitacoes de Pagamento

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `payment_requests` | Nao | Necessaria para Contas a Pagar/Solicitacoes. |
| `payment_request_attachments` | Nao | Deve ser evitada se `attachments` generico existir. |
| `payment_request_status_history` | Nao | Necessaria ou resolvida por historico generico de status. |
| `payment_proofs` | Nao | Pode ser entidade propria ou `attachments` com tipo comprovante. |

As regras de aprovacao por R$ 200,00 e emergencial ainda nao estao modeladas. `approval_flows`/`approval_levels` conseguem suportar, mas sera necessario configurar alçadas e registrar excecoes.

## 9. RH

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `employee_documents` | Nao | Necessaria ou coberta por `attachments` + `documents`. |
| `employee_salary_history` | Nao | Necessaria para historico salarial. |
| `salary_change_requests` | Nao | Necessaria para fluxo de aumento. |
| `employee_warnings` | Nao | Necessaria para advertencias. |
| `employee_evaluations` | Nao | Necessaria para avaliacoes. |
| `employee_trainings` | Nao | Ponto a validar contra `training_records`. |
| `training_records` | Nao | Necessaria para POPs/treinamentos. |
| `admission_requests` | Nao | Necessaria para contratacao. |
| `termination_requests` | Nao | Necessaria para dispensa. |
| `absence_records` | Nao | Necessaria para atestados/ausencias. |
| `vacation_requests` | Nao | Necessaria para ferias. |
| `employee_file_attachments` | Nao | Deve ser evitada se `attachments` generico existir. |

`employees` e `job_positions` existem, mas RH robusto ainda nao esta modelado. Isso pode ficar para modulo RH, exceto anexos/documentos/treinamentos se forem definidos como transversais.

## 10. POPs e Documentos Internos

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `documents` | Nao | Necessaria ou ponto a validar como base transversal. |
| `pop_documents` | Nao | Necessaria para POP oficial. |
| `pop_versions` | Nao | Necessaria para versionamento. |
| `pop_acknowledgements` | Nao | Necessaria para ciencia. |
| `pop_training_links` | Nao | Necessaria para vinculo com treinamento. |
| `document_categories` | Nao | Provavel tabela transversal util. |

Regra arquitetural: Administrativo guarda o documento oficial; RH controla treinamento, ciencia e vinculos com cargo/departamento/colaborador. O banco atual ainda nao suporta isso.

## 11. A&B Simples

| Entidade | Existe? | Avaliacao |
|---|---:|---|
| `ab_requisitions` | Nao | Necessaria para requisicoes simples. |
| `ab_hygiene_checklists` | Nao | Necessaria para checklist de higiene. |
| `ab_temperature_logs` | Nao | Necessaria para temperatura. |
| `ab_waste_records` | Nao | Necessaria para perdas/desperdicio. |
| `ab_occurrences` | Nao | Pode usar `operational_occurrences` generico. |

Correto nao criar estoque completo, CMV ou ficha tecnica detalhada agora. As tabelas de A&B podem ficar para sprint do modulo.

## 12. Aprovacoes

As tabelas `approval_flows`, `approval_levels`, `approval_requests`, `approval_steps` e `approval_actions` estao bem posicionadas para suportar:

- compras;
- pagamentos;
- contratacoes;
- desligamentos;
- aumentos salariais;
- compras emergenciais;
- aprovacoes posteriores.

Pontos a revisar futuramente:

- Criar convencao obrigatoria para `entity_type`/`entity_id`.
- Garantir bloqueio de autoaprovacao em trigger/servico.
- Garantir rejeicao com justificativa. A constraint atual em `approval_actions` cobre `reject`.
- Modelar aprovacao posterior de emergencia com status e motivo claros.

## 13. Anexos

Status Sprint 2C: existe tabela generica `attachments` em `011_shared_foundation_tables.sql`. Esta era a lacuna mais critica da revisao original.

Recomendacao atendida: `attachments` foi criada como entidade transversal antes do commit da Sprint 2.

Ela deve atender:

- NF;
- boleto;
- recibo;
- contrato;
- comprovante;
- foto antes;
- foto depois;
- orcamento;
- laudo;
- documento de colaborador;
- POP;
- avaliacao;
- advertencia;
- evidencia de treinamento;
- evidencia de plano de acao.

Tambem deve prever: `unit_id`, `module_code`, `entity_type`, `entity_id`, `attachment_type_id`, nome, storage path/bucket, MIME type, tamanho, validade, sensibilidade/restricao, autoria, soft delete e auditoria.

## 14. Comentarios e Historico

Status Sprint 2C: existe `comments` em `011_shared_foundation_tables.sql`.

Ainda nao existe `status_history` generico, `payment_request_status_history` ou `maintenance_ticket_status_history`. A Sprint 2C adicionou `room_status_history`, que era o historico especifico mais urgente para UHs.

Recomendacao:

- `comments` transversal foi criado na Sprint 2C com `module`, `entity_type`, `entity_id`, `author_id`, `unit_id`, conteudo e soft delete.
- Criar `status_history` generico ou historicos especificos por entidade critica.
- `room_status_history` foi criado especificamente antes de usar status operacional de UH, porque ha regra forte de liberacao tecnica vs operacional.

## 15. Auditoria e Logs

`audit_trail` e `system_logs` sao boas bases. Eles cobrem estrutura para:

- aprovacao/rejeicao;
- alteracao de status;
- eventos tecnicos;
- entidade e modulo;
- IP e user agent quando disponiveis;
- `old_value` e `new_value`.

Lacunas:

- Com `attachments`, passa a existir base estruturada para eventos de upload de anexo.
- Com `room_status_history`, a alteracao de status da UH nao depende apenas de `audit_trail` para consulta operacional.
- Sem tabelas de RH, compras e pagamentos, eventos como compra emergencial, alteracao salarial, advertencia e dispensa ainda nao podem ser auditados semanticamente.
- Exportacao de relatorios pode ser registrada em `system_logs`, mas precisa convencao futura.

## 16. RLS e Seguranca

Pontos corretos:

- RLS esta habilitado nas tabelas criticas.
- Nao ha policies finais falsas dependentes de autenticacao inexistente.
- Existem helpers preparados para `auth.uid()` futuro.
- `app_users` e `employees` estao separados.
- `username` e unico e nao permite espaco nem e-mail como login.
- `auth_email` existe como campo tecnico.
- Tabelas operacionais criadas ate aqui possuem `unit_id` quando aplicavel.
- `user_unit_links` permite acesso por unidade/departamento/perfil.

Pontos a ajustar futuramente:

- Dados sensiveis de RH precisarao policies especificas.
- Anexos/documentos sensiveis precisam controle por tipo e permissao.
- RLS final deve considerar unidade ativa, perfil, permissao granular e dados multiunidade.

## 17. Ordem das Migrations

Ordem atual esta tecnicamente coerente:

- Enums sao criados em `001` antes do uso.
- Organizacao/unidade/departamento/cargos vem antes de usuarios e operacionais.
- `app_users` existe antes de tabelas que o referenciam em aprovacoes/logs.
- `created_by`, `updated_by` e `deleted_by` sao UUID nullable sem FK, evitando circularidade.
- `approval_flows` adiciona FK para `request_types.default_approval_flow_id` depois de criar `approval_flows`.
- Seeds nao criam unidade real, usuario real ou Hotel Galli real.

Riscos restantes:

- Seeds de departamentos globais usam `departments` como template via `is_system_default`. Isso esta aceitavel, mas deve permanecer documentado para nao confundir com departamentos reais de unidade.
- O enum `room_status` atual nao representa todos os status definidos na arquitetura.

## O Que Esta Correto nas Migrations

- Separacao `app_users` x `employees`.
- Login preparado por `username`, nao por e-mail.
- `auth_email` tecnico.
- Multiunidade desde a base.
- Estrutura operacional inicial com UHs, blocos, andares, locais e equipamentos.
- Aprovacoes genericas bem posicionadas.
- Notificacoes in-app previstas.
- Auditoria e logs tecnicos previstos.
- RLS preparado sem policies finais inseguras.
- Soft delete previsto nas tabelas principais.
- Ordem de criacao sem FKs apontando para tabelas inexistentes.

## O Que Esta Faltando

Faltas criticas para base/transversal na revisao original, resolvidas na Sprint 2C:

- `suppliers`
- `attachments`
- `comments`
- `room_status_history`

Faltas importantes que ainda podem ser decididas antes do fechamento ou em migrations futuras:

- `documents`
- `document_categories`
- `pop_documents`
- `training_records`
- `status_history` generico ou historicos especificos

Faltas esperadas para modulos futuros:

- Recepcao: `reception_shift_logs`, `operational_occurrences`/`reception_occurrences`, `lost_and_found`.
- Manutencao: `maintenance_tickets`, materiais, status history.
- Governanca: checklists, inspeções, tarefas.
- Compras: solicitações, itens, cotações, pedidos, recebimentos, emergência.
- Pagamentos: solicitações, comprovantes, histórico.
- RH: documentos, admissão, dispensa, avaliação, advertência, treinamento, salário.
- A&B: requisições, checklists, temperatura, perdas.

## O Que Deve Ser Corrigido Antes do Commit

Recomendado antes do commit da Sprint 2, conforme revisao original:

1. Criar `suppliers`.
2. Criar `attachments`.
3. Criar `comments`.
4. Criar `room_status_history`.
5. Revisar `room_status` para refletir a linguagem operacional: Disponivel Operacionalmente, Em limpeza, Em inspeção, Não conforme, Aguardando manutenção, Em manutenção, Aguardando peça, Bloqueada, Liberada tecnicamente, Liberada para governança.
6. Revisar seeds de perfis para incluir os perfis definidos na arquitetura integrada ou documentar que os perfis atuais sao provisórios.

Status Sprint 2C: itens 1 a 4 foram atendidos em `011_shared_foundation_tables.sql`.

Pontos ainda a validar antes de alterar:

- Se `documents`, `pop_documents`, `training_records` e `document_categories` entram na Sprint 2 ou ficam para Administrativo/RH.

## O Que Pode Ficar Para Migrations Futuras

Pode ficar para os modulos operacionais, desde que as entidades transversais sejam resolvidas:

- `maintenance_tickets`
- `governance_checklists`
- `purchase_requests`
- `payment_requests`
- `reception_shift_logs`
- `operational_occurrences`, se nao for definida como transversal agora
- `salary_change_requests`
- `admission_requests`
- `termination_requests`
- `ab_requisitions`

Preventiva de manutencao, estoque completo de A&B, CMV e ficha tecnica detalhada devem ficar para fases futuras.

## Tabelas Novas Recomendadas

Prioridade alta:

- `suppliers`
- `attachments`
- `comments`
- `room_status_history`

Prioridade media:

- `documents`
- `document_categories`
- `pop_documents`
- `pop_versions`
- `training_records`
- `status_history`

Prioridade por modulo:

- `reception_shift_logs`
- `operational_occurrences`
- `lost_and_found`
- `maintenance_tickets`
- `maintenance_ticket_status_history`
- `maintenance_ticket_materials`
- `governance_checklists`
- `room_inspections`
- `purchase_requests`
- `purchase_quotes`
- `payment_requests`
- `employee_documents`
- `salary_change_requests`
- `employee_warnings`
- `admission_requests`
- `termination_requests`
- `ab_requisitions`

## Migrations Que Precisam Ser Alteradas

Provaveis ajustes:

- `001_extensions_and_enums.sql`: revisar `room_status` para status operacionais internos ou migrar status de UH para `system_statuses`.
- `011_shared_foundation_tables.sql`: migration complementar criada para `suppliers`, `attachments`, `comments` e `room_status_history`.
- `007_notifications_logs_audit.sql`: revisar triggers/auditoria depois de criar anexos e comentarios.
- `010_seed_base_data.sql`: revisar perfis seedados e status padrao conforme arquitetura.

Alternativa: criar uma migration nova antes do commit, por exemplo `011_transversal_entities.sql`, mas isso quebraria a numeracao pedida originalmente de 001 a 010. Melhor decisao depende de como a equipe quer tratar a Sprint 2 antes do primeiro commit.

## Riscos Se o Banco For Commitado Como Esta

- Modulos futuros podem criar anexos duplicados por dominio.
- Compras e pagamentos ficarao bloqueados por falta de fornecedores.
- Status de UH nao tera historico operacional consultavel.
- Liberacao tecnica e liberacao operacional podem ficar apenas em auditoria JSONB, ruim para dashboards.
- Comentarios podem ser implementados de forma diferente por modulo.
- POPs/RH/documentos podem nascer desconectados da base transversal.
- Perfis seedados podem divergir dos perfis reais da operacao.
- O enum `room_status` pode conflitar com a linguagem exigida para nao parecer PMS.

## Recomendacao Final

Com a Sprint 2C aplicada, a recomendacao muda: a Sprint 2 pode seguir para commit apos revisao humana final e, idealmente, teste das migrations em um Supabase/PostgreSQL local.

O ajuste minimo recomendado foi atendido com:

- `suppliers`
- `attachments`
- `comments`
- `room_status_history`

Depois desses ajustes, as demais tabelas especificas de Recepcao, Manutencao, Governanca, Compras, Pagamentos, RH, POPs e A&B podem ser implementadas por sprints de modulo, usando as entidades transversais sem duplicacao.
