# CORE-EMP-02 — Mapa de Telas, Menus e Fluxos Operacionais

## 1. Objetivo do documento

Este documento complementa a auditoria da lógica empresarial e a matriz de papéis/permissões do Sistema Administrativo Hotel Galli.

Ele detalha a camada de apresentação do sistema:

- menus;
- páginas;
- telas;
- visões por perfil;
- formulários;
- ações;
- demandas;
- cronologia de uso.

Este documento não substitui `docs/RH-35B_MATRIZ_PAPEIS_PERMISSOES_MENU.md`, não altera banco de dados e não cria permissões reais. Ele serve como mapa de produto para orientar próximas sprints de navegação, dashboard, Minhas demandas, listagens, detalhes e formulários.

O sistema continua fora do escopo de PMS, reservas, check-in, check-out, tarifas, disponibilidade, folha, eSocial, financeiro completo, contabilidade completa e conciliação bancária completa.

## 2. Princípio de navegação do sistema

Cronologia principal esperada:

1. Login.
2. Identificação da unidade ou escopo de unidade.
3. Dashboard inicial conforme perfil.
4. Minhas demandas.
5. Aprovações pendentes, se aplicável.
6. Menus dos módulos permitidos.
7. Tela de listagem do processo.
8. Tela de detalhe.
9. Ação operacional.
10. Histórico, anexo, evidência ou encerramento.

O sistema deve levar o trabalho até o usuário. A pessoa não deve precisar procurar tarefas manualmente em vários menus para descobrir onde precisa agir.

Regra central:

- menu organiza;
- página apresenta;
- demanda direciona o trabalho;
- permissão controla ação;
- histórico registra decisão;
- dashboard mostra situação e risco.

## 3. Diferença entre menu, página, processo e demanda

| Elemento | Definição | Exemplo |
| --- | --- | --- |
| Menu | Caminho de navegação. | RH, Compras, Manutenção. |
| Página | Tela onde o usuário visualiza ou executa algo. | `/rh/vagas`, `/compras/solicitacoes`. |
| Processo | Fluxo empresarial com status, responsáveis e histórico. | Abertura de vaga, compra, chamado. |
| Demanda | Trabalho que precisa aparecer para alguém. | Aprovar vaga, cotar compra, concluir chamado. |

Regra de produto:

`O menu organiza. A página apresenta. O processo dá sentido. A demanda direciona a ação.`

## 4. Estrutura geral do menu principal

Esta é a estrutura conceitual do menu principal. O menu real deve respeitar perfil, permissão, unidade e escopo.

### Início

- Dashboard
- Minhas demandas
- Aprovações pendentes
- Alertas e vencimentos

### RH

- Painel RH
- Vagas
- Candidatos
- Entrevistas
- Admissões
- Colaboradores
- Documentos RH
- ASO/SST
- Treinamentos
- Avaliações
- Conduta
- Desligamentos

### Compras

- Painel Compras
- Solicitações
- Cotações
- Aprovações
- Fornecedores
- Entregas/Pendências

### Contas a Pagar

- Painel Contas a Pagar
- Contas lançadas
- Aguardando aprovação
- Vencimentos
- Devolvidas
- Pagas/encerradas

### Manutenção

- Painel Manutenção
- Chamados
- Meus chamados
- Aguardando material
- Concluídos
- Equipamentos/áreas

### Governança

- Painel Governança
- Quartos/áreas
- Tarefas
- Ocorrências
- Achados e perdidos
- Chamados abertos
- Enxoval/compras

### Recepção

- Painel Recepção
- Ocorrências
- Novo chamado
- Achados e perdidos
- Comunicação operacional
- Pendências encaminhadas

### A&B

- Painel A&B
- Ocorrências
- Perdas/desperdícios
- Solicitações de compra
- Chamados de manutenção
- Checklists

### Administrativo

- Documentos
- Contratos
- Comunicados
- Cadastros de apoio
- Ocorrências administrativas

### Cadastros

- Unidades
- Departamentos
- Cargos
- Colaboradores
- Usuários
- Perfis de acesso
- Fornecedores

### Relatórios

- RH
- Compras
- Manutenção
- Governança
- A&B
- Contas a pagar
- Auditoria

## 5. Menu por perfil

Esta seção é visão de produto. A matriz técnica de permissão está em documento separado.

