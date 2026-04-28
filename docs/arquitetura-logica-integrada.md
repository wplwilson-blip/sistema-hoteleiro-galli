# Arquitetura Logica Integrada - Sistema Administrativo Hotel Galli

## 1. Visao Geral da Logica do Sistema

O Sistema Administrativo Hotel Galli deve operar como uma plataforma integrada de administracao, operacao, aprovacoes, evidencias, auditoria e indicadores. O fluxo conceitual central e:

```text
Rede -> Unidade -> Departamento -> Usuario -> Solicitacao -> Aprovacao -> Execucao -> Evidencia -> Indicador
```

Mesmo iniciando no Hotel Galli, o sistema deve nascer preparado para multiunidade. Isso significa que processos operacionais relevantes devem considerar `unit_id`, perfis por unidade/departamento, trilha de auditoria e visao consolidada para gestao.

O sistema nao e PMS, nao tera reservas e nao deve virar financeiro completo. UHs/quartos, status operacionais e recepcao existem para controle interno da operacao, nao para disponibilidade comercial.

Os modulos nao devem funcionar como ilhas. Recepcao, manutencao, governanca, compras, contas a pagar, RH, A&B, administrativo, POPs, documentos, auditoria e dashboards devem compartilhar cadastros, workflow, anexos, comentarios, notificacoes, logs e auditoria.

## 2. Camadas do Sistema

| Camada | Objetivo | Entidades principais | Modulos dependentes | Riscos se mal modelada |
|---|---|---|---|---|
| Base | Sustentar identidade organizacional, usuarios, colaboradores, unidades, departamentos, perfis, permissoes e estrutura fisica. | `organizations`, `units`, `departments`, `app_users`, `employees`, `user_employee_links`, `user_unit_links`, `access_profiles`, `permissions`, `rooms`, `operational_locations`, `equipment_assets` | Todos | Misturar usuarios e colaboradores, perder multiunidade, criar permissoes apenas no front-end, impossibilitar auditoria. |
| Operacional | Registrar a execucao diaria por modulo e departamento. | Chamados, ocorrencias, checklists, compras, pagamentos, admisssoes, advertencias, treinamentos, POPs, documentos | Recepcao, Manutencao, Governanca, Compras, Contas a Pagar, RH, A&B, Administrativo | Criar tabelas isoladas sem workflow comum, duplicar status e anexos, perder rastreabilidade. |
| Workflow | Padronizar solicitacao, aprovacao, execucao, notificacao e encerramento. | `approval_requests`, `approval_steps`, `approval_actions`, status, comentarios, historico de status | Compras, Pagamentos, RH, Manutencao, Governanca, Administrativo | Aprovar fora do sistema, duplicar alçadas, perder justificativas de rejeicao e emergencia. |
| Evidencias | Guardar documentos, fotos, comprovantes, orcamentos, laudos, POPs e aceite digital. | `attachments`, `documents`, `pop_documents`, evidencias de treinamento, comprovantes | Todos | Duplicar anexos por modulo, nao controlar validade, expor documentos sensiveis. |
| Auditoria | Registrar alteracoes criticas e eventos tecnicos. | `audit_trail`, `system_logs`, historico de status, IP, user agent | Todos | Nao conseguir provar quem aprovou, alterou, anexou, exportou ou liberou uma UH. |
| Dashboards | Transformar dados operacionais em indicadores por perfil. | Indicadores de SLA, aprovacoes, pendencias, compras, pagamentos, UHs, RH, auditoria | Diretoria, gerencias, supervisao, auditoria | Dashboards inconsistentes se status, unidade e eventos forem fragmentados. |

## 3. Entidades Compartilhadas por Todos os Modulos

