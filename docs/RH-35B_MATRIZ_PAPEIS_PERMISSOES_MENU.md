# RH-35B — Matriz de Papéis, Permissões e Menu

> Observação: este documento trata de papéis, permissões, menus e demandas; a auditoria completa da lógica empresarial será criada em documento separado.

## 1. Objetivo do documento

Este documento define a matriz técnica e operacional de papéis, permissões, visões e menu por perfil para o Sistema Administrativo Hotel Galli.

A finalidade é orientar as próximas sprints antes de implementar menu filtrado, ações por permissão e demandas globais. A matriz descreve:

- papéis operacionais;
- permissões por módulo;
- visão esperada por perfil;
- menu conceitual por perfil;
- ações permitidas;
- fluxo de demandas;
- separação entre ver e executar.

O processo pode ser único, mas cada perfil deve enxergar e operar apenas o que faz sentido para sua função. Ver um processo não significa poder executar, aprovar, cancelar, anexar documento sensível ou configurar regras.

## 2. Princípios de acesso

- Super Admin vê e opera tudo.
- Diretoria vê tudo, mas não executa operação diária por padrão.
- Gerência Administrativa vê e opera áreas administrativas conforme alçada.
- Gerência Operacional vê e opera áreas operacionais conforme alçada.
- Líder ou encarregado opera o próprio setor e solicita demandas.
- Equipe operacional executa tarefas atribuídas.
- RH Recrutamento opera vagas, candidatos, entrevistas e decisão de recrutamento.
- RH Admissão opera admissões, documentos, ASO, contabilidade administrativa e onboarding.
- Ação sensível depende de permissão, não apenas de menu.
- `allowed_actions` pode orientar a interface, mas a autorização final precisa ser validada no backend.
- Menu não é segurança; é experiência.
- Segurança real deve continuar server-side.
- Não mexer em RLS, Auth, login ou `auth_email` nesta fase.

## 3. Separar ver de executar

| Capacidade | Significado operacional |
| --- | --- |
| Pode ver | Consulta registros do escopo permitido. |
| Pode criar | Abre novo registro, solicitação ou rascunho. |
| Pode editar | Altera dados antes de etapa definitiva. |
| Pode aprovar | Registra decisão formal de aprovação. |
| Pode devolver | Retorna para etapa anterior com justificativa. |
| Pode cancelar | Encerra processo sem conclusão. |
| Pode concluir | Finaliza tarefa operacional atribuída. |
| Pode anexar | Envia evidência/documento permitido. |
| Pode auditar | Consulta histórico, logs, anexos e decisões. |
| Pode configurar | Altera regras, cadastros estruturais ou permissões. |

Diretoria pode ver tudo, mas não deve registrar entrevista, anexar documento admissional, concluir manutenção, alterar checklist operacional ou executar rotina diária, salvo permissão especial.

## 4. Papéis globais propostos

| Papel | Objetivo | Escopo | Módulos visíveis | Ações permitidas | Ações proibidas por padrão |
| --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Administração geral do sistema. | Todas as unidades e módulos. | Todos. | Ver, operar, configurar, auditar. | Nenhuma, salvo regra legal/negocial específica. |
| `NETWORK_MANAGER` / `DIRETOR_REDE` | Gestão executiva da rede. | Todas as unidades. | Painéis, aprovações, RH, compras, operação, relatórios. | Ver, aprovar conforme regra, auditar. | Operação diária sem permissão específica. |
| `UNIT_DIRECTOR` / `DIRETOR_UNIDADE` | Diretoria da unidade. | Unidade vinculada. | Painéis, aprovações, RH, compras, contas, operação, relatórios. | Ver, aprovar, devolver, auditar. | Executar rotina operacional. |
| `GERENCIA_ADMINISTRATIVA` | Gestão administrativa. | Áreas administrativas da unidade. | RH, documentos, compras, contas a pagar, administrativo, relatórios. | Operar, aprovar conforme alçada, acompanhar demandas. | Ações técnicas de SST e operação setorial sem escopo. |
| `GERENCIA_OPERACIONAL` | Gestão da operação hoteleira. | Áreas operacionais da unidade. | Recepção, governança, manutenção, A&B, ocorrências, solicitações. | Ver, priorizar, devolver, aprovar conforme alçada. | Documentos admissionais sensíveis e configurações. |
| `RH_RECRUTAMENTO` | Conduzir vagas e candidatos. | Recrutamento e seleção. | Vagas, candidatos, entrevistas, dashboard de recrutamento. | Criar, editar, validar, decidir candidato, encaminhar admissão. | Executar admissão documental sensível fora do escopo. |
| `RH_ADMISSAO` | Conduzir processo admissional. | Admissão, documentos, onboarding administrativo. | Admissões, documentos admissionais, onboarding, pendências. | Solicitar, conferir, rejeitar, aprovar documentos, liberar etapas. | Operar folha, eSocial, financeiro ou cálculos. |
| `RH_DOCUMENTOS` | Gerir documentos RH. | Documentos e dossiês permitidos. | Documentos RH, dossiês, pendências. | Ver, anexar, conferir, reprovar, auditar documentos. | Ver sensíveis sem permissão específica. |
| `SST` | Validar saúde ocupacional e riscos. | ASO, exames, EPIs técnicos, confirmações SST. | Saúde ocupacional, EPIs técnicos, pendências SST. | Validar, registrar conclusão técnica, orientar risco. | Folha, eSocial, valores e documentos admissionais não técnicos. |
| `CONTABILIDADE_ADMINISTRATIVA` | Registrar retorno administrativo sem operar folha no sistema. | Etapas administrativas de registro. | Admissões e pendências administrativas. | Registrar retorno, pendências e liberação administrativa. | Cálculo trabalhista, folha, eSocial, valores. |
| `COMPRAS` | Operar compras. | Solicitações, cotações, evidências. | Compras, fornecedores, pendências de compras. | Cotar, anexar, selecionar vencedora, reenviar. | Aprovar fora da alçada. |
| `CONTAS_A_PAGAR` | Operar contas a pagar. | Lançamentos e conferências. | Contas a pagar, anexos, aprovações relacionadas. | Lançar, anexar, conferir, acompanhar. | Aprovar diretoria sem perfil. |
| `LIDER_GOVERNANCA` | Coordenar governança. | Setor governança. | Demandas do setor, ocorrências, chamados, equipe. | Solicitar vaga, registrar ocorrência, validar conclusão. | Ver documentos admissionais sensíveis. |
| `LIDER_RECEPCAO` | Coordenar recepção. | Setor recepção. | Ocorrências, chamados, solicitações, equipe. | Criar demandas, acompanhar, escalar. | Operar RH sensível. |
| `LIDER_AB` | Coordenar A&B. | Setor A&B. | Ocorrências, compras solicitadas, manutenção, equipe. | Solicitar, acompanhar, validar demanda setorial. | Aprovar fora da alçada. |
| `LIDER_MANUTENCAO` | Coordenar manutenção. | Manutenção. | Chamados, materiais, evidências. | Assumir, distribuir, concluir, escalar. | Aprovar compras fora da alçada. |
| `LIDER_ADMINISTRATIVO` | Coordenar rotinas administrativas. | Administrativo. | Solicitações, compras, documentos, pendências. | Criar, acompanhar, validar. | Configurar permissões. |
| `OPERACIONAL_GOVERNANCA` | Executar tarefas de governança. | Tarefas atribuídas. | Minhas tarefas, ocorrências permitidas. | Atualizar e concluir tarefas atribuídas. | Consultar gestão ampla. |
| `OPERACIONAL_RECEPCAO` | Executar registros de recepção. | Tarefas e ocorrências permitidas. | Minhas tarefas, ocorrências, chamados. | Registrar e acompanhar demandas. | Ver dados sensíveis de RH. |
| `OPERACIONAL_AB` | Executar rotinas A&B. | Tarefas do setor. | Minhas tarefas, ocorrências, solicitações. | Registrar perdas, ocorrências e demandas. | Aprovar compras. |
| `OPERACIONAL_MANUTENCAO` | Executar chamados. | Chamados atribuídos. | Minhas tarefas, manutenção. | Assumir, atualizar, concluir, anexar evidência. | Configurar ou aprovar. |
| `AUDITORIA` | Auditar processos. | Consulta e rastreabilidade. | Relatórios, auditoria, históricos. | Ver histórico e evidências permitidas. | Executar rotina e aprovar. |
| `CONSULTA_GESTOR` | Consulta gerencial limitada. | Unidade/departamento vinculado. | Painéis e consultas do escopo. | Ver e acompanhar. | Criar, aprovar ou alterar. |
| `EMPLOYEE` | Colaborador operacional. | Próprio escopo/tarefas. | Minhas tarefas e registros permitidos. | Executar demandas atribuídas. | Acessar gestão ampla. |