| Perfil/grupo | Dashboard inicial | Menus principais | Menus secundários | O que não deve aparecer | Tipo de demanda esperada |
| --- | --- | --- | --- | --- | --- |
| Super Admin | Painel geral do sistema. | Todos os módulos. | Configurações, auditoria, cadastros. | Nada por padrão, salvo restrição legal/negocial futura. | Suporte, auditoria, exceções e configuração. |
| Diretoria | Painel executivo. | Aprovações, RH executivo, Compras, Contas a Pagar, Relatórios. | Operação em modo consulta. | Rotina diária de execução, anexos admissionais sensíveis por padrão. | Aprovar vaga, compra, conta e acompanhar riscos. |
| Gerência Administrativa | Painel administrativo. | RH administrativo, Compras, Contas a Pagar, Administrativo. | Cadastros e relatórios administrativos. | Operação técnica SST, rotina operacional de setor, dados sensíveis sem permissão. | Aprovar dentro da alçada, resolver pendências administrativas. |
| Gerência Operacional | Painel operacional. | Manutenção, Governança, Recepção, A&B, Solicitações. | Indicadores operacionais e equipe. | Documentos admissionais sensíveis e configuração de permissões. | Priorizar chamados, acompanhar setores, solicitar vaga/compra. |
| RH | Painel RH. | Vagas, Candidatos, Admissões, Documentos RH, Colaboradores. | Treinamentos, Conduta, Saúde, Desligamentos. | Folha, eSocial e financeiro completo. | Validar vagas, candidatos, documentos e pendências RH. |
| RH Recrutamento | Dashboard de recrutamento. | Vagas, Candidatos, Entrevistas. | Banco de talentos futuro, relatórios de funil. | Documentos admissionais sensíveis fora do escopo. | Validar vaga, entrevistar, registrar parecer, encaminhar admissão. |
| RH Admissão | Painel de admissões. | Admissões, Documentos admissionais, ASO/SST, Onboarding. | Pendências e dossiê do processo. | Folha, eSocial, cálculos trabalhistas. | Conferir documentos, acompanhar ASO, liberar onboarding. |
| RH Documentos | Painel documental. | Documentos RH, Pendências, Dossiês. | Vencimentos e reprovados. | Operação de seleção/candidato sem necessidade. | Conferir, reprovar, anexar e acompanhar documentos. |
| SST | Painel SST. | ASO/SST, Saúde ocupacional, EPIs técnicos. | Admissões aguardando ASO. | Documentos admissionais não técnicos, folha, eSocial. | Validar ASO, exames, EPIs e riscos. |
| Compras | Painel Compras. | Solicitações, Cotações, Aprovações enviadas, Fornecedores. | Entregas/Pendências. | Aprovar a própria compra fora da regra. | Cotar, anexar evidência, reenviar para aprovação. |
| Contas a Pagar | Painel Contas a Pagar. | Contas lançadas, Vencimentos, Aguardando aprovação. | Devolvidas, Pagas/encerradas. | Financeiro completo e conciliação bancária completa. | Lançar, conferir, anexar e enviar para aprovação; aprovar somente com perfil/alçada. |
| Manutenção | Painel Manutenção. | Chamados, Meus chamados, Aguardando material. | Equipamentos/áreas, concluídos. | Aprovar compras fora da alçada. | Assumir chamado, atualizar, solicitar material, concluir. |
| Governança | Painel Governança. | Tarefas, Quartos/áreas, Ocorrências, Achados e perdidos. | Chamados abertos, Enxoval/compras. | PMS, reservas, dados sensíveis RH. | Executar tarefa, registrar ocorrência, validar conclusão. |
| Recepção | Painel Recepção. | Ocorrências, Chamados, Achados e perdidos. | Comunicação com Governança/Manutenção. | Reservas, tarifas, disponibilidade e PMS. | Registrar ocorrência, comunicar setor, abrir chamado. |
| A&B | Painel A&B. | Ocorrências, Perdas/desperdícios, Solicitações de compra. | Chamados de manutenção, Checklists. | Estoque completo, CMV e financeiro completo na V1. | Registrar perda, solicitar compra, abrir chamado. |
| Administrativo | Painel Administrativo. | Documentos, Contratos, Comunicados, Cadastros de apoio. | Ocorrências administrativas. | Rotinas sensíveis sem permissão. | Resolver demandas internas e controles administrativos. |
| Líder/Encarregado | Minhas demandas do setor. | Solicitações, Minha equipe, Ocorrências do setor, Chamados do setor. | Acompanhamento de admissões sem sensíveis. | Documentos admissionais sensíveis, aprovações fora da alçada. | Solicitar vaga, corrigir devolução, validar conclusão. |
| Equipe Operacional | Minhas tarefas. | Tarefas, Chamados, Registros permitidos. | Histórico próprio permitido. | Gestão, aprovações, dados sensíveis. | Executar tarefa atribuída e registrar conclusão. |
| Auditoria | Painel de auditoria. | Relatórios, Histórico, Evidências, Auditoria. | Consultas por módulo. | Criar, editar, aprovar ou concluir rotina. | Analisar inconsistências, histórico e evidências. |

## 6. Dashboard inicial por perfil

### Diretoria

Deve ver:

- aprovações pendentes;
- compras acima da alçada;
- vagas aguardando decisão;
- contas aguardando aprovação;
- alertas críticos;
- indicadores por unidade;
- gargalos operacionais.

Não deve operar rotina diária.

### Gerência Administrativa

Deve ver:

- compras dentro da alçada;
- contas a pagar;
- pendências administrativas;
- RH administrativo;
- documentos;
- vencimentos;
- solicitações devolvidas ou atrasadas.

### Gerência Operacional

Deve ver:

- manutenção;
- governança;
- A&B;
- ocorrências;
- chamados críticos;
- pendências operacionais;
- demandas de pessoal dos setores.

### RH

Deve ver:

- vagas aguardando validação;
- candidatos pendentes;
- entrevistas;
- admissões;
- documentos pendentes;
- ASO/documentos vencendo;
- treinamentos;
- ocorrências de conduta.

### Líder/Encarregado

Deve ver:

- solicitações do setor;
- demandas devolvidas;
- chamados abertos;
- admissões em acompanhamento;
- tarefas da equipe;
- pendências operacionais do setor.

### Compras

Deve ver:

- solicitações aguardando cotação;
- cotações em andamento;
- compras devolvidas;
- compras aguardando aprovação;
- entregas pendentes.

### Manutenção

Deve ver:

- chamados abertos;
- chamados atribuídos;
- urgências;
- chamados aguardando material;
- concluídos aguardando validação.