| Entidade | Para que serve | Modulos que usam | Tipo | Observacoes importantes |
|---|---|---|---|---|
| `organizations` | Representa rede/organizacao controladora. | Todos | Base | Deve permitir multiunidade futura. |
| `units` | Representa hotel/unidade operacional. | Todos | Base | Dados operacionais devem referenciar unidade quando aplicavel. |
| `departments` | Estrutura departamental. | Todos | Base | Pode ter templates globais e vinculos por unidade. |
| `app_users` | Usuarios que acessam o sistema. | Todos | Base | Login por `username`; e-mail nao e credencial. |
| `employees` | Colaboradores da operacao. | RH, Governanca, Manutencao, Recepcao, A&B, Administrativo | Base | Separado de usuario. Todos terao login individual na decisao atual, mas a separacao continua necessaria. |
| `user_employee_links` | Vincula usuario a colaborador. | Base, RH, Auditoria | Base | Vínculo opcional; preserva casos de auditor, consultor e tecnico externo. |
| `user_unit_links` | Define acesso por unidade, departamento e perfil. | Todos | Base | Essencial para RLS e UI por permissao. |
| `access_profiles` | Agrupa permissoes por perfil. | Todos | Base | Deve suportar perfis iniciais e customizacoes. |
| `permissions` | Define acoes permitidas. | Todos | Base | Nomes devem ser granulares por modulo e acao. |
| `cost_centers` | Classifica custos por unidade/departamento. | Compras, Pagamentos, Administrativo, A&B, Manutencao | Base/transversal | Nao implica financeiro completo. |
| `suppliers` | Cadastro de fornecedores. | Compras, Pagamentos, Manutencao, A&B, Administrativo | Base/transversal | Falta nas migrations atuais; deve ser previsto antes dos fluxos de compras/pagamentos. |
| `operational_locations` | Cadastro generico de locais. | Manutencao, Governanca, A&B, Recepcao, Administrativo | Base/operacional | Deve cobrir UHs, areas comuns, setores fisicos e ambientes internos. |
| `rooms` | UHs/quartos para controle operacional. | Governanca, Manutencao, Recepcao, Dashboards | Base/operacional | Status nao deve ser disponibilidade comercial de PMS. |
| `equipment_assets` | Equipamentos vinculados a unidade/local. | Manutencao, A&B, Administrativo | Base/operacional | Permite historico por equipamento. |
| `attachments` | Anexos compartilhados. | Todos | Transversal | Falta nas migrations atuais; deve evitar anexos duplicados por modulo. |
| `comments` | Comentarios e interacoes nos registros. | Todos | Transversal | Falta nas migrations atuais; deve ser rastreavel e auditavel. |
| `approval_requests` | Instancia generica de aprovacao. | Compras, Pagamentos, RH, Administrativo, Emergencias | Workflow | Deve apontar para entidade futura via `entity_type`/`entity_id`. |
| `approval_steps` | Etapas de aprovacao. | Modulos com alçada | Workflow | Deve suportar aprovadores por perfil/usuario. |
| `approval_actions` | Acoes de aprovar, rejeitar, escalar, cancelar. | Modulos com alçada | Workflow | Rejeicao exige justificativa. Autoaprovacao deve ser bloqueada futuramente. |
| `audit_trail` | Trilha de auditoria de alteracoes criticas. | Todos | Auditoria | Deve guardar `old_value` e `new_value`. |
| `system_logs` | Logs tecnicos. | Todos | Auditoria/observabilidade | Nao substitui auditoria de negocio. |
| `notifications` | Notificacoes in-app. | Todos | Transversal | V1 prioriza in-app; e-mail opcional. |
| `documents` | Documentos internos gerais. | Administrativo, RH, Auditoria | Transversal | Ponto a validar: separar de `attachments` ou usar tipo documental sobre anexos. |
| `training_records` | Registro de treinamento/ciencia. | RH, Administrativo, POPs | Operacional/transversal | Deve vincular colaborador, POP/documento, evidencias e status. |
| `pop_documents` | POPs versionados. | Administrativo, RH, Departamentos | Transversal | Documento oficial fica no Administrativo; RH controla ciencia/treinamento. |
| `salary_change_requests` | Solicitações de aumento salarial. | RH, Diretoria | Operacional/workflow | Deve usar aprovacao, anexos e historico funcional. |

## 4. Mapa de Telas x Banco de Dados

