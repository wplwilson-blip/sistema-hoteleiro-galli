# Histórico de Sprints

## Sprint 1 - Base visual Hotel Galli

- Status: concluída.
- Objetivo: criar base visual inicial do sistema.
- Entregas: layout administrativo, navegação, páginas iniciais.
- Migrations: não aplicável.
- Não implementado: fluxos operacionais reais.

## Sprint 2 - Banco base + arquitetura lógica

- Status: concluída.
- Objetivo: estruturar base lógica e banco inicial.
- Entregas: estrutura multiunidade, usuários, permissões, cadastros base.
- Migrations: `001` a `010`.
- Não implementado: módulos operacionais completos.

## Sprint 2.5 - Validação Supabase

- Status: concluída.
- Objetivo: validar Supabase, conexão e estrutura.
- Entregas: checagem de tabelas, policies e funcionamento básico.
- Migrations: validação das migrations base.

## Sprint 2.6 - Orçamento integrado às compras

- Status: concluída.
- Objetivo: preparar fundação para orçamento ligado a compras.
- Entregas: tabelas compartilhadas e base orçamentária.
- Migrations: `011`, `012`.
- Não implementado: financeiro completo.

## Sprint 3 - Login real por username + senha

- Status: concluída.
- Objetivo: implementar login real sem e-mail visível.
- Entregas: login por username + senha, `auth_email` técnico invisível, setup inicial.
- Não alterar sem autorização: login, Supabase Auth e setup inicial.

## Sprint 4A - Unidades, Departamentos e Cargos

- Status: concluída.
- Objetivo: CRUDs do módulo base.
- Entregas: unidades, departamentos e cargos.

## Sprint 4B - Colaboradores

- Status: concluída.
- Objetivo: cadastro de colaboradores separado de usuários.
- Entregas: CRUD de colaboradores vinculado a unidade, departamento e cargo.

## Sprint 4C - Usuários internos

- Status: concluída.
- Objetivo: cadastro de usuários internos.
- Entregas: usuários, vínculo com colaborador, perfil e unidades.
- Observação: perfil aparece em português na interface; códigos técnicos continuam internos.

## Sprint 5A - Banco operacional de compras

- Status: concluída.
- Objetivo: criar base de compras.
- Entregas: solicitações, cotações, itens, eventos e recebimentos base.
- Migrations: `013_purchase_module_base.sql`.

## Sprint 5B - Solicitações de compra

- Status: concluída.
- Objetivo: permitir criação e acompanhamento de solicitações.
- Entregas: solicitação, itens, status, filtros e envio para análise/cotação.
- Não implementado: decisão inicial formal da solicitação.

## Sprint 5C - Cotações

- Status: concluída.
- Objetivo: registrar cotações para solicitações.
- Entregas: cotações, itens de cotação, total, prazo, validade, seleção de vencedora.

## Sprint 5C.1 - Cadastro de fornecedores

- Status: concluída.
- Objetivo: criar cadastro de fornecedores.
- Entregas: fornecedores em Cadastros e integração com Compras.
- Migrations: `014_suppliers_unique_document.sql`.

## Sprint 5C.2 - Anexos de cotação

- Status: concluída.
- Objetivo: anexar evidências às cotações.
- Entregas: upload/listagem/remoção usando bucket `attachments`.

## Sprint 5C.3 - Fornecedor rápido na cotação + busca + duplicidade

- Status: concluída.
- Objetivo: melhorar operação de cotação.
- Entregas: cadastro rápido de fornecedor, combobox pesquisável, bloqueio de duplicidade.

## Sprint 5C.4 - Cotação recomendada

- Status: concluída.
- Objetivo: indicar cotação recomendada.
- Entregas: recomendação V1 por menor valor total, comparativo, badges de menor valor/recomendada/vencedora.
- Não implementado: score complexo ou IA.

## Sprint 5D - Aprovação real de compras

- Status: concluída.
- Objetivo: transformar aprovações em fluxo real.
- Entregas: tela `/compras/aprovacoes`, API de decisão, histórico, aprovação e reprovação.
- Migrations: `015_purchase_approvals.sql`.
- Não implementado: grupos avançados de aprovação.

## Sprint 5D.1 - Devolução para Compras + anexos na aprovação

- Status: concluída.
- Objetivo: permitir devolução sem reprovar definitivamente e exibir evidências na aprovação.
- Entregas: devolução para Compras, reenvio para aprovação, anexos da vencedora e demais cotações.
- Migrations: `016_purchase_approval_return_to_purchases.sql`.

## UI-FIX - Sidebar fixa e layout global

- Status: concluída.
- Objetivo: manter sidebar fixa e conteúdo rolando à direita.
- Entregas: layout global com `h-screen`, sidebar sticky e scroll no conteúdo.

## UI-1 - Padronização visual global

- Status: concluída.
- Objetivo: padronizar textos, dashboards, badges, empty states e ações cautelosas.
- Entregas: textos em português, remoção de referências antigas, badges longas, `danger` em botões e perfis em português.