### Governança

Deve ver:

- tarefas operacionais;
- ocorrências de quarto/área;
- chamados abertos;
- pendências de validação;
- achados e perdidos;
- solicitações de enxoval/material.

### Recepção

Deve ver:

- ocorrências abertas pela recepção;
- chamados encaminhados;
- achados e perdidos;
- comunicação operacional entre turnos/setores;
- pendências encaminhadas para Governança, Manutenção, Administrativo ou Gerência;
- retornos aguardando ação da recepção.

Não deve ver reservas, check-in, check-out, tarifas ou disponibilidade.

### A&B

Deve ver:

- ocorrências;
- perdas/desperdícios;
- compras solicitadas;
- manutenção de equipamentos;
- checklists pendentes.

## 7. Minhas demandas

"Minhas demandas" deve ser a central inicial do trabalho.

Campos esperados:

- tipo da demanda;
- módulo de origem;
- unidade;
- departamento;
- prioridade;
- prazo;
- responsável;
- status;
- ação principal;
- link para abrir o processo.

Exemplos:

| Demanda | Origem | Perfil responsável | Ação principal |
| --- | --- | --- | --- |
| Aprovar vaga de camareira | RH | Diretoria | Aprovar/devolver |
| Conferir documentos de candidato | Admissão | RH Admissão | Conferir documentos |
| Cotar compra de enxoval | Compras | Compras | Iniciar cotação |
| Executar chamado quarto 203 | Manutenção | Manutenção | Atualizar chamado |
| Aprovar boleto de fornecedor | Contas a Pagar | Gerência/Diretoria | Aprovar/devolver |
| Validar manutenção concluída | Governança | Líder Governança | Validar conclusão |

Sem migration, essa central pode começar como visão calculada a partir de dados existentes, como workflows, status, responsáveis, `responsible_user_id`, `assigned_to_user_id`, pendências e aprovações.

Versão futura pode exigir tabela persistente de demandas para unificar origem, responsável, prioridade, prazo, leitura e encerramento.

## 8. Padrão de tela de listagem

Toda tela de listagem deve ter:

- título claro;
- descrição curta;
- filtros principais;
- cards de resumo;
- tabela/lista operacional;
- status;
- responsável atual;
- prazo;
- prioridade;
- unidade;
- departamento;
- ação rápida;
- botão de criar novo, quando permitido.

| Elemento | Finalidade |
| --- | --- |
| Cards de resumo | Mostrar volume e risco. |
| Filtros | Permitir localizar por status, unidade, departamento e responsável. |
| Lista/tabela | Mostrar processos ou demandas. |
| Ação rápida | Executar ação sem excesso de cliques. |
| Link de detalhe | Abrir processo completo. |

## 9. Padrão de tela de detalhe

Toda tela de detalhe deve seguir estrutura padrão:

1. Cabeçalho do processo.
2. Status/fase.
3. Unidade.
4. Departamento.
5. Solicitante.
6. Responsável atual.
7. Prioridade.
8. Prazo.
9. Próxima ação.
10. Dados específicos do módulo.
11. Anexos/evidências.
12. Histórico.
13. Comentários/observações.
14. Ações permitidas conforme perfil.
15. Encerramento.

| Bloco | O que mostra | Exemplo |
| --- | --- | --- |
| Cabeçalho | Identificação do processo. | Vaga Camareira — Unidade Londrina. |
| Status | Fase atual. | Aguardando diretoria. |
| Próxima ação | O que precisa acontecer. | Aprovar ou devolver. |
| Dados específicos | Campos próprios do módulo. | Cargo, motivo, quantidade. |
| Anexos | Evidências/documentos. | Currículo, NF, foto do chamado. |
| Histórico | Eventos auditáveis. | Enviado, aprovado, devolvido. |
| Ações | Botões conforme perfil. | Aprovar, devolver, concluir. |

## 10. Padrão de formulário

Todo formulário deve ter:

- dados mínimos obrigatórios;
- unidade;
- departamento;
- solicitante;
- justificativa;
- prioridade, quando aplicável;
- anexos, quando aplicável;
- prazo, quando aplicável;
- responsável inicial, quando aplicável;
- botão de salvar rascunho, quando fizer sentido;
- botão de enviar, quando o processo começar formalmente.

Diferença entre ações:

| Ação | Significado |
| --- | --- |
| Salvar rascunho | Guarda sem iniciar fluxo formal. |
| Enviar para análise | Cria demanda para responsável. |
| Devolver | Retorna com justificativa para correção. |
| Aprovar | Registra decisão formal positiva. |
| Reprovar | Registra decisão formal negativa. |
| Cancelar | Encerra antes da conclusão. |
| Concluir | Finaliza tarefa ou processo. |
| Arquivar | Remove da fila ativa mantendo histórico. |

## 11. Mapa de páginas por módulo

Legenda de maturidade usada nas tabelas:

| Marcador | Significado |
| --- | --- |
| Existente | Já há rota, componente ou fluxo identificável no sistema atual. |
| Parcial | Há base, rota ou componente, mas o fluxo ainda não cobre a operação completa. |
| Conceitual | É desenho de produto para orientar UX/arquitetura, sem implementação confirmada. |
| Futuro | Depende de implementação posterior e possivelmente de novas estruturas. |