| Tela | Rota sugerida | Objetivo | Tabelas lidas | Tabelas gravadas | Permissoes necessarias | Acoes permitidas | Integracoes |
|---|---|---|---|---|---|---|---|
| Login | `/login` | Entrada por username e senha. | `app_users` futuramente via Auth | Nenhuma na Sprint 2 | Publica | Autenticar futuramente | Supabase Auth na Sprint 3 |
| Dashboard | `/dashboard` | Visao consolidada por perfil. | `notifications`, `approval_requests`, status por modulo | Nenhuma, salvo filtros/preferencias futuras | `BASE:dashboard.view` | Visualizar, filtrar | Todos os modulos |
| Minha Operacao | `/minha-operacao` | Pendencias pessoais. | `notifications`, `approval_steps`, tarefas futuras | Comentarios/acoes futuras | Usuario autenticado | Ver pendencias, agir conforme permissao | Workflow e notificacoes |
| Aprovacoes | `/aprovacoes` | Fila de aprovacoes. | `approval_requests`, `approval_steps`, `approval_actions` | `approval_actions`, status | `*.approve` | Aprovar, rejeitar, escalar | Compras, Pagamentos, RH |
| Solicitacoes | `/solicitacoes` | Lista geral de solicitacoes do usuario. | Tipos por modulo, status, anexos | Solicitudes futuras por modulo | `*.view`, `*.create` | Criar, acompanhar | Workflow |
| Recepcao | `/recepcao` | Painel operacional da recepcao. | Ocorrencias, passagens, chamados, comunicados | Ocorrencias/chamados futuros | `RECEPTION:view` | Abrir chamado, registrar ocorrencia | Manutencao, Governanca |
| Passagem de turno | `/recepcao/passagem-turno` | Registrar passagem e pendencias. | `reception_shift_logs` futuro | `reception_shift_logs` futuro | `RECEPTION:shift.manage` | Criar, encerrar, anexar | Ocorrencias, dashboards |
| Ocorrencias recepcao | `/recepcao/ocorrencias` | Registrar problemas percebidos. | `operational_occurrences` futuro | `operational_occurrences`, anexos | `RECEPTION:occurrences.manage` | Criar, encaminhar | Manutencao, Governanca |
| Unidades | `/cadastros/unidades` | Cadastro de unidades. | `units`, `unit_settings` | `units`, `unit_settings` | `BASE:units.manage` | Criar, editar, inativar | Multiunidade |
| Usuarios | `/cadastros/usuarios` | Cadastro de usuarios e acessos. | `app_users`, `user_unit_links`, `access_profiles` | Mesmas | `BASE:users.manage` | Criar, bloquear, vincular | Auth Sprint 3 |
| Departamentos | `/cadastros/departamentos` | Departamentos e cargos. | `departments`, `job_positions` | Mesmas | `BASE:departments.manage` | Criar, editar | RH, permissoes |
| Fornecedores | `/cadastros/fornecedores` | Cadastro de fornecedores. | `suppliers` futuro | `suppliers` futuro | `BASE:suppliers.manage` | Criar, editar, inativar | Compras, Pagamentos |
| UHs | `/cadastros/uhs` | Cadastro operacional de UHs. | `rooms`, `floors`, `blocks` | Mesmas | `BASE:rooms.manage` | Criar, editar status | Governanca, Manutencao |
| Areas | `/cadastros/areas` | Areas e locais operacionais. | `operational_areas`, `operational_locations` | Mesmas | `BASE:locations.manage` | Criar, editar | Manutencao, A&B |
| Equipamentos | `/cadastros/equipamentos` | Equipamentos principais. | `equipment_assets`, `operational_locations` | `equipment_assets` | `BASE:equipment.manage` | Criar, editar, inativar | Manutencao |
| Contas a Pagar | `/contas-a-pagar` | Solicitações de pagamento, vencimentos e comprovantes. | `payment_requests` futuro, fornecedores, anexos | `payment_requests`, anexos | `PAYMENTS:*` | Solicitar, aprovar, anexar comprovante | Compras, Administrativo |
| Compras | `/compras` | Solicitações, cotações, mapa comparativo e recebimento. | `purchase_requests` futuro, fornecedores, anexos | `purchase_requests`, anexos | `PURCHASES:*` | Cotar, aprovar, receber | Manutencao, A&B, Pagamentos |
| Manutencao | `/manutencao` | Chamados, SLA, materiais e status tecnico. | `maintenance_tickets` futuro, locais, UHs, equipamentos | Chamados, fotos, status | `MAINTENANCE:*` | Executar, liberar tecnicamente | Recepcao, Governanca, Compras |
| Governanca | `/governanca` | Checklists, inspecoes, status de UH. | `governance_checklists` futuro, `rooms` | Checklists, status, anexos | `GOVERNANCE:*` | Inspecionar, validar UH | Manutencao, Recepcao |
| Administrativo | `/administrativo` | Contratos, documentos e rotinas administrativas. | `documents`, contratos futuros | Documentos, solicitacoes | `ADMIN:*` | Criar, anexar, solicitar pagamento | Pagamentos, POPs |
| POPs | `/administrativo/pops` | Documentos oficiais e versoes. | `pop_documents`, `documents` futuro | `pop_documents`, anexos | `POPS:manage` | Versionar, publicar | RH treinamentos |
| RH | `/rh` | Painel de RH. | `employees`, pendencias, documentos | Fluxos futuros | `HR:view` | Acompanhar | Diretoria, POPs |
| Colaboradores | `/rh/colaboradores` | Cadastro e prontuario. | `employees`, documentos | `employees`, anexos | `HR:employees.manage` | Criar, editar, anexar | Usuarios, treinamentos |
| Admissoes | `/rh/admissoes` | Processo de contratacao. | `employees`, cargos, documentos | `admission_requests` futuro | `HR:admissions.manage` | Solicitar, validar, executar | Diretor |
| Desligamentos | `/rh/desligamentos` | Processo de dispensa. | `employees` | `termination_requests` futuro | `HR:terminations.manage` | Solicitar, aprovar, registrar | Diretor |
| Avaliacoes | `/rh/avaliacoes` | Avaliacoes de desempenho. | `performance_reviews` futuro | Mesma | `HR:reviews.manage` | Criar, concluir | Aumentos |
| Treinamentos | `/rh/treinamentos` | Treinamentos e ciencia. | `training_records`, `pop_documents` futuro | `training_records` | `HR:training.manage` | Registrar, concluir | POPs |
| Aumentos salariais | `/rh/aumentos-salariais` | Solicitações de aumento. | `salary_change_requests` futuro | Mesma | `HR:salary.manage` | Solicitar, validar | Diretor, Auditoria |
| Advertencias | `/rh/advertencias` | Advertencias e aceite digital. | `disciplinary_warnings` futuro | Mesma, anexos | `HR:warnings.manage` | Criar, anexar, coletar aceite | Historico funcional |
| A&B | `/ab` | Requisicoes, checklists e perdas. | `ab_requests` futuro, compras | Requisicoes/checklists futuros | `AB:*` | Solicitar compra, registrar perda | Compras |
| Relatorios | `/relatorios` | Exportacoes e analises. | Todas conforme permissao | Log de exportacao | `REPORTS:view/export` | Filtrar, exportar | Auditoria |
| Auditoria | `/auditoria` | Consulta auditavel. | `audit_trail`, `system_logs` | Nenhuma | `AUDIT:view` | Visualizar, exportar | Todos |
| Configuracoes | `/configuracoes` | Parametros globais/unidade. | `unit_settings`, perfis | Configuracoes | `BASE:settings.manage` | Editar parametros | Todos |

## 5. Fluxos Interdepartamentais Completos

### Fluxo 1: Recepcao -> Manutencao -> Governanca

- Inicio: recepcao identifica problema em UH ou area comum.
- Responsavel inicial: recepcionista ou supervisor de recepcao.
- Telas: `/recepcao`, `/recepcao/ocorrencias`, `/manutencao`, `/governanca`.
- Tabelas provaveis: `operational_occurrences`, `maintenance_tickets`, `rooms`, `operational_locations`, `attachments`, `notifications`, `audit_trail`.
- Status: aberto, triado, em manutencao, liberado tecnicamente, liberado para governanca, Disponivel Operacionalmente.
- Aprovacoes: geralmente nao exige aprovacao; ponto a validar para chamados que geram compra.
- Anexos obrigatorios: foto do problema quando aplicavel; foto depois para conclusao tecnica.
- Notificacoes: manutencao recebe chamado; governanca recebe validacao de UH quando manutencao liberar.
- Logs/auditoria: abertura, mudanca de status, anexos, liberacao tecnica, validacao operacional.
- Encerramento: UH fica Disponivel Operacionalmente apenas por Governanta ou Gerente Operacional.