## 5. Relação com perfis existentes

| Perfil atual | Papel operacional sugerido |
| --- | --- |
| `SUPER_ADMIN` | Super Admin. |
| `NETWORK_MANAGER` | Diretoria/Rede. |
| `UNIT_DIRECTOR` | Diretoria da Unidade. |
| `DEPARTMENT_MANAGER` | Gerência Administrativa, Gerência Operacional ou Gestor de Departamento conforme `department_id` em `user_unit_links`. |
| `SUPERVISOR` | Líder/Encarregado. |
| `FINANCE` | Financeiro/Contas a pagar. |
| `AUDIT` | Auditoria/Consulta. |
| `EMPLOYEE` | Operacional/Colaborador. |
| `EXTERNAL_TECHNICIAN` | Técnico externo/manutenção externa. |

Esta matriz é conceitual. A implementação real deve aproveitar `access_profiles`, `permissions`, `profile_permissions`, `user_unit_links` e `user_permission_overrides`, sem alterar Auth, login ou `auth_email`.

## 5.1. Legenda operacional de permissões

As matrizes seguintes usam códigos curtos para deixar claro o que cada papel pode fazer.

| Código | Permissão operacional | Descrição |
| --- | --- | --- |
| `V` | Ver | Pode consultar registros do próprio escopo. |
| `VC` | Ver completo | Pode consultar registro completo, inclusive histórico permitido. |
| `VS` | Ver sensível | Pode ver dados/anexos sensíveis quando houver permissão específica. |
| `C` | Criar | Pode criar novo registro, rascunho ou solicitação. |
| `E` | Editar | Pode editar registro em etapa permitida. |
| `A` | Aprovar | Pode registrar aprovação formal. |
| `R` | Reprovar | Pode registrar reprovação/não aprovação formal. |
| `D` | Devolver | Pode devolver para etapa anterior com justificativa. |
| `N` | Cancelar | Pode cancelar ou encerrar processo conforme regra. |
| `X` | Executar | Pode executar tarefa operacional atribuída. |
| `F` | Finalizar | Pode concluir tarefa, etapa ou checklist. |
| `AN` | Anexar | Pode anexar arquivo/evidência no contexto permitido. |
| `AU` | Auditar | Pode consultar trilha, histórico e evidências para auditoria. |
| `CFG` | Configurar | Pode alterar cadastros estruturais, regras, usuários ou permissões. |
| `-` | Não permitido | Não deve ter acesso nem ação operacional por padrão. |

## 5.2. Matriz consolidada de permissões por módulo e papel

Esta matriz é a referência estática inicial para RH-35C. Ela não cria permissão real no banco; apenas define a política desejada para filtragem de menu e ações futuras.

