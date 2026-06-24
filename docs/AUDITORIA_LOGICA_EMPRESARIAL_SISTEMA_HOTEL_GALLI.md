# Auditoria da Lógica Empresarial — Sistema Hotel Galli

## 1. Objetivo do documento

Este documento organiza a lógica empresarial e departamental do Sistema Administrativo Hotel Galli. Ele descreve como a empresa hoteleira deve funcionar dentro do sistema, quais departamentos existem, quais processos atravessam esses departamentos, quem solicita, quem valida, quem aprova, quem executa, quem acompanha e onde as demandas devem aparecer.

Este documento não é uma matriz de permissões. A matriz de papéis, permissões, menus e demandas está em `docs/RH-35B_MATRIZ_PAPEIS_PERMISSOES_MENU.md`.

Escopo conceitual:

- não é PMS;
- não é sistema de reservas;
- não controla check-in/check-out;
- não controla tarifas;
- não controla disponibilidade;
- não é folha;
- não é eSocial;
- não é financeiro completo;
- o foco é administração interna, operação hoteleira, processos, demandas, evidências, aprovações e gestão por departamentos.

## 2. Princípio central do sistema

Todo processo operacional deve ter:

- solicitante;
- responsável atual;
- aprovador, quando necessário;
- executor;
- status ou fase;
- próxima ação;
- alerta ou demanda;
- histórico;
- encerramento claro.

O sistema não deve ser organizado apenas por telas. As telas são pontos de entrada. A lógica principal deve ser organizada por processos, departamentos, responsabilidades e demandas.

Regra-mãe:

| Elemento | Regra empresarial |
| --- | --- |
| Solicitante | Quem percebe a necessidade e inicia o fluxo. |
| Responsável atual | Quem precisa agir agora. |
| Aprovador | Quem decide formalmente quando houver alçada, risco ou impacto. |
| Executor | Quem realiza a tarefa operacional. |
| Status/fase | Estado calculado pelo sistema a partir de ações reais. |
| Próxima ação | O que precisa acontecer para o processo avançar. |
| Alerta/demanda | Como o sistema leva o trabalho até a pessoa certa. |
| Histórico | Registro auditável de ações, decisões, anexos e mudanças. |
| Encerramento | Condição clara para finalizar, cancelar ou arquivar o processo. |

## 3. Organograma funcional do sistema