### Fluxo 2: Governanca -> Manutencao -> Compras -> Contas a Pagar -> Governanca

- Inicio: checklist/inspecao de UH encontra nao conformidade.
- Responsavel inicial: governanta, supervisora ou camareira conforme permissao.
- Telas: `/governanca`, `/manutencao`, `/compras`, `/contas-a-pagar`.
- Tabelas provaveis: `governance_checklists`, `maintenance_tickets`, `purchase_requests`, `payment_requests`, `rooms`, `equipment_assets`, `attachments`, `approval_requests`.
- Status: nao conforme, aguardando manutencao, aguardando compra, compra em cotacao, compra aprovada, recebido, manutencao concluida, em reinspecao, Disponivel Operacionalmente.
- Aprovacoes: compra normal exige Diretor; pagamento segue alçada.
- Anexos obrigatorios: checklist, fotos, minimo 2 orcamentos, NF/anexo, comprovante se pagamento for registrado.
- Notificacoes: manutencao, compras, Diretor, contas a pagar e governanca.
- Logs/auditoria: checklist, criacao de chamado, requisicao de compra, aprovacao, recebimento, pagamento e validacao final.
- Encerramento: reinspecao de Governanca/Gerente Operacional.

### Fluxo 3: Manutencao -> Compra emergencial -> Diretor -> Contas a Pagar

- Inicio: problema critico exige compra imediata.
- Responsavel: manutencao registra emergencia; compras ou responsavel autorizado registra compra.
- Telas: `/manutencao`, `/compras`, `/aprovacoes`, `/contas-a-pagar`.
- Tabelas provaveis: `maintenance_tickets`, `purchase_requests`, `approval_requests`, `payment_requests`, `attachments`, `audit_trail`.
- Status: emergencia registrada, compra executada, aguardando ciencia/aprovacao do Diretor, aguardando pagamento, encerrado.
- Aprovacoes: ciencia/aprovacao posterior do Diretor.
- Anexos obrigatorios: justificativa, evidencia, NF/recibo/orcamento quando houver.
- Notificacoes: Diretor, Gerente Operacional, Contas a Pagar.
- Auditoria: obrigatoria para emergencia, valor, responsavel, anexos e aprovacao posterior.
- Encerramento: pagamento solicitado e comprovante anexado, quando aplicavel.

### Fluxo 4: A&B -> Compras -> Contas a Pagar

- Inicio: A&B solicita insumos ou registra necessidade operacional.
- Responsavel: lider A&B ou perfil autorizado.
- Telas: `/ab`, `/compras`, `/contas-a-pagar`.
- Tabelas provaveis: `ab_requests`, `purchase_requests`, `payment_requests`, `suppliers`, `attachments`.
- Status: solicitado, em triagem, em cotacao, aprovado, recebido, pagamento solicitado, concluido.
- Aprovacoes: compra normal com Diretor; pagamento conforme alçada.
- Anexos obrigatorios: orcamentos, NF, comprovante.
- Ponto a validar: regras para valor baixo ou compra recorrente de insumos.

### Fluxo 5: Administrativo -> Contrato -> Solicitacao de Pagamento

- Inicio: contrato/documento administrativo gera pagamento.
- Responsavel: administrativo ou gerente administrativa.
- Telas: `/administrativo`, `/contas-a-pagar`.
- Tabelas provaveis: `documents`, contratos futuros, `payment_requests`, `attachments`, `approval_requests`.
- Status: documento cadastrado, pagamento solicitado, aprovado, comprovante anexado, encerrado.
- Aprovacoes: ate R$ 200,00 nao emergencial por Gerente Administrativa; acima de R$ 200,00 por Diretor.
- Anexos obrigatorios: contrato/documento, boleto/NF/recibo, comprovante.

### Fluxo 6: RH -> Contratacao -> Diretor -> Admissao

- Inicio: gestor solicita contratacao.
- Responsavel: gestor solicitante, RH e Diretor.
- Telas: `/rh/admissoes`, `/aprovacoes`, `/rh/colaboradores`.
- Tabelas provaveis: `admission_requests`, `employees`, `job_positions`, `attachments`, `approval_requests`.
- Status: solicitada, em analise RH, aguardando Diretor, aprovada, admissao executada, concluida.
- Anexos: documentos de candidato/colaborador conforme regra de RH.
- Auditoria: aprovacao, documentos sensiveis, criacao de colaborador e usuario.

### Fluxo 7: RH -> Avaliacao -> Plano de Cargos -> Aumento Salarial -> Diretor

- Inicio: avaliacao ou demanda de enquadramento.
- Responsavel: RH valida plano; Diretor aprova.
- Telas: `/rh/avaliacoes`, `/rh/aumentos-salariais`, `/aprovacoes`.
- Tabelas provaveis: `performance_reviews`, `salary_change_requests`, `employees`, `attachments`, `approval_requests`.
- Status: rascunho, em avaliacao, validado pelo RH, aguardando Diretor, aprovado/rejeitado, registrado.
- Anexos: avaliacao, justificativa, plano de cargos quando aplicavel.
- Auditoria: obrigatoria por dado sensivel e impacto salarial.