| Módulo | Super Admin | Diretoria/Rede | Diretoria Unidade | Ger. Administrativa | Ger. Operacional | RH Recrutamento | RH Admissão | RH Documentos | SST | Compras | Contas a Pagar | Líder Setor | Operacional | Auditoria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel geral | VC CFG | VC AU | VC AU | VC | VC | V | V | V | V | V | V | V | V limitado | VC AU |
| Cadastros | VC C E CFG | V | V | VC C E | V | V limitado | V limitado | V limitado | V limitado | V fornecedores | V favorecidos | V setor | - | VC AU |
| RH geral | VC C E A R D N AN AU CFG | VC AU | VC A R D AU | VC E A D | V limitado | V módulo | V módulo | V módulo | V módulo | - | - | V equipe | - | VC AU |
| Vagas | VC C E A R D N AU CFG | VC AU | VC A R D AU | VC A D | VC A D | VC C E D N | V status | - | - | - | - | C E própria D | - | VC AU |
| Candidatos | VC C E A R D AN AU | V executivo | V executivo | V autorizado | V autorizado | VC C E A R D AN | V admissão | - | - | - | - | V/parecer autorizado | - | VC AU |
| Admissões | VC C E A R D N AN AU | V executivo | V executivo | VC A D | V status | V status | VC C E A R D N AN | VC E A R AN | V ASO/SST | - | V etapa administrativa | V status geral | - | VC AU |
| Documentos RH | VC C E A R D AN AU | V sem sensível por padrão | V sem sensível por padrão | VC AN | V status | V recrutamento | VC AN | VC E A R AN | V ASO | - | - | V status geral | - | VC AU |
| Saúde/SST | VC C E A R AN AU | V executivo | V executivo | V status | V status | - | V status | V documentos | VC C E A R AN | - | - | V status geral | - | VC AU |
| Onboarding | VC C E F AU | V executivo | V executivo | VC | VC | V status | VC C E F | V documentos | V quando SST | - | - | X F equipe | X atribuído | VC AU |
| Recepção | VC C E F AU CFG | VC | VC | V | VC A D | - | - | - | - | - | - | VC C E F setor | VC C X F | VC AU |
| Governança | VC C E F AU CFG | VC | VC | V | VC A D | - | - | - | - | - | - | VC C E F setor | VC C X F | VC AU |
| A&B | VC C E F AU CFG | VC | VC | V | VC A D | - | - | - | - | V compras relacionadas | - | VC C E F setor | VC C X F | VC AU |
| Manutenção | VC C E F AN AU CFG | VC | VC | V | VC A D | - | - | - | SST quando risco | V materiais | - | VC C E F AN setor | VC X F AN | VC AU |
| Compras | VC C E A R D N AN AU CFG | VC A D AU | VC A D AU | VC A D | V solicitações | - | - | - | - | VC C E D N AN | V quando conta | C própria V | - | VC AU |
| Contas a pagar | VC C E A R D AN AU CFG | VC A D AU | VC A D AU | VC A D | V consulta | - | - | - | - | V compras relacionadas | VC C E A D AN | V própria | - | VC AU |
| Relatórios | VC CFG | VC AU | VC AU | VC | VC | V módulo | V módulo | V módulo | V módulo | V módulo | V módulo | V setor | - | VC AU |
| Configurações | VC CFG | V | V | CFG limitado | - | - | - | - | - | - | - | - | - | AU |

## 5.3. Pacotes estáticos de permissão sugeridos

Estes pacotes servem como desenho para implementar menu filtrado e ações por permissão. Eles não devem ser criados no banco nesta sprint.

| Pacote | Permissões sugeridas | Uso inicial |
| --- | --- | --- |
| `menu.executive` | Ver painéis, aprovações, relatórios, consultas multiunidade conforme escopo. | Diretoria/Rede e Diretoria Unidade. |
| `menu.hr.recruitment` | Ver/criar/editar vagas, candidatos, entrevistas, pareceres e encaminhamento para admissão. | RH Recrutamento. |
| `menu.hr.admission` | Ver/operar admissões, documentos admissionais, ASO status, contabilidade administrativa e onboarding. | RH Admissão. |
| `menu.hr.documents` | Ver fila documental, dossiês permitidos, anexar e conferir documentos. | RH Documentos. |
| `menu.sst` | Ver/operar saúde ocupacional, ASO, exames, confirmações SST e EPIs técnicos. | SST. |
| `menu.operations.leader` | Ver equipe, solicitações, ocorrências, chamados e demandas do setor. | Líderes de Governança, Recepção, A&B, Manutenção e Administrativo. |
| `menu.operations.worker` | Ver minhas tarefas, chamados e registros permitidos. | Operacional. |
| `menu.purchases` | Ver/operar solicitações, cotações, fornecedores e evidências. | Compras. |
| `menu.payables` | Ver/operar contas, anexos, conferências e aprovações financeiras permitidas. | Contas a Pagar. |
| `menu.audit` | Ver relatórios, históricos, logs e evidências permitidas sem executar rotina. | Auditoria. |

## 6. Departamentos e módulos da matriz

| Módulo | Quem vê | Quem opera | Quem aprova | Quem recebe demandas | Quem apenas consulta |
| --- | --- | --- | --- | --- | --- |
| RH | Super Admin, Diretoria, Gerências, RH | RH conforme submódulo | Diretoria/Gerência conforme regra | RH | Auditoria, Consulta Gestor |
| Recrutamento e Seleção | RH, Gestor autorizado, Diretoria | RH Recrutamento | Diretoria/Gerência conforme fluxo | RH Recrutamento | Gestor autorizado |
| Admissões | RH Admissão, RH Documentos, SST, Diretoria | RH Admissão | Gerência/Diretoria quando aplicável | RH Admissão | Líder acompanha status geral |
| Onboarding | RH Admissão, Líder, Gerência | RH Admissão e Líder | RH/Gerência conforme etapa | Líder e RH | Diretoria |
| Documentos RH | RH Documentos, RH Admissão, Diretoria | RH Documentos | RH/Gerência conforme tipo | RH Documentos | Auditoria |
| A&B | Líder A&B, Gerência Operacional, Diretoria | Líder/Operacional A&B | Gerência/Diretoria conforme alçada | Líder A&B | Diretoria/Auditoria |
| Governança | Líder Governança, Gerência Operacional | Líder/Operacional Governança | Gerência quando aplicável | Líder Governança | Diretoria |
| Recepção | Recepção, Líder, Gerência | Recepção/Líder | Gerência quando aplicável | Líder Recepção | Diretoria |
| Manutenção | Manutenção, Gerência, Diretoria | Técnico/Líder Manutenção | Gerência/Diretoria conforme compra/risco | Líder Manutenção | Auditoria |
| Compras | Solicitante, Compras, Gerências, Diretoria | Compras | Gerência Administrativa ou Diretoria conforme alçada | Compras/Aprovador | Auditoria |
| Contas a pagar | Financeiro, Gerência Administrativa, Diretoria | Lançador/Conferente | Gerência/Diretoria | Financeiro | Auditoria |
| Administrativo geral | Administrativo, Gerência, Diretoria | Administrativo | Gerência/Diretoria | Administrativo | Auditoria |
| Diretoria/Aprovações | Diretoria, Super Admin | Diretoria para decisão | Diretoria | Diretoria | Auditoria |
| Auditoria/Relatórios | Auditoria, Diretoria, Super Admin | Auditoria consulta | Não aplicável | Auditoria | Gestores autorizados |

