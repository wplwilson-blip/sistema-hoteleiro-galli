# Plano de Autorizacao Granular para Base e Compras

## 1. Objetivo

Corrigir a lacuna confirmada no diagnostico de autorizacao: rotas de `src/app/api/base` e parte das rotas de `src/app/api/purchases` usam apenas `requireAuthenticatedRequest()` ou `requireSuperAdminRequest()` e, em alguns casos, nao filtram os dados por unidade.

O objetivo da proxima etapa de codigo sera criar um helper generico reutilizavel, no mesmo modelo operacional do RH, para exigir permissao por acao e retornar as unidades acessiveis do usuario. As rotas afetadas deverao usar essas unidades para leitura e escrita.

Nao faz parte deste plano alterar login, Supabase Auth, `auth_email`, schema de banco, RLS/policies ou fluxos de negocio.

## 2. Padrao tecnico proposto

Criar um helper generico, reaproveitando a logica de `src/lib/hr/api-auth.ts`, com responsabilidade equivalente a:

- validar sessao com os helpers existentes;
- localizar a permissao em `permissions.code`;
- considerar `profile_permissions`;
- considerar `user_permission_overrides`;
- considerar apenas `user_unit_links` ativos;
- retornar `accessibleUnitIds`;
- tratar `SUPER_ADMIN` como acesso a todas as unidades ativas;
- devolver `403` quando nao houver permissao efetiva.

Nome sugerido para a fundacao:

| Item | Nome sugerido |
|---|---|
| Helper de consulta de escopo | `getAccessibleUnitIdsForPermission` |
| Helper de rota | `requirePermission` |
| Contexto retornado | `PermissionRequestContext` |
| Assertion de unidade | `assertUnitInPermissionScope` |

Local sugerido:

`src/lib/auth/permissions.ts` ou `src/lib/base-cadastros/api-permissions.ts`.

Para evitar duplicacao, `src/lib/hr/api-auth.ts` deve continuar expondo `requireHrPermission`, mas a implementacao interna pode passar a delegar ao helper generico. A API publica do RH deve permanecer compativel.

## 3. Modulos e codigos de permissao

### 3.1 BASE

As permissoes abaixo ja existem na seed `010_seed_base_data.sql`:

| Codigo | Uso planejado |
|---|---|
| `BASE:units.view` | Listar unidades acessiveis. |
| `BASE:units.manage` | Criar/editar unidades. |
| `BASE:departments.manage` | Listar/criar/editar departamentos e cargos, pois ainda nao existe `BASE:departments.view` nem `BASE:job_positions.*`. |
| `BASE:employees.view` | Listar colaboradores. |
| `BASE:employees.manage` | Criar/editar colaboradores. |
| `BASE:users.view` | Consultar usuarios internos. |
| `BASE:users.manage` | Criar/editar usuarios internos. |

Observacao: para nao criar migration nesta etapa, o plano usa `BASE:departments.manage` tambem para leitura de departamentos e cargos. Uma evolucao futura pode separar `BASE:departments.view`, `BASE:job_positions.view` e `BASE:job_positions.manage`.

### 3.2 PURCHASES

Nao encontrei seed persistida de permissoes `PURCHASES:*` nas migrations atuais. Para cumprir autorizacao granular sem amarrar Compras a perfis fixos, a implementacao de codigo deve usar codigos abaixo, mas a revisao precisa decidir se esses codigos serao cadastrados no banco antes da ativacao.

| Codigo proposto | Uso planejado |
|---|---|
| `PURCHASES:requests.view` | Ver solicitacoes de compra. |
| `PURCHASES:requests.manage` | Criar, editar, enviar ou cancelar solicitacoes. |
| `PURCHASES:quotes.view` | Ver cotações e fornecedores disponiveis para cotacao. |
| `PURCHASES:quotes.manage` | Iniciar cotacao, criar, editar, selecionar, excluir e negociar cotacoes. |
| `PURCHASES:approvals.view` | Ver dossies e fila de aprovacao de compras. |
| `PURCHASES:approvals.submit` | Enviar ou reenviar compra para aprovacao. |
| `PURCHASES:approvals.decide` | Decidir aprovacao, mantendo a regra de alcada existente. |
| `PURCHASES:documentation.view` | Ver dashboard documental de cotacoes. |

Decisao pendente para revisao: se nao houver cadastro desses codigos em `permissions`, o helper generico devera negar acesso para usuarios comuns. Para manter comportamento de usuarios autorizados, e necessario cadastrar/conceder essas permissoes antes ou junto da etapa de codigo. `SUPER_ADMIN` continuara liberado pelo helper.

## 4. Rotas de Cadastros afetadas

