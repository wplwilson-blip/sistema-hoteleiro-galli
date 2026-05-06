# Arquitetura

## Visão Geral

O projeto usa Next.js 14 com App Router, TypeScript, Tailwind, shadcn/ui e Supabase. A aplicação é organizada em rotas autenticadas, APIs server-side e componentes por domínio.

## Estrutura Next.js

- `src/app/(app)`: rotas autenticadas do sistema administrativo.
- `src/app/(auth)`: rotas públicas de autenticação, como login.
- `src/app/api`: APIs server-side.
- `src/components`: componentes compartilhados e componentes de domínio.
- `src/lib`: helpers, schemas, APIs internas e sessão.
- `supabase/migrations`: migrations locais do banco.

## Layout Autenticado

- Sidebar fixa em desktop.
- Header/topbar no topo da área direita.
- Conteúdo principal rola à direita.
- O body não deve criar scroll horizontal global.

Arquivos principais:

- `src/app/(app)/layout.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/app-header.tsx`

## Componentes Compartilhados

- `src/components/common/module-dashboard.tsx`: dashboards por módulo.
- `src/components/common/status-badge.tsx`: badges de status.
- `src/components/common/empty-state.tsx`: estados vazios.
- `src/components/common/stat-card.tsx`: cards de indicadores.
- `src/components/ui/*`: componentes base de UI.

## Cadastros

Componentes em `src/components/base-cadastros`:

- Unidades.
- Departamentos.
- Cargos.
- Colaboradores.
- Usuários internos.
- Fornecedores.

As APIs ficam em `src/app/api/base`.

## Compras

Componentes em `src/components/purchases`:

- `purchase-requests-client.tsx`: solicitações.
- `purchase-quotes-client.tsx`: cotações.
- `purchase-approvals-client.tsx`: aprovações.
- `quick-supplier-dialog.tsx`: cadastro rápido de fornecedor.

APIs em `src/app/api/purchases`.

## Supabase Server-side

- APIs usam Supabase no servidor.
- APIs sensíveis devem validar sessão e permissão.
- Não confiar em `organization_id`, `unit_id` ou usuário enviados pelo front.
- Usar contexto autenticado para escopo de dados.

## Storage

- Bucket privado: `attachments`.
- Usado para anexos operacionais.
- Cotações usam `module = purchases`, `entity_type = purchase_quote`, `entity_id = purchase_quotes.id`.
- No formulário de cotação ou nova proposta, arquivos podem ficar staged antes de existir `purchase_quotes.id`.
- Ao salvar, a cotação é criada primeiro; depois os arquivos são enviados para a API de anexos e vinculados ao `purchase_quote.id`.
- Se o upload falhar depois da criação da cotação, a cotação não deve ser apagada.

## Auditoria e Eventos

- Compras usa `purchase_request_events` para registrar eventos operacionais.
- Aprovações usam `purchase_approval_decisions` para histórico formal.
- Aprovações usam `purchase_approval_snapshots` para congelar o dossiê enviado formalmente para decisão.
- Decisões críticas devem preservar usuário, data, alçada e justificativa/observação.
- Cotações registram origem/evidência estruturada em `purchase_quotes`.
- A função central `classifyPurchaseQuoteEvidence` classifica a base documental em `formal_sufficient`, `acceptable_with_reservation`, `fragile` ou `critical`.
- Envio e reenvio para aprovação devem recalcular a classificação considerando anexos reais, não apenas campos declarados.

## Dossiê Formal de Aprovação

- O snapshot formal é criado somente no envio ou reenvio para aprovação.
- A seleção de cotação vencedora continua sendo etapa de Compras e não cria snapshot por si só.
- A API de Aprovações deve priorizar o snapshot formal quando ele existir.
- Compras legadas sem snapshot podem aparecer para consulta histórica, mas não devem exibir ações de decisão.
- A rota de decisão continua operando por `purchaseRequestId`; o snapshot pendente é localizado pelo vínculo com a solicitação.
- A rota de decisão deve usar o `approval_level` do snapshot pendente antes de registrar a decisão.
- O payload congelado deve preservar dados reais do momento do envio, não apenas IDs.
- O payload deve congelar origem/evidência da cotação, anexos, classificação documental, motivo da classificação, alertas de auditoria e exigência de Diretoria quando a evidência for crítica.

## Hardening Backend de Aprovação

- `src/lib/purchases/approval-authorization.ts` centraliza a validação de autoridade para decisão de compra.
- Para `approval_level = general_directorate`, a autoridade atual é vínculo ativo de `UNIT_DIRECTOR` na unidade da compra.
- `SUPER_ADMIN` não é automaticamente Diretoria.
- Se futuramente houver Diretoria Geral corporativa, criar ou mapear perfil/permissão específica antes de alterar essa regra.
- A validação acontece no backend da rota de decisão e independe de a UI exibir ou esconder botões.

## Bloqueio de Cotações em Dossiê

- Cotações que já aparecem em `purchase_approval_snapshots` não devem sofrer mutações estruturais diretas.
- A verificação considera `selected_quote_id` e presença da cotação no `snapshot_payload`, incluindo vencedora e concorrentes.
- A trava cobre edição/save, `unselect` direto, `DELETE/cancel` e ações equivalentes.
- Correções após devolução para Compras devem ser feitas por nova proposta/rodada e novo envio formal.
- Risco residual conhecido: o modelo atual usa `purchase_quotes.is_selected`; a seleção controlada de nova vencedora pode limpar a vencedora anterior para manter uma única vencedora viva. Evolução futura deve modelar a vencedora atual sem alterar o estado vivo de cotação congelada.

## Multiunidade

- Dados operacionais devem considerar `unit_id`.
- Usuários possuem vínculos com unidades.
- Telas e APIs devem respeitar unidade ativa e unidades permitidas.