| Grupo funcional | Função empresarial | O que solicita | O que valida | O que aprova | O que executa | O que acompanha | O que não deveria fazer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Super Admin | Administração técnica e operacional máxima do sistema. | Demandas estruturais. | Configurações e cadastros críticos. | Exceções quando autorizado. | Configurações, suporte e correções. | Tudo, conforme necessidade. | Substituir operação diária sem regra clara. |
| Diretoria | Decisão executiva e aprovação de alto impacto. | Diretrizes e prioridades. | Contexto executivo. | Vagas, compras, contas e decisões conforme alçada. | Decisões executivas. | Indicadores, riscos, aprovações e histórico. | Operar rotina diária, anexar documentos admissionais ou concluir tarefas operacionais. |
| Gerência Administrativa | Gestão de rotinas administrativas. | Demandas administrativas e RH. | Documentos, compras e contas dentro da alçada. | Compras/contas conforme regra. | Processos administrativos. | Pendências administrativas. | Operar SST, folha, eSocial ou rotina operacional de setor. |
| Gerência Operacional | Gestão das áreas operacionais do hotel. | Demandas de equipe, manutenção, compras e vagas. | Prioridade operacional. | Decisões operacionais conforme alçada. | Coordenação operacional. | Recepção, governança, manutenção e A&B. | Ver documentos admissionais sensíveis ou operar RH documental. |
| RH | Gestão administrativa de pessoas. | Documentos, processos de pessoal e rotinas RH. | Solicitações de vaga, candidatos e documentos. | Decisões RH conforme fluxo. | Recrutamento, admissão, documentos, vida funcional. | Pendências RH e dossiês. | Folha, eSocial e cálculos trabalhistas. |
| Recrutamento | Condução de vagas e candidatos. | Vagas e candidatos. | Perfil da vaga, triagem, pareceres. | Formalização da decisão do candidato. | Recrutamento e seleção. | Funil e pendências. | Operar documentos admissionais sensíveis. |
| Admissão | Entrada administrativa do candidato aprovado. | Documentos e etapas admissionais. | Conferência documental. | Liberação admissional conforme regra. | Processo admissional. | Pendências de documentos, ASO e onboarding. | Folha, eSocial, cálculo trabalhista ou financeiro. |
| Documentos RH | Organização documental e dossiê. | Regularização documental. | Documento recebido/reprovado. | Validação documental conforme tipo. | Conferência e anexos. | Pendências e vencimentos. | Expor sensíveis sem permissão. |
| SST | Saúde ocupacional e segurança do trabalho. | Exames, ASO, EPIs técnicos e validações SST. | Condições ocupacionais. | Validações técnicas quando aplicável. | Registros de saúde/SST. | Vencimentos e riscos. | Operar folha, eSocial ou documentos admissionais não técnicos. |
| Governança | Limpeza, quartos, áreas comuns e enxoval. | Manutenção, compras, vagas e ocorrências. | Conclusão de tarefas do setor. | Validações operacionais do setor. | Limpeza, checklists, ocorrências. | Pendências de quartos/áreas. | PMS, reservas ou dados sensíveis de RH. |
| Recepção | Atendimento operacional interno e comunicação entre áreas. | Chamados, ocorrências e comunicação com setores. | Registro e repasse de problemas. | Escalonamento operacional. | Registros operacionais permitidos. | Pendências com hóspedes/setores. | Reservas, check-in/check-out, tarifas ou disponibilidade. |
| A&B | Operação de alimentos e bebidas. | Compras, manutenção, pessoal e ocorrências. | Perdas, desperdícios e necessidades. | Validações operacionais do setor. | Registros do setor. | Indicadores e pendências. | Estoque completo ou financeiro completo nesta fase. |
| Manutenção | Atendimento de chamados e conservação predial. | Material/compra quando necessário. | Prioridade e viabilidade técnica. | Conclusão técnica quando aplicável. | Chamados, evidências e execução. | SLA e pendências. | Aprovar compras fora da alçada. |
| Compras | Cotação e aquisição administrativa. | Dados complementares para cotação. | Escopo da solicitação e evidências. | Não aprova a própria compra. | Cotação, dossiê, evidências e envio para aprovação. | Entrega e devoluções. | Definir valor no momento da solicitação ou aprovar fora da alçada. |
| Contas a pagar | Controle administrativo de obrigações a pagar. | Documentos e conferências. | Boleto/NF e vencimento. | Aprovação conforme alçada. | Lançamento e acompanhamento. | Vencimentos e pendências. | Financeiro completo, conciliação bancária completa ou contabilidade real nesta fase. |
| Administrativo geral | Apoio aos departamentos e controles internos. | Demandas internas. | Cadastros, documentos e contratos. | Conforme alçada. | Rotinas administrativas. | Controles gerais. | Virar ERP genérico. |
| Líderes/encarregados | Gestão diária do setor. | Vagas, compras, manutenção e ocorrências. | Necessidade real do setor. | Validação operacional limitada. | Coordenação da equipe. | Demandas do setor. | Acessar documentos sensíveis ou aprovar fora da alçada. |
| Equipe operacional | Execução das tarefas do setor. | Registros permitidos. | Conclusão da própria tarefa. | Não aprova por padrão. | Tarefas atribuídas. | Próprias pendências. | Consultar gestão ampla. |
| Auditoria | Rastreabilidade e controle. | Evidências e relatórios. | Consistência histórica. | Não aprova por padrão. | Consulta e auditoria. | Eventos, decisões, anexos. | Executar rotina operacional. |

## 4. Departamentos do hotel e responsabilidades

### 4.1 RH

O RH é responsável por organizar a vida administrativa do colaborador e o fluxo de entrada, acompanhamento e saída.

Responsabilidades:

- abertura e validação de solicitações de vaga;
- recrutamento;
- candidatos;
- entrevistas;
- pareceres;
- encaminhamento para admissão;
- documentos RH;
- dossiê oficial;
- vida funcional;
- treinamentos;
- avaliações;
- conduta;
- saúde ocupacional em conjunto com SST;
- desligamentos administrativos.

Separação interna:

| Subárea | Responsabilidade |
| --- | --- |
| RH Recrutamento | Vagas, candidatos, triagem, entrevistas, pareceres e decisão de encaminhamento. |
| RH Admissão | Processo admissional, documentos, ASO, contabilidade administrativa e liberação para onboarding. |
| RH Documentos | Pendências documentais, dossiê, documentos contextuais e vencimentos. |
| SST | ASO, exames, riscos, EPIs técnicos e validações de saúde/segurança. |
| Onboarding | Integração, uniforme operacional, tarefas iniciais e acompanhamento do líder. |

### 4.2 Governança

Governança cuida da limpeza, organização e disponibilidade operacional de quartos e áreas comuns no contexto administrativo interno.

Responsabilidades:

- limpeza de quartos;
- limpeza de áreas comuns;
- checklists operacionais;
- enxoval;
- achados e perdidos;
- ocorrências de quarto;
- solicitação de manutenção;
- solicitação de compras;
- solicitação de vaga;
- acompanhamento de pendências.

Governança não deve depender do dossiê completo do colaborador para resolver tarefas do setor. Deve receber demandas contextuais e acompanhar apenas o que afeta a operação.

### 4.3 Recepção

Recepção é ponto de comunicação operacional, não PMS.

Responsabilidades:

- registrar ocorrências;
- comunicar governança;
- abrir chamados de manutenção;
- registrar achados e perdidos;
- acompanhar pendências operacionais;
- repassar problemas;
- acionar gerência operacional.

Fora do escopo:

- reservas;
- check-in;
- check-out;
- tarifas;
- disponibilidade;
- motor de reservas.

### 4.4 A&B

A&B cobre restaurante, café da manhã, bar/cozinha e rotinas alimentares quando aplicável.

Responsabilidades:

- registrar ocorrências;
- registrar perdas e desperdícios;
- solicitar compras;
- acionar manutenção de equipamentos;
- solicitar pessoal quando necessário;
- acompanhar indicadores operacionais futuros.

A&B não deve virar estoque completo nem financeiro completo nesta fase.

### 4.5 Manutenção

Manutenção deve receber, classificar, executar e encerrar chamados com evidência.

Responsabilidades:

- receber chamados;
- classificar prioridade;
- assumir chamado;
- atribuir técnico;
- executar;
- anexar evidência;
- solicitar compra/material;
- escalar urgência;
- concluir;
- permitir validação da área solicitante quando necessário.

### 4.6 Compras

Compras transforma necessidades operacionais em cotações, evidências, dossiês e aprovações.

Responsabilidades:

- receber solicitação;
- validar escopo;
- cotar;
- anexar evidências;
- montar dossiê;
- enviar para aprovação;
- acompanhar entrega;
- devolver quando necessário;
- registrar cancelamento quando aplicável.

Regra atual do Hotel Galli:

- até R$ 200,00: Gerência Administrativa;
- acima de R$ 200,00: Diretoria Geral;
- evidência crítica: Diretoria Geral independentemente do valor;
- exceções emergenciais devem ser registradas e auditáveis.

### 4.7 Contas a pagar

Contas a pagar é controle administrativo com aprovação, não financeiro completo.

Responsabilidades:

- lançar conta;
- anexar boleto/NF;
- conferir;
- aprovar conforme alçada;
- devolver;
- auditar;
- acompanhar vencimentos.

Fora do escopo atual:

- conciliação bancária completa;
- fluxo de caixa completo;
- contabilidade real;
- ERP financeiro completo.

### 4.8 Administrativo geral

Administrativo geral apoia os departamentos com documentos, cadastros, contratos e controles internos.

Responsabilidades:

- documentos administrativos;
- cadastros;
- contratos;
- demandas internas;
- apoio aos departamentos;
- controles gerais;
- auditoria administrativa.

## 5. Processos empresariais principais

### 5.1 Processo de abertura de vaga

| Campo | Definição |
| --- | --- |
| Objetivo | Formalizar necessidade de contratação antes de abrir recrutamento. |
| Quem inicia | Líder/encarregado ou RH em exceção interna. |
| Quem valida | RH Recrutamento. |
| Quem aprova | Diretoria/Gerência conforme regra futura. |
| Quem executa | RH Recrutamento. |
| Quem acompanha | Líder, RH, Gerência e Diretoria conforme visão. |
| Telas/módulos envolvidos | `/rh/vagas`, `/rh/vagas/nova`, `/rh/workflows/[id]`, candidatos e admissões. |

Fluxo esperado:

1. Líder/encarregado cria rascunho.
2. Líder envia para RH.
3. RH valida.
4. RH devolve ou envia para diretoria.
5. Diretoria aprova, reprova ou devolve.
6. Após aprovação, RH inicia recrutamento.
7. RH conduz candidatos.
8. Candidato aprovado.
9. Candidato encaminhado para admissão.
10. RH Admissão assume.
11. Onboarding começa depois da admissão liberada.
12. Vaga encerra conforme quantidade de posições preenchidas ou cancelamento formal.

Diferenças de conceito:

| Conceito | Significado |
| --- | --- |
| Solicitação da vaga | Pedido de necessidade operacional. |
| Aprovação da vaga | Decisão de abrir ou não a vaga. |
| Recrutamento | Trabalho do RH para captar e avaliar candidatos. |
| Candidato | Pessoa em avaliação para uma vaga. |
| Admissão | Processo administrativo do candidato aprovado. |
| Onboarding | Integração após liberação admissional. |
| Encerramento da vaga | Fechamento por preenchimento, cancelamento ou decisão formal. |

Problemas atuais percebidos:

- fluxo já existe de forma significativa em RH, mas ainda precisa de visão por papel;
- líder, RH, diretoria e admissão não deveriam ter a mesma experiência;
- a central de demandas ainda precisa ficar mais clara.

Evolução futura:

- menu por perfil;
- ações por permissão;
- fila de aprovações da diretoria;
- visão do líder para solicitações.

### 5.2 Processo de candidato

| Campo | Definição |
| --- | --- |
| Objetivo | Avaliar pessoa candidata até decisão de não avançar, banco de talentos ou encaminhamento para admissão. |
| Quem inicia | RH Recrutamento. |
| Quem valida | RH Recrutamento e gestor autorizado. |
| Quem aprova | RH formaliza decisão; gestor pode emitir parecer quando autorizado. |
| Quem executa | RH Recrutamento. |
| Quem acompanha | RH, gestor autorizado e diretoria em visão executiva. |
| Telas/módulos envolvidos | `/rh/vagas/[id]/candidatos`, `/rh/vagas/[id]/candidatos/[candidateId]`, APIs de candidatos e currículo. |

Fluxo esperado:

- cadastro;
- currículo;
- triagem;
- entrevista;
- parecer;
- decisão;
- banco de talentos;
- aprovado;
- encaminhado para admissão;
- não avançou;
- não recomendado;
- desistiu.

Ponto de evolução:

- entrevista precisa de agenda, data/hora, presença, atraso, falta e reagendamento.

### 5.3 Processo de admissão

| Campo | Definição |
| --- | --- |
| Objetivo | Transformar candidato aprovado em processo admissional administrativo. |
| Quem inicia | RH Admissão recebe candidato aprovado. |
| Quem valida | RH Admissão, RH Documentos e SST conforme etapa. |
| Quem aprova | RH/Gerência/Diretoria apenas quando houver regra específica. |
| Quem executa | RH Admissão, RH Documentos, SST e contabilidade administrativa. |
| Quem acompanha | Líder acompanha status geral; Diretoria vê status executivo. |
| Telas/módulos envolvidos | `/rh/admissoes`, `/rh/admissoes/[id]`, APIs `admission-processes`. |

Fluxo esperado:

- candidato aprovado;
- RH Admissão recebe;
- documentos solicitados;
- documentos recebidos;
- conferência;
- ASO;
- SST;
- contabilidade administrativa;
- liberação;
- onboarding.

Limites:

- não é folha;
- não é eSocial;
- não é cálculo trabalhista;
- não é financeiro;
- documentos sensíveis precisam de permissão específica.

### 5.4 Processo de onboarding

| Campo | Definição |
| --- | --- |
| Objetivo | Integrar o novo colaborador à unidade e ao setor. |
| Início | Após admissão liberada. |
| Quem executa | RH Admissão e líder da área. |
| Quem acompanha | RH, líder e gerência. |
| Telas/módulos envolvidos | RH Onboarding, prontuário do colaborador e dashboards RH. |

Pode envolver:

- uniforme operacional;
- integração;
- apresentação do setor;
- treinamentos iniciais;
- política de conduta;
- ciência de procedimentos;
- demandas para líder.

O líder acompanha o onboarding sem ver documentos admissionais sensíveis.