| Rota | Metodo | Permissao | Filtro/restricao por unidade |
|---|---:|---|---|
| `/api/base/units` | GET | `BASE:units.view` | Listar somente `units.id in accessibleUnitIds`, exceto `SUPER_ADMIN`. Buscar `unit_settings` apenas das unidades filtradas. |
| `/api/base/units` | POST | `BASE:units.manage` | Criacao de unidade deve exigir permissao de gestao. Como unidade nova ainda nao esta em `accessibleUnitIds`, manter permitido apenas para `SUPER_ADMIN` ou perfil com permissao global equivalente. |
| `/api/base/units/[id]` | PATCH | `BASE:units.manage` | Antes de alterar, confirmar que `params.id` esta em `accessibleUnitIds`, exceto `SUPER_ADMIN`; aplicar `.eq("id", params.id)` e tratar fora de escopo como `404` ou `403`. |
| `/api/base/departments` | GET | `BASE:departments.manage` | Adicionar `.in("unit_id", accessibleUnitIds)` na query principal e carregar unidades apenas desse conjunto. |
| `/api/base/departments` | POST | `BASE:departments.manage` | Validar `payload.unitId` em `accessibleUnitIds` antes de `getUnitOrganizationId`, exceto `SUPER_ADMIN`. |
| `/api/base/departments/[id]` | PATCH | `BASE:departments.manage` | Carregar departamento atual por `id`; exigir unidade atual no escopo e `payload.unitId` no escopo para impedir mover entre unidades indevidas. |
| `/api/base/job-positions` | GET | `BASE:departments.manage` | Adicionar `.in("unit_id", accessibleUnitIds)` na query principal e carregar departamentos/unidades somente relacionados ao resultado filtrado. |
| `/api/base/job-positions` | POST | `BASE:departments.manage` | Validar `payload.unitId` em `accessibleUnitIds`; se `departmentId` vier, confirmar departamento da mesma unidade. |
| `/api/base/job-positions/[id]` | PATCH | `BASE:departments.manage` | Carregar cargo atual; exigir unidade atual no escopo e `payload.unitId` no escopo; validar departamento da unidade nova. |
| `/api/base/employees` | GET | `BASE:employees.view` | Adicionar `.in("unit_id", accessibleUnitIds)` na query principal; carregar departamentos/cargos/unidades apenas dos registros retornados. |
| `/api/base/employees` | POST | `BASE:employees.manage` | Validar `payload.unitId` em `accessibleUnitIds`; validar departamento/cargo dentro da mesma unidade quando informados. |
| `/api/base/employees/[id]` | PATCH | `BASE:employees.manage` | Carregar colaborador atual; exigir unidade atual no escopo e `payload.unitId` no escopo; validar departamento/cargo dentro da unidade. |
| `/api/base/suppliers` | GET | `BASE:settings.manage` ou futura `BASE:suppliers.view` | Substituir `session.units` por `accessibleUnitIds`; manter fornecedor global sem `unit_id` visivel apenas se a permissao permitir escopo corporativo ou para `SUPER_ADMIN`. |
| `/api/base/suppliers` | POST | `BASE:settings.manage` ou futura `BASE:suppliers.manage` | Validar `payload.unitId` em `accessibleUnitIds`; fornecedor global sem unidade deve ficar restrito a `SUPER_ADMIN` ou permissao global. |
| `/api/base/suppliers/[id]` | GET | `BASE:settings.manage` ou futura `BASE:suppliers.view` | Carregar fornecedor; se tiver `unit_id`, exigir unidade no escopo; se nao tiver `unit_id`, restringir a permissao global/`SUPER_ADMIN`. |
| `/api/base/suppliers/[id]` | PATCH | `BASE:settings.manage` ou futura `BASE:suppliers.manage` | Exigir unidade atual no escopo e unidade de destino no escopo; fornecedor global restrito a `SUPER_ADMIN` ou permissao global. |
| `/api/base/users` | GET | `BASE:users.view` ou manter `BASE:users.manage` | Atualmente exige `SUPER_ADMIN`. Plano: migrar para permissao granular apenas se produto permitir administradores nao-super; se mantiver `SUPER_ADMIN`, documentar excecao. |
| `/api/base/users` | POST | `BASE:users.manage` | Atualmente exige `SUPER_ADMIN`. Mesmo com helper generico, validar que todas as `payload.unitIds` estao no escopo do operador; para criar usuario multiunidade fora do proprio escopo, exigir `SUPER_ADMIN`. |
| `/api/base/users/[id]` | PATCH | `BASE:users.manage` | Mesma regra do POST; impedir atribuir ou remover escopos fora das unidades acessiveis, exceto `SUPER_ADMIN`. |

## 5. Rotas de Compras afetadas