### Início

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `/dashboard` | Visão inicial conforme perfil. | Todos. | Indicadores, riscos, atalhos. | Abrir demanda/processo. | Nenhuma direta. | Alertas e pendências. | Deve ser diferente por perfil. |
| Minhas demandas | `/minhas-demandas` | Central de trabalho. | Todos com ação pendente. | Demandas, prioridade, prazo. | Abrir, executar, aprovar, devolver. | Novas demandas conforme ação. | Todas atribuídas ao usuário/perfil. | Pode iniciar calculada sem migration. |
| Aprovações pendentes | `/aprovacoes` | Fila decisória. | Diretoria/Gerências. | Dossiês e pendências. | Aprovar, reprovar, devolver. | Devolução ou continuidade. | Vagas, compras, contas. | Hoje compras têm aprovações operacionais. |
| Alertas e vencimentos | `/alertas` | Vencimentos e riscos. | Gestores/RH/SST/Compras. | Datas, risco, status. | Abrir item. | Demandas de regularização. | Vencimentos. | Pode ser dashboard calculado. |

Aprovações globais e aprovações por módulo têm papéis diferentes:

- Aprovações globais são uma fila consolidada para o aprovador, reunindo decisões pendentes de vários módulos conforme perfil, unidade e alçada.
- Aprovações por módulo aparecem dentro do contexto operacional do processo, por exemplo `Compras > Aprovações`, para preservar dossiê, histórico, anexos e linguagem específica do módulo.
- A fila global não substitui a tela do módulo; ela direciona o usuário para o detalhe correto.

### RH

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel RH | `/rh` | Entrada RH. | RH/Gestores. | Resumos e atalhos. | Abrir módulos. | Nenhuma direta. | Pendências RH. | Existe. |
| Vagas | `/rh/vagas` | Listar vagas/processos. | RH, líderes, gestores. | Vagas, fase, responsável. | Abrir, criar, filtrar. | Validação/aprovação. | Vagas pendentes. | Existe. |
| Nova vaga | `/rh/vagas/nova` | Criar solicitação/vaga. | Líder/RH exceção. | Formulário de vaga. | Salvar, enviar. | Demanda para RH. | Nenhuma. | Existe. |
| Detalhe da vaga | `/rh/workflows/[id]` | Acompanhar processo. | RH, líder, diretoria. | Timeline, ações, status. | Validar, aprovar, devolver. | Próxima fase. | Ações do workflow. | Existe. |
| Candidatos da vaga | `/rh/vagas/[id]/candidatos` | Listar candidatos. | RH. | Candidatos e status. | Criar, abrir detalhe. | Triagem/entrevista. | Candidatos pendentes. | Existe. |
| Detalhe do candidato | `/rh/vagas/[id]/candidatos/[candidateId]` | Avaliar candidato. | RH e gestor autorizado. | Dados, currículo, parecer. | Entrevistar, decidir, encaminhar. | Admissão. | Pareceres pendentes. | Existe. |
| Entrevistas | `/rh/entrevistas` | Agenda futura. | RH/Gestor. | Data, hora, presença. | Agendar, remarcar, registrar. | Parecer. | Entrevistas pendentes. | Evolução futura. |
| Admissões | `/rh/admissoes` | Listar processos admissionais. | RH Admissão. | Status, candidato, pendências. | Abrir, criar quando permitido. | Documentos/ASO. | Candidatos aprovados. | Existe. |
| Detalhe da admissão | `/rh/admissoes/[id]` | Operar admissão. | RH Admissão/RH Documentos/SST. | Documentos, ASO, etapas. | Conferir, rejeitar, liberar. | Onboarding/pendências. | Processo admissional. | Existe. |
| Onboarding | `/rh/onboarding` | Acompanhar integração após admissão liberada. | RH Admissão, RH e líder da área. | Tarefas iniciais, uniforme operacional, integração e status. | Liberar, acompanhar e concluir tarefas permitidas. | Demandas para líder/RH. | Admissões liberadas. | Parcial. Começa após admissão liberada; líder acompanha sem acesso a documentos admissionais sensíveis. |
| Colaboradores | `/rh/employees` | Listar colaboradores. | RH/Gestores. | Colaboradores e status. | Abrir detalhe. | Demandas contextuais. | Pendências por colaborador. | Existe. |
| Detalhe do colaborador | `/rh/employees/[id]` | Dossiê/vida funcional. | RH. | Documentos, treinamentos, saúde, conduta. | Consultar/anexar conforme módulo. | Pendências. | Histórico. | Existe. |
| Documentos RH | `/rh/pendencias-documentais` | Fila documental. | RH Documentos. | Pendências, status, vencimentos. | Conferir, abrir dossiê. | Regularização. | Documentos pendentes. | Existe. |
| ASO/SST | `/rh/gestao/saude-ocupacional` | Saúde ocupacional. | SST/RH. | ASO, exames, restrições. | Registrar/anexar. | Vencimentos. | Pendências SST. | Existe. |
| Treinamentos | `/rh/gestao/treinamentos` | Gestão de treinamentos. | RH. | Treinamentos e anexos. | Atribuir/concluir/anexar. | Certificados. | Pendências. | Existe. |
| Avaliações | `/rh/gestao/avaliacoes` | Avaliação de desempenho. | RH/Gestores. | Avaliações, modelos. | Criar, avaliar, relatar. | Pendências de avaliação. | Avaliações pendentes. | Existe. |
| Conduta | `/rh/gestao/conduta` | Ocorrências de conduta. | RH. | Ocorrências, evidências. | Criar, aprovar, anexar. | Vida funcional. | Revisões. | Existe. |
| Desligamentos | `/rh/gestao/desligamentos` | Desligamento administrativo. | RH. | Checklists, status, documentos. | Criar, acompanhar, anexar. | Pendências. | Processos de saída. | Existe. |