### 5.5 Processo de compra

| Campo | Definição |
| --- | --- |
| Objetivo | Comprar item/serviço necessário com cotação, evidência e aprovação. |
| Quem inicia | Área solicitante. |
| Quem valida | Compras. |
| Quem aprova | Gerência Administrativa ou Diretoria conforme alçada. |
| Quem executa | Compras. |
| Quem acompanha | Solicitante, Compras, aprovador e auditoria. |
| Telas/módulos envolvidos | Compras, solicitações, cotações, aprovações e documentação. |

Fluxo esperado:

- área solicita;
- compras recebe;
- compras valida;
- compras cota;
- compras anexa evidências;
- aprovação por alçada;
- devolução quando necessário;
- pedido/compra;
- entrega;
- encerramento.

Relações:

- manutenção pode gerar compra de material;
- A&B pode gerar compra de insumos;
- governança pode gerar compra de enxoval/material;
- recepção pode gerar demanda administrativa;
- compras aprovadas podem alimentar contas a pagar futuramente.

### 5.6 Processo de manutenção

| Campo | Definição |
| --- | --- |
| Objetivo | Resolver chamado técnico ou predial com rastreabilidade. |
| Quem inicia | Área solicitante. |
| Quem valida | Líder de manutenção. |
| Quem executa | Técnico de manutenção. |
| Quem acompanha | Solicitante, líder, gerência operacional. |
| Telas/módulos envolvidos | Manutenção e, futuramente, compras integradas. |

Fluxo esperado:

- área abre chamado;
- manutenção recebe;
- classifica prioridade;
- atribui técnico;
- técnico executa;
- se precisar de material, gera solicitação de compra;
- conclui com evidência;
- área valida quando aplicável;
- chamado encerra.

### 5.7 Processo de ocorrência

| Campo | Definição |
| --- | --- |
| Objetivo | Registrar fato operacional e gerar acompanhamento. |
| Quem inicia | Qualquer área autorizada. |
| Quem valida | Responsável da área ou gerência. |
| Quem executa | Área responsável pela resolução. |
| Quem acompanha | Solicitante, responsável, gerência e auditoria. |

Fluxo esperado:

- área registra ocorrência;
- responsável recebe;
- pode encaminhar para outro setor;
- pode gerar chamado;
- pode gerar compra;
- pode gerar advertência/processo RH, quando aplicável;
- acompanha;
- conclui;
- fica no histórico.

### 5.8 Processo de governança

Fluxo esperado:

- tarefas de limpeza;
- status de quartos/áreas comuns no contexto administrativo;
- ocorrência;
- achados e perdidos;
- chamado de manutenção;
- compra/enxoval;
- validação de conclusão.

Não incluir PMS/reserva.

### 5.9 Processo de A&B

Fluxo esperado:

- ocorrência;
- perda/desperdício;
- solicitação de compra;
- manutenção de equipamento;
- demanda de pessoal;
- indicadores futuros.

### 5.10 Processo de contas a pagar

Fluxo esperado:

- lançamento;
- conferência;
- anexos;
- aprovação;
- devolução;
- vencimento;
- pagamento futuro;
- auditoria.

Contas a pagar não é financeiro completo nesta fase.

## 6. Relação entre departamentos

| Origem | Evento | Destino | Tipo de demanda | Responsável | Encerramento |
| --- | --- | --- | --- | --- | --- |
| Recepção | Problema em quarto/área | Governança | Operacional | Líder Governança | Ocorrência tratada ou encaminhada. |
| Recepção | Falha técnica | Manutenção | Chamado | Líder Manutenção | Chamado concluído e validado. |
| Governança | Defeito encontrado | Manutenção | Chamado | Líder Manutenção | Chamado concluído. |
| Manutenção | Necessidade de material | Compras | Solicitação de compra | Compras | Compra aprovada/entregue ou cancelada. |
| A&B | Necessidade de insumo/material | Compras | Solicitação de compra | Compras | Compra encerrada. |
| RH Recrutamento | Candidato aprovado | RH Admissão | Processo admissional | RH Admissão | Admissão liberada ou cancelada. |
| RH Admissão | Admissão liberada | Onboarding/Líder | Integração | RH/Líder | Onboarding concluído. |
| Compras | Compra aprovada | Contas a pagar | Obrigação administrativa futura | Contas a pagar | Conta paga/baixada futuramente. |
| Contas a pagar | Conta exige decisão | Gerência/Diretoria | Aprovação | Aprovador da alçada | Aprovada, devolvida ou reprovada. |
| Ocorrência | Fato com impacto RH | RH | Conduta/vida funcional | RH | Processo RH concluído. |
| Ocorrência | Fato com impacto operacional | Manutenção/Compras/Administrativo | Chamado, compra ou tarefa | Área responsável | Demanda concluída. |