## 7. Matriz do fluxo de abertura de vaga

Fluxo operacional:

1. Líder/Encarregado cria rascunho.
2. Líder/Encarregado envia para RH.
3. RH valida.
4. RH pode editar, devolver ou enviar para diretoria.
5. Diretoria aprova, reprova ou devolve.
6. Após aprovação, RH inicia recrutamento.
7. RH conduz candidatos.
8. RH aprova candidato.
9. RH encaminha para admissão.
10. RH Admissão assume.
11. Onboarding começa depois da admissão liberada.

| Fase | Responsável | Quem pode ver | Quem pode agir | Ações permitidas | Próxima demanda | Alerta necessário |
| --- | --- | --- | --- | --- | --- | --- |
| Rascunho da vaga | Líder/Encarregado | Líder, RH, Gerência | Líder | Criar, editar, salvar rascunho | Enviar para RH | Rascunho parado |
| Enviada para RH | RH Recrutamento | Líder, RH, Gerência | RH | Validar, editar, devolver, enviar diretoria | RH validar | Vaga aguardando RH |
| Devolvida ao líder | Líder/Encarregado | Líder, RH | Líder | Corrigir e reenviar | Líder corrigir | Devolução pendente |
| Enviada para diretoria | Diretoria | RH, Diretoria, Gerência | Diretoria | Aprovar, reprovar, devolver | Diretoria decidir | Aprovação pendente |
| Aprovada | RH Recrutamento | RH, Diretoria, Líder | RH | Abrir recrutamento | RH iniciar candidatos | Vaga aprovada sem ação |
| Recrutamento | RH Recrutamento | RH, Gestor autorizado | RH | Criar candidato, registrar etapas | RH conduzir seleção | Candidato parado |
| Candidato aprovado | RH Recrutamento | RH, Gestor, Diretoria | RH | Encaminhar admissão | RH Admissão assumir | Encaminhamento pendente |
| Admissão iniciada | RH Admissão | RH Admissão, RH Documentos, SST | RH Admissão | Solicitar documentos, acompanhar ASO | Processo admissional: documentos, ASO e conferência | Pendências admissionais |
| Onboarding | RH Admissão/Líder | RH, Líder, Gerência | RH/Líder | Liberar e acompanhar onboarding | Líder receber colaborador | Onboarding atrasado |

## 8. Visões diferentes para o mesmo processo de vaga

### Visão do Líder

- Menu sugerido: Solicitações > Abertura de vagas.
- Vê próprias solicitações.
- Cria rascunho.
- Envia para RH.
- Corrige devolução.
- Acompanha status.
- Não vê candidatos, admissão ou documentos sensíveis.

### Visão do RH

- Menu: RH > Recrutamento e Seleção.
- Valida vaga.
- Envia para diretoria.
- Conduz recrutamento.
- Opera candidatos.
- Encaminha para admissão.

### Visão da Diretoria

- Menu: Aprovações ou Pendências da Diretoria.
- Vê vaga validada.
- Aprova, reprova ou devolve.
- Acompanha status.
- Não opera seleção.

### Visão do RH Admissão

- Menu: RH > Admissões.
- Recebe candidato aprovado.
- Opera documentos, ASO, contabilidade administrativa e onboarding.

## 9. Matriz de candidato

| Ação | RH Recrutamento | Líder/Gestor área | Gerência Operacional | Gerência Administrativa | Diretoria | RH Admissão | Super Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ver candidato | Sim | Quando autorizado | Quando autorizado | Apenas vaga administrativa ou autorização formal | Consulta executiva | Status admissional | Sim |
| Criar candidato | Sim | Não | Não | Não | Não | Não | Sim |
| Editar candidato | Sim | Limitado/parecer | Não | Não | Não | Não | Sim |
| Anexar currículo | Sim | Não | Não | Não | Não | Não | Sim |
| Marcar entrevista | Sim | Participa quando autorizado | Consulta | Consulta apenas se vaga administrativa ou autorização formal | Não | Não | Sim |
| Registrar entrevista | Sim | Parecer autorizado | Parecer autorizado | Parecer apenas em vaga administrativa ou autorização formal | Não | Não | Sim |
| Salvar parecer | Sim | Quando convocado | Quando convocado | Quando convocada para vaga administrativa ou autorizada | Consulta | Não | Sim |
| Aprovar candidato | Formaliza decisão | Recomendação | Recomendação em vaga operacional | Recomendação apenas em vaga administrativa/autorizada | Decisão quando aplicável | Não | Sim |
| Banco de talentos | Sim | Consulta autorizada | Consulta autorizada | Consulta apenas em vaga administrativa/autorizada | Consulta | Não | Sim |
| Não avançar | Formaliza decisão | Recomendação | Recomendação em vaga operacional | Recomendação apenas em vaga administrativa/autorizada | Consulta | Não | Sim |
| Não recomendado | Formaliza decisão | Recomendação | Recomendação em vaga operacional | Recomendação apenas em vaga administrativa/autorizada | Consulta | Não | Sim |
| Encaminhar para admissão | Sim | Não | Não | Não | Não | Recebe | Sim |

Líder/Gestor pode participar ou consultar quando autorizado, mas não deve ter acesso amplo a dados sensíveis sem necessidade. A Gerência Administrativa participa de candidato apenas quando a vaga for administrativa ou quando estiver formalmente autorizada no processo. Para vagas operacionais, o parecer deve ficar com a Gerência Operacional, líder/gestor da área e RH Recrutamento. O RH Recrutamento continua responsável por formalizar a decisão no sistema.