Diferença importante:

- `RH > Colaboradores` é visão operacional de RH: vida funcional, dossiê, documentos, treinamentos, saúde, conduta, desligamentos e acompanhamento do colaborador.
- `Cadastros > Colaboradores` é cadastro base: dados cadastrais essenciais, vínculo administrativo e manutenção estrutural do registro.
- A regra de negócio do colaborador deve nascer no RH; o cadastro base não deve virar dossiê nem duplicar a operação de vida funcional.

### Compras

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel Compras | `/compras` | Entrada de compras. | Compras/Gestores. | Resumos e pendências. | Abrir filas. | Nenhuma direta. | Solicitações/aprovações. | Existe. |
| Solicitações | `/compras/solicitacoes` | Solicitar e acompanhar compras. | Solicitantes/Compras. | Solicitações, status, unidade. | Criar, abrir, acompanhar. | Cotação. | Solicitações recebidas. | Existe. |
| Nova solicitação | `/compras/solicitacoes/nova` | Criar necessidade. | Áreas. | Itens, quantidade, justificativa. | Salvar/enviar. | Demanda para Compras. | Nenhuma. | Rota pode ser modal/tela atual. |
| Detalhe da solicitação | `/compras/solicitacoes/[id]` | Ver compra completa. | Compras/Solicitante/Aprovador. | Itens, cotações, anexos. | Cotar, selecionar, enviar. | Aprovação. | Devoluções. | Conceitual se não houver rota dedicada. |
| Cotações | `/compras/cotacoes` | Cotações e propostas. | Compras. | Fornecedores, valores, evidências. | Cotar, anexar, selecionar. | Aprovação. | Solicitações para cotar. | Existe. |
| Aprovações | `/compras/aprovacoes` | Decisão de compras. | Gerência/Diretoria. | Dossiê formal. | Aprovar, reprovar, devolver. | Compra aprovada/devolvida. | Compras pendentes. | Existe. |
| Fornecedores | `/cadastros/fornecedores` | Cadastro e consulta. | Compras/Cadastros. | Fornecedores. | Criar/editar conforme permissão. | Nenhuma direta. | Demandas de cadastro. | Não duplicar item no menu Compras real. |
| Entregas/Pendências | `/compras/entregas` | Acompanhar entrega. | Compras/Solicitante. | Status, prazo, fornecedor. | Confirmar/registrar pendência. | Conta a pagar futura. | Entregas pendentes. | Evolução futura. |

### Contas a Pagar

Regra operacional: a área de Contas a Pagar lança, confere e envia contas para aprovação. Aprovar só deve ser possível quando o usuário possuir perfil/alçada de aprovação. A existência da página de Contas a Pagar não deve transformar o usuário operacional em aprovador.

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel Contas a Pagar | `/contas-a-pagar` | Entrada do módulo. | Financeiro administrativo. | Resumos e placeholder/filas futuras. | Abrir contas. | Nenhuma direta. | Vencimentos. | Hoje é entrada de módulo. |
| Contas lançadas | `/contas-a-pagar/contas` | Listar contas. | Contas a pagar. | Conta, fornecedor, vencimento. | Abrir, conferir. | Aprovação. | Contas pendentes. | Futuro. |
| Nova conta | `/contas-a-pagar/nova` | Lançar obrigação. | Lançador. | Dados mínimos, anexos. | Salvar/enviar. | Conferência/aprovação. | Nenhuma. | Futuro. |
| Detalhe da conta | `/contas-a-pagar/[id]` | Acompanhar conta. | Financeiro/aprovador. | Anexos, histórico, status. | Conferir, enviar para aprovação, aprovar/devolver apenas com perfil e alçada. | Pagamento/baixa futura. | Aprovações. | Futuro. |
| Aguardando aprovação | `/contas-a-pagar/aprovacoes` | Fila decisória. | Gerência/Diretoria ou perfil autorizado. | Contas por alçada. | Aprovar/devolver conforme alçada. | Continuidade. | Contas pendentes. | Futuro. |
| Vencimentos | `/contas-a-pagar/vencimentos` | Controle de prazo. | Financeiro/Gestores. | Próximos vencimentos. | Abrir conta. | Alertas. | Vencimentos. | Futuro. |
| Devolvidas | `/contas-a-pagar/devolvidas` | Correções. | Lançador/Financeiro. | Motivos. | Corrigir/reenviar. | Aprovação. | Devoluções. | Futuro. |
| Pagas/encerradas | `/contas-a-pagar/encerradas` | Consulta histórica. | Financeiro/Auditoria. | Histórico. | Consultar. | Nenhuma. | Nenhuma ativa. | Futuro. |