## 7. Módulo versus processo

Módulo é onde o usuário trabalha. Processo é o caminho da demanda.

A mesma demanda pode passar por vários módulos. A tela deve mudar conforme o perfil, mas o processo deve continuar único.

Exemplo de abertura de vaga:

| Perfil | Visão da mesma demanda |
| --- | --- |
| Líder | Solicitação de vaga do setor. |
| RH | Vaga para validar, recrutar e conduzir candidatos. |
| Diretoria | Aprovação pendente. |
| RH Admissão | Candidato aprovado para admissão. |
| Líder após aprovação | Status da vaga/admissão sem dados sensíveis. |

## 8. Telas e visões esperadas

| Visão | Quem usa | Objetivo | Principais ações | Dados que pode mostrar | Dados que não deve mostrar | Demandas que aparecem |
| --- | --- | --- | --- | --- | --- | --- |
| Painel executivo | Diretoria, Super Admin | Decisão e acompanhamento. | Ver indicadores e aprovar pendências. | Indicadores, aprovações, riscos. | Rotina operacional detalhada sem contexto. | Aprovações críticas e alertas. |
| Minhas demandas | Todos com tarefas | Mostrar trabalho pendente. | Abrir, executar, aprovar, devolver. | Demandas do usuário/perfil. | Demandas fora do escopo. | Tudo que exige ação. |
| Aprovações | Diretoria/Gerências | Decidir formalmente. | Aprovar, reprovar, devolver. | Dossiê e justificativas. | Operação diária sem decisão. | Compras, vagas, contas. |
| Solicitações | Líderes/áreas | Pedir vaga, compra, manutenção, apoio. | Criar e acompanhar. | Próprias solicitações. | Dados sensíveis de RH. | Devoluções e status. |
| RH Recrutamento | RH | Conduzir vagas/candidatos. | Validar vaga, entrevistar, decidir. | Vaga, candidato, currículo permitido. | Documentos admissionais sensíveis. | Vagas e candidatos pendentes. |
| RH Admissões | RH Admissão | Conduzir entrada administrativa. | Solicitar/conferir documentos, ASO, liberação. | Processo admissional. | Folha/eSocial/cálculos. | Admissões pendentes. |
| Documentos RH | RH Documentos | Fila documental e dossiê. | Conferir, reprovar, anexar. | Documentos permitidos. | Sensíveis sem permissão. | Pendências e vencimentos. |
| SST | SST/RH | Saúde ocupacional. | Validar ASO, exames, EPIs. | Dados ocupacionais permitidos. | Dados não técnicos sem permissão. | ASO/exames/risco. |
| Compras | Compras | Cotações e dossiê. | Cotar, anexar, enviar aprovação. | Solicitações, fornecedores, evidências. | Aprovar fora da alçada. | Solicitações e devoluções. |
| Contas a pagar | Financeiro administrativo | Lançar e acompanhar contas. | Lançar, conferir, anexar. | Contas, vencimentos, anexos. | Financeiro completo/contabilidade real. | Conferências e aprovações. |
| Governança | Governança | Limpeza, ocorrências e pendências. | Registrar, concluir, acionar manutenção. | Tarefas do setor. | PMS e RH sensível. | Limpezas, ocorrências, chamados. |
| Recepção | Recepção | Comunicação operacional. | Registrar ocorrência e chamado. | Pendências operacionais. | Reservas/tarifas/disponibilidade. | Ocorrências e repasses. |
| Manutenção | Manutenção | Resolver chamados. | Assumir, executar, concluir. | Chamados e evidências. | Aprovações fora da alçada. | Chamados atribuídos. |
| A&B | A&B | Operação de alimentos e bebidas. | Registrar perda, solicitar compra, acionar manutenção. | Ocorrências e demandas do setor. | Estoque/financeiro completo. | Perdas, compras, chamados. |
| Administrativo | Administrativo | Apoio e controles internos. | Criar/acompanhar controles. | Documentos administrativos. | Configurações sensíveis sem permissão. | Demandas internas. |
| Auditoria | Auditoria | Rastreabilidade. | Consultar histórico e evidências. | Eventos, decisões e anexos permitidos. | Executar rotina. | Alertas e inconsistências. |