## 10. Matriz de admissão

| Ação | RH Admissão | RH Documentos | SST | Contabilidade Administrativa | Gerência Administrativa | Diretoria | Super Admin | Líder/Gestor área |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ver admissão | Sim | Sim | Parcial/SST | Parcial administrativa | Sim | Status executivo, sem documentos sensíveis por padrão | Sim | Status geral |
| Solicitar documentos | Sim | Sim | Não | Não | Consulta | Não | Sim | Não |
| Anexar/conferir documentos | Sim | Sim | Não | Não | Consulta | Não | Sim | Não |
| Aprovar/rejeitar documentos | Sim | Sim | Não | Não | Consulta | Não | Sim | Não |
| Acompanhar ASO | Sim | Consulta | Sim | Não | Consulta | Status executivo | Sim | Status geral |
| Enviar para contabilidade | Sim | Não | Não | Recebe | Consulta | Não | Sim | Não |
| Registrar retorno administrativo | Consulta | Não | Não | Sim | Consulta | Status executivo | Sim | Não |
| Liberar onboarding | Sim | Não | Consulta | Consulta | Consulta | Status executivo | Sim | Recebe status |
| Cancelar admissão | Sim, conforme regra | Não | Não | Não | Conforme alçada | Conforme alçada, sem operar documentos/ASO/onboarding | Sim | Não |

Líder/Gestor acompanha status geral, mas não deve ver documentos admissionais sensíveis. Diretoria pode ver status executivo da admissão, mas não deve ver documentos admissionais sensíveis por padrão, nem operar documentos, ASO, onboarding ou anexos admissionais. Qualquer acesso sensível deve depender de permissão específica.

## 11. Matriz de A&B

| Ação | Líder A&B | Operacional A&B | Gerência Operacional | Compras | Diretoria | Super Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Registrar ocorrência | Sim | Sim | Consulta | Não | Consulta | Sim |
| Solicitar compra | Sim | Solicita via líder/regra | Consulta/Aprova conforme alçada | Recebe | Aprova conforme alçada | Sim |
| Registrar perda/desperdício | Sim | Sim | Consulta | Não | Consulta | Sim |
| Abrir chamado manutenção | Sim | Sim | Consulta | Não | Consulta | Sim |
| Acompanhar demanda | Sim | Próprias | Sim | Compras relacionadas | Consulta | Sim |
| Validar solicitação operacional | Sim | Não | Sim | Não | Consulta | Sim |
| Aprovar conforme alçada | Limitado | Não | Sim | Não | Sim | Sim |

## 12. Matriz de Governança

| Ação | Líder Governança | Camareira/Serviços gerais | Gerência Operacional | Manutenção | Compras | Diretoria | Super Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Registrar limpeza/checklist | Sim | Sim | Consulta | Não | Não | Consulta | Sim |
| Registrar ocorrência de quarto | Sim | Sim | Consulta | Recebe se chamado | Não | Consulta | Sim |
| Achados e perdidos | Sim | Sim | Consulta | Não | Não | Consulta | Sim |
| Solicitar manutenção | Sim | Sim | Consulta | Recebe | Não | Consulta | Sim |
| Solicitar compra/enxoval | Sim | Via líder | Consulta/Aprova | Não | Recebe | Aprova conforme alçada | Sim |
| Acompanhar pendência | Sim | Próprias | Sim | Demandas recebidas | Compras relacionadas | Consulta | Sim |
| Validar conclusão | Sim | Não | Sim | Atualiza | Não | Consulta | Sim |

## 13. Matriz de Recepção

| Ação | Recepcionista | Líder Recepção | Gerência Operacional | Governança | Manutenção | Diretoria | Super Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Registrar ocorrência | Sim | Sim | Consulta | Recebe quando envolvida | Recebe quando envolvida | Consulta | Sim |
| Abrir chamado | Sim | Sim | Consulta | Não | Recebe | Consulta | Sim |
| Registrar achados e perdidos | Sim | Sim | Consulta | Consulta quando aplicável | Não | Consulta | Sim |
| Comunicar governança | Sim | Sim | Consulta | Recebe | Não | Consulta | Sim |
| Acompanhar pendência | Próprias | Sim | Sim | Demandas recebidas | Demandas recebidas | Consulta | Sim |
| Escalar para gerência | Sim | Sim | Recebe | Não | Não | Consulta | Sim |

## 14. Matriz de Manutenção

| Ação | Técnico manutenção | Líder manutenção | Gerência Operacional | Compras | Diretoria | Super Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Receber chamado | Sim | Sim | Consulta | Não | Consulta | Sim |
| Assumir chamado | Sim | Sim/distribui | Consulta | Não | Consulta | Sim |
| Atualizar status | Sim | Sim | Consulta | Não | Consulta | Sim |
| Concluir chamado | Sim | Sim | Valida quando necessário | Não | Consulta | Sim |
| Anexar evidência | Sim | Sim | Consulta | Não | Consulta | Sim |
| Solicitar compra/material | Via líder/regra | Sim | Aprova conforme alçada | Recebe | Aprova conforme alçada | Sim |
| Escalar urgência | Sim | Sim | Recebe | Consulta | Consulta/decide | Sim |

## 15. Matriz de Compras

| Ação | Solicitante | Compras | Gerência Administrativa | Gerência Operacional | Diretoria | Super Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Criar solicitação | Sim | Sim | Sim | Sim | Consulta | Sim |
| Cotar | Não | Sim | Consulta | Consulta | Consulta | Sim |
| Anexar orçamento | Não | Sim | Consulta | Consulta | Consulta | Sim |
| Aprovar conforme alçada | Não | Não | Sim quando aplicável | Sim quando aplicável | Sim quando aplicável | Sim |
| Devolver | Não | Recebe | Sim | Sim | Sim | Sim |
| Cancelar | Própria antes de envio/regra | Sim conforme regra | Sim conforme regra | Sim conforme regra | Sim conforme regra | Sim |
| Acompanhar entrega | Sim | Sim | Consulta | Consulta | Consulta | Sim |