## DB-COMPRAS-1B - Rodadas de negociação e economia de compras

- Status: concluída.
- Objetivo: preservar propostas originais e registrar economia de negociações futuras.
- Entregas: vínculos de proposta original, proposta anterior, rodada, proposta superada e tabela `purchase_quote_negotiations`.
- Migrations: `017_purchase_quote_negotiations.sql`.
- Não implementado: desconto por item, motor avançado de negociação ou exigências configuráveis por fornecedor.

## FIX-APPROVAL-STATUS-1 - Status formal de aprovação sem default automático

- Status: concluída.
- Objetivo: impedir que compras não enviadas formalmente para aprovação nasçam como `pending`.
- Entregas: `approval_status` passou a aceitar `null` antes do envio formal.
- Migrations: `018_fix_purchase_approval_status_default.sql`.

## AUDIT-1C-B - Snapshot formal da aprovação

- Status: concluída.
- Objetivo: congelar o dossiê enviado formalmente para aprovação de compras.
- Entregas: tabela `purchase_approval_snapshots`, helper de criação de snapshot e integração no envio/reenvio formal.
- Migrations: `019_purchase_approval_snapshots.sql`.
- Regra central: selecionar vencedora não cria snapshot; snapshot nasce apenas no envio ou reenvio formal para aprovação.

## AUDIT-1C-C-A - Decisão formal do snapshot

- Status: concluída.
- Objetivo: fazer a decisão de aprovação atualizar o snapshot formal pendente.
- Entregas: aprovar, reprovar e devolver para Compras encerram o snapshot `pending` correspondente com decisão, justificativa quando aplicável, usuário e data.
- Migrations: não aplicável.

## AUDIT-1C-C-B - Aprovações priorizam snapshot formal

- Status: concluída.
- Objetivo: fazer API e tela de Aprovações priorizarem o dossiê formal congelado.
- Entregas: compras com snapshot formal pendente aparecem para decisão; compras legadas sem snapshot aparecem para consulta, sem botões de decisão e sem duplicidade.
- Migrations: não aplicável.

## UI-APROVACOES-1 - Refinamento visual do dossiê de aprovação

- Status: concluída.
- Objetivo: melhorar a clareza visual da lista e do dossiê de Aprovações.
- Entregas: cards mais compactos, badges de dossiê formal/registro legado, indicadores de valor/alçada/envio/status e alerta para aprovações legadas.
- Migrations: não aplicável.

## AUDIT-COTACOES-1-B - Origem e Evidência da Cotação

- Status: concluída.
- Commit: `20b60d8 audit-cotacoes-origem-evidencia`.
- Objetivo: registrar a origem da cotação e a evidência documental que sustenta a proposta.
- Entregas: migration `020_purchase_quote_evidence.sql`, campos estruturados em `purchase_quotes`, schemas de cotação atualizados e APIs de criação, edição, listagem e negociação ajustadas.
- Evidência: bloco "Origem e Evidência da Cotação", classificação documental automática, alertas de auditoria, upload/staged files no fluxo da cotação, exibição de origem/evidência em Aprovações e congelamento dos dados no snapshot formal.
- Auditoria: cotação vinculada a dossiê formal passou a ter bloqueio contra edição direta.
- Migrations: `020_purchase_quote_evidence.sql`.
- Observação: migration aplicada manualmente no Supabase pelo usuário.

## UI-AUDIT-COTACOES-1-C - UX Condicional e Classificação Automática

- Status: concluída.
- Commit: `20b60d8 audit-cotacoes-origem-evidencia`.
- Objetivo: reduzir julgamento livre do comprador sobre suficiência documental.
- Entregas: campos condicionais por origem, classificação calculada pelo sistema e orientação visual para anexos, justificativas, evidência crítica, emergência e regularização.
- Regra central: Compras registra fatos; o sistema classifica a base documental; o aprovador decide com base no dossiê formal.

## UI-AUDIT-COTACOES-1-D - Upload de Evidência no Fluxo da Cotação

- Status: concluída.
- Commit: `20b60d8 audit-cotacoes-origem-evidencia`.
- Objetivo: permitir anexar evidências durante o cadastro ou edição da cotação.
- Entregas: arquivos staged antes da cotação existir, upload após criação do `purchase_quote.id` e vínculo em `attachments` com `module = purchases`, `entity_type = purchase_quote`.
- Observação: se o upload falhar após a criação da cotação, a cotação permanece registrada e a UI orienta o usuário a anexar a evidência antes do envio formal.

## UI-COTACOES-2 - Organização do Modal de Nova Proposta Negociada

- Status: concluída.
- Commit: `20b60d8 audit-cotacoes-origem-evidencia`.
- Objetivo: organizar o fluxo de nova proposta negociada sem duplicar campos de evidência.
- Entregas: modal reorganizado em cotação anterior compacta, dados da nova proposta, itens/valores, origem/evidência e ação de salvar.

## AUDIT-COTACOES-2-A - Varredura Técnica Pós-Implementação