## 9. Central de demandas

Toda demanda precisa aparecer para alguém. Sem central de demandas, o usuário precisa caçar trabalho no menu, o que não é aceitável operacionalmente.

Exemplos:

- vaga enviada ao RH;
- vaga enviada à diretoria;
- candidato enviado à admissão;
- documento pendente;
- ASO pendente;
- compra aguardando cotação;
- compra aguardando aprovação;
- manutenção atribuída;
- ocorrência aguardando responsável;
- conta aguardando aprovação.

Tipos de demanda:

| Tipo | Definição | Exemplo |
| --- | --- | --- |
| Demanda de ação | Alguém precisa executar tarefa. | Técnico precisa concluir chamado. |
| Demanda de aprovação | Alguém precisa decidir. | Diretoria aprova vaga ou compra. |
| Demanda de acompanhamento | Alguém precisa monitorar. | Líder acompanha admissão. |
| Alerta de vencimento | Algo vencerá em breve. | ASO/documento. |
| Alerta de atraso | Prazo passou. | Chamado ou aprovação atrasada. |
| Alerta crítico | Risco operacional/documental. | Evidência crítica em compra. |

## 10. Status e fases automáticas

O usuário executa ações reais. O sistema calcula a fase automaticamente.

Evitar botões genéricos:

- avançar etapa;
- registrar etapa;
- concluir etapa sem contexto.

Ações reais:

- enviar para RH;
- devolver para líder;
- enviar para diretoria;
- aprovar vaga;
- criar candidato;
- registrar entrevista;
- salvar parecer;
- aprovar candidato;
- encaminhar admissão;
- solicitar documentos;
- registrar ASO;
- liberar onboarding;
- concluir manutenção;
- aprovar compra;
- devolver conta.

## 11. O que já existe no sistema

Auditoria baseada nos arquivos atuais do repositório.

| Área | Evidência no repositório | Classificação |
| --- | --- | --- |
| RH geral | Rotas `/rh`, dashboards, gestão, inbox, workflows e componentes RH. | Existe de forma operacional/parcial. |
| Vagas | `/rh/vagas`, `/rh/vagas/nova`, `/rh/workflows/[id]`, workflow-data/mutations/templates. | Existe de forma operacional. |
| Candidatos | Rotas de candidatos, detalhe, currículo, scorecards e entrevistas. | Existe parcialmente/operacional. |
| Admissões | `/rh/admissoes`, admission-processes, checklist e UI operacional. | Existe parcialmente/operacional. |
| Documentos RH | Pendências documentais, documentos por colaborador, contextual-documents. | Existe de forma operacional. |
| Saúde ocupacional/SST | Rotas de occupational, NR e saúde ocupacional. | Existe parcialmente/operacional. |
| Onboarding | Dashboards, cards, onboarding por colaborador. | Existe parcialmente. |
| Treinamentos | Gestão de treinamentos e anexos contextuais. | Existe de forma operacional. |
| Conduta | Gestão de conduta e evidências contextuais. | Existe de forma operacional. |
| Desligamentos | Gestão de desligamentos e documento contextual geral. | Existe parcialmente/operacional. |
| Compras | Solicitações, cotações, aprovações, snapshots, anexos e evidências. | Existe de forma operacional. |
| Contas a pagar | Rota `/contas-a-pagar`. | Existe só como entrada/placeholder ou não identificado como fluxo completo. |
| Manutenção | Rota `/manutencao`. | Existe como entrada de módulo; fluxo completo não identificado no código atual. |
| Governança | Rota `/governanca`. | Existe como entrada de módulo; fluxo completo não identificado no código atual. |
| A&B | Rota `/ab`. | Existe como entrada de módulo; fluxo completo não identificado no código atual. |
| Recepção | Rota `/recepcao`. | Existe como entrada de módulo; fluxo completo não identificado no código atual. |
| Administrativo | Entradas de módulo/cadastros. | Existe parcialmente. |
| Permissões | `access_profiles`, `permissions`, helpers RH, workflow-auth. | Existe base técnica. |
| Dashboards | Dashboard geral, RH executivo, RH operacional, recrutamento, onboarding. | Existe parcialmente/operacional em RH. |
| Anexos | Bucket `attachments`, anexos de compras e documentos contextuais RH. | Existe de forma operacional. |
| Usuários | Login real, usuários internos, vínculos de unidade. | Existe de forma operacional. |
| Unidades | Cadastros e escopo multiunidade. | Existe. |
| Departamentos | Cadastros e vínculos de usuário. | Existe base técnica. |
| Cargos | Cadastros e matriz de regras por cargo/função. | Existe parcialmente/operacional. |