### Fluxo 8: RH -> Advertencia -> Aceite Digital + Anexo -> Historico funcional

- Inicio: gestor/RH registra advertencia.
- Responsavel: RH e gestor responsavel.
- Telas: `/rh/advertencias`, `/rh/colaboradores`.
- Tabelas provaveis: `disciplinary_warnings`, `employees`, `attachments`, `audit_trail`.
- Status: criada, pendente de aceite, aceita, recusada/registrada, arquivada.
- Anexos: documento da advertencia e evidencias.
- Auditoria: motivo, data, colaborador, gestor, aceite digital.

### Fluxo 9: POP Administrativo -> Treinamento RH -> Ciencia do Colaborador

- Inicio: Administrativo publica ou atualiza POP.
- Responsavel: Administrativo pelo documento; RH pela ciencia/treinamento.
- Telas: `/administrativo/pops`, `/rh/treinamentos`, `/minha-operacao`.
- Tabelas provaveis: `pop_documents`, `training_records`, `employees`, `job_positions`, `departments`, `attachments`.
- Status: rascunho, vigente, treinamento pendente, ciencia pendente, concluido, revisado.
- Anexos: POP oficial, evidencia de treinamento, aceite digital.
- Auditoria: versao, publicacao, ciencia, treinamento concluido.

### Fluxo 10: Ocorrencia Operacional -> Plano de Acao -> Evidencia -> Dashboard

- Inicio: ocorrencia em qualquer departamento.
- Responsavel: area que identifica e gestor responsavel pelo plano.
- Telas: modulo de origem, `/solicitacoes`, `/dashboard`, `/relatorios`.
- Tabelas provaveis: `operational_occurrences`, `action_plans`, `attachments`, `comments`, `notifications`, `audit_trail`.
- Status: aberta, em analise, plano criado, em execucao, evidenciado, concluido.
- Anexos: evidencias de acao e conclusao.
- Dashboard: pendencias, reincidencia, SLA e areas com maior volume.

## 6. Workflow Geral de Solicitacoes

Lógica comum:

1. Solicitacao: usuario cria demanda com unidade, departamento, tipo, prioridade e contexto.
2. Aprovacao: quando aplicavel, cria `approval_requests`, etapas e responsaveis.
3. Execucao: area executora atualiza status, prazo, responsavel e evidencias.
4. Anexos: documentos obrigatorios bloqueiam conclusao quando definidos.
5. Comentarios: interacoes ficam centralizadas e auditaveis.
6. Historico de status: cada transicao relevante deve ser rastreavel.
7. Notificacao: interessados sao notificados in-app.
8. Encerramento: exige permissao, status valido, evidencias e auditoria.

Comparacao:

| Opcao | Descricao | Vantagens | Riscos |
|---|---|---|---|
| A | Tabela generica `requests` para todos os modulos. | Relatorios e workflow simples no inicio. | Pode ficar generica demais para manutencao, RH, compras e governanca; campos especificos viram JSONB excessivo. |
| B | Tabelas especificas por modulo usando componentes compartilhados (`approval_requests`, `attachments`, `comments`, `notifications`, `audit_trail`). | Mantem dominio claro e reaproveita workflow transversal. Escala melhor para RH, compras, manutencao e governanca. | Exige disciplina para padronizar status, anexos e auditoria. |

Recomendacao: Opcao B. Para este sistema, manutencao, compras, pagamentos, RH, governanca, recepcao e A&B possuem regras proprias suficientes para tabelas especificas. O compartilhamento deve ocorrer nas camadas transversais: aprovacoes, anexos, comentarios, notificacoes, auditoria, status e dashboards.

## 7. Regras de Status

Status comuns:

- Rascunho
- Enviado
- Aguardando aprovação
- Aprovado
- Rejeitado
- Em execução
- Aguardando informação
- Aguardando compra
- Aguardando pagamento
- Concluído
- Cancelado

Status por modulo:

| Modulo | Status especificos |
|---|---|
| Manutencao | Aberto, Triado, Aguardando manutenção, Em manutenção, Aguardando peça, Liberado tecnicamente, Cancelado, Concluído |
| Governanca | Em limpeza, Em inspeção, Não conforme, Liberada para governança, Disponível Operacionalmente |
| Compras | Solicitada, Em triagem, Em cotação, Aguardando orçamentos, Mapa comparativo, Aguardando Diretor, Aprovada, Rejeitada, Recebida, Enviada para pagamento |
| Solicitações de Pagamento | Rascunho, Aguardando anexos, Aguardando aprovação, Aprovada, Rejeitada, Pagamento externo executado, Comprovante anexado, Encerrada |
| Recepcao | Aberta, Comunicada, Encaminhada, Em acompanhamento, Resolvida, Cancelada |
| RH | Solicitado, Em análise RH, Aguardando Diretor, Aprovado, Rejeitado, Executado, Arquivado |
| POPs | Rascunho, Em revisão, Vigente, Substituído, Inativo |
| Treinamentos | Pendente, Agendado, Em andamento, Concluído, Vencido, Dispensado |
| UHs/quartos | Disponível Operacionalmente, Em limpeza, Em inspeção, Não conforme, Aguardando manutenção, Em manutenção, Aguardando peça, Bloqueada, Liberada tecnicamente, Liberada para governança |