- Status: concluída em modo read-only.
- Objetivo: auditar a implementação de origem/evidência sem alterar arquivos.
- Achados altos: AC-01, aprovação por Diretoria sem validação granular no backend; AC-02, bloqueio de dossiê sem cobertura suficiente para `unselect` e `DELETE/cancel`.
- Achado médio: AC-03, `has_formal_evidence` com default `true` pode gerar falso positivo em consumo futuro.
- Resultado: AC-01 e AC-02 corrigidos na sprint seguinte; AC-03 corrigido posteriormente em `SEC-AUDIT-COTACOES-3-A`.

## SEC-AUDIT-COTACOES-2-B - Hardening Backend de Aprovação e Bloqueio de Dossiê

- Status: concluída.
- Commit: `38a28ab sec-audit-cotacoes-hardening-backend`.
- Objetivo: corrigir os dois achados críticos da auditoria AUDIT-COTACOES-2-A.
- AC-01: decisão de aprovação passou a usar o `approval_level` do snapshot formal pendente e validar autoridade no backend.
- Autoridade atual para `general_directorate`: vínculo ativo de `UNIT_DIRECTOR` na unidade da compra; `SUPER_ADMIN` não é tratado automaticamente como Diretoria.
- Helper criado: `src/lib/purchases/approval-authorization.ts`.
- AC-02: cotação em dossiê formal ficou protegida contra mutações diretas, incluindo `save`, `unselect` direto e `DELETE/cancel`.
- Regra preservada: nova proposta, seleção permitida de nova vencedora, reenvio formal e criação de novo snapshot continuam no fluxo legítimo de Compras.

## SEC-AUDIT-COTACOES-3-A - Blindagem do `has_formal_evidence` como Campo Derivado

- Status: concluída.
- Objetivo: corrigir o achado médio AC-03 da auditoria AUDIT-COTACOES-2-A sem migration e sem alterar o banco já aplicado.
- Regra: Compras registra fatos; o sistema calcula a classificação documental; o aprovador decide pelo dossiê formal.
- Entregas: schemas passaram a ter default conservador para derivados, a UI deixou de enviar derivados como declaração livre, APIs de persistência recalculam os campos derivados e listagens recalculam classificação com anexos reais quando disponíveis.
- Compatibilidade: `purchase_quotes.has_formal_evidence` mantém o default legado no banco, mas telas, APIs e relatórios futuros não devem consumi-lo como fonte absoluta de verdade.

## DASH-COTACOES-1 - Dashboard de Pendências Documentais de Cotações

- Status: concluída.
- Objetivo: criar uma visão operacional read-only para riscos documentais de cotações.
- Entregas: API `GET /api/purchases/documentation-dashboard`, página `/compras/pendencias-documentais`, cards de resumo, filtros por unidade/classificação/severidade/status/pendência e tabela responsiva.
- Regras: classificação documental recalculada com `classifyPurchaseQuoteEvidence` e anexos ativos reais; `has_formal_evidence` não é usado como verdade isolada.
- Escopo: sem alteração de aprovação, snapshot, upload de anexos, `is_selected`, banco ou Storage.
- Migrations: não aplicável.
## DASH-COTACOES-2 - Refinamento Gerencial do Dashboard de Pendências Documentais

- Status: concluída.
- Objetivo: evoluir o dashboard vivo de pendências documentais com leitura gerencial, sem transformar em relatório histórico de dossiê.
- Entregas: filtros server-side por criação, validade e regularização; códigos internos de pendência; dias até vencimento/regularização; visão por unidade; ranking de tipos de pendência; ranking documental de fornecedores; filtro rápido de evidência crítica; exportação CSV frontend do conjunto filtrado e legenda de severidade.
- Regras: classificação documental continua recalculada com `classifyPurchaseQuoteEvidence` e anexos ativos reais; `has_formal_evidence` não é usado como verdade isolada.
- Escopo: sem alteração de aprovação, snapshot, upload de anexos, `is_selected`, banco, Storage, PDF ou leitura histórica completa de `purchase_approval_snapshots`.
- Migrations: não aplicável.

## UI-COMPRAS-2 - Polimento Visual e Linguagem Operacional do Módulo de Compras

- Status: concluída.
- Objetivo: reduzir ruídos de linguagem, navegação e microcopy do módulo de Compras antes de novas evoluções estruturais.
- Entregas: correção de textos visíveis sem acento em Solicitações e Aprovações, ordem operacional do menu de Compras, card documental do dashboard apontando para Pendências Documentais, substituição de termos técnicos visíveis por "dossiê formal" e reforço de que a aprovação é administrativa e não financeira.
- Evidência: Aprovações passou a destacar evidência documental crítica/frágil com microcopy de análise gerencial, sem alterar regra de decisão.
- Escopo: sem alteração de APIs, aprovação backend, snapshot técnico, classificação documental, pendências, `is_selected`, banco, Auth/login, upload de anexos, Storage, financeiro completo ou PDF.
- Migrations: não aplicável.