### Manutenção

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel Manutenção | `/manutencao` | Entrada do módulo. | Manutenção/Gerência. | Resumos e chamados futuros. | Abrir chamados. | Nenhuma direta. | Chamados. | Hoje é entrada de módulo. |
| Chamados | `/manutencao/chamados` | Lista operacional. | Manutenção. | Chamados, prioridade, status. | Assumir/atribuir. | Tarefa para técnico. | Chamados abertos. | Futuro. |
| Novo chamado | `/manutencao/chamados/novo` | Abrir demanda técnica. | Áreas. | Local, problema, prioridade. | Enviar. | Demanda para Manutenção. | Nenhuma. | Futuro. |
| Detalhe do chamado | `/manutencao/chamados/[id]` | Executar chamado. | Técnico/Líder. | Descrição, anexos, histórico. | Atualizar, anexar, concluir. | Validação/compra. | Chamado atribuído. | Futuro. |
| Meus chamados | `/manutencao/meus-chamados` | Fila pessoal. | Técnico. | Chamados atribuídos. | Atualizar/concluir. | Validação. | Tarefas. | Futuro. |
| Aguardando material | `/manutencao/aguardando-material` | Travados por compra. | Manutenção/Compras. | Chamados e compras. | Solicitar/acompanhar compra. | Compra. | Material pendente. | Futuro. |
| Concluídos | `/manutencao/concluidos` | Consulta e validação. | Manutenção/Área solicitante. | Chamados concluídos. | Validar/reabrir. | Reabertura se necessário. | Validação. | Futuro. |
| Equipamentos/áreas | `/manutencao/equipamentos` | Cadastro operacional. | Manutenção. | Equipamentos/áreas. | Consultar/registrar. | Nenhuma direta. | Histórico. | Futuro. |

### Governança

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel Governança | `/governanca` | Entrada do módulo. | Governança/Gerência. | Resumos futuros. | Abrir tarefas/ocorrências. | Nenhuma direta. | Pendências. | Hoje é entrada de módulo. |
| Quartos/áreas | `/governanca/quartos-areas` | Gestão administrativa de áreas. | Governança. | Áreas e status operacional. | Atualizar status. | Tarefas/chamados. | Pendências. | Não é PMS. |
| Tarefas | `/governanca/tarefas` | Lista de limpeza/checklist. | Governança. | Tarefas e responsáveis. | Concluir/registrar ocorrência. | Validação/chamado. | Tarefas atribuídas. | Futuro. |
| Ocorrências | `/governanca/ocorrencias` | Registrar fatos. | Governança. | Ocorrências e status. | Criar/encaminhar. | Manutenção/Compras. | Ocorrências. | Futuro. |
| Achados e perdidos | `/governanca/achados-perdidos` | Controlar itens encontrados. | Governança/Recepção. | Itens, local, status. | Registrar/devolver/arquivar. | Acompanhamento. | Itens pendentes. | Futuro. |
| Chamados abertos | `/governanca/chamados` | Ver chamados do setor. | Governança. | Chamados enviados. | Acompanhar/validar. | Reabertura. | Conclusões para validar. | Futuro. |
| Enxoval/compras | `/governanca/enxoval-compras` | Necessidades de material. | Governança/Compras. | Solicitações e status. | Solicitar/acompanhar. | Compra. | Compras devolvidas. | Futuro. |

### Recepção

Recepção neste sistema é comunicação e operação interna. Não é PMS e não controla reservas, check-in, check-out, tarifas ou disponibilidade.

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel Recepção | `/recepcao` | Entrada operacional da recepção. | Recepção, líder e gerência operacional. | Pendências, ocorrências, chamados e comunicados. | Abrir filas e registrar ocorrências. | Nenhuma direta. | Pendências encaminhadas. | Existente como entrada de módulo. Não é PMS. |
| Ocorrências | `/recepcao/ocorrencias` | Registrar fatos operacionais. | Recepção. | Ocorrências, status, setor envolvido. | Criar, acompanhar, encaminhar. | Demandas para Governança, Manutenção, Administrativo ou Gerência. | Ocorrências atribuídas à recepção. | Futuro. |
| Novo chamado | `/recepcao/chamados/novo` | Acionar manutenção ou setor responsável. | Recepção. | Local, descrição, prioridade, evidência. | Enviar chamado. | Demanda para Manutenção ou setor responsável. | Nenhuma. | Futuro. |
| Achados e perdidos | `/recepcao/achados-perdidos` | Registrar e acompanhar itens encontrados. | Recepção/Governança. | Item, local, data, status. | Registrar, atualizar, devolver, arquivar. | Acompanhamento interno. | Itens pendentes. | Futuro. |
| Comunicação operacional | `/recepcao/comunicacao` | Registrar repasses entre turnos/setores. | Recepção e líderes. | Comunicados, destinatário, prioridade. | Criar, encaminhar, marcar ciência. | Demanda de leitura/ação. | Comunicados recebidos. | Futuro. |
| Pendências encaminhadas | `/recepcao/pendencias` | Acompanhar demandas abertas pela recepção. | Recepção. | Destino, status, responsável atual. | Acompanhar, cobrar, encerrar quando aplicável. | Reabertura/escalonamento. | Retornos dos setores. | Futuro. |

### A&B

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Painel A&B | `/ab` | Entrada do módulo. | A&B/Gerência. | Resumos futuros. | Abrir ocorrências. | Nenhuma direta. | Pendências. | Hoje é entrada de módulo. |
| Ocorrências | `/ab/ocorrencias` | Registrar fatos do setor. | A&B. | Ocorrências e status. | Criar/encaminhar. | Compra/manutenção. | Ocorrências. | Futuro. |
| Perdas/desperdícios | `/ab/perdas` | Registrar perdas. | A&B/Gerência. | Produto, motivo, volume. | Registrar/analisar. | Indicadores. | Alertas. | Futuro. |
| Solicitações de compra | `/ab/compras` | Pedidos de insumo/material. | A&B. | Solicitações e status. | Solicitar/acompanhar. | Compras. | Devoluções. | Futuro. |
| Chamados de manutenção | `/ab/manutencao` | Equipamentos/problemas. | A&B/Manutenção. | Chamados do setor. | Abrir/acompanhar. | Manutenção. | Conclusões. | Futuro. |
| Checklists | `/ab/checklists` | Rotinas do setor. | A&B. | Checklists e responsáveis. | Concluir/registrar. | Pendências. | Tarefas. | Futuro. |