## 16. Matriz de Contas a Pagar

| Ação | Lançador | Conferente | Gerência Administrativa | Diretoria | Super Admin | Auditoria |
| --- | --- | --- | --- | --- | --- | --- |
| Lançar conta | Sim | Não | Sim | Consulta | Sim | Consulta |
| Anexar boleto/NF | Sim | Sim | Sim | Consulta | Sim | Consulta |
| Validar | Não | Sim | Sim | Consulta | Sim | Consulta |
| Aprovar | Não | Não | Sim conforme alçada | Sim conforme alçada | Sim | Consulta |
| Devolver | Não | Sim | Sim | Sim | Sim | Consulta |
| Auditar | Não | Não | Consulta | Consulta | Sim | Sim |
| Acompanhar pagamento | Sim | Sim | Sim | Sim | Sim | Consulta |

## 17. Menu por perfil

Esta seção define o menu conceitual preenchido para cada papel. O menu real ainda não deve ser alterado nesta sprint.

### Super Admin

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel geral, Minhas demandas, Alertas. |
| Cadastros | Unidades, departamentos, cargos, colaboradores, usuários internos, fornecedores. |
| Compras | Solicitações, cotações, aprovações, fornecedores, relatórios de compras. |
| RH | Painel RH, recrutamento, vagas, candidatos, admissões, documentos RH, onboarding, colaboradores, avaliações, PDI, treinamentos, movimentações, saúde, conduta, desligamentos, relatórios RH. |
| Operação | Recepção, governança, manutenção, A&B, ocorrências, chamados. |
| Financeiro administrativo | Contas a pagar, aprovações, anexos, relatórios. |
| Gestão | Painel executivo, aprovações gerais, relatórios, auditoria. |
| Configurações | Usuários, perfis, permissões, regras, integrações futuras. |

### Diretoria

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel executivo, Minhas aprovações, Alertas críticos. |
| Aprovações | Vagas aguardando diretoria, compras aguardando diretoria, contas aguardando diretoria, devoluções pendentes. |
| RH | Indicadores RH, vagas aprovadas/em aprovação, admissões em andamento, desligamentos, relatórios. |
| Operação | Indicadores de recepção, governança, manutenção e A&B. |
| Compras | Dossiês de aprovação, compras por status, compras criticas. |
| Contas a pagar | Aprovações, consultas e relatórios. |
| Auditoria/Relatórios | Relatórios executivos, históricos, rastreabilidade. |

### Gerência Administrativa

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel administrativo, Minhas demandas, Pendências administrativas. |
| RH | Admissões, documentos RH, onboarding, colaboradores, relatórios administrativos. |
| Compras | Solicitações, cotações em acompanhamento, aprovações da alçada administrativa. |
| Contas a pagar | Lançamentos, conferências, aprovações administrativas, pendências. |
| Administrativo | Cadastros permitidos, documentos administrativos, demandas internas. |
| Relatórios | Relatórios administrativos, pendências por unidade, auditoria operacional permitida. |

### Gerência Operacional

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel operacional, Minhas demandas, Alertas operacionais. |
| Equipes | Minha equipe, solicitações de vaga, onboarding de equipe, status de admissões sem documentos sensíveis. |
| Recepção | Ocorrências, chamados, pendências e indicadores. |
| Governança | Checklists, ocorrências, achados e perdidos, enxoval, demandas. |
| Manutenção | Chamados, urgências, materiais, evidências. |
| A&B | Ocorrências, perdas, solicitações, compras relacionadas. |
| Relatórios | Indicadores operacionais, SLA de demandas, pendências por setor. |

### Líder/Encarregado

| Grupo de menu | Itens |
| --- | --- |
| Início | Minhas demandas, Pendências do setor, Alertas. |
| Solicitações | Abertura de vaga, compra/material, manutenção, apoio administrativo. |
| Minha equipe | Status de equipe, onboarding sem dados sensíveis, demandas abertas. |
| Setor | Ocorrências do setor, chamados do setor, checklists permitidos. |
| Acompanhamento | Minhas solicitações, devoluções para corrigir, histórico do setor. |

### RH Recrutamento

| Grupo de menu | Itens |
| --- | --- |
| Início | Dashboard de recrutamento, Minhas demandas, Vagas aguardando RH. |
| Vagas | Nova vaga interna RH, quando aplicável; solicitações recebidas, vagas em aprovação, vagas abertas, encerradas. |
| Candidatos | Lista de candidatos, detalhe do candidato, entrevistas, pareceres. |
| Funil | Triagem, entrevista, aprovado, banco de talentos, não recomendado. |
| Encaminhamentos | Candidatos aprovados para admissão, pendências de encaminhamento. |

### RH Admissão

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel de admissões, Minhas demandas, Candidatos recebidos. |
| Admissões | Em preparação, aguardando documentos, em conferência, aguardando ASO, contabilidade administrativa, liberadas, canceladas. |
| Documentos | Documentos admissionais, pendências, reprovados, dossiê do processo. |
| SST/ASO | Status ASO, pendências SST, confirmações ocupacionais. |
| Onboarding | Onboarding a liberar, em andamento, concluído. |

### Operacional

| Grupo de menu | Itens |
| --- | --- |
| Início | Minhas tarefas, Meus chamados, Alertas do setor. |
| Registros | Ocorrências permitidas, checklists atribuídos, evidências solicitadas. |
| Chamados | Chamados atribuídos, chamados abertos, histórico permitido. |
| Solicitações | Solicitar apoio, material ou manutenção quando permitido. |

### SST

| Grupo de menu | Itens |
| --- | --- |
| Início | Pendências SST, ASOs pendentes, confirmações de risco. |
| Saúde ocupacional | ASO, exames, restrições, vencimentos. |
| EPIs técnicos | Confirmações SST, EPIs por risco, pendências de entrega técnica. |
| Admissões | Admissões aguardando ASO ou validação SST. |
| Relatórios | Vencimentos, pendências ocupacionais, histórico permitido. |

### Compras