## 12. O que está confuso ou jogado

Análise crítica:

- telas evoluíram antes da lógica empresarial completa;
- alguns processos ainda parecem módulos isolados;
- perfil, menu e permissão precisam continuar separados;
- líder, RH e diretoria não podem ter a mesma experiência;
- documentos sensíveis precisam de visão própria;
- demandas ainda precisam de centralização;
- algumas fases são inferidas, não formais;
- módulos operacionais como Recepção, Governança, Manutenção e A&B ainda precisam de processos claros;
- Contas a pagar ainda não deve ser tratado como financeiro completo;
- Compras e manutenção ainda precisam de integração operacional futura.

Riscos:

- usuário não saber onde agir;
- diretoria operar o que deveria apenas aprovar;
- líder ver dados sensíveis;
- RH misturar recrutamento com admissão;
- compras e manutenção não se conectarem;
- demanda ficar escondida no menu;
- processo ser duplicado por tela em vez de ser único com visões diferentes.

## 13. O que precisa ser redesenhado

### Prioridade P1

- menu por perfil;
- ações por permissão;
- Minhas demandas;
- visão do líder;
- visão da diretoria;
- separação RH Recrutamento/RH Admissão;
- fluxo formal de vaga.

### Prioridade P2

- agenda de entrevistas;
- documentos admissionais reais;
- ASO real;
- onboarding real;
- manutenção integrada com compras;
- ocorrências integradas com setores.

### Prioridade P3

- dashboards gerenciais;
- alertas avançados;
- SLA;
- auditoria avançada;
- configurações por unidade;
- grupos persistentes.

## 14. O que pode ser feito sem migration

- documentação;
- menu por perfil baseado em `access_profile`;
- ocultar ações por perfil;
- dashboards calculados;
- fases calculadas;
- filtros por unidade;
- algumas filas com `responsible_user_id`/`assigned_to_user_id`;
- ajustes de UX;
- separar telas por perfil sem mudar banco, quando possível.

## 15. O que exige migration futura

- central global de demandas;
- grupos operacionais persistentes;
- permissões por módulo mais granulares;
- menu configurável;
- agenda de entrevistas;
- documentos admissionais por tipo;
- ASO estruturado;
- onboarding estruturado;
- SLA;
- alçadas configuráveis;
- histórico formal de decisões;
- status formais de aprovação RH/diretoria;
- integração futura com financeiro mais completo.

## 16. Roadmap recomendado

1. CORE-EMP-01 — Menu empresarial por perfil.
2. CORE-EMP-02 — Minhas demandas inicial sem migration.
3. RH-36 — Visão do líder para solicitações.
4. RH-37 — Visão da diretoria para aprovações.
5. RH-38 — Separação operacional RH Recrutamento e RH Admissão.
6. CORE-DEM-01 — Central de demandas persistente, se necessário.
7. OPS-01 — Chamados/ocorrências operacionais unificados.
8. COMPRAS-INT-01 — Integração manutenção/A&B/governança com compras.
9. FIN-ADM-01 — Contas a pagar administrativo com aprovação.
10. DOCS-02 — Documentos admissionais, ASO e onboarding real.

## 17. Conclusão

O Sistema Administrativo Hotel Galli deve deixar de ser organizado apenas por telas e passar a ser organizado por processos, departamentos, papéis, permissões e demandas.

Antes de evoluir novas telas, recomenda-se validar esta lógica empresarial com o responsável do projeto e só depois transformar em sprints técnicas.

Esta auditoria complementa, mas não substitui, o documento `docs/RH-35B_MATRIZ_PAPEIS_PERMISSOES_MENU.md`.