### Administrativo

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Documentos | `/administrativo/documentos` | Documentos administrativos. | Administrativo/Gerência. | Documentos e status. | Anexar/consultar. | Regularização. | Pendências. | Futuro. |
| Contratos | `/administrativo/contratos` | Controle de contratos. | Administrativo. | Contratos e vencimentos. | Registrar/acompanhar. | Alertas. | Vencimentos. | Futuro. |
| Comunicados | `/administrativo/comunicados` | Comunicação interna. | Administrativo/Gestores. | Comunicados. | Criar/publicar. | Ciência/leitura. | Pendências. | Futuro. |
| Cadastros de apoio | `/administrativo/cadastros` | Apoio operacional. | Administrativo. | Listas auxiliares. | Criar/editar. | Nenhuma direta. | Solicitações. | Futuro. |
| Ocorrências administrativas | `/administrativo/ocorrencias` | Fatos administrativos. | Administrativo. | Ocorrências e histórico. | Registrar/encaminhar. | Demandas internas. | Ocorrências. | Futuro. |

### Cadastros

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unidades | `/cadastros/unidades` | Cadastro multiunidade. | Admin. | Unidades. | Criar/editar. | Nenhuma direta. | Solicitações de cadastro. | Existe/base. |
| Departamentos | `/cadastros/departamentos` | Departamentos. | Admin. | Departamentos. | Criar/editar. | Nenhuma direta. | Solicitações de cadastro. | Existe/base. |
| Cargos | `/cadastros/cargos` | Cargos. | Admin/RH. | Cargos/CBO. | Criar/editar. | Regras RH futuras. | Solicitações. | Existe/base. |
| Colaboradores | `/cadastros/colaboradores` | Cadastro base. | RH/Admin. | Colaboradores. | Criar/editar dados cadastrais. | Documentos. | Pendências. | Existente/base. Não substitui `RH > Colaboradores`, que é visão de vida funcional e dossiê. |
| Usuários | `/cadastros/usuarios` | Acessos internos. | Admin. | Usuários e vínculos. | Criar/editar. | Ativação/permissão. | Solicitações. | Existe/base. |
| Perfis de acesso | `/cadastros/perfis` | Perfis/permissões. | Admin. | Perfis. | Configurar. | Auditoria. | Solicitações. | Base existe; UI pode variar. |
| Fornecedores | `/cadastros/fornecedores` | Fornecedores. | Compras/Admin. | Fornecedores. | Criar/editar. | Cotações. | Solicitações de cadastro. | Existe/base. |

### Relatórios

| Página | Rota sugerida/existente | Objetivo | Quem usa | Dados exibidos | Principais ações | Demandas geradas | Demandas recebidas | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Relatórios RH | `/rh/relatorios` | Indicadores RH. | RH/Diretoria. | Vagas, admissões, documentos. | Exportar/consultar. | Nenhuma direta. | Alertas. | Existe parcialmente. |
| Relatórios Compras | `/relatorios/compras` | Compras e aprovações. | Compras/Diretoria. | Solicitações, cotações, alçadas. | Consultar/exportar. | Auditoria. | Alertas. | Futuro/conceitual. |
| Relatórios Manutenção | `/relatorios/manutencao` | Chamados/SLA. | Manutenção/Gerência. | Chamados, atraso, prioridade. | Consultar. | Demandas de melhoria. | Alertas. | Futuro. |
| Relatórios Governança | `/relatorios/governanca` | Operação do setor. | Governança/Gerência. | Tarefas, ocorrências. | Consultar. | Demandas. | Alertas. | Futuro. |
| Relatórios A&B | `/relatorios/ab` | Perdas e ocorrências. | A&B/Gerência. | Perdas, compras, chamados. | Consultar. | Demandas. | Alertas. | Futuro. |
| Relatórios Contas a Pagar | `/relatorios/contas-a-pagar` | Vencimentos/aprovações. | Financeiro/Diretoria. | Contas, status, prazo. | Consultar. | Alertas. | Vencimentos. | Futuro. |
| Auditoria | `/relatorios/auditoria` | Rastreabilidade. | Auditoria/Super Admin. | Eventos e histórico. | Consultar/exportar. | Alertas. | Inconsistências. | Futuro/parcial. |

## 12. Cronologia dos principais fluxos

### Vaga

1. Líder solicita.
2. RH valida.
3. Diretoria/Gerência aprova.
4. RH recruta.
5. RH entrevista.
6. Gestor emite parecer, quando aplicável.
7. RH aprova candidato.
8. RH encaminha para admissão.
9. RH Admissão conduz documentos.
10. Admissão é liberada.
11. Onboarding inicia.
12. Vaga encerra conforme quantidade preenchida.

### Candidato

1. Cadastro.
2. Currículo.
3. Triagem.
4. Entrevista.
5. Parecer.
6. Decisão.
7. Banco de talentos, reprovação ou aprovação.
8. Encaminhamento para admissão, se aprovado.

### Admissão

1. Candidato aprovado.
2. RH Admissão recebe.
3. Solicita documentos.
4. Confere documentos.
5. Registra ASO/SST.
6. Resolve pendências.
7. Libera admissão.
8. Inicia onboarding.