| Rota | Metodo | Permissao | Filtro/restricao por unidade |
|---|---:|---|---|
| `/api/purchases/requests` | GET | `PURCHASES:requests.view` | Continuar `.in("unit_id", accessibleUnitIds)`, mas obter `accessibleUnitIds` pelo helper de permissao, nao por `session.units`. |
| `/api/purchases/requests` | POST | `PURCHASES:requests.manage` | Validar `payload.unitId` em `accessibleUnitIds`; validar departamento/centro de custo na unidade. |
| `/api/purchases/requests/[id]` | GET | `PURCHASES:requests.view` | Buscar solicitacao e retornar `404`/`403` se `request.unit_id` nao estiver no escopo. |
| `/api/purchases/requests/[id]` | PATCH | `PURCHASES:requests.manage` | Exigir unidade atual no escopo; validar unidade de destino no escopo; manter bloqueios de status existentes. |
| `/api/purchases/requests/[id]/quotes` | POST | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; validar fornecedor no escopo ou fornecedor global permitido. |
| `/api/purchases/requests/[id]/quotes/[quoteId]` | PATCH | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; garantir `quote.purchase_request_id = params.id`; validar fornecedor no escopo quando alterado. |
| `/api/purchases/requests/[id]/quotes/[quoteId]` | DELETE | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; manter bloqueios de dossie formal/selecionada existentes. |
| `/api/purchases/requests/[id]/quotes/[quoteId]/negotiations` | POST | `PURCHASES:quotes.manage` | Exigir `request.unit_id` no escopo; validar fornecedor/origem da cotacao; manter regras de bloqueio existentes. |
| `/api/purchases/quotes` | GET | `PURCHASES:quotes.view` | Continuar filtrando solicitações/cotações por `.in("unit_id", accessibleUnitIds)` e fornecedores por escopo; usar `accessibleUnitIds` do helper. |
| `/api/purchases/approvals` | GET | `PURCHASES:approvals.view` | Hoje usa `requireSuperAdminRequest` apesar de filtrar por `session.units`. Planejado: trocar para helper granular e manter `.in("unit_id", accessibleUnitIds)`. |
| `/api/purchases/approvals/[requestId]/decision` | POST | `PURCHASES:approvals.decide` | Manter `assertCanDecidePurchaseApprovalLevel`; antes disso exigir permissao granular e unidade no escopo. A regra de Diretoria por unidade continua valendo. |
| `/api/purchases/approvals/[requestId]/resubmit` | POST | `PURCHASES:approvals.submit` | Exigir unidade da solicitacao no escopo e permissao de envio; manter validacoes de status, cotacao vencedora e evidencia. |
| `/api/purchases/documentation-dashboard` | GET | `PURCHASES:documentation.view` | Continuar `.in("unit_id", accessibleUnitIds)` em `purchase_quotes`; consultas derivadas devem partir dos IDs ja filtrados. |

## 6. Regras de filtro por unidade

1. Toda leitura de tabela com `unit_id` deve aplicar `.in("unit_id", accessibleUnitIds)`, exceto quando `isSuperAdmin = true`.
2. Toda escrita deve validar a unidade atual do registro antes de alterar.
3. Toda escrita que recebe `payload.unitId` deve validar a unidade de destino.
4. Registros globais com `unit_id null` nao devem ser tratados como visiveis para todos por padrao. A regra proposta e restringir a `SUPER_ADMIN` ou permissao global explicita.
5. Consultas auxiliares de `units`, `departments`, `job_positions`, `suppliers`, `attachments` e eventos devem derivar dos IDs ja autorizados ou aplicar o mesmo escopo.
6. Fora de escopo deve preferir `404` quando revelar existencia do registro for sensivel; `403` pode ser usado quando a mensagem operacional ja existe e nao vaza detalhe adicional.

## 7. Sequencia de implementacao proposta

1. Criar helper generico reutilizando a logica de permissao do RH.
2. Ajustar `src/lib/hr/api-auth.ts` para delegar ao helper generico sem mudar sua API publica.
3. Migrar rotas de `src/app/api/base` para `requirePermission`.
4. Migrar rotas de `src/app/api/purchases` para `requirePermission`.
5. Validar se existem permissões `PURCHASES:*` no banco. Se nao existirem, decidir cadastro/seed antes de ativar as rotas para usuarios comuns.
6. Rodar testes manuais com:
   - usuario sem permissao: espera `403`;
   - usuario com permissao em uma unidade: enxerga/altera apenas aquela unidade;
   - usuario sem acesso a unidade do registro: nao enxerga nem altera;
   - `SUPER_ADMIN`: enxerga tudo.
7. Rodar `npm.cmd run lint` e `npm.cmd run build`.

## 8. Pontos de revisao antes do codigo

| Ponto | Decisao necessaria |
|---|---|
| Permissoes de Compras | Confirmar cadastro dos codigos `PURCHASES:*` ou autorizar migration/seed especifica. |
| Fornecedores globais | Definir se fornecedor sem `unit_id` e corporativo ou legado; por seguranca, restringir a `SUPER_ADMIN` ate regra explicita. |
| Criacao de unidades | Definir se perfis alem de `SUPER_ADMIN` podem criar unidade nova. |
| Usuarios internos | Definir se deixa `SUPER_ADMIN` como excecao ou se migra para `BASE:users.*` com escopo por unidade. |
| Departamentos/cargos | Decidir se `BASE:departments.manage` pode continuar cobrindo leitura de cargos/departamentos nesta etapa. |