Regra de UH: manutencao libera tecnicamente; Governanta ou Gerente Operacional libera operacionalmente. O termo final deve ser “Disponível Operacionalmente”.

## 8. Regras de Permissoes por Acao

| Modulo | Ver | Criar | Editar | Aprovar/Rejeitar | Cancelar | Anexar | Concluir | Exportar | Outras unidades | Dados sensiveis |
|---|---|---|---|---|---|---|---|---|---|---|
| Base | Admin/perfil autorizado | Admin | Admin | Ponto a validar | Admin | Admin | Admin | Admin | Diretor/Super Admin | Restrito |
| Recepcao | Recepcao/gestores | Recepcao | Autor/gestor | Nao aprova compras | Gestor | Recepcao | Gestor | Gestor | Gestores | Limitado |
| Manutencao | Manutencao/gestores | Recepcao/Governanca/Manutencao | Manutencao | Nao aprova compra normal | Gestor | Manutencao | Manutencao | Gestor | Gestores | Limitado |
| Compras | Compras/Diretor/gestores | Solicitantes autorizados | Compras | Diretor | Compras/Diretor | Compras | Compras | Compras/Diretor | Diretor | Valores restritos |
| Governanca | Governanca/gestores | Governanca | Governanca | Valida UH, nao compra | Governanta/Gerente Operacional | Governanca | Governanta/Gerente Operacional | Gestor | Gestores | Limitado |
| Contas a Pagar | Financeiro/Gerente Adm/Diretor | Autorizados | Financeiro | Gerente Adm/Diretor | Financeiro/Diretor | Financeiro | Financeiro | Financeiro/Diretor | Diretor | Alto |
| RH | RH/Diretor | RH/gestores em fluxos | RH | Diretor conforme fluxo | RH/Diretor | RH | RH | RH/Diretor | Diretor/RH | Alto |
| A&B | A&B/gestores | A&B | A&B | Diretor via compras | Gestor | A&B | A&B | Gestor | Gestores | Limitado |
| Administrativo | Administrativo/gestores | Administrativo | Administrativo | Conforme fluxo | Gestor | Administrativo | Administrativo | Gestor | Gestores | Contratos restritos |
| POPs/Documentos | Conforme publico-alvo | Administrativo/RH | Dono do documento | Ponto a validar | Dono/gestor | Dono | RH/Administrativo | Gestor | Gestores | Conforme documento |
| Relatorios | Conforme perfil | Nao aplicavel | Nao aplicavel | Nao aplicavel | Nao aplicavel | Nao aplicavel | Nao aplicavel | Perfil autorizado | Diretor/gestores | Restrito por modulo |
| Auditoria | Auditoria/Diretor | Nao | Nao | Nao | Nao | Nao | Nao | Auditoria/Diretor | Diretor/Auditoria | Leitura restrita |

Perfis iniciais: Super Admin, Diretor, Gerente Geral, Gerente Operacional, Gerente Administrativa, Gerente Financeiro, Gerente de Departamento, Governanta, Supervisor, Colaborador Operacional, Recepcao, Manutencao, Compras, RH, A&B, Auditoria/Consulta, Tecnico Externo.

## 9. Integracao Entre UI e Permissoes

A UI deve derivar menus, botoes, acoes e campos das permissoes efetivas do usuario por unidade/departamento.

Regras:

- Menus sem permissao nao aparecem.
- Acoes sem permissao nao aparecem ou ficam indisponiveis com motivo claro.
- Campos sensiveis ficam ocultos para quem nao tem permissao.
- Documentos de RH e valores financeiros exigem permissao explicita.
- Dados de outra unidade so aparecem para perfis multiunidade.
- Auditoria ve registros, mas nao edita.

Exemplos:

- Colaborador operacional nao ve valores financeiros sensiveis.
- Recepcao pode abrir chamado, mas nao aprovar compra.
- Manutencao pode concluir chamado e liberar tecnicamente, mas nao tornar UH Disponível Operacionalmente.
- Governanta pode validar UH.
- Diretor ve aprovacoes e dashboards executivos.
- RH ve dados sensiveis de colaboradores.
- Tecnico externo ve apenas chamados atribuídos e anexos permitidos.

## 10. Integracao Entre Banco e Telas

| Modulo | Cards | Tabelas | Formularios | Obrigatorios | Calculados | Somente leitura | Disparam notificacao | Geram auditoria |
|---|---|---|---|---|---|---|---|---|
| Base | Usuarios ativos, unidades | Usuarios, perfis, unidades | Usuario, unidade, perfil | Username, unidade, perfil | Permissoes efetivas | IDs, auth_email oculto | Novo acesso, bloqueio | Permissoes, status |
| Recepcao | Ocorrencias abertas | Passagens, ocorrencias | Ocorrencia, chamado | Unidade, local, descricao | Pendencias por turno | Historico encerrado | Chamado criado | Ocorrencia/status |
| Manutencao | SLA, criticos | Chamados | Execucao, materiais | Local/UH, prioridade | Tempo SLA | Historico | Atribuicao, liberacao tecnica | Status, fotos, materiais |
| Compras | Em cotacao, aguardando Diretor | Solicitacoes, orcamentos | Compra, mapa | Justificativa, orcamentos | Melhor proposta | Aprovacoes concluidas | Aguardando aprovacao | Valores, emergencia |
| Pagamentos | Vencimentos, pendentes | Solicitacoes | Pagamento, comprovante | Fornecedor, valor, anexos | Dias para vencimento | Comprovante encerrado | Aprovacao, vencimento | Valor, status |
| Governanca | UHs nao conformes | Checklists, inspecoes | Checklist, validacao | UH/local, itens | Reincidencia | Historico | Validacao pendente | Status de UH |
| RH | Pendencias documentais | Colaboradores, processos | Admissao, advertencia | Colaborador, documento | Vencimentos | Historico funcional | Ciencia, aprovacao | Sensivel |
| A&B | Checklists pendentes | Requisicoes, perdas | Requisicao/checklist | Local, item, responsavel | Perdas por periodo | Historico | Compra solicitada | Perdas/checklists |
| POPs | Ciencias pendentes | POPs, treinamentos | POP, treinamento | Versao, vigencia | Aderencia | Versoes antigas | Ciencia pendente | Publicacao/ciencia |
| Auditoria | Eventos criticos | Audit trail/logs | Filtros | Periodo | Volume por modulo | Tudo | Exportacao | Exportacao |