| Grupo de menu | Itens |
| --- | --- |
| Início | Pendências de compras, solicitações recebidas, devoluções. |
| Solicitações | Novas, em cotação, devolvidas, aprovadas, canceladas. |
| Cotações | Cotações em aberto, evidências, fornecedores, proposta vencedora. |
| Aprovações | Dossiês enviados, devolvidos, aguardando decisão. |
| Entrega | Acompanhamento de entrega e pendências. |

### Contas a Pagar

| Grupo de menu | Itens |
| --- | --- |
| Início | Contas pendentes, vencimentos próximos, devoluções. |
| Lançamentos | Nova conta, contas em conferência, contas devolvidas. |
| Documentos | Boletos, notas fiscais, comprovantes e anexos permitidos. |
| Aprovações | Aguardando gerência, aguardando diretoria, aprovadas, reprovadas. |
| Relatórios | Contas por status, vencimentos, auditoria permitida. |

### Auditoria

| Grupo de menu | Itens |
| --- | --- |
| Início | Painel de auditoria, alertas, inconsistências. |
| Consultas | Compras, RH, documentos, contas, operação. |
| Históricos | Eventos, decisões, anexos, logs permitidos. |
| Relatórios | Relatórios executivos e trilhas de auditoria. |

## 17.1. Menu mínimo por perfil atual existente

Enquanto não houver novos papéis no banco, a primeira filtragem pode usar os perfis atuais como aproximação.

| Perfil atual | Menu mínimo recomendado | Menu oculto por padrão |
| --- | --- | --- |
| `SUPER_ADMIN` | Todos os grupos. | Nenhum. |
| `NETWORK_MANAGER` | Painel executivo, aprovações, RH consulta, compras consulta/aprovação, contas consulta/aprovação, operação consulta, relatórios. | Configurações técnicas, rotina operacional diária. |
| `UNIT_DIRECTOR` | Painel da unidade, aprovações, RH consulta, compras aprovação, contas aprovação, operação consulta, relatórios. | Configurações globais, operação diária, documentos sensíveis sem permissão. |
| `DEPARTMENT_MANAGER` | Módulos do departamento, minhas demandas, solicitações, aprovações da alçada, relatórios do escopo. | Outros departamentos, configurações, documentos sensíveis fora do escopo. |
| `SUPERVISOR` | Minhas demandas, solicitações, equipe, setor, chamados, ocorrências. | Diretoria, configurações, financeiro amplo, RH sensível. |
| `FINANCE` | Contas a pagar, documentos financeiros, pendências, relatórios financeiros permitidos. | RH sensível, operação diária fora do escopo, configurações. |
| `AUDIT` | Auditoria, relatórios, históricos e consultas permitidas. | Criar, editar, aprovar, cancelar ou concluir rotina. |
| `EMPLOYEE` | Minhas tarefas, registros permitidos, chamados, solicitações simples. | Gestão, aprovações, configurações, dados sensíveis. |
| `EXTERNAL_TECHNICIAN` | Chamados atribuídos, evidências, histórico limitado. | RH, compras, contas, cadastros, relatórios gerenciais. |

## 18. Demandas e alertas globais

"Minhas demandas" deve ser o ponto operacional para tudo que exige ação, decisão, acompanhamento ou responsabilidade de uma pessoa ou área.

Quando uma demanda, aprovação, tarefa, pendência ou responsabilidade for atribuída, deve aparecer em:

- badge;
- fila;
- painel;
- item "Minhas demandas".

Exemplos:

- vaga enviada para RH;
- vaga enviada para diretoria;
- candidato encaminhado para admissão;
- documento pendente;
- ASO pendente;
- compra aguardando aprovação;
- manutenção atribuída;
- ocorrência da governança;
- pendência da recepção;
- conta a pagar aguardando aprovação.

Sem migration, é possível iniciar usando `responsible_user_id`, `assigned_to_user_id`, status de workflow, notificações existentes e filtros por unidade/permissão. Futuramente, uma tabela central de demandas/notificações pode unificar origem, destinatário, prioridade, vencimento e status de leitura.

## 18.1. Roteamento preenchido de demandas globais

