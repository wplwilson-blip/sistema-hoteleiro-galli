# Agente Coletor de Relatorios sem API + BI Financeiro + IA

## Status do documento

Este documento registra uma frente futura de arquitetura e produto.

Nao deve ser implementado agora. Ele nao autoriza criacao de rotas, tabelas, migrations, robo Playwright, dashboards, alteracoes em RH, Compras, login, permissoes ou qualquer codigo de producao.

## Contexto do Sistema Hotel

O Sistema Administrativo Hotel Galli / Sistema Hotel e hoje um backoffice operacional hoteleiro. O foco atual permanece nos modulos administrativos e operacionais internos, com rastreabilidade, anexos, auditoria, permissao e organizacao por unidade.

A frente descrita aqui considera uma necessidade futura: consolidar relatorios financeiros e operacionais vindos de sistemas externos que nao possuem API aberta, para permitir leitura gerencial, BI interno e analise assistida por IA.

## Objetivo futuro

Criar, em momento oportuno, uma frente de Inteligencia Financeira / BI Operacional capaz de:

- Receber relatorios externos.
- Padronizar e validar dados.
- Armazenar dados finais no Supabase/PostgreSQL.
- Registrar logs, origem, usuario, data e versao de importacao.
- Exibir indicadores internos auditaveis.
- Permitir analises gerenciais por IA apenas depois da base estar confiavel.

## Nome sugerido do modulo

Nome conceitual recomendado:

**Inteligencia Financeira / BI Operacional**

Nome tecnico futuro possivel:

**Agente Coletor de Relatorios sem API + BI Financeiro + IA**

## Onde ficaria no menu

Quando implementado futuramente, o modulo deve entrar em uma area gerencial ou administrativa, nao misturado a RH ou Compras.

Opcoes futuras:

- `Inteligencia Financeira`.
- `BI Operacional`.
- `Relatorios Gerenciais`.

A escolha final deve respeitar a estrutura de menu existente no momento da sprint.

## Dashboard de referencia

O dashboard HTML atual do Hotel Galli deve ser usado apenas como referencia visual e conceitual.

Ele pode orientar:

- Tipos de indicadores.
- Organizacao visual.
- Leitura gerencial esperada.
- Comparativos e agrupamentos relevantes.

Ele nao deve ser copiado diretamente como produto final sem revisao de dados, permissoes, origem, auditoria e aderencia ao design system do Sistema Hotel.

## Arquitetura futura recomendada

A arquitetura futura deve separar claramente:

- Entrada de arquivos ou coletas.
- Validacao e parser.
- Normalizacao dos dados.
- Persistencia no Supabase/PostgreSQL.
- Logs de processamento.
- Auditoria por usuario, unidade e periodo.
- Camada de permissoes.
- Dashboards internos.
- Analise IA gerencial.

Os dados finais devem ir para Supabase/PostgreSQL com trilha de auditoria, logs de importacao, permissao por perfil/unidade e possibilidade de reprocessamento controlado.

## Estrategia para sistemas sem API

Como o sistema externo nao possui API aberta, a estrategia futura deve priorizar upload manual de relatorios antes de qualquer robo automatico.

Ordem recomendada:

1. Entender quais relatorios existem, seus formatos e periodicidade.
2. Definir um primeiro relatorio piloto.
3. Criar upload manual controlado.
4. Criar parser e validacoes.
5. Persistir dados normalizados.
6. Criar dashboard interno.
7. Somente depois avaliar automacao com Playwright ou navegador.

Playwright/automacao de navegador deve ser tratado como fase posterior, com risco operacional, manutencao constante e controles de seguranca proprios.

## Seguranca

Credenciais nunca devem ser colocadas em prompt, codigo, documentacao sensivel, logs ou repositorio.

Regras obrigatorias futuras:

- Nunca salvar senha em texto puro.
- Nunca pedir credenciais em prompt de IA.
- Nunca commitar credenciais.
- Nunca registrar tokens ou senhas em logs.
- Usar variaveis de ambiente e cofres apropriados quando houver automacao autorizada.
- Registrar quem importou ou processou cada arquivo.
- Aplicar permissao por perfil, unidade e modulo.
- Tratar relatorios financeiros como dados sensiveis.

## Fases de implantacao

Ordem futura recomendada:

1. **BI-INT-0 — Diagnostico de Fontes e Relatorios**
   Mapear sistemas externos, relatorios disponiveis, formatos, periodicidade, campos, riscos, usuarios responsaveis e indicadores desejados.

2. **BI-INT-1 — Upload Manual e Parser do Primeiro Relatorio**
   Criar fluxo controlado para upload manual do primeiro relatorio piloto, parser, validacoes, logs e persistencia normalizada.

3. **BI-INT-2 — Dashboard Interno**
   Criar dashboard interno com indicadores auditaveis a partir dos dados ja normalizados.

4. **BI-INT-3 — Robo Coletor Playwright**
   Avaliar automacao de navegador apenas depois do fluxo manual estar estavel, documentado e validado.

5. **BI-INT-4 — Analise IA Gerencial**
   Adicionar IA para analise gerencial somente depois de dados, permissoes, historico e indicadores estarem confiaveis.

## Possiveis tabelas conceituais

As tabelas abaixo sao apenas ideias conceituais futuras. Nao criar migrations agora.

- `bi_report_sources`: fontes externas e tipos de relatorio.
- `bi_report_imports`: importacoes realizadas, usuario, unidade, periodo, status e arquivo de origem.
- `bi_report_import_logs`: logs tecnicos e operacionais de processamento.
- `bi_financial_facts`: fatos financeiros normalizados.
- `bi_operational_metrics`: metricas operacionais consolidadas.
- `bi_ai_insights`: analises gerenciais geradas por IA, com versao, fonte e responsavel.

Qualquer modelagem real deve ser feita em sprint propria, com revisao de LGPD, seguranca, auditoria e permissoes.

## Regras de negocio futuras

- Toda importacao deve registrar origem, usuario, data, unidade e periodo.
- Relatorios importados devem ter status de processamento.
- Erros de parser devem ser visiveis para administradores autorizados.
- Dados financeiros devem respeitar permissao por perfil e unidade.
- Indicadores exibidos devem ser rastreaveis ate a importacao de origem.
- Reprocessamento deve preservar historico ou registrar substituicao formal.
- IA nao deve inventar dados; deve analisar apenas dados persistidos e autorizados.
- Analises IA devem exibir periodo, fonte e contexto usado.

## Primeiro relatorio piloto recomendado

O primeiro piloto deve ser um relatorio simples, recorrente e gerencialmente relevante.

Recomendacao:

**Relatorio financeiro mensal consolidado por unidade**, preferencialmente em CSV ou XLSX exportado manualmente do sistema externo.

Motivo:

- Facilita validacao humana.
- Reduz risco inicial.
- Permite comparar com o dashboard HTML de referencia.
- Cria base para indicadores financeiros sem depender de automacao.

## O que o Codex NAO deve fazer agora

Nesta etapa, o Codex nao deve:

- Implementar funcionalidade.
- Criar rotas.
- Criar telas.
- Criar dashboards.
- Criar tabelas.
- Criar migrations.
- Criar robo Playwright.
- Criar parser.
- Alterar RH.
- Alterar Compras.
- Alterar login.
- Alterar permissoes.
- Alterar dashboards existentes.
- Mexer em codigo de producao.
- Solicitar ou registrar credenciais.

## Proximo passo quando for a hora de implementar

Quando a frente for autorizada, o primeiro passo deve ser a sprint:

**BI-INT-0 — Diagnostico de Fontes e Relatorios**

Essa sprint deve levantar:

- Quais sistemas externos serao fonte.
- Quais relatorios existem.
- Quais formatos podem ser exportados.
- Quem tem permissao para exportar.
- Qual frequencia de atualizacao.
- Quais campos existem.
- Quais indicadores sao prioridade.
- Quais riscos de seguranca e LGPD existem.
- Qual relatorio sera o piloto.

Somente depois desse diagnostico deve ser planejada a sprint de upload manual e parser.

## Decisao arquitetural atual

A decisao atual e documentar a direcao futura sem implementar nada.

O caminho aprovado conceitualmente e:

1. Comecar por diagnostico.
2. Priorizar upload manual.
3. Persistir dados normalizados no Supabase/PostgreSQL.
4. Criar BI interno auditavel.
5. Avaliar robo Playwright apenas depois.
6. Adicionar IA gerencial somente com dados confiaveis, permissoes e auditoria.