## 11. Regras de Anexos

| Tipo | Quem anexa | Quem ve | Obrigatorio quando | Bloqueia conclusao | Auditoria | Validade | Sensivel/restrito |
|---|---|---|---|---|---|---|---|
| NF | Compras/Financeiro | Financeiro/Diretor/Compras | Compra/pagamento | Sim para pagamento | Sim | Nao | Sim |
| Boleto | Financeiro/Admin | Financeiro/Diretor | Pagamento com boleto | Sim | Sim | Vencimento | Sim |
| Recibo | Financeiro/Admin | Financeiro/Diretor | Pagamento sem NF | Ponto a validar | Sim | Nao | Sim |
| Contrato | Administrativo | Admin/Diretor/perfis | Pagamento contratual | Sim | Sim | Pode exigir | Sim |
| Comprovante | Financeiro | Financeiro/Diretor | Encerrar pagamento | Sim | Sim | Nao | Sim |
| Foto antes | Manutencao/Governanca/Recepcao | Area envolvida | Chamado com evidencia visual | Ponto a validar | Sim | Nao | Geralmente nao |
| Foto depois | Manutencao/Governanca | Area envolvida | Conclusao de chamado | Sim em manutencao | Sim | Nao | Geralmente nao |
| Orcamento | Compras | Compras/Diretor | Compra normal | Sim, minimo 2 | Sim | Nao | Valor restrito |
| Laudo | Manutencao/Tecnico | Gestores/Manutencao | Equipamento/criticidade | Ponto a validar | Sim | Pode exigir | Pode ser restrito |
| Documento colaborador | RH | RH/Diretor/autorizados | Prontuario/admissao | Conforme tipo | Sim | Pode exigir | Sim |
| POP | Administrativo | Publico alvo | Publicacao | Sim | Sim | Vigencia | Conforme POP |
| Avaliacao | RH/Gestor | RH/Diretor/gestor | Ciclo avaliativo | Sim | Sim | Nao | Sim |
| Advertencia | RH | RH/Diretor/gestor autorizado | Advertencia | Sim | Sim | Nao | Sim |
| Evidencia treinamento | RH/Gestor | RH/auditoria/gestor | Treinamento pratico | Sim | Sim | Pode exigir | Pode ser restrito |
| Evidencia plano de acao | Responsavel | Gestores/auditoria | Encerrar plano | Sim | Sim | Nao | Conforme caso |

## 12. Logs e Auditoria

Eventos criticos:

- Criacao, edicao e exclusao logica.
- Aprovacao, rejeicao e cancelamento.
- Alteracao de valor, status, permissao e perfil.
- Reset de senha.
- Troca de unidade ativa.
- Upload, substituicao e remocao logica de anexo.
- Exportacao de relatorio.
- Compra emergencial.
- Alteracao salarial.
- Advertencia.
- Dispensa.
- Liberacao de UH.
- Alteracao de status operacional de UH.
- Alteracao/publicacao de POP.
- Ciencia de colaborador.
- Treinamento concluido.

`audit_trail` deve registrar eventos de negocio com usuario, unidade, entidade, acao, `old_value`, `new_value`, IP e user agent quando disponiveis. `system_logs` deve registrar falhas tecnicas, jobs, integrações futuras e diagnosticos, sem substituir auditoria.

## 13. Dashboards Integrados

| Perfil | Cards principais | Alertas | Pendencias | Rankings | Visao |
|---|---|---|---|---|---|
| Diretor | Aprovacoes, compras, pagamentos, SLA, UHs bloqueadas | Emergencias, vencimentos, rejeicoes | Aprovar compras/pagamentos/RH | Departamentos com maior pendencia | Multiunidade/unidade |
| Gerente Geral | Operacao geral, recepcao, governanca, manutencao | UHs bloqueadas, ocorrencias criticas | Planos de acao | Areas recorrentes | Unidade |
| Gerente Operacional | UHs, manutencao, governanca, recepcao | SLA vencido, UH nao conforme | Validar UH, cobrar execucao | Equipamentos/UHs recorrentes | Unidade/departamento |
| Gerente Administrativa | Pagamentos ate R$ 200, documentos, contratos | Vencimentos, anexos faltantes | Aprovar pagamentos permitidos | Fornecedores pendentes | Unidade |
| Gerente Financeiro | Solicitacoes, comprovantes, vencimentos | Pagamento sem comprovante | Anexar comprovante | Categorias de maior volume | Unidade |
| Governanta | UHs em limpeza/inspecao/nao conformes | Liberacao tecnica pendente de validacao | Validar UH | UHs reincidentes | Unidade/andar |
| Manutencao | Chamados, SLA, criticidade | Aguardando peca, bloqueios | Executar chamados | Equipamentos recorrentes | Unidade/local |
| Compras | Em cotacao, aguardando orcamento, recebimentos | Emergenciais, sem 2 orcamentos | Cotar/receber | Fornecedores | Unidade/categoria |
| RH | Documentos, treinamentos, admissoes, advertencias | Documentos vencidos, ciencia pendente | Processos RH | Departamentos com pendencia | Unidade/departamento |
| A&B | Checklists, perdas, requisicoes | Temperatura fora padrao | Solicitar insumos | Perdas por item | Unidade/area |
| Recepcao | Ocorrencias, pendencias de turno | Problemas criticos | Passagem de turno | Tipos de ocorrencia | Unidade/turno |
| Auditoria | Eventos criticos, acessos, exportacoes | Alteracoes sensiveis | Revisar logs | Usuarios/modulos com mais eventos | Multiunidade conforme permissao |

