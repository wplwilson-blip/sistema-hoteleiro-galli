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

## Auditoria e Eventos

- Compras usa `purchase_request_events` para registrar eventos operacionais.
- Aprovações usam `purchase_approval_decisions` para histórico formal.
- Aprovações usam `purchase_approval_snapshots` para congelar o dossiê enviado formalmente para decisão.
- Decisões críticas devem preservar usuário, data, alçada e justificativa/observação.

## Dossiê Formal de Aprovação

- O snapshot formal é criado somente no envio ou reenvio para aprovação.
- A seleção de cotação vencedora continua sendo etapa de Compras e não cria snapshot por si só.
- A API de Aprovações deve priorizar o snapshot formal quando ele existir.
- Compras legadas sem snapshot podem aparecer para consulta histórica, mas não devem exibir ações de decisão.
- A rota de decisão continua operando por `purchaseRequestId`; o snapshot pendente é localizado e atualizado pelo vínculo com a solicitação.
- O payload congelado deve preservar dados reais do momento do envio, não apenas IDs.

## Multiunidade

- Dados operacionais devem considerar `unit_id`.
- Usuários possuem vínculos com unidades.
- Telas e APIs devem respeitar unidade ativa e unidades permitidas.