| Origem | Evento | Quem recebe | Perfil/papel alvo | Menu/fila onde aparece | Ação esperada |
| --- | --- | --- | --- | --- | --- |
| Vaga | Rascunho salvo pelo líder | Líder criador | Líder/Encarregado | Minhas demandas > Rascunhos | Completar e enviar para RH. |
| Vaga | Enviada para RH | Fila RH Recrutamento | RH Recrutamento | RH > Vagas > Aguardando RH | Validar, editar, devolver ou enviar para diretoria. |
| Vaga | Devolvida ao líder | Líder criador | Líder/Encarregado | Minhas demandas > Devolvidas | Corrigir justificativa e reenviar. |
| Vaga | Enviada para diretoria | Diretoria da unidade ou rede conforme regra | UNIT_DIRECTOR/NETWORK_MANAGER | Aprovações > Vagas | Aprovar, reprovar ou devolver. |
| Vaga | Aprovada | RH Recrutamento | RH Recrutamento | RH > Recrutamento > Vagas aprovadas | Abrir recrutamento e conduzir candidatos. |
| Candidato | Candidato aguardando triagem | RH Recrutamento | RH Recrutamento | RH > Candidatos > Triagem | Avaliar currículo e definir próxima etapa. |
| Candidato | Entrevista solicitada | RH Recrutamento e gestor autorizado | RH Recrutamento/Líder/Gerência | Minhas demandas > Entrevistas | Registrar entrevista ou parecer. |
| Candidato | Parecer pendente do gestor | Gestor da área | Líder/Gerência autorizada | Minhas demandas > Pareceres | Informar parecer sem acesso sensível amplo. |
| Candidato | Aprovado para admissão | RH Admissão | RH Admissão | RH > Admissões > Recebidos | Criar/assumir processo admissional. |
| Admissão | Documentos solicitados | RH Documentos/RH Admissão | RH Documentos/RH Admissão | RH > Documentos admissionais | Acompanhar recebimento e conferir. |
| Admissão | Documento reprovado | RH Admissão | RH Admissão | RH > Admissões > Pendências | Solicitar correção e registrar motivo. |
| Admissão | ASO pendente | SST | SST | SST > ASOs pendentes | Validar ASO ou registrar pendência. |
| Admissão | Retorno administrativo pendente | Contabilidade Administrativa | CONTABILIDADE_ADMINISTRATIVA | Admissões > Contabilidade administrativa | Registrar retorno administrativo sem folha/eSocial. |
| Admissão | Onboarding liberado | Líder da área e RH Admissão | Líder/RH Admissão | Minhas demandas > Onboarding | Preparar recepção do colaborador e concluir etapas. |
| Documento RH | Documento vencendo | RH Documentos | RH Documentos | Documentos RH > Vencimentos próximos | Cobrar renovação ou atualizar status. |
| Saúde | Exame/ASO vencendo | SST/RH Admissão | SST/RH | Saúde ocupacional > Vencimentos | Providenciar agenda e registro. |
| Compras | Solicitação criada | Compras | COMPRAS | Compras > Solicitações recebidas | Cotar ou devolver. |
| Compras | Dossiê enviado para aprovação | Aprovador da alçada | Gerência/Diretoria | Aprovações > Compras | Aprovar, reprovar ou devolver. |
| Compras | Devolvida para compras | Compras | COMPRAS | Compras > Devolvidas | Revisar cotação/evidência e reenviar. |
| Contas a pagar | Conta lançada | Conferente | CONTAS_A_PAGAR | Contas a pagar > Conferência | Conferir dados e anexos. |
| Contas a pagar | Conta aguardando aprovação | Aprovador da alçada | Gerência/Diretoria | Aprovações > Contas a pagar | Aprovar ou devolver. |
| Recepção | Ocorrência registrada | Líder Recepção/Gerência Operacional | Líder/Gerência | Recepção > Ocorrências | Acompanhar, encaminhar ou escalar. |
| Governança | Ocorrência de quarto | Líder Governança | Líder Governança | Governança > Ocorrências | Tratar ou acionar manutenção. |
| Manutenção | Chamado aberto | Líder Manutenção | Líder Manutenção | Manutenção > Chamados novos | Priorizar e atribuir técnico. |
| Manutenção | Chamado atribuído | Técnico | OPERACIONAL_MANUTENCAO | Minhas tarefas > Manutenção | Atualizar, anexar evidência e concluir. |
| A&B | Perda/desperdício registrado | Líder A&B/Gerência Operacional | Líder/Gerência | A&B > Ocorrências | Validar, acompanhar e gerar ação. |

## 18.2. Regras de badge e fila

| Tipo de demanda | Badge | Prioridade visual | Sai da fila quando |
| --- | --- | --- | --- |
| Aprovação pendente | Aguardando aprovação | Alta | Aprovada, reprovada ou devolvida. |
| Ação atribuída ao usuário | Minha ação | Alta | Usuário executa, devolve ou transfere conforme regra. |
| Pendência documental | Documento pendente | Média/alta conforme vencimento | Documento é recebido, aprovado, dispensado ou cancelado. |
| Pendência SST | SST pendente | Alta quando bloqueia admissão/atividade | SST valida, reprova ou registra pendência. |
| SLA próximo | Vencendo | Média | Prazo é resolvido ou vira atraso. |
| SLA vencido | Atrasado | Alta | Demanda é concluída ou repriorizada. |
| Consulta informativa | Acompanhar | Baixa | Processo muda de etapa ou é encerrado. |

## 19. O que dá para implementar sem migration

- Matriz estática de menu.
- Filtragem inicial de menu por `access_profile`.
- Ocultar ações por permissão existente.
- Usar `user_unit_links` para escopo de unidade.
- Usar `department_id` para algumas visões.
- Usar `responsible_user_id` e `assigned_to_user_id` para "Minhas demandas" inicial.
- Usar `permissions`, `profile_permissions` e `user_permission_overrides` quando já existirem.

## 20. O que exige migration futura

- Papéis operacionais múltiplos por usuário.
- Grupos persistentes por módulo.
- Permissões administrativas configuráveis.
- Menu persistente por perfil.
- Alçadas por valor/departamento.
- Tabela central de demandas/notificações.
- Histórico formal de decisões por papel.
- Status formais de aprovação RH/diretoria.
- Agenda de entrevistas.

## 21. Riscos e cuidados

- Não mexer em `auth_email`.
- Não mexer em login.
- Não mexer em RLS sem plano específico.
- Menu não substitui autorização backend.
- Esconder botão não é segurança.
- Diretoria vê tudo, mas operação deve ser limitada.
- Documentos sensíveis exigem cuidado por perfil e permissão.
- Permissões de UI devem ser consistentes com permissões server-side.
- Toda ação sensível precisa de validação na API, mesmo quando o botão estiver oculto para outros perfis.

## 22. Plano de sprints recomendado

- RH-35C: Menu filtrado por `access_profile` e permissões existentes.
- RH-35D: Ações da vaga por papel.
- RH-35E: Visão do líder - Solicitações/Abertura de vagas.
- RH-35F: Visão da diretoria - Fila de aprovações.
- RH-35G: Visão RH Admissão - permissões e demandas.
- CORE-01: Minhas demandas global.
- CORE-02: Grupos/permissões persistentes, se necessário.
- CORE-03: Alertas/notificações globais.

## 23. Conclusão recomendada

A recomendação é não mexer em Auth, login, RLS ou `auth_email` agora. A evolução deve reaproveitar `access_profiles`, `permissions`, `profile_permissions`, `user_unit_links` e `user_permission_overrides`.

A ordem mais segura é:

1. Implementar primeiro menu por perfil.
2. Depois limitar ações por permissão.
3. Depois consolidar demandas globais.
4. Somente depois avaliar migration para grupos e permissões persistentes mais granulares.

Esta abordagem melhora a experiência operacional sem trocar a base de autenticação, sem criar risco em RLS e sem confundir menu com segurança real.

Próximo documento recomendado: AUDITORIA_LOGICA_EMPRESARIAL_SISTEMA_HOTEL_GALLI.md, para auditar a lógica empresarial completa do sistema de forma separada desta matriz de papéis, permissões, menus e demandas.