## 14. Riscos de Modelagem

- Criar modulos isolados.
- Duplicar tabelas de anexos.
- Duplicar aprovacoes.
- Misturar `app_users` com `employees`.
- Nao incluir recepcao.
- Nao incluir UHs e locais operacionais.
- Nao tratar compras emergenciais.
- Colocar financeiro completo dentro do sistema.
- Banco nascer antes dos fluxos.
- Status de UH conflitar com PMS.
- Permitir login generico.
- Permitir alteracao critica sem auditoria.
- Criar permissoes apenas no front-end.
- Nao tratar documentos sensiveis de RH.
- Usar `auth_email` em telas ou logs de interface.
- Criar status textuais divergentes entre modulos.

## 15. Recomendacoes Para Revisar as Migrations da Sprint 2

Tabelas da Sprint 2 que estao alinhadas:

- `organizations`, `units`, `unit_settings`
- `departments`, `job_positions`
- `app_users`, `employees`, `user_employee_links`
- `access_profiles`, `permissions`, `profile_permissions`, `user_unit_links`, `user_permission_overrides`
- `blocks`, `floors`, `rooms`, `operational_areas`, `operational_locations`, `equipment_assets`
- `cost_centers`, `operational_categories`, `request_types`, `attachment_types`, `system_statuses`
- `approval_flows`, `approval_levels`, `approval_requests`, `approval_steps`, `approval_actions`
- `notification_rules`, `notifications`, `system_logs`, `audit_trail`

Tabelas que podem faltar ainda no Modulo Base/transversal:

- `suppliers`
- `attachments`
- `comments`
- `documents`
- `pop_documents`
- `training_records`
- `room_status_history`

Tabelas que talvez devam ficar para migrations dos modulos, mas precisam estar previstas no desenho:

- `reception_shift_logs`
- `operational_occurrences`
- `action_plans`
- `purchase_requests`
- `payment_requests`
- `maintenance_tickets`
- `governance_checklists`
- `salary_change_requests`

Relacionamentos a revisar:

- `attachment_types` existe, mas ainda falta a tabela concreta de anexos.
- `approval_requests` ja permite entidade generica, mas as tabelas especificas precisam padronizar `entity_type`/`entity_id`.
- `rooms.room_status` deve incluir os status operacionais definidos nesta arquitetura ou usar tabela padronizada de status por modulo.
- `suppliers` deve existir antes de compras/pagamentos.
- `comments` e historico de status devem ser compartilhados para evitar duplicacao.

O que ajustar antes do commit da Sprint 2, ponto a validar:

- Incluir `suppliers`, `attachments`, `comments` e talvez `room_status_history` ainda na Sprint 2, por serem transversais.
- Decidir se `documents`, `pop_documents` e `training_records` entram no Modulo Base ou ficam para Administrativo/RH.
- Decidir se status de UH ficam em enum `room_status` ou em `system_statuses` para maior flexibilidade.
- Revisar perfis seedados para refletir os perfis definidos nesta arquitetura: Diretor, Gerente Geral, Gerente Operacional, Gerente Administrativa, Gerente Financeiro, Governanta, Recepcao, Manutencao, Compras, RH, A&B e Tecnico Externo.
- Nao criar dados reais do Hotel Galli, unidade real, usuario real ou colaborador real em seeds.

## 16. Conclusao

A arquitetura logica integrada esta pronta para orientar a revisao do banco da Sprint 2.

Decisoes que ainda precisam validacao humana antes de implementar:

- Se `suppliers`, `attachments`, `comments` e `room_status_history` entram imediatamente na Sprint 2.
- Se POPs e treinamentos devem nascer como tabelas transversais no Modulo Base ou em migrations especificas de Administrativo/RH.
- Se status de UH serao enum rigido ou tabela configuravel.
- Quais excecoes de compras e pagamentos terao alçadas especificas por valor, unidade ou categoria.
- Quais documentos de RH terao visibilidade restrita por tipo.

Proximos passos recomendados:

1. Revisar as migrations da Sprint 2 contra esta arquitetura.
2. Ajustar tabelas transversais faltantes antes do commit, se aprovado.
3. Validar a execucao SQL em Supabase local/remoto de teste quando houver ambiente.
4. Fechar a Sprint 2 somente depois de confirmar que o banco suporta os fluxos integrados sem transformar o sistema em PMS ou financeiro completo.