### Compra

1. Área solicita.
2. Compras recebe.
3. Compras valida escopo.
4. Compras cota.
5. Compras monta dossiê.
6. Gerência/Diretoria aprova.
7. Compras realiza pedido.
8. Entrega é acompanhada.
9. Compra é encerrada.
10. Pode gerar conta a pagar.

### Manutenção

1. Área abre chamado.
2. Manutenção recebe.
3. Classifica prioridade.
4. Atribui técnico.
5. Técnico executa.
6. Se precisar material, gera compra.
7. Técnico conclui com evidência.
8. Área solicitante valida, quando aplicável.
9. Chamado encerra.

### Ocorrência

1. Área registra ocorrência.
2. Responsável recebe.
3. Pode encaminhar para setor.
4. Pode gerar chamado.
5. Pode gerar compra.
6. Pode gerar processo RH.
7. Área resolve.
8. Histórico fica registrado.

### Contas a Pagar

1. Conta é lançada.
2. Documento é anexado.
3. Conferência administrativa.
4. Aprovação por usuário com perfil/alçada.
5. Devolução ou aprovação.
6. Registro de pagamento/encerramento futuro.
7. Auditoria.

## 13. Ações por tela e demandas geradas

| Ação | Tela de origem | Demanda gerada | Responsável |
| --- | --- | --- | --- |
| Enviar vaga para RH | Nova vaga | Validar solicitação de vaga | RH |
| Enviar vaga para diretoria | Detalhe da vaga | Aprovar vaga | Diretoria |
| Aprovar candidato | Detalhe do candidato | Iniciar admissão | RH Admissão |
| Solicitar documentos | Detalhe da admissão | Enviar/conferir documentos | RH Admissão/RH Documentos |
| Abrir chamado | Governança/Recepção/A&B | Atender chamado | Manutenção |
| Solicitar compra | Manutenção/Governança/A&B | Cotar solicitação | Compras |
| Enviar compra para aprovação | Compras | Aprovar compra | Gerência/Diretoria |
| Lançar conta | Contas a Pagar | Conferir conta lançada | Contas a Pagar/Financeiro administrativo |
| Enviar conta para aprovação | Detalhe da conta | Aprovar/devolver conta | Gerência/Diretoria conforme alçada |
| Concluir chamado | Manutenção | Validar conclusão | Área solicitante, quando aplicável |

## 14. O que entra na V1

V1 deve ser utilizável sem tentar resolver tudo.

### V1A — Organização da experiência com base existente e sem migration

- menu empresarial por perfil;
- dashboard inicial por perfil;
- Minhas demandas inicial calculada;
- páginas de listagem padronizadas;
- páginas de detalhe padronizadas;
- ações visíveis por perfil;
- RH com recrutamento/admissão mais claro;
- compras com solicitações/cotações/aprovação;
- diferenciação entre aprovações globais e aprovações por módulo;
- clareza entre `RH > Colaboradores` e `Cadastros > Colaboradores`;
- anexos e histórico quando já existirem.

### V1B — Processos operacionais que provavelmente exigem novas estruturas/migrations

- contas a pagar administrativo básico;
- manutenção com chamados básicos;
- governança com ocorrências/chamados;
- A&B com ocorrências/compras/chamados simples;
- recepção com ocorrências, comunicação operacional e pendências encaminhadas;
- central persistente de demandas, se a visão calculada não for suficiente;
- tabelas formais para chamados, ocorrências, tarefas operacionais e validações por setor;
- vínculos estruturados entre manutenção, compras e área solicitante.

## 15. O que fica para evolução futura

- central global persistente de demandas;
- menu configurável por banco;
- grupos operacionais persistentes;
- agenda estruturada de entrevistas;
- documentos admissionais por tipo;
- ASO estruturado;
- SLA por processo;
- alçadas configuráveis;
- alertas automáticos avançados;
- dashboards gerenciais avançados;
- integração mais profunda entre compras e contas a pagar;
- estoque A&B;
- CMV;
- ficha técnica;
- integrações externas;
- auditoria avançada.

## 16. Regras de ouro para criar ou alterar telas

| Regra | Pergunta obrigatória |
| --- | --- |
| Processo | Qual processo esta tela movimenta? |
| Responsável | Quem precisa agir aqui? |
| Demanda | Essa ação gera demanda para alguém? |
| Permissão | Quem pode ver, criar, editar, aprovar ou concluir? |
| Unidade | A informação pertence a qual unidade? |
| Departamento | Qual departamento é dono da demanda? |
| Histórico | O que precisa ficar auditável? |
| Encerramento | Quando esse processo termina? |
| Sensibilidade | Existe dado sensível? |
| Dashboard | Qual indicador nasce dessa operação? |

Regra final:

`Nenhuma tela nova deve ser criada sem responder essas perguntas.`

## 17. Conclusão

Este documento deve orientar as próximas sprints antes de criar novas telas. A evolução técnica deve seguir a ordem:

1. organizar menu;
2. organizar dashboard inicial;
3. organizar Minhas demandas;
4. organizar ações por perfil;
5. organizar tela de listagem;
6. organizar tela de detalhe;
7. só depois expandir módulos operacionais.

O objetivo é impedir que o sistema cresça por telas soltas. Cada nova tela deve existir porque movimenta um processo, atende um perfil, cria ou resolve uma demanda e deixa histórico claro.
